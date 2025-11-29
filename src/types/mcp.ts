/**
 * MCP-related type definitions
 * Defines types related to @modelcontextprotocol/sdk and project-specific types
 */

/**
 * Context method type for image generation metadata
 */

/**
 * Supported aspect ratios for Gemini image generation
 */
export type AspectRatio =
  | '1:1' // Square (default)
  | '2:3' // Portrait
  | '3:2' // Landscape
  | '3:4' // Portrait
  | '4:3' // Landscape
  | '4:5' // Portrait
  | '5:4' // Landscape
  | '9:16' // Vertical (social media)
  | '16:9' // Horizontal (cinematic)
  | '21:9' // Ultra-wide

/**
 * Supported image sizes for high-resolution output
 */
export type ImageSize = '2K' | '4K'

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
  /** Enable Google Search grounding for real-time web information (default: false) */
  useGoogleSearch?: boolean
  /** Aspect ratio for generated image (default: "1:1") */
  aspectRatio?: AspectRatio
  /** Image resolution for high-quality output (e.g., "2K", "4K"). Leave unspecified for standard quality */
  imageSize?: ImageSize
  /** Intended use for the image (e.g., cookbook cover, social media post). Helps tailor visual style and quality */
  purpose?: string
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
