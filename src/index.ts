#!/usr/bin/env node

/**
 * MCP Image Generator - Entry Point Router
 *
 * Routes to:
 * - skills install  → bin/install-skills.js
 * - (default)       → MCP server startup
 */

import { resolve } from 'node:path'

const args = process.argv.slice(2)

if (args[0] === 'skills') {
  if (args[1] === 'install') {
    const { run } = require(resolve(__dirname, '..', 'bin', 'install-skills.js'))
    run(args.slice(2))
    process.exit(0)
  } else {
    console.error('Unknown skills subcommand. Usage: npx mcp-image skills install --path <path>')
    console.error('Run "npx mcp-image skills install --help" for more information.')
    process.exit(1)
  }
} else {
  require('./server-main')
}

export { createMCPServer, MCPServerImpl } from './server/mcpServer'
export type { GenerateImageParams, MCPServerConfig } from './types/mcp'
export type { GeneratedImageResult } from './api/geminiClient'
