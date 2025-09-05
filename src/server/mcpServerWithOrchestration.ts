/**
 * MCP Server with Orchestration Support
 * Extends basic MCP server with structured prompt generation capabilities
 * Maintains 100% backward compatibility with existing functionality
 */

// Base server functionality
import { type MCPServerDependencies, MCPServerImpl } from './mcpServer'

// Types and interfaces
import type { MCPServerConfig, McpToolResponse } from '../types/mcp'
import type {
  GenerateImageWithOrchestrationParams,
  MCPOrchestrationConfig,
  MCPOrchestrationResult,
  OrchestrationStatus,
} from '../types/mcpOrchestrationTypes'
import { DEFAULT_ORCHESTRATION_CONFIG } from '../types/mcpOrchestrationTypes'

// Orchestration components
import type {
  OrchestrationOptions,
  StructuredPromptOrchestrator,
} from '../business/promptOrchestrator'
import { StructuredPromptOrchestratorImpl } from '../business/promptOrchestrator'
import { StructuredPromptHandler } from './handlers/structuredPromptHandler'

// Business logic and API clients
import { type GeminiTextClient, createGeminiTextClient } from '../api/geminiTextClient'
import { type BestPracticesEngine, BestPracticesEngineImpl } from '../business/bestPracticesEngine'
import { validateGenerateImageParams } from '../business/inputValidator'
import { type POMLTemplateEngine, POMLTemplateEngineImpl } from '../business/pomlTemplateEngine'

// Utilities
import { getConfig } from '../utils/config'
import { Logger } from '../utils/logger'
import { ErrorHandler } from './errorHandler'

/**
 * Dependencies for orchestration-enabled MCP server
 */
export interface MCPServerWithOrchestrationDependencies extends MCPServerDependencies {
  geminiTextClient?: GeminiTextClient
  bestPracticesEngine?: BestPracticesEngine
  pomlTemplateEngine?: POMLTemplateEngine
  structuredPromptOrchestrator?: StructuredPromptOrchestrator
  structuredPromptHandler?: StructuredPromptHandler
}

/**
 * MCP Server with orchestration capabilities
 * Extends basic MCP server while maintaining backward compatibility
 */
export class MCPServerWithOrchestration extends MCPServerImpl {
  private orchestrationConfig: MCPOrchestrationConfig
  private structuredPromptHandler: StructuredPromptHandler | null = null
  private geminiTextClient: GeminiTextClient | null = null
  private orchestrator: StructuredPromptOrchestrator | null = null

  constructor(
    config: Partial<MCPServerConfig> = {},
    orchestrationConfig: Partial<MCPOrchestrationConfig> = {},
    dependencies: MCPServerWithOrchestrationDependencies = {}
  ) {
    super(config, dependencies)

    this.orchestrationConfig = { ...DEFAULT_ORCHESTRATION_CONFIG, ...orchestrationConfig }

    // Initialize orchestration components if provided
    if (dependencies.structuredPromptHandler) {
      this.structuredPromptHandler = dependencies.structuredPromptHandler
    }

    if (dependencies.geminiTextClient) {
      this.geminiTextClient = dependencies.geminiTextClient
    }

    if (dependencies.structuredPromptOrchestrator) {
      this.orchestrator = dependencies.structuredPromptOrchestrator
    }
  }

  /**
   * Enable structured prompt generation with orchestration components
   */
  async enableStructuredPromptGeneration(config?: Partial<MCPOrchestrationConfig>): Promise<void> {
    try {
      if (config) {
        this.orchestrationConfig = { ...this.orchestrationConfig, ...config }
      }

      // Initialize components if not already done
      if (!this.orchestrator) {
        await this.initializeOrchestrationComponents()
      }

      if (!this.orchestrator) {
        throw new Error('Failed to initialize orchestration components')
      }

      // Create structured prompt handler or update existing
      if (!this.structuredPromptHandler) {
        this.structuredPromptHandler = new StructuredPromptHandler(
          this.orchestrator,
          this.orchestrationConfig,
          { logger: new Logger() }
        )
      } else {
        // Update existing handler with new config
        this.structuredPromptHandler.updateConfig(this.orchestrationConfig)
      }

      this.orchestrationConfig.enableOrchestration = true

      const logger = new Logger()
      logger.info('mcp-orchestration', 'Structured prompt generation enabled', {
        mode: this.orchestrationConfig.orchestrationMode,
        progressNotifications: this.orchestrationConfig.progressNotifications,
      })
    } catch (error) {
      const logger = new Logger()
      logger.error(
        'mcp-orchestration',
        'Failed to enable structured prompt generation',
        error as Error
      )
      throw error
    }
  }

