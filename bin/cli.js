#!/usr/bin/env node
import { createApp } from '../dist/app.js';
import { Library } from '../dist/library.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from 'node:http';

const app = createApp();
const library = new Library();

function buildServer() {
  const server = new Server({ name: app.name, version: app.version }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: app.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = app.tools.find((t) => t.name === req.params.name);
    if (!tool) return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
    try {
      const result = await tool.execute(req.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: String(e) }], isError: true };
    }
  });

  return server;
}

// ── Gateway registration ─────────────────────────────────────────────────────

const GATEWAY_URL = process.env.GATEWAY_URL;
const MCP_HTTP_PORT = process.env.MCP_HTTP_PORT ? Number(process.env.MCP_HTTP_PORT) : null;
const POD_IP = process.env.POD_IP || '0.0.0.0';

let sessionToken = null;

async function registerWithGateway() {
  if (!GATEWAY_URL) return;
  const mcpEndpoint = `http://${POD_IP}:${MCP_HTTP_PORT || 8200}/mcp`;
  const body = {
    fabric_id: 'fabric-aiana',
    as_number: 65005,
    version: app.version,
    mcp_endpoint: mcpEndpoint,
    ollama_endpoint: process.env.OLLAMA_ENDPOINT || 'http://ollama.fabric-sdk:11434',
    ollama_model: process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b',
    supervisor: 'standalone',
    tailscale_node: 'fabric-aiana',
    worker_pool: { total: 0, healthy: 0, workers: [] },
    routes: [
      { prefix: 'fabric.memory', local_pref: 100, confidence_floor: 0.7, description: 'Semantic memory — recall, search, add, feedback, sessions' },
      { prefix: 'fabric.memory.recall', local_pref: 100, confidence_floor: 0.7, description: 'Memory recall — project-scoped context retrieval' },
      { prefix: 'fabric.memory.search', local_pref: 100, confidence_floor: 0.7, description: 'Memory search — semantic similarity search over stored memories' },
      { prefix: 'fabric.memory.add', local_pref: 100, confidence_floor: 0.7, description: 'Memory storage — add new memories with secret scrubbing' },
      { prefix: 'fabric.memory.feedback', local_pref: 100, confidence_floor: 0.7, description: 'Memory feedback — rate recalled memories for relevance tuning' },
      { prefix: 'fabric.memory.sessions', local_pref: 100, confidence_floor: 0.7, description: 'Session management — list sessions grouped by project' },
    ],
  };

  try {
    const res = await fetch(`${GATEWAY_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      sessionToken = data.session_token;
      console.log(`[fabric-aiana] Registered with gateway: ${sessionToken} (${data.routes_accepted} routes)`);
    } else {
      console.warn(`[fabric-aiana] Registration rejected: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.warn(`[fabric-aiana] Gateway registration failed (standalone mode): ${err.message}`);
  }
}

async function sendKeepalive() {
  if (!GATEWAY_URL || !sessionToken) return;
  try {
    const res = await fetch(`${GATEWAY_URL}/keepalive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fabric_id: 'fabric-aiana',
        session_token: sessionToken,
        worker_pool: { total: 0, healthy: 0, workers: [] },
        timestamp: Math.floor(Date.now() / 1000),
      }),
    });
    if (res.status === 401) {
      console.log('[fabric-aiana] Session expired — re-registering');
      sessionToken = null;
      await registerWithGateway();
    }
  } catch {
    // Gateway unreachable — will retry next interval
  }
}

// ── Server startup ───────────────────────────────────────────────────────────

const httpPort = MCP_HTTP_PORT;

if (httpPort) {
  const httpServer = createServer(async (req, res) => {
    if (req.url === '/healthz' || req.url === '/health') {
      const h = await app.health();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(h));
      return;
    }
    if (req.url === '/tools') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(app.tools.map((t) => ({ name: t.name, description: t.description }))));
      return;
    }
    // MCP tool call endpoint for gateway DNS unicast resolution
    if ((req.url === '/mcp/tools/call' || req.url === '/tools/call') && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      // Handle aiana_query — gateway DNS resolver asks for context
      //
      // Aiana IS the memory system. Its aiana_query handler routes to its
      // own memory tools (aiana_memory_recall, aiana_memory_search) rather
      // than external APIs. It doesn't call itself — it IS the memory.
      //
      // Two knowledge sources, checked in order:
      //   1. Own memory tools (semantic) — stored memories, recall, sessions
      //   2. Library (reference) — Qdrant docs, fetched from git on demand
      //
      // Memory tools answer "what do I remember" — library answers "how to" and "why"
      if (body.name === 'aiana_query') {
        const queryText = (body.arguments?.query_text || '').toLowerCase();
        try {
          let context = '';
          let confidence = 0;
          let source = 'aiana-memory';

          // ── Memory recall queries (project-scoped context) ──────────
          if (/\b(recall|remember|context|what do (i|we|you) know)\b/.test(queryText)) {
            const project = body.arguments?.project || queryText.replace(/.*(?:about|for|on)\s+/, '').trim();
            const memories = await app.tools.find(t => t.name === 'aiana_memory_recall')?.execute({
              project: project || 'default',
              maxItems: 10,
            });
            context = JSON.stringify(memories, null, 2);
            confidence = 0.95;
          }
          // ── Memory search queries (semantic similarity) ─────────────
          else if (/\b(search|find|look up|lookup|similar|related|matching)\b.*\b(memor|note|pattern|insight|preference)\b/.test(queryText) ||
                   /\b(memor|note|pattern|insight|preference)\b.*\b(search|find|look up|lookup|similar|related|matching)\b/.test(queryText)) {
            const memories = await app.tools.find(t => t.name === 'aiana_memory_search')?.execute({
              query: body.arguments?.query_text || queryText,
              limit: 10,
            });
            context = JSON.stringify(memories, null, 2);
            confidence = 0.9;
          }
          // ── Session queries ─────────────────────────────────────────
          else if (/\b(session|conversation|thread|history|timeline)\b/.test(queryText)) {
            const sessions = await app.tools.find(t => t.name === 'aiana_session_list')?.execute({
              limit: 20,
            });
            context = JSON.stringify(sessions, null, 2);
            confidence = 0.9;
          }
          // ── Status / health queries ─────────────────────────────────
          else if (/\b(status|health|stats|count|how many|total)\b/.test(queryText)) {
            const status = await app.tools.find(t => t.name === 'aiana_status')?.execute({});
            context = JSON.stringify(status, null, 2);
            confidence = 0.95;
          }
          // ── Generic memory queries — search by default ──────────────
          else if (/\b(memor|remember|forgot|stored|saved)\b/.test(queryText)) {
            const memories = await app.tools.find(t => t.name === 'aiana_memory_search')?.execute({
              query: body.arguments?.query_text || queryText,
              limit: 10,
            });
            context = JSON.stringify(memories, null, 2);
            confidence = 0.85;
          } else {
            // ── Library queries (reference docs) ──────────────────────
            const libraryResult = await library.query(queryText);
            if (libraryResult && libraryResult.context) {
              context = libraryResult.context;
              confidence = libraryResult.confidence;
              source = 'library';
              console.log(`[fabric-aiana] Library hit: ${libraryResult.sources.join(', ')}`);
            } else {
              // Nothing in library either — try a broad memory search as fallback
              const memories = await app.tools.find(t => t.name === 'aiana_memory_search')?.execute({
                query: body.arguments?.query_text || queryText,
                limit: 5,
              });
              context = JSON.stringify(memories, null, 2);
              confidence = 0.5;
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ context, confidence, source }));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ context: `Error querying Aiana: ${err.message}`, confidence: 0 }));
        }
        return;
      }

      const tool = app.tools.find((t) => t.name === body.name);
      if (!tool) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Tool not found: ${body.name}` }));
        return;
      }
      try {
        const result = await tool.execute(body.arguments ?? {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
    if (req.url === '/mcp' || req.url === '/') {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = buildServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, undefined);
      return;
    }
    res.writeHead(404).end('not found');
  });

  httpServer.listen(httpPort, () => {
    console.log(`[fabric-aiana] ${app.name} v${app.version} — ${app.tools.length} tools`);
    console.log(`[fabric-aiana] MCP server listening on :${httpPort}`);
    console.log(`[fabric-aiana] Endpoints: /health /tools /tools/call /mcp/tools/call /mcp`);
  });

  // Register with gateway after server is listening
  await registerWithGateway();

  // Keepalive every 30s
  if (GATEWAY_URL) {
    setInterval(sendKeepalive, 30_000);
  }
} else {
  const transport = new StdioServerTransport();
  const server = buildServer();
  await server.connect(transport);
}
