# @git-fabric/aiana

Aiana memory fabric app — semantic memory, session context, and cross-project recall as a composable MCP layer.

Part of the [git-fabric](https://github.com/git-fabric) ecosystem.

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

## Architecture

Follows the [git-fabric layered pattern](https://github.com/git-fabric/gateway):

```
Detection / Query  →  layers/memories.ts (searchMemories, recallProjectContext)
Action             →  layers/memories.ts (addMemory, deleteMemory, import/export)
Sessions           →  layers/sessions.ts (read-only, derived from memory sessionIds)
Scrubbing          →  layers/scrub.ts (PII/secret redaction before embed+store)
Adapter            →  adapters/env.ts (Qdrant REST + OpenAI embeddings)
Surface            →  app.ts (FabricApp factory with 11 inline tools)
```

Zero footprint: no local state, no SQLite, no Redis. Qdrant Cloud is the only store.

### Qdrant collection

| Property | Value |
|----------|-------|
| Collection | `aiana_fabric__memories__v1` |
| Dimensions | 1536 |
| Distance | Cosine |
| Embedding model | `text-embedding-3-small` |

## Usage

### Via gateway (recommended)

```yaml
# gateway.yaml
apps:
  - name: "@git-fabric/aiana"
    enabled: true
```

### Standalone MCP server

```bash
QDRANT_URL=https://xxx.qdrant.io:6333 \
QDRANT_API_KEY=your-key \
OPENAI_API_KEY=sk-... \
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

## Secret scrubbing

All content is scrubbed before embedding and storage. Redacted patterns:

- GitHub tokens (`ghp_`, `ghs_`, `github_pat_`)
- OpenAI keys (`sk-...`)
- Bearer tokens in headers
- JWT tokens (3-part base64)
- Password patterns

## License

MIT
