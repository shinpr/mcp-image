/**
 * MCP-related type definitions
 * Defines types related to @modelcontextprotocol/sdk and project-specific types
 */

/**
 * Context method type for image generation metadata
 */

/**
 * Parameters for image generation using Gemini API
 */
export interface GenerateImageParams {
  /** Prompt for image generation */
  prompt: string
  /** Output path (auto-generated if omitted) */
  outputPath?: string
  /** Image path to edit (for image editing) */
  inputImagePath?: string
  /** Output format */
  outputFormat?: 'PNG' | 'JPEG' | 'WebP'
  /** Enable URL context extraction and processing (default: false) */
  enableUrlContext?: boolean
}

/**
 * Image generation result
 */
export interface GenerateImageResult {
  /** Success flag */
  success: boolean
  /** Path of the generated image */
  imagePath?: string
  /** Error message */
  error?: string
  /** Execution time (milliseconds) */
  executionTime?: number
}

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  /** Server name */
  name: string
  /** Version */
  version: string
  /** Default image output directory */
  defaultOutputDir: string
}

/**
 * MCP Tool Response format
 */
export interface McpToolResponse {
  content: [
    {
      type: 'text'
      text: string
    },
  ]
  isError?: boolean
  _meta?: {
    progressToken?: string
  }
}

/**
 * Structured content for successful responses
 */
export interface StructuredContent {
  type: 'resource'
  resource: {
    uri: string
    name: string
    mimeType: string
  }
  metadata: {
    model: string
    processingTime: number
    contextMethod: string
    timestamp: string
  }
}

/**
 * Structured error for error responses
 */
export interface StructuredError {
  error: {
    code: string
    message: string
    suggestion: string
  }
}
