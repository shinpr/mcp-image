import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { MCPServerImpl } from './server/mcpServer.js'
import { toError } from './utils/errors.js'
import { Logger } from './utils/logger.js'

const logger = new Logger()

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
    const startupError = toError(error)
    logger.error('mcp-startup', 'Failed to start MCP server', startupError, {
      errorType: startupError.constructor.name,
      stack: startupError.stack,
    })
    process.exit(1)
  }
}

main().catch((error: unknown) => {
  logger.error('mcp-startup', 'Fatal error during startup', toError(error))
  process.exit(1)
})
