#!/usr/bin/env node

// Redirect console.log to console.error to avoid breaking the MCP stdio transport
console.log = console.error;

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { registerProfileTool, handleProfileCall } from './tools/profile';
import { registerMirrorTool, handleMirrorCall } from './tools/mirror';
import { registerStatusTool, handleStatusCall } from './tools/status';
import { registerConnectTool, handleConnectCall } from './tools/connect';
import { registerQueryTool, handleQueryCall } from './tools/query';

const server = new Server(
  {
    name: 'isomorphdb-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      registerProfileTool(),
      registerMirrorTool(),
      registerStatusTool(),
      registerConnectTool(),
      registerQueryTool(),
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case 'isomorphdb_profile':
        return await handleProfileCall(request.params.arguments || {});
      case 'isomorphdb_morph':
        return await handleMirrorCall(request.params.arguments || {});
      case 'isomorphdb_status':
        return await handleStatusCall(request.params.arguments || {});
      case 'isomorphdb_connect':
        return await handleConnectCall();
      case 'isomorphdb_query':
        return await handleQueryCall(request.params.arguments || {});
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error executing tool: ${error.message}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('IsomorphDB MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
