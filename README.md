# @git-fabric/aiana

Aiana memory fabric — semantic memory, session context, and cross-project recall as a composable MCP layer.

Part of the [git-fabric](https://github.com/git-fabric) ecosystem. Built on the [fabric-sdk](https://github.com/git-fabric/sdk) architecture.

## Role

Aiana is both a **fabric spoke** and a **core system component**. As a spoke, it registers with the gateway like any other fabric and serves tools over MCP. As a core component, it powers the AIANA feedback loop — the mechanism that indexes Claude's answers back into local knowledge. Every time Claude answers a question, Aiana can store that answer as a memory. The next time a similar question arrives, the gateway routes to Aiana first (local preference 100) instead of escalating to Claude. Over time, the escalation rate trends toward zero.

## Tools

| Tool | Description |
|------|-------------|
| `aiana_memory_search` | Semantic search over stored memories |
| `aiana_memory_add` | Store a new memory (auto-scrubbed for secrets) |
| `aiana_memory_recall` | Recall top-N relevant memories for a project |
| `aiana_memory_delete` | Permanently delete a memory by ID |
| `aiana_memory_export` | Export all memories as a JSONL-compatible array |
| `aiana_memory_import` | Import memories from an exported array |
| `aiana_session_list` | List sessions grouped by project |
| `aiana_preference_add` | Store a user preference (type=preference memory) |
| `aiana_memory_feedback` | Record helpfulness feedback on a recalled memory |
| `aiana_status` | Collection stats: count, by-project breakdown, model |
| `aiana_health` | Ping Qdrant Cloud, return latency |

## Architecture — OSI Layer Mapping

```
Layer 7 — Application    app.ts (FabricApp factory, 11 tools)
Layer 6 — Presentation   bin/cli.js (MCP stdio + HTTP, aiana_query handler)
Layer 5 — Session        layers/sessions.ts (read-only, derived from memory sessionIds)
Layer 4 — Transport      MCP protocol (stdio + StreamableHTTP)
Layer 3 — Network        Gateway registration (AS65010, fabric.memory.*)
Layer 2 — Data Link      adapters/env.ts (Qdrant REST + OpenAI embeddings)
Layer 1 — Physical       Qdrant Cloud
```

Zero footprint: no local state, no SQLite, no Redis. Qdrant Cloud is the only store.

## Gateway Registration

Aiana registers dynamically with the gateway at startup — there is no static `gateway.yaml`. When `GATEWAY_URL` is set, `bin/cli.js` sends a POST to `/register` with the fabric's AS number, MCP endpoint, and advertised routes. The gateway accepts the routes into its F-RIB and begins routing queries to Aiana. A keepalive runs every 30 seconds to maintain the session.

| Property | Value |
|----------|-------|
| `fabric_id` | `fabric-aiana` |
| `as_number` | `65010` |

### Advertised Routes

| Prefix | Description |
|--------|-------------|
| `fabric.memory` | Semantic memory — recall, search, add, feedback, sessions |
| `fabric.memory.recall` | Project-scoped context retrieval |
| `fabric.memory.search` | Semantic similarity search over stored memories |
| `fabric.memory.add` | Memory storage with secret scrubbing |
| `fabric.memory.feedback` | Rate recalled memories for relevance tuning |
| `fabric.memory.sessions` | List sessions grouped by project |

All routes advertise `local_pref: 100` — highest priority. The gateway prefers Aiana over Claude for any query matching these prefixes.

### Qdrant Collection

| Property | Value |
|----------|-------|
| Collection | `aiana_fabric__memories__v1` |
| Dimensions | 1536 |
| Distance | Cosine |
| Embedding model | `text-embedding-3-small` |

## Library

Aiana includes a reference library (`library.ts`) that fetches documentation from upstream Git repositories on demand. Currently indexes the [qdrant/qdrant](https://github.com/qdrant/qdrant) repository for collection, point, search, filter, snapshot, and indexing documentation. Library queries are checked after memory queries — if Aiana has no stored memory for a topic, it falls back to reference docs before yielding to Claude.

## Usage

### Standalone MCP server (stdio)

```bash
QDRANT_URL=https://xxx.qdrant.io:6333 \
QDRANT_API_KEY=your-key \
OPENAI_API_KEY=sk-... \
npx @git-fabric/aiana
```

### HTTP mode (gateway-connected)

```bash
QDRANT_URL=https://xxx.qdrant.io:6333 \
QDRANT_API_KEY=your-key \
OPENAI_API_KEY=sk-... \
MCP_HTTP_PORT=8200 \
GATEWAY_URL=http://gateway.fabric-sdk:8080 \
npx @git-fabric/aiana
```

### Programmatic

```typescript
import { createApp } from "@git-fabric/aiana";

const app = createApp();
// app.tools, app.health(), etc.
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `QDRANT_URL` | Yes | Qdrant Cloud base URL (e.g. `https://xxx.us-west-1-0.aws.cloud.qdrant.io:6333`) |
| `QDRANT_API_KEY` | Yes | Qdrant Cloud API key |
| `OPENAI_API_KEY` | Yes | OpenAI API key for `text-embedding-3-small` embeddings |
| `MCP_HTTP_PORT` | No | Port for HTTP/StreamableHTTP server. Omit for stdio mode. |
| `GATEWAY_URL` | No | Gateway base URL for dynamic registration (e.g. `http://gateway.fabric-sdk:8080`) |
| `POD_IP` | No | IP address advertised to gateway. Defaults to `0.0.0.0`. |
| `OLLAMA_ENDPOINT` | No | Ollama endpoint for local inference. Defaults to `http://ollama.fabric-sdk:11434`. |
| `OLLAMA_MODEL` | No | Ollama model name. Defaults to `qwen2.5-coder:3b`. |

## Secret Scrubbing

All content is scrubbed before embedding and storage. Redacted patterns:

- GitHub tokens (`ghp_`, `ghs_`, `github_pat_`)
- OpenAI keys (`sk-...`)
- Bearer tokens in headers
- JWT tokens (3-part base64)
- Password patterns

## License

MIT
