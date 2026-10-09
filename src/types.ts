/**
 * @git-fabric/aiana — shared types
 *
 * Adapter interfaces decouple the memory layers from any specific
 * vector-store or embedding implementation. Consumers (gateway, CLI)
 * provide concrete adapters at runtime via createAdapterFromEnv().
 */

// ── Memory record ────────────────────────────────────────────────────────────

export interface MemoryRecord {
  id: string;
  content: string;
  project?: string;
  memoryType: "note" | "preference" | "pattern" | "insight" | "conversation";
  sessionId?: string;
  timestamp: string; // ISO 8601
  score?: number;    // populated during semantic search
  metadata?: Record<string, unknown>;
}

// ── Adapter interface ────────────────────────────────────────────────────────

export interface AianaAdapter {
  // Core CRUD
  addMemory(
    content: string,
    opts: { project?: string; memoryType?: string; sessionId?: string },
  ): Promise<string>; // returns new memory id

  searchMemories(
    query: number[],
    opts: { project?: string; limit?: number; minScore?: number },
  ): Promise<MemoryRecord[]>;

  getMemoriesByProject(project: string, limit: number): Promise<MemoryRecord[]>;

  deleteMemory(id: string): Promise<void>;

  exportMemories(project?: string): Promise<MemoryRecord[]>;

  importMemories(memories: MemoryRecord[]): Promise<number>; // returns imported count

  // Feedback
  recordFeedback(
    memoryId: string,
    query: string,
    rating: number,
    reason?: string,
  ): Promise<void>;

  // Embedding
  embed(text: string): Promise<number[]>;

  // Meta
  getStats(): Promise<{
    totalMemories: number;
    byProject: Record<string, number>;
    embeddingModel: string;
    collection: string;
  }>;

  health(): Promise<{
    status: "healthy" | "degraded" | "unavailable";
    latencyMs: number;
  }>;
}

// ── FabricApp (mirrors @git-fabric/gateway, defined inline for zero coupling) ─

export interface FabricTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface FabricApp {
  name: string;
  version: string;
  description: string;
  tools: FabricTool[];
  health: () => Promise<{
    app: string;
    status: "healthy" | "degraded" | "unavailable";
    latencyMs?: number;
    details?: Record<string, unknown>;
  }>;
}
