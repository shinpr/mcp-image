import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
/**
 * MCP Image Generator entry point
 * MCP server startup process
 */
import { MCPServerImpl } from './server/mcpServer'

/**
 * Application startup
 */
async function main(): Promise<void> {
  try {
    const mcpServerImpl = new MCPServerImpl()
    const server = mcpServerImpl.initialize()
    const transport = new StdioServerTransport()

    await server.connect(transport)

    console.error('Gemini Image Generator MCP Server started')
  } catch (error) {
    console.error('Failed to start MCP server:', error)
    process.exit(1)
  }
}

// Check if running in ESModule environment
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  main()
}

export { createMCPServer, MCPServerImpl } from './server/mcpServer'
export type { GenerateImageParams, GenerateImageResult, MCPServerConfig } from './types/mcp'
