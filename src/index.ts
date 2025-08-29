#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
/**
 * MCP Image Generator entry point
 * MCP server startup process
 */
import { MCPServerImpl } from './server/mcpServer'
import { Logger } from './utils/logger'

const logger = new Logger()

/**
 * Application startup
 */
async function main(): Promise<void> {
  try {
    logger.info('mcp-startup', 'Starting MCP Image Generator initialization', {
      nodeVersion: process.version,
      platform: process.platform,
      env: process.env['NODE_ENV'] || 'development',
    })

    const mcpServerImpl = new MCPServerImpl()

    const server = mcpServerImpl.initialize()

    const transport = new StdioServerTransport()

    await server.connect(transport)

    logger.info('mcp-startup', 'Image Generator MCP Server started successfully')
  } catch (error) {
    logger.error('mcp-startup', 'Failed to start MCP server', error as Error, {
      errorType: (error as Error)?.constructor?.name,
      stack: (error as Error)?.stack,
    })
    process.exit(1)
  }
}

// Run main function
main().catch((error) => {
  logger.error('mcp-startup', 'Fatal error during startup', error as Error)
  process.exit(1)
})

export { createMCPServer, MCPServerImpl } from './server/mcpServer'
export type { GenerateImageParams, MCPServerConfig } from './types/mcp'
export type { GeneratedImageResult } from './api/geminiClient'
