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
import type { AianaAdapter } from "../types.js";
export interface SessionSummary {
    sessionId: string;
    project?: string;
    memoryCount: number;
    firstSeen: string;
    lastSeen: string;
    preview: string;
}
/**
 * List sessions grouped by project.
 *
 * Implementation: export all memories (optionally filtered by project),
 * group by sessionId, then summarise each group.
 * Sessions without a sessionId are excluded.
 */
export declare function listSessions(adapter: AianaAdapter, project?: string, limit?: number): Promise<SessionSummary[]>;
//# sourceMappingURL=sessions.d.ts.map