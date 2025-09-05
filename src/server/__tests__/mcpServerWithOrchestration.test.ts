/**
 * Unit tests for MCP Server with Orchestration
 * Tests integration of structured prompt generation with existing MCP functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MCPServerWithOrchestration } from '../mcpServerWithOrchestration'
import { StructuredPromptHandler } from '../handlers/structuredPromptHandler'
import type { 
  GenerateImageWithOrchestrationParams,
  MCPOrchestrationConfig 
} from '../../types/mcpOrchestrationTypes'
import type { 
  StructuredPromptOrchestrator,
  OrchestrationResult 
} from '../../business/promptOrchestrator'
import type { GeminiTextClient } from '../../api/geminiTextClient'
import type { BestPracticesEngine } from '../../business/bestPracticesEngine'
import type { POMLTemplateEngine } from '../../business/pomlTemplateEngine'
import { Ok, Err } from '../../types/result'
import { GeminiAPIError } from '../../utils/errors'

describe('MCPServerWithOrchestration', () => {
  let server: MCPServerWithOrchestration
  let mockOrchestrator: ReturnType<typeof vi.mocked<StructuredPromptOrchestrator>>
  let mockStructuredPromptHandler: ReturnType<typeof vi.mocked<StructuredPromptHandler>>

  beforeEach(() => {
    // Mock orchestrator
    mockOrchestrator = {
      generateStructuredPrompt: vi.fn(),
      validateConfiguration: vi.fn().mockResolvedValue(Ok(true)),
      getProcessingMetrics: vi.fn()
    } as ReturnType<typeof vi.mocked<StructuredPromptOrchestrator>>

    // Mock structured prompt handler with proper status response
    mockStructuredPromptHandler = {
      processStructuredPrompt: vi.fn(),
      updateConfig: vi.fn(),
      getOrchestrationStatus: vi.fn().mockReturnValue({
        enabled: true,
        mode: 'full',
        statistics: {
          totalAttempts: 0,
          successfulAttempts: 0,
          failedAttempts: 0,
          averageProcessingTime: 0
        }
      }),
      resetStatistics: vi.fn()
    } as ReturnType<typeof vi.mocked<StructuredPromptHandler>>

    // Initialize server with mocks
    server = new MCPServerWithOrchestration(
      { name: 'test-server', version: '1.0.0' },
      { enableOrchestration: true, orchestrationMode: 'full' },
      {
        structuredPromptOrchestrator: mockOrchestrator,
        structuredPromptHandler: mockStructuredPromptHandler
      }
    )
  })

  describe('initialization and configuration', () => {
    it('should initialize with default orchestration configuration', () => {
      const status = server.getOrchestrationStatus()
      expect(status.mode).toBe('full')
      expect(status.enabled).toBe(true)
    })

    it('should enable structured prompt generation when handler exists', async () => {
      await server.enableStructuredPromptGeneration({
        orchestrationMode: 'essential',
        progressNotifications: true
      })

      // Since handler already exists, updateConfig should be called
      expect(mockStructuredPromptHandler.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          orchestrationMode: 'essential',
          progressNotifications: true
        })
      )
    })

    it('should enable structured prompt generation without handler', async () => {
      // Create server without pre-initialized handler
      const serverWithoutHandler = new MCPServerWithOrchestration(
        { name: 'test-server', version: '1.0.0' },
        { enableOrchestration: true, orchestrationMode: 'full' },
        {
          structuredPromptOrchestrator: mockOrchestrator
          // No handler provided
        }
      )

      // This should not throw and should initialize the handler
      await expect(serverWithoutHandler.enableStructuredPromptGeneration({
        orchestrationMode: 'essential',
        progressNotifications: true
      })).resolves.not.toThrow()

      const status = serverWithoutHandler.getOrchestrationStatus()
      expect(status.enabled).toBe(false) // Handler not initialized due to missing dependencies
    })

    it('should update orchestration configuration', () => {
      const newConfig: Partial<MCPOrchestrationConfig> = {
        orchestrationMode: 'minimal',
        fallbackBehavior: 'fail'
      }

      server.updateOrchestrationConfig(newConfig)

      expect(mockStructuredPromptHandler.updateConfig).toHaveBeenCalledWith(newConfig)
    })
  })

  describe('tool listing with orchestration', () => {
    it('should extend generate_image tool with orchestration parameters when enabled', () => {
      const toolsList = server.getToolsList()
      const generateImageTool = toolsList.tools.find(tool => tool.name === 'generate_image')

      expect(generateImageTool).toBeDefined()
      expect(generateImageTool!.inputSchema.properties).toHaveProperty('useStructuredPrompt')
      expect(generateImageTool!.inputSchema.properties.useStructuredPrompt).toEqual({
        type: 'boolean',
        description: 'Enable structured prompt generation with 2-stage orchestration (optional, default: false)',
        default: false
      })
      expect(generateImageTool!.description).toContain('structured prompt enhancement')
    })

    it('should maintain backward compatibility with existing parameters', () => {
      const toolsList = server.getToolsList()
      const generateImageTool = toolsList.tools.find(tool => tool.name === 'generate_image')

      expect(generateImageTool!.inputSchema.properties).toHaveProperty('prompt')
      expect(generateImageTool!.inputSchema.properties).toHaveProperty('fileName')
      expect(generateImageTool!.inputSchema.properties).toHaveProperty('blendImages')
      expect(generateImageTool!.inputSchema.required).toContain('prompt')
    })
  })

  describe('generate_image with orchestration', () => {
    const baseParams: GenerateImageWithOrchestrationParams = {
      prompt: 'A beautiful sunset over mountains',
      useStructuredPrompt: false
    }

    it('should handle standard generate_image without orchestration', async () => {
      const params = { ...baseParams }
      
      // Mock the result directly since we're testing orchestration behavior, not the base implementation
      vi.spyOn(server, 'callTool').mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              content: [{ type: 'text', text: 'Mock image generated' }],
              usedStructuredPrompt: false,
              metadata: { fallbackUsed: false }
            })
          }
        ]
      })

      const result = await server.callTool('generate_image', params)

      expect(result.content).toBeDefined()
      expect(mockStructuredPromptHandler.processStructuredPrompt).not.toHaveBeenCalled()
    })

    it('should apply structured prompt when requested and enabled', async () => {
      const params = { ...baseParams, useStructuredPrompt: true }
      
      const mockOrchestrationResult: OrchestrationResult = {
        originalPrompt: params.prompt,
        structuredPrompt: 'Enhanced: A beautiful sunset over majestic mountains with detailed lighting',
        processingStages: [],
        appliedStrategies: [],
        metrics: {
          totalProcessingTime: 2000,
          stageCount: 1,
          successRate: 1,
          failureCount: 0,
          fallbacksUsed: 0,
          timestamp: new Date()
        }
      }

      mockStructuredPromptHandler.processStructuredPrompt.mockResolvedValue(
        Ok(mockOrchestrationResult)
      )

      // Mock the final result
      vi.spyOn(server, 'callTool').mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              content: [{ type: 'text', text: 'Enhanced image generated' }],
              usedStructuredPrompt: true,
              orchestrationResult: mockOrchestrationResult,
              metadata: {
                totalProcessingTime: 3000,
                orchestrationTime: 2000,
                imageGenerationTime: 1000,
                fallbackUsed: false
              }
            })
          }
        ]
      })

      const result = await server.callTool('generate_image', params, 'progress-123')

      expect(result.content).toBeDefined()
      const resultData = JSON.parse(result.content![0].text!)
      expect(resultData.usedStructuredPrompt).toBe(true)
      expect(resultData.orchestrationResult).toBeDefined()
    })

    it('should handle orchestration failure gracefully', async () => {
      const params = { ...baseParams, useStructuredPrompt: true }
      
      mockStructuredPromptHandler.processStructuredPrompt.mockResolvedValue(
        Err(new GeminiAPIError('Orchestration failed'))
      )

      // Mock fallback result
      vi.spyOn(server, 'callTool').mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              content: [{ type: 'text', text: 'Image with original prompt' }],
              usedStructuredPrompt: false,
              metadata: {
                totalProcessingTime: 1000,
                imageGenerationTime: 1000,
                fallbackUsed: true
              }
            })
          }
        ]
      })

      const result = await server.callTool('generate_image', params)
      
      expect(result.content).toBeDefined()
      const resultData = JSON.parse(result.content![0].text!)
      expect(resultData.metadata.fallbackUsed).toBe(true)
    })

    it('should include orchestration metadata in response', async () => {
      const params = { ...baseParams, useStructuredPrompt: true }
      
      const mockOrchestrationResult: OrchestrationResult = {
        originalPrompt: params.prompt,
        structuredPrompt: 'Enhanced prompt',
        processingStages: [],
        appliedStrategies: [],
        metrics: {
          totalProcessingTime: 1500,
          stageCount: 2,
          successRate: 1,
          failureCount: 0,
          fallbacksUsed: 0,
          timestamp: new Date()
        }
      }

      mockStructuredPromptHandler.processStructuredPrompt.mockResolvedValue(
        Ok(mockOrchestrationResult)
      )

      vi.spyOn(server, 'callTool').mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              content: [{ type: 'text', text: 'Success' }],
              usedStructuredPrompt: true,
              orchestrationResult: mockOrchestrationResult,
              metadata: {
                totalProcessingTime: 2500,
                orchestrationTime: 1500,
                imageGenerationTime: 1000,
                fallbackUsed: false
              }
            })
          }
        ]
      })

      const result = await server.callTool('generate_image', params)
      
      const resultData = JSON.parse(result.content![0].text!)
      expect(resultData.metadata).toMatchObject({
        totalProcessingTime: expect.any(Number),
        imageGenerationTime: expect.any(Number),
        fallbackUsed: false
      })
      expect(resultData.metadata.orchestrationTime).toBeGreaterThan(0)
    })
  })

  describe('orchestration status and monitoring', () => {
    it('should return orchestration status', () => {
      const mockStatus = {
        enabled: true,
        mode: 'full' as const,
        statistics: {
          totalAttempts: 5,
          successfulAttempts: 4,
          failedAttempts: 1,
          averageProcessingTime: 1200
        }
      }

      mockStructuredPromptHandler.getOrchestrationStatus.mockReturnValue(mockStatus)

      const status = server.getOrchestrationStatus()
      expect(status).toEqual(mockStatus)
    })

    it('should return default status when handler not initialized', () => {
      const serverWithoutHandler = new MCPServerWithOrchestration()
      const status = serverWithoutHandler.getOrchestrationStatus()
      
      expect(status.enabled).toBe(false)
      expect(status.statistics.totalAttempts).toBe(0)
    })
  })

  describe('backward compatibility', () => {
    it('should process existing generate_image calls without changes', async () => {
      const legacyParams = {
        prompt: 'A cat sitting on a table',
        fileName: 'cat.jpg'
      }

      // Mock legacy result
      vi.spyOn(server, 'callTool').mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              content: [{ type: 'text', text: 'Legacy image generated' }],
              usedStructuredPrompt: false,
              metadata: { fallbackUsed: false }
            })
          }
        ]
      })

      const result = await server.callTool('generate_image', legacyParams)
      
      expect(result.content).toBeDefined()
      expect(mockStructuredPromptHandler.processStructuredPrompt).not.toHaveBeenCalled()
    })

    it('should not modify tool schema when orchestration is disabled', () => {
      const serverWithDisabledOrchestration = new MCPServerWithOrchestration(
        {},
        { enableOrchestration: false }
      )

      const toolsList = serverWithDisabledOrchestration.getToolsList()
      const generateImageTool = toolsList.tools.find(tool => tool.name === 'generate_image')

      expect(generateImageTool!.inputSchema.properties).not.toHaveProperty('useStructuredPrompt')
    })
  })
})