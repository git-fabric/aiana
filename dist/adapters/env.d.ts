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
import type { AianaAdapter } from "../types.js";
export declare function createAdapterFromEnv(): AianaAdapter;
//# sourceMappingURL=env.d.ts.map