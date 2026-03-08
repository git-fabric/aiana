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
/**
 * Add a new memory. Content is scrubbed before embedding and storage.
 */
export declare function addMemory(adapter: AianaAdapter, content: string, opts?: {
    project?: string;
    memoryType?: string;
    sessionId?: string;
}): Promise<string>;
/**
 * Semantic search over stored memories.
 * Embeds the query, then delegates to the adapter's vector search.
 */
export declare function searchMemories(adapter: AianaAdapter, query: string, opts?: {
    project?: string;
    limit?: number;
    minScore?: number;
}): Promise<MemoryRecord[]>;
/**
 * Recall context for a project — top-N semantically relevant memories.
 * Uses the project name as the query seed, then filters by project.
 */
export declare function recallProjectContext(adapter: AianaAdapter, project: string, maxItems?: number): Promise<MemoryRecord[]>;
/**
 * Delete a single memory by id.
 */
export declare function deleteMemory(adapter: AianaAdapter, id: string): Promise<void>;
/**
 * Export all memories, optionally filtered to a project.
 */
export declare function exportMemories(adapter: AianaAdapter, project?: string): Promise<MemoryRecord[]>;
/**
 * Import memories from an exported JSONL-style array.
 * Returns the number of records successfully imported.
 */
export declare function importMemories(adapter: AianaAdapter, memories: MemoryRecord[]): Promise<number>;
/**
 * Record feedback on a recalled memory (thumbs up/neutral/down).
 */
export declare function recordFeedback(adapter: AianaAdapter, memoryId: string, query: string, rating: number, reason?: string): Promise<void>;
//# sourceMappingURL=memories.d.ts.map