/**
 * @git-fabric/aiana — FabricApp factory
 *
 * Implements the FabricApp interface from @git-fabric/gateway.
 * Exposes all memory, session, preference, feedback, and status
 * operations as a single composable layer.
 *
 * Tools (11 total):
 *   Memory   : aiana_memory_search, aiana_memory_add, aiana_memory_recall,
 *              aiana_memory_delete, aiana_memory_export, aiana_memory_import
 *   Sessions : aiana_session_list
 *   Prefs    : aiana_preference_add
 *   Feedback : aiana_memory_feedback
 *   Status   : aiana_status, aiana_health
 */
import { createAdapterFromEnv } from "./adapters/env.js";
import * as layers from "./layers/index.js";
// ── createApp ────────────────────────────────────────────────────────────────
export function createApp(adapterOverride) {
    const adapter = adapterOverride ?? createAdapterFromEnv();
    const tools = [
        // ── Memory tools ─────────────────────────────────────────────────────────
        {
            name: "aiana_memory_search",
            description: "Semantic search over stored memories. Returns memories ranked by relevance to the query.",
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Natural language search query." },
                    project: { type: "string", description: "Filter results to a specific project." },
                    limit: { type: "number", description: "Maximum number of results to return. Default: 10." },
                    minScore: { type: "number", description: "Minimum similarity score (0–1). Default: 0.5." },
                },
                required: ["query"],
            },
            execute: async (args) => layers.memories.searchMemories(adapter, args.query, {
                project: args.project,
                limit: args.limit,
                minScore: args.minScore,
            }),
        },
        {
            name: "aiana_memory_add",
            description: "Store a new memory. Content is automatically scrubbed for secrets before embedding and storage.",
            inputSchema: {
                type: "object",
                properties: {
                    content: { type: "string", description: "The memory content to store." },
                    memoryType: {
                        type: "string",
                        enum: ["note", "preference", "pattern", "insight"],
                        description: "Memory type. Default: note.",
                    },
                    project: { type: "string", description: "Associate memory with a project." },
                },
                required: ["content"],
            },
            execute: async (args) => {
                const id = await layers.memories.addMemory(adapter, args.content, {
                    memoryType: args.memoryType,
                    project: args.project,
                });
                return { id, stored: true };
            },
        },
        {
            name: "aiana_memory_recall",
            description: "Recall the most relevant memories for a project. Uses the project name as a semantic seed and returns the top-N most relevant memories scoped to that project.",
            inputSchema: {
                type: "object",
                properties: {
                    project: { type: "string", description: "Project name to recall context for." },
                    maxItems: { type: "number", description: "Maximum number of memories to return. Default: 5." },
                },
                required: ["project"],
            },
            execute: async (args) => layers.memories.recallProjectContext(adapter, args.project, args.maxItems),
        },
        {
            name: "aiana_memory_delete",
            description: "Permanently delete a memory by its ID.",
            inputSchema: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Memory ID to delete." },
                },
                required: ["id"],
            },
            execute: async (args) => {
                await layers.memories.deleteMemory(adapter, args.id);
                return { id: args.id, deleted: true };
            },
        },
        {
            name: "aiana_memory_export",
            description: "Export all stored memories as an array of memory records (JSONL-compatible). Optionally filter by project.",
            inputSchema: {
                type: "object",
                properties: {
                    project: { type: "string", description: "Export only memories for this project." },
                },
            },
            execute: async (args) => layers.memories.exportMemories(adapter, args.project),
        },
        {
            name: "aiana_memory_import",
            description: "Import memories from a previously exported array of memory records. Duplicate IDs are overwritten.",
            inputSchema: {
                type: "object",
                properties: {
                    memories: {
                        type: "array",
                        description: "Array of memory records to import (from aiana_memory_export).",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                content: { type: "string" },
                                project: { type: "string" },
                                memoryType: { type: "string" },
                                sessionId: { type: "string" },
                                timestamp: { type: "string" },
                                metadata: { type: "object" },
                            },
                            required: ["content"],
                        },
                    },
                },
                required: ["memories"],
            },
            execute: async (args) => {
                const count = await layers.memories.importMemories(adapter, args.memories);
                return { imported: count };
            },
        },
        // ── Session tools ─────────────────────────────────────────────────────────
        {
            name: "aiana_session_list",
            description: "List sessions grouped by project. Sessions are derived from memories that share a sessionId. Returns sessions sorted by most-recent activity.",
            inputSchema: {
                type: "object",
                properties: {
                    project: { type: "string", description: "Filter sessions to a specific project." },
                    limit: { type: "number", description: "Maximum number of sessions to return. Default: 20." },
                },
            },
            execute: async (args) => layers.sessions.listSessions(adapter, args.project, args.limit),
        },
        // ── Preference tools ──────────────────────────────────────────────────────
        {
            name: "aiana_preference_add",
            description: "Store a user preference as a memory with type=preference. Preferences are searchable and recallable like any other memory.",
            inputSchema: {
                type: "object",
                properties: {
                    preference: { type: "string", description: "The preference to store (e.g. 'Use TypeScript strict mode')." },
                    project: { type: "string", description: "Associate with a specific project." },
                },
                required: ["preference"],
            },
            execute: async (args) => {
                const id = await layers.memories.addMemory(adapter, args.preference, {
                    memoryType: "preference",
                    project: args.project,
                });
                return { id, stored: true, memoryType: "preference" };
            },
        },
        // ── Feedback tools ────────────────────────────────────────────────────────
        {
            name: "aiana_memory_feedback",
            description: "Record feedback on a recalled memory to improve future relevance. Rating: 1=helpful, 0=neutral, -1=not helpful.",
            inputSchema: {
                type: "object",
                properties: {
                    memoryId: { type: "string", description: "ID of the memory being rated." },
                    query: { type: "string", description: "The original query that surfaced this memory." },
                    rating: { type: "number", enum: [1, 0, -1], description: "Helpfulness rating: 1=helpful, 0=neutral, -1=not helpful." },
                    reason: { type: "string", description: "Optional explanation for the rating." },
                },
                required: ["memoryId", "query", "rating"],
            },
            execute: async (args) => {
                await layers.memories.recordFeedback(adapter, args.memoryId, args.query, args.rating, args.reason);
                return { memoryId: args.memoryId, rating: args.rating, recorded: true };
            },
        },
        // ── Status / health ───────────────────────────────────────────────────────
        {
            name: "aiana_status",
            description: "Return collection stats: total memory count, memories per project, embedding model, and collection name.",
            inputSchema: {
                type: "object",
                properties: {},
            },
            execute: async (_args) => adapter.getStats(),
        },
        {
            name: "aiana_health",
            description: "Ping Qdrant Cloud and return connection status and latency.",
            inputSchema: {
                type: "object",
                properties: {},
            },
            execute: async (_args) => adapter.health(),
        },
    ];
    return {
        name: "@git-fabric/aiana",
        version: "0.1.0",
        description: "Aiana memory fabric app — semantic memory, session context, and cross-project recall as a composable MCP layer",
        tools,
        async health() {
            const start = Date.now();
            try {
                const h = await adapter.health();
                return {
                    app: "@git-fabric/aiana",
                    status: h.status,
                    latencyMs: h.latencyMs,
                    details: {
                        qdrantUrl: process.env.QDRANT_URL ?? "(not set)",
                        collection: "aiana_fabric__memories__v1",
                        embeddingModel: "text-embedding-3-small",
                    },
                };
            }
            catch (e) {
                return {
                    app: "@git-fabric/aiana",
                    status: "unavailable",
                    latencyMs: Date.now() - start,
                    details: { error: String(e) },
                };
            }
        },
    };
}
//# sourceMappingURL=app.js.map