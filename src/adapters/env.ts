/**
 * @git-fabric/aiana — environment adapter
 *
 * Creates an AianaAdapter from environment variables.
 * Uses fetch() for the Qdrant REST API — no qdrant-client npm package.
 * Uses native fetch() for embeddings — no openai npm package needed.
 *
 * Embedding dispatch (in priority order):
 *   1. Ollama — if OLLAMA_ENDPOINT is set (default: http://localhost:11434)
 *      Model via OLLAMA_EMBED_MODEL (default: nomic-embed-text)
 *   2. OpenAI — if OPENAI_API_KEY is set and no Ollama endpoint configured
 *      Model via OPENAI_EMBED_MODEL (default: text-embedding-3-small)
 *
 * Required env vars:
 *   QDRANT_URL      — Qdrant base URL (e.g. https://xxx.qdrant.io:6333)
 *   QDRANT_API_KEY  — Qdrant API key
 *
 * Optional env vars:
 *   OLLAMA_ENDPOINT    — Ollama base URL (default: http://localhost:11434)
 *   OLLAMA_EMBED_MODEL — Ollama model for embeddings (default: nomic-embed-text)
 *   OPENAI_API_KEY     — OpenAI API key (fallback if no Ollama)
 *   OPENAI_EMBED_MODEL — OpenAI model for embeddings (default: text-embedding-3-small)
 */

import { randomUUID } from "crypto";
import type { AianaAdapter, MemoryRecord } from "../types.js";
import { scrubSensitive } from "../layers/scrub.js";

// ── Constants ────────────────────────────────────────────────────────────────

const COLLECTION = "aiana_fabric__memories__v1";

// ── Embedding backend detection ─────────────────────────────────────────────

type EmbedBackend =
  | { kind: "ollama"; endpoint: string; model: string }
  | { kind: "openai"; apiKey: string; model: string };

function detectEmbedBackend(): EmbedBackend {
  const ollamaEndpoint = process.env.OLLAMA_ENDPOINT;
  const openaiKey = process.env.OPENAI_API_KEY;

  // Ollama is preferred if endpoint is explicitly set, OR if no OpenAI key
  if (ollamaEndpoint || !openaiKey) {
    return {
      kind: "ollama",
      endpoint: ollamaEndpoint || "http://localhost:11434",
      model: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
    };
  }

  return {
    kind: "openai",
    apiKey: openaiKey,
    model: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
  };
}

// ── Embedding helpers ───────────────────────────────────────────────────────

async function embedOllama(
  endpoint: string,
  model: string,
  text: string,
): Promise<number[]> {
  const res = await fetch(`${endpoint}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`Ollama embed → HTTP ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings[0];
}

async function embedOpenAI(
  apiKey: string,
  model: string,
  text: string,
): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`OpenAI embed → HTTP ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

// ── Qdrant REST helpers ──────────────────────────────────────────────────────

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    content: string;
    project?: string;
    memoryType: string;
    sessionId?: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  };
}

interface QdrantScoredPoint {
  id: string;
  score: number;
  payload: QdrantPoint["payload"];
}

function makeQdrantHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "api-key": apiKey,
  };
}

async function qdrantRequest<T>(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: makeQdrantHeaders(apiKey),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Qdrant ${method} ${path} → HTTP ${res.status}: ${text}`);
  }
  // DELETE 200 may return empty body
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// ── Collection bootstrap ─────────────────────────────────────────────────────

async function ensureCollection(
  baseUrl: string,
  apiKey: string,
  dims: number,
): Promise<void> {
  // Check if collection already exists
  try {
    await qdrantRequest(baseUrl, apiKey, "GET", `/collections/${COLLECTION}`);
    return; // already exists
  } catch {
    // doesn't exist — create it
  }

  await qdrantRequest(baseUrl, apiKey, "PUT", `/collections/${COLLECTION}`, {
    vectors: {
      size: dims,
      distance: "Cosine",
    },
    on_disk_payload: false,
  });

  // Create payload indexes for efficient filtering
  await qdrantRequest(
    baseUrl,
    apiKey,
    "PUT",
    `/collections/${COLLECTION}/index`,
    { field_name: "project", field_schema: "keyword" },
  );
  await qdrantRequest(
    baseUrl,
    apiKey,
    "PUT",
    `/collections/${COLLECTION}/index`,
    { field_name: "memoryType", field_schema: "keyword" },
  );
  await qdrantRequest(
    baseUrl,
    apiKey,
    "PUT",
    `/collections/${COLLECTION}/index`,
    { field_name: "sessionId", field_schema: "keyword" },
  );
  await qdrantRequest(
    baseUrl,
    apiKey,
    "PUT",
    `/collections/${COLLECTION}/index`,
    { field_name: "timestamp", field_schema: "datetime" },
  );
}

// ── Point conversion helpers ─────────────────────────────────────────────────

function pointToRecord(point: QdrantScoredPoint | QdrantPoint, score?: number): MemoryRecord {
  const p = point.payload;
  return {
    id: point.id,
    content: p.content,
    project: p.project,
    memoryType: p.memoryType as MemoryRecord["memoryType"],
    sessionId: p.sessionId,
    timestamp: p.timestamp,
    score: "score" in point ? point.score : score,
    metadata: p.metadata,
  };
}

// ── createAdapterFromEnv ─────────────────────────────────────────────────────

export function createAdapterFromEnv(): AianaAdapter {
  const qdrantUrlRaw = process.env.QDRANT_URL;
  if (!qdrantUrlRaw) throw new Error("QDRANT_URL environment variable is required");
  const qdrantUrl: string = qdrantUrlRaw;

  const qdrantApiKeyRaw = process.env.QDRANT_API_KEY;
  if (!qdrantApiKeyRaw) throw new Error("QDRANT_API_KEY environment variable is required");
  const qdrantApiKey: string = qdrantApiKeyRaw;

  const backend = detectEmbedBackend();
  const embeddingModelLabel =
    backend.kind === "ollama"
      ? `ollama/${backend.model}`
      : `openai/${backend.model}`;

  console.log(`[@git-fabric/aiana] Embedding backend: ${embeddingModelLabel}`);

  // Auto-detect embedding dimensions on first embed call,
  // then bootstrap the collection with the correct size.
  let detectedDims: number | null = null;
  let collectionReady: Promise<void> | null = null;

  async function doEmbed(text: string): Promise<number[]> {
    if (backend.kind === "ollama") {
      return embedOllama(backend.endpoint, backend.model, text);
    }
    return embedOpenAI(backend.apiKey, backend.model, text);
  }

  async function ensureReady(dims: number): Promise<void> {
    if (!collectionReady) {
      collectionReady = ensureCollection(qdrantUrl, qdrantApiKey, dims).catch(
        (e) =>
          console.error(
            "[@git-fabric/aiana] Collection bootstrap failed:",
            e,
          ),
      ) as Promise<void>;
    }
    await collectionReady;
  }

  const adapter: AianaAdapter = {
    // ── Embedding ─────────────────────────────────────────────────────────

    async embed(text: string): Promise<number[]> {
      const vec = await doEmbed(text);

      // Auto-detect dimensions on first call and bootstrap collection
      if (detectedDims === null) {
        detectedDims = vec.length;
        console.log(
          `[@git-fabric/aiana] Detected ${detectedDims} embedding dimensions`,
        );
        await ensureReady(detectedDims);
      }

      return vec;
    },

    // ── Core CRUD ─────────────────────────────────────────────────────────

    async addMemory(
      content: string,
      opts: { project?: string; memoryType?: string; sessionId?: string },
    ): Promise<string> {
      const clean = scrubSensitive(content);
      const id = randomUUID();
      const vector = await adapter.embed(clean);

      const point: QdrantPoint = {
        id,
        vector,
        payload: {
          content: clean,
          project: opts.project,
          memoryType: opts.memoryType ?? "note",
          sessionId: opts.sessionId,
          timestamp: new Date().toISOString(),
        },
      };

      await qdrantRequest(qdrantUrl, qdrantApiKey, "PUT", `/collections/${COLLECTION}/points`, {
        points: [point],
      });

      return id;
    },

    async searchMemories(
      query: number[],
      opts: { project?: string; limit?: number; minScore?: number },
    ): Promise<MemoryRecord[]> {
      // Ensure collection is ready (may not have been if no embed call yet)
      if (detectedDims !== null) await ensureReady(detectedDims);

      const filter =
        opts.project
          ? {
              must: [
                { key: "project", match: { value: opts.project } },
              ],
            }
          : undefined;

      const body: Record<string, unknown> = {
        vector: query,
        limit: opts.limit ?? 10,
        score_threshold: opts.minScore ?? 0.5,
        with_payload: true,
      };
      if (filter) body.filter = filter;

      const result = await qdrantRequest<{
        result: QdrantScoredPoint[];
      }>(qdrantUrl, qdrantApiKey, "POST", `/collections/${COLLECTION}/points/search`, body);

      return (result.result ?? []).map((p) => pointToRecord(p));
    },

    async getMemoriesByProject(project: string, limit: number): Promise<MemoryRecord[]> {
      if (detectedDims !== null) await ensureReady(detectedDims);

      const result = await qdrantRequest<{
        result: { points: Array<{ id: string; payload: QdrantPoint["payload"] }> };
      }>(qdrantUrl, qdrantApiKey, "POST", `/collections/${COLLECTION}/points/scroll`, {
        filter: {
          must: [{ key: "project", match: { value: project } }],
        },
        limit,
        with_payload: true,
        with_vector: false,
        order_by: { key: "timestamp", direction: "desc" },
      });

      const points = result.result?.points ?? [];
      return points.map((p) => ({
        id: p.id,
        content: p.payload.content,
        project: p.payload.project,
        memoryType: p.payload.memoryType as MemoryRecord["memoryType"],
        sessionId: p.payload.sessionId,
        timestamp: p.payload.timestamp,
        metadata: p.payload.metadata,
      }));
    },

    async deleteMemory(id: string): Promise<void> {
      if (detectedDims !== null) await ensureReady(detectedDims);
      await qdrantRequest(
        qdrantUrl,
        qdrantApiKey,
        "POST",
        `/collections/${COLLECTION}/points/delete`,
        { points: [id] },
      );
    },

    async exportMemories(project?: string): Promise<MemoryRecord[]> {
      if (detectedDims !== null) await ensureReady(detectedDims);

      const filter = project
        ? { must: [{ key: "project", match: { value: project } }] }
        : undefined;

      const records: MemoryRecord[] = [];
      let offset: string | undefined = undefined;

      // Paginate through all points using Qdrant scroll API
      while (true) {
        const body: Record<string, unknown> = {
          limit: 250,
          with_payload: true,
          with_vector: false,
        };
        if (filter) body.filter = filter;
        if (offset) body.offset = offset;

        const result = await qdrantRequest<{
          result: {
            points: Array<{ id: string; payload: QdrantPoint["payload"] }>;
            next_page_offset?: string;
          };
        }>(qdrantUrl, qdrantApiKey, "POST", `/collections/${COLLECTION}/points/scroll`, body);

        const points = result.result?.points ?? [];
        for (const p of points) {
          records.push({
            id: p.id,
            content: p.payload.content,
            project: p.payload.project,
            memoryType: p.payload.memoryType as MemoryRecord["memoryType"],
            sessionId: p.payload.sessionId,
            timestamp: p.payload.timestamp,
            metadata: p.payload.metadata,
          });
        }

        const next = result.result?.next_page_offset;
        if (!next || points.length === 0) break;
        offset = next;
      }

      return records;
    },

    async importMemories(memories: MemoryRecord[]): Promise<number> {
      if (memories.length === 0) return 0;

      // Batch embed all contents, then upsert in chunks
      const BATCH_SIZE = 20;
      let imported = 0;

      for (let i = 0; i < memories.length; i += BATCH_SIZE) {
        const batch = memories.slice(i, i + BATCH_SIZE);

        const points: QdrantPoint[] = await Promise.all(
          batch.map(async (m) => {
            const clean = scrubSensitive(m.content);
            const vector = await adapter.embed(clean);
            return {
              id: m.id ?? randomUUID(),
              vector,
              payload: {
                content: clean,
                project: m.project,
                memoryType: m.memoryType ?? "note",
                sessionId: m.sessionId,
                timestamp: m.timestamp ?? new Date().toISOString(),
                metadata: m.metadata,
              },
            };
          }),
        );

        await qdrantRequest(qdrantUrl, qdrantApiKey, "PUT", `/collections/${COLLECTION}/points`, {
          points,
        });
        imported += points.length;
      }

      return imported;
    },

    // ── Feedback ──────────────────────────────────────────────────────────

    async recordFeedback(
      memoryId: string,
      query: string,
      rating: number,
      reason?: string,
    ): Promise<void> {
      if (detectedDims !== null) await ensureReady(detectedDims);

      // Store feedback by updating the memory's metadata payload
      const timestamp = new Date().toISOString();
      await qdrantRequest(
        qdrantUrl,
        qdrantApiKey,
        "POST",
        `/collections/${COLLECTION}/points/payload`,
        {
          points: [memoryId],
          payload: {
            [`feedback_${timestamp}`]: {
              query: scrubSensitive(query),
              rating,
              reason: reason ?? null,
              recordedAt: timestamp,
            },
          },
        },
      );
    },

    // ── Meta ──────────────────────────────────────────────────────────────

    async getStats(): Promise<{
      totalMemories: number;
      byProject: Record<string, number>;
      embeddingModel: string;
      collection: string;
    }> {
      if (detectedDims !== null) await ensureReady(detectedDims);

      // Get collection info for total count
      const info = await qdrantRequest<{
        result: { points_count: number };
      }>(qdrantUrl, qdrantApiKey, "GET", `/collections/${COLLECTION}`);

      const totalMemories = info.result?.points_count ?? 0;

      // Scroll all records to count by project
      const all = await adapter.exportMemories();
      const byProject: Record<string, number> = {};
      for (const m of all) {
        const key = m.project ?? "(no project)";
        byProject[key] = (byProject[key] ?? 0) + 1;
      }

      return {
        totalMemories,
        byProject,
        embeddingModel: embeddingModelLabel,
        collection: COLLECTION,
      };
    },

    async health(): Promise<{
      status: "healthy" | "degraded" | "unavailable";
      latencyMs: number;
    }> {
      const start = Date.now();
      try {
        await qdrantRequest(qdrantUrl, qdrantApiKey, "GET", "/healthz");
        return { status: "healthy", latencyMs: Date.now() - start };
      } catch {
        // /healthz may not exist on all versions — try collections endpoint
        try {
          await qdrantRequest(qdrantUrl, qdrantApiKey, "GET", `/collections/${COLLECTION}`);
          return { status: "healthy", latencyMs: Date.now() - start };
        } catch {
          return { status: "unavailable", latencyMs: Date.now() - start };
        }
      }
    },
  };

  return adapter;
}
