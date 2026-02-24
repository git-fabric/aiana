/**
 * @git-fabric/aiana — memories layer
 *
 * Pure read/write operations on the memory store.
 * All functions accept an AianaAdapter and query params;
 * they perform no I/O themselves beyond delegating to the adapter.
 *
 * Inputs:  AianaAdapter + query params
 * Outputs: typed MemoryRecord arrays / ids
 */

import type { AianaAdapter, MemoryRecord } from "../types.js";
import { scrubSensitive } from "./scrub.js";

/**
 * Add a new memory. Content is scrubbed before embedding and storage.
 */
export async function addMemory(
  adapter: AianaAdapter,
  content: string,
  opts: { project?: string; memoryType?: string; sessionId?: string } = {},
): Promise<string> {
  const clean = scrubSensitive(content);
  return adapter.addMemory(clean, opts);
}

/**
 * Semantic search over stored memories.
 * Embeds the query, then delegates to the adapter's vector search.
 */
export async function searchMemories(
  adapter: AianaAdapter,
  query: string,
  opts: { project?: string; limit?: number; minScore?: number } = {},
): Promise<MemoryRecord[]> {
  const vector = await adapter.embed(query);
  return adapter.searchMemories(vector, {
    project: opts.project,
    limit: opts.limit ?? 10,
    minScore: opts.minScore ?? 0.5,
  });
}

/**
 * Recall context for a project — top-N semantically relevant memories.
 * Uses the project name as the query seed, then filters by project.
 */
export async function recallProjectContext(
  adapter: AianaAdapter,
  project: string,
  maxItems = 5,
): Promise<MemoryRecord[]> {
  const vector = await adapter.embed(project);
  return adapter.searchMemories(vector, {
    project,
    limit: maxItems,
    minScore: 0.3, // lower threshold for recall — favour coverage
  });
}

/**
 * Delete a single memory by id.
 */
export async function deleteMemory(
  adapter: AianaAdapter,
  id: string,
): Promise<void> {
  return adapter.deleteMemory(id);
}

/**
 * Export all memories, optionally filtered to a project.
 */
export async function exportMemories(
  adapter: AianaAdapter,
  project?: string,
): Promise<MemoryRecord[]> {
  return adapter.exportMemories(project);
}

/**
 * Import memories from an exported JSONL-style array.
 * Returns the number of records successfully imported.
 */
export async function importMemories(
  adapter: AianaAdapter,
  memories: MemoryRecord[],
): Promise<number> {
  return adapter.importMemories(memories);
}

/**
 * Record feedback on a recalled memory (thumbs up/neutral/down).
 */
export async function recordFeedback(
  adapter: AianaAdapter,
  memoryId: string,
  query: string,
  rating: number,
  reason?: string,
): Promise<void> {
  return adapter.recordFeedback(memoryId, query, rating, reason);
}
