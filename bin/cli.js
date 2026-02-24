#!/usr/bin/env node
/**
 * @git-fabric/aiana CLI
 *
 * Standalone MCP server entry point.
 * Runs the aiana fabric app as a stdio MCP server.
 *
 * Usage:
 *   QDRANT_URL=https://... QDRANT_API_KEY=... OPENAI_API_KEY=sk-... fabric-aiana
 *
 * Or register via gateway.yaml:
 *   apps:
 *     - name: "@git-fabric/aiana"
 *       enabled: true
 */

import { createApp } from "../dist/app.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const app = createApp();

const server = new Server(
  { name: app.name, version: app.version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: app.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = app.tools.find((t) => t.name === req.params.name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      isError: true,
    };
  }
  try {
    const result = await tool.execute(req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: String(e) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
