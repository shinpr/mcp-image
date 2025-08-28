/**
 * MCP-related type definitions
 * Defines types related to @modelcontextprotocol/sdk and project-specific types
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
