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
  /** Optional file name for the generated image (if not specified, generates an auto-named file in IMAGE_OUTPUT_DIR) */
  fileName?: string
  /** Absolute path to input image for editing (optional) */
  inputImagePath?: string
  /** Base64 encoded input image data (optional) */
  inputImage?: string
  /** MIME type of the input image (optional, used with inputImage) */
  inputImageMimeType?: string
  /** Multi-image blending functionality (default: false) */
  blendImages?: boolean
  /** Maintain character consistency across generations (default: false) */
  maintainCharacterConsistency?: boolean
  /** Use world knowledge integration for more accurate context (default: false) */
  useWorldKnowledge?: boolean
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
 * Content types for MCP responses
 */
export type McpContent = {
  type: 'text'
  text: string
}

/**
 * MCP Tool Response format
 */
export interface McpToolResponse {
  content: McpContent[]
  isError?: boolean
  structuredContent?: unknown
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