  /**
   * Get current orchestration status
   */
  getOrchestrationStatus(): OrchestrationStatus {
    if (!this.structuredPromptHandler) {
      return {
        enabled: false,
        mode: this.orchestrationConfig.orchestrationMode,
        statistics: {
          totalAttempts: 0,
          successfulAttempts: 0,
          failedAttempts: 0,
          averageProcessingTime: 0,
        },
      }
    }

    return this.structuredPromptHandler.getOrchestrationStatus()
  }

  /**
   * Update orchestration configuration
   */
  updateOrchestrationConfig(newConfig: Partial<MCPOrchestrationConfig>): void {
    this.orchestrationConfig = { ...this.orchestrationConfig, ...newConfig }

    if (this.structuredPromptHandler) {
      this.structuredPromptHandler.updateConfig(newConfig)
    }
  }

  /**
   * Override getToolsList to include orchestration parameters
   */
  public override getToolsList() {
    const baseTools = super.getToolsList()

    // Extend generate_image tool with orchestration parameters
    const generateImageTool = baseTools.tools.find((tool) => tool.name === 'generate_image')

    if (generateImageTool && this.orchestrationConfig.enableOrchestration) {
      // Extend properties with orchestration parameter
      const properties = generateImageTool.inputSchema.properties as Record<string, unknown>
      properties['useStructuredPrompt'] = {
        type: 'boolean' as const,
        description:
          'Enable structured prompt generation with 2-stage orchestration (optional, default: false)',
        default: false,
      }

      // Update description to mention orchestration
      generateImageTool.description =
        'Generate image with specified prompt and optional structured prompt enhancement'
    }

    return baseTools
  }

  /**
   * Override callTool to handle orchestration
   */
  public override async callTool(
    name: string,
    args: unknown,
    progressToken?: string | number
  ): Promise<McpToolResponse> {
    try {
      if (name === 'generate_image') {
        return await this.handleGenerateImageWithOrchestration(
          args as GenerateImageWithOrchestrationParams,
          progressToken
        )
      }

      // Delegate to parent for other tools
      return await super.callTool(name, args, progressToken)
    } catch (error) {
      const logger = new Logger()
      logger.error('mcp-orchestration', 'Tool execution failed', error as Error, {
        toolName: name,
        args,
      })
      return ErrorHandler.handleError(error as Error)
    }
  }

