/**
 * Unit tests for POML Template Engine
 * Tests Microsoft POML syntax processing and CONFIG3 feature flag control
 * Follows TDD approach: Red-Green-Refactor
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type {
  FeatureFlags,
  POMLTemplate,
  POMLTemplateEngine,
  StructuredPrompt,
} from '../pomlTemplateEngine'
import { createPOMLTemplateEngine } from '../pomlTemplateEngine'

describe('POMLTemplateEngine', () => {
  let engine: POMLTemplateEngine

  beforeEach(() => {
    engine = createPOMLTemplateEngine()
  })

  describe('Interface Definition', () => {
    it('should create engine instance successfully', () => {
      expect(engine).toBeDefined()
      expect(typeof engine.applyTemplate).toBe('function')
      expect(typeof engine.parseTemplate).toBe('function')
      expect(typeof engine.validateTemplate).toBe('function')
      expect(typeof engine.getAvailableTemplates).toBe('function')
      expect(typeof engine.configureFeatureFlags).toBe('function')
      expect(typeof engine.getFeatureFlags).toBe('function')
    })

    it('should have default feature flags enabled', () => {
      const flags = engine.getFeatureFlags()
      expect(flags).toEqual({
        hyperSpecific: true,
        characterConsistency: true,
        contextIntent: true,
        semanticNegatives: true,
        cameraControl: true,
        aspectRatio: true,
        iterateRefine: true,
      })
    })
  })

  describe('POML Template Parsing', () => {
    it('should parse basic POML template structure', async () => {
      const pomlString = `
        <template id="test-template" name="Test Template">
          <role>Image generation assistant</role>
          <task>Generate detailed image</task>
          <context>{originalPrompt}</context>
          <constraints>
            <quality>High resolution</quality>
            <style>Professional</style>
          </constraints>
        </template>
      `

      const result = engine.parseTemplate(pomlString)

      // Should succeed with enhanced validation
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe('test-template')
        expect(result.data.name).toBe('Test Template')
        expect(result.data.structure.role).toBe('Image generation assistant')
        expect(result.data.structure.task).toBe('Generate detailed image')
        expect(result.data.structure.context).toBe('{originalPrompt}')
      }
    })

    it('should handle malformed POML template gracefully', async () => {
      const malformedPoml = '<template><unclosed-tag>content'

      const result = engine.parseTemplate(malformedPoml)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Template parsing failed')
      }
    })

    it('should parse POML features with categories', async () => {
      const pomlWithFeatures = `
        <template id="feature-test">
          <features>
            <feature name="hyper-specific" enabled="true" category="basic" priority="1" />
            <feature name="character-consistency" enabled="false" category="advanced" priority="2" />
          </features>
        </template>
      `

      const result = engine.parseTemplate(pomlWithFeatures)

      // Should succeed with fallback features
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.features).toBeDefined()
        expect(result.data.features.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Template Validation', () => {
    it('should validate complete template successfully', () => {
      const validTemplate: POMLTemplate = {
        id: 'valid-template',
        name: 'Valid Template',
        structure: {
          role: 'assistant',
          task: 'generate',
        },
        features: [
          {
            name: 'hyper-specific',
            enabled: true,
            priority: 1,
            category: 'basic',
          },
        ],
        metadata: {
          version: '1.0.0',
          author: 'Test',
          description: 'Test template',
          tags: [],
          created: new Date(),
          lastModified: new Date(),
        },
      }

      const result = engine.validateTemplate(validTemplate)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing required fields', () => {
      const invalidTemplate: POMLTemplate = {
        id: '',
        name: '',
        structure: {},
        features: [],
        metadata: {
          version: '1.0.0',
          author: 'Test',
          description: 'Test template',
          tags: [],
          created: new Date(),
          lastModified: new Date(),
        },
      }

      const result = engine.validateTemplate(invalidTemplate)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Template ID is required')
      expect(result.errors).toContain('Template name is required')
    })

    it('should detect dependency violations in features', () => {
      const templateWithBadDeps: POMLTemplate = {
        id: 'dep-test',
        name: 'Dependency Test',
        structure: {},
        features: [
          {
            name: 'dependent-feature',
            enabled: true,
            priority: 1,
            category: 'basic',
            dependencies: ['non-existent-feature'],
          },
        ],
        metadata: {
          version: '1.0.0',
          author: 'Test',
          description: 'Test template',
          tags: [],
          created: new Date(),
          lastModified: new Date(),
        },
      }

      const result = engine.validateTemplate(templateWithBadDeps)

      expect(result.valid).toBe(false)
      expect(result.errors.some((err) => err.includes('depends on missing feature'))).toBe(true)
    })
  })

  describe('CONFIG3: Feature Flag Granular Control', () => {
    it('should configure individual feature flags', () => {
      const customFlags: Partial<FeatureFlags> = {
        hyperSpecific: false,
        characterConsistency: true,
        cameraControl: false,
      }

      const success = engine.configureFeatureFlags(customFlags)

      expect(success).toBe(true)

      const currentFlags = engine.getFeatureFlags()
      expect(currentFlags.hyperSpecific).toBe(false)
      expect(currentFlags.characterConsistency).toBe(true)
      expect(currentFlags.cameraControl).toBe(false)
      // Other flags should remain unchanged
      expect(currentFlags.contextIntent).toBe(true)
    })

    it('should apply only enabled features during template processing', async () => {
      // Configure selective feature flags
      engine.configureFeatureFlags({
        hyperSpecific: true,
        characterConsistency: false,
        contextIntent: false,
        semanticNegatives: false,
        cameraControl: false,
        aspectRatio: false,
      })

      const template = engine.getAvailableTemplates()[0]
      const result = await engine.applyTemplate('test prompt', template)

      expect(result.success).toBe(true)
      if (result.success) {
        const appliedFeatures = result.data.processingMeta.appliedFeatures
        expect(appliedFeatures).toContain('hyper-specific')
        expect(appliedFeatures).not.toContain('character-consistency')
        expect(appliedFeatures).not.toContain('context-intent')
      }
    })

    it('should support runtime feature flag overrides in template options', async () => {
      // Set engine defaults
      engine.configureFeatureFlags({
        hyperSpecific: false,
        characterConsistency: false,
      })

      const template = engine.getAvailableTemplates()[0]

      // Override specific flags for this template application
      const result = await engine.applyTemplate('test prompt', template, {
        featureFlags: {
          hyperSpecific: true, // Override to enabled
          characterConsistency: true, // Override to enabled
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        const featureFlags = result.data.processingMeta.featureFlags
        expect(featureFlags.hyperSpecific).toBe(true)
        expect(featureFlags.characterConsistency).toBe(true)
      }
    })

    it('should track applied feature flags in processing metadata', async () => {
      const template = engine.getAvailableTemplates()[0]
      const result = await engine.applyTemplate('character in fantasy setting', template)

      expect(result.success).toBe(true)
      if (result.success) {
        const meta = result.data.processingMeta
        expect(meta.featureFlags).toBeDefined()
        expect(meta.appliedFeatures).toBeInstanceOf(Array)
        expect(meta.templateId).toBe(template.id)
        expect(meta.timestamp).toBeInstanceOf(Date)
        expect(typeof meta.processingTime).toBe('number')
      }
    })
  })

  describe('Template Application Logic', () => {
    it('should apply hyper-specific enhancements when enabled', async () => {
      engine.configureFeatureFlags({
        hyperSpecific: true,
        characterConsistency: false,
        contextIntent: false,
        semanticNegatives: false,
        cameraControl: false,
        aspectRatio: false,
      })

      const template = engine.getAvailableTemplates()[0]
      const result = await engine.applyTemplate('fantasy armor', template)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.structuredPrompt).toContain('Enhanced with hyper-specific details')
        expect(result.data.processingMeta.appliedFeatures).toContain('hyper-specific')
      }
    })

    it('should apply character consistency features when enabled', async () => {
      engine.configureFeatureFlags({
        hyperSpecific: false,
        characterConsistency: true,
        contextIntent: false,
        semanticNegatives: false,
        cameraControl: false,
        aspectRatio: false,
      })

      const template = engine.getAvailableTemplates()[0]
      const result = await engine.applyTemplate('a warrior character', template)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.structuredPrompt).toContain('detailed facial features')
        expect(result.data.processingMeta.appliedFeatures).toContain('character-consistency')
      }
    })

    it('should apply semantic negatives conversion when enabled', async () => {
      engine.configureFeatureFlags({
        hyperSpecific: false,
        characterConsistency: false,
        contextIntent: false,
        semanticNegatives: true,
        cameraControl: false,
        aspectRatio: false,
      })

      const template = engine.getAvailableTemplates()[0]
      const result = await engine.applyTemplate('no cars on road', template)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.structuredPrompt).toContain('quiet empty street')
        expect(result.data.structuredPrompt).not.toContain('no cars')
        expect(result.data.processingMeta.appliedFeatures).toContain('semantic-negatives')
      }
    })

    it('should apply camera control enhancements when enabled', async () => {
      engine.configureFeatureFlags({
        hyperSpecific: false,
        characterConsistency: false,
        contextIntent: false,
        semanticNegatives: false,
        cameraControl: true,
        aspectRatio: false,
      })

      const template = engine.getAvailableTemplates()[0]
      const result = await engine.applyTemplate('portrait shot', template)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.structuredPrompt).toContain('85mm portrait lens')
        expect(result.data.processingMeta.appliedFeatures).toContain('camera-control')
      }
    })

    it('should handle empty prompts with appropriate error', async () => {
      const template = engine.getAvailableTemplates()[0]
      const result = await engine.applyTemplate('', template)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Empty prompt provided')
      }
    })

    it('should handle invalid templates with validation errors', async () => {
      const invalidTemplate: POMLTemplate = {
        id: '',
        name: '',
        structure: {},
        features: [],
        metadata: {
          version: '1.0.0',
          author: 'Test',
          description: 'Test template',
          tags: [],
          created: new Date(),
          lastModified: new Date(),
        },
      }

      const result = await engine.applyTemplate('test prompt', invalidTemplate)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('Template validation failed')
      }
    })
  })

  describe('Built-in Template Library', () => {
    it('should provide built-in templates', () => {
      const templates = engine.getAvailableTemplates()

      expect(templates).toBeInstanceOf(Array)
      expect(templates.length).toBeGreaterThan(0)

      const basicTemplate = templates.find((t) => t.id === 'basic-image-generation')
      expect(basicTemplate).toBeDefined()
      expect(basicTemplate?.name).toBe('Basic Image Generation Template')
    })

    it('should have valid built-in template structure', () => {
      const templates = engine.getAvailableTemplates()
      const basicTemplate = templates[0]

      const validation = engine.validateTemplate(basicTemplate)
      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })
  })

  describe('Performance and Processing', () => {
    it('should complete template application within reasonable time', async () => {
      const template = engine.getAvailableTemplates()[0]
      const startTime = Date.now()

      const result = await engine.applyTemplate('performance test prompt', template)
      const processingTime = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(processingTime).toBeLessThan(1000) // Should complete in under 1 second

      if (result.success) {
        expect(result.data.processingMeta.processingTime).toBeGreaterThan(0)
      }
    })

    it('should preserve original prompt in result', async () => {
      const originalPrompt = 'original test prompt'
      const template = engine.getAvailableTemplates()[0]

      const result = await engine.applyTemplate(originalPrompt, template)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.originalPrompt).toBe(originalPrompt)
        expect(result.data.structuredPrompt).not.toBe(originalPrompt)
      }
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle concurrent template applications', async () => {
      const template = engine.getAvailableTemplates()[0]
      const promises = [
        engine.applyTemplate('prompt 1', template),
        engine.applyTemplate('prompt 2', template),
        engine.applyTemplate('prompt 3', template),
      ]

      const results = await Promise.all(promises)

      results.forEach((result, index) => {
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.originalPrompt).toBe(`prompt ${index + 1}`)
        }
      })
    })

    it('should maintain feature flag isolation between instances', () => {
      const engine1 = createPOMLTemplateEngine({ hyperSpecific: true })
      const engine2 = createPOMLTemplateEngine({ hyperSpecific: false })

      const flags1 = engine1.getFeatureFlags()
      const flags2 = engine2.getFeatureFlags()

      expect(flags1.hyperSpecific).toBe(true)
      expect(flags2.hyperSpecific).toBe(false)
    })

    it('should handle feature flag configuration errors gracefully', () => {
      // This should not throw but return false for invalid operations
      const result = engine.configureFeatureFlags({} as FeatureFlags)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('Integration with CONFIG3 Test Requirements', () => {
    it('should support granular feature flag control as required by CONFIG3', async () => {
      // This test specifically targets CONFIG3 requirements
      const template = engine.getAvailableTemplates()[0]

      // Test individual feature control
      const featuresToTest: (keyof FeatureFlags)[] = [
        'hyperSpecific',
        'characterConsistency',
        'contextIntent',
        'semanticNegatives',
        'cameraControl',
        'aspectRatio',
      ]

      for (const featureName of featuresToTest) {
        // Enable only this feature
        const flags: Partial<FeatureFlags> = {
          hyperSpecific: false,
          characterConsistency: false,
          contextIntent: false,
          semanticNegatives: false,
          cameraControl: false,
          aspectRatio: false,
        }
        flags[featureName] = true

        engine.configureFeatureFlags(flags)

        const result = await engine.applyTemplate('test prompt for feature control', template)

        expect(result.success).toBe(true)
        if (result.success) {
          // Verify that the feature flags are correctly applied
          expect(result.data.processingMeta.featureFlags[featureName]).toBe(true)

          // Verify other features are disabled
          const otherFeatures = featuresToTest.filter((f) => f !== featureName)
          for (const otherFeature of otherFeatures) {
            expect(result.data.processingMeta.featureFlags[otherFeature]).toBe(false)
          }
        }
      }
    })

    it('should provide feature flag metadata for orchestration components', async () => {
      const template = engine.getAvailableTemplates()[0]
      const result = await engine.applyTemplate('orchestration test', template)

      expect(result.success).toBe(true)
      if (result.success) {
        // CONFIG3 requirement: metadata should include granular feature control info
        expect(result.data.processingMeta.featureFlags).toBeDefined()
        expect(result.data.processingMeta.appliedFeatures).toBeInstanceOf(Array)

        // Should support querying current configuration
        const currentFlags = engine.getFeatureFlags()
        expect(currentFlags).toBeDefined()
        expect(typeof currentFlags.hyperSpecific).toBe('boolean')
        expect(typeof currentFlags.characterConsistency).toBe('boolean')
      }
    })
  })
})
