/**
 * @git-fabric/aiana — sessions layer
 *
 * Read-only operations over session-tagged memories.
 * Sessions are not a first-class entity in Qdrant — they are derived
 * by grouping memories that share the same sessionId payload field.
 *
 * Inputs:  AianaAdapter + query params
 * Outputs: grouped session summaries
 */

import type { AianaAdapter, MemoryRecord } from "../types.js";

export interface SessionSummary {
  sessionId: string;
  project?: string;
  memoryCount: number;
  firstSeen: string;  // ISO timestamp of earliest memory in session
  lastSeen: string;   // ISO timestamp of most recent memory in session
  preview: string;    // first 120 chars of the most recent memory
}

/**
 * List sessions grouped by project.
 *
 * Implementation: export all memories (optionally filtered by project),
 * group by sessionId, then summarise each group.
 * Sessions without a sessionId are excluded.
 */
export async function listSessions(
  adapter: AianaAdapter,
  project?: string,
  limit = 20,
): Promise<SessionSummary[]> {
  const memories = await adapter.exportMemories(project);

  // Group by sessionId — skip memories with no session
  const groups = new Map<string, MemoryRecord[]>();
  for (const m of memories) {
    if (!m.sessionId) continue;
    const arr = groups.get(m.sessionId) ?? [];
    arr.push(m);
    groups.set(m.sessionId, arr);
  }

  // Build summaries, sorted by most-recent activity desc
  const summaries: SessionSummary[] = [];
  for (const [sessionId, records] of groups) {
    records.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const latest = records[records.length - 1];
    const earliest = records[0];
    summaries.push({
      sessionId,
      project: latest.project,
      memoryCount: records.length,
      firstSeen: earliest.timestamp,
      lastSeen: latest.timestamp,
      preview: latest.content.slice(0, 120),
    });
  }

  summaries.sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  );

  return summaries.slice(0, limit);
}