  /**
   * Handle generate_image with optional orchestration
   */
  private async handleGenerateImageWithOrchestration(
    params: GenerateImageWithOrchestrationParams,
    progressToken?: string | number
  ): Promise<McpToolResponse> {
    const startTime = new Date()

    // Use ErrorHandler.wrapWithResultType for safe execution
    const result = await ErrorHandler.wrapWithResultType(async () => {
      const logger = new Logger()

      // Validate input parameters (same as base implementation)
      const validationResult = validateGenerateImageParams(params)
      if (!validationResult.success) {
        throw validationResult.error
      }

      const server = this.getServerInstance()
      let structuredPrompt = params.prompt
      let orchestrationResult = undefined
      let orchestrationTime = 0

      // Apply structured prompt generation if requested and enabled
      if (
        params.useStructuredPrompt &&
        this.orchestrationConfig.enableOrchestration &&
        this.structuredPromptHandler
      ) {
        logger.info('mcp-orchestration', 'Starting structured prompt generation', {
          originalPrompt: params.prompt,
        })

        const orchestrationStart = new Date()

        const orchestrationOptions: OrchestrationOptions = {
          ...params.orchestrationOptions,
          // Map feature parameters to orchestration options (only when defined)
          ...(params.maintainCharacterConsistency !== undefined && {
            maintainCharacterConsistency: params.maintainCharacterConsistency,
          }),
          ...(params.blendImages !== undefined && { blendImages: params.blendImages }),
          ...(params.useWorldKnowledge !== undefined && {
            useWorldKnowledge: params.useWorldKnowledge,
          }),
        }

        const orchestrationRes = await this.structuredPromptHandler.processStructuredPrompt(
          params.prompt,
          orchestrationOptions,
          server || undefined,
          progressToken
        )

        orchestrationTime = new Date().getTime() - orchestrationStart.getTime()

        if (orchestrationRes.success) {
          structuredPrompt = orchestrationRes.data.structuredPrompt
          orchestrationResult = orchestrationRes.data

          logger.info('mcp-orchestration', 'Structured prompt generation successful', {
            originalLength: params.prompt.length,
            enhancedLength: structuredPrompt.length,
            orchestrationTime,
          })
        } else {
          logger.warn('mcp-orchestration', 'Structured prompt generation failed, using original', {
            error: orchestrationRes.error.message,
          })
          // Continue with original prompt (graceful fallback)
        }
      }

      // Update progress for image generation phase
      if (server && progressToken) {
        await server.notification({
          method: 'notifications/progress',
          params: {
            progressToken,
            progress: orchestrationResult ? 80 : 50,
            total: 100,
            message: 'Starting image generation...',
          },
        })
      }

      // Call parent implementation with structured prompt
      const updatedParams = { ...params, prompt: structuredPrompt }
      const baseResult = await super.callTool('generate_image', updatedParams, progressToken)

      // Enhance result with orchestration metadata
      const totalTime = new Date().getTime() - startTime.getTime()
      const imageGenerationTime = totalTime - orchestrationTime

      const enhancedResult: MCPOrchestrationResult = {
        content: baseResult.content || [],
        usedStructuredPrompt: !!params.useStructuredPrompt && !!orchestrationResult,
        ...(orchestrationResult && { orchestrationResult }),
        metadata: {
          totalProcessingTime: totalTime,
          ...(orchestrationTime > 0 && { orchestrationTime }),
          imageGenerationTime,
          fallbackUsed: !!(params.useStructuredPrompt && !orchestrationResult),
        },
      }

      return enhancedResult
    })

    if (!result.ok) {
      return ErrorHandler.handleError(result.error)
    }

    // Return result with orchestration metadata
    const orchestrationResult = result.value
    return {
      content: orchestrationResult.content
        .filter((item) => item.type === 'text')
        .map((item) => ({
          type: 'text' as const,
          text: item.text || 'Image generated successfully',
        })),
      structuredContent: orchestrationResult,
    }
  }

  /**
   * Initialize orchestration components
   */
  private async initializeOrchestrationComponents(): Promise<void> {
    try {
      // Load configuration
      const configResult = getConfig()
      if (!configResult.success) {
        throw configResult.error
      }

      // Initialize Gemini Text Client
      if (!this.geminiTextClient) {
        const geminiTextClientResult = createGeminiTextClient(configResult.data)
        if (!geminiTextClientResult.success) {
          throw geminiTextClientResult.error
        }
        this.geminiTextClient = geminiTextClientResult.data
      }

      // Initialize Best Practices Engine
      const bestPracticesEngine = new BestPracticesEngineImpl()

      // Initialize POML Template Engine
      const pomlTemplateEngine = new POMLTemplateEngineImpl()

      // Initialize Orchestrator
      this.orchestrator = new StructuredPromptOrchestratorImpl(
        this.geminiTextClient,
        bestPracticesEngine,
        pomlTemplateEngine
      )

      const logger = new Logger()
      logger.info('mcp-orchestration', 'Orchestration components initialized successfully')
    } catch (error) {
      const logger = new Logger()
      logger.error(
        'mcp-orchestration',
        'Failed to initialize orchestration components',
        error as Error
      )
      throw error
    }
  }
}
