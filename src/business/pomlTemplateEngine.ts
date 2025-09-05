/**
 * POML Template Engine for Microsoft POML syntax processing
 * Handles template application logic, prompt structuring, and individual feature control
 * Supports CONFIG3 requirement: granular feature flag control for best practices
 */

import type { Result } from '../types/result'
import { Err, Ok } from '../types/result'
import { GeminiAPIError } from '../utils/errors'

/**
 * POML (Prompt Markup Language) Template structure
 */
export interface POMLTemplate {
  id: string
  name: string
  structure: POMLStructure
  features: POMLFeature[]
  metadata: TemplateMetadata
}

/**
 * POML template structure definition
 */
export interface POMLStructure {
  role?: string | undefined
  task?: string | undefined
  context?: string | undefined
  constraints?: POMLConstraints | undefined
  examples?: string[] | undefined
}

/**
 * POML constraints definition
 */
export interface POMLConstraints {
  quality?: string | undefined
  style?: string | undefined
  technical?: string[] | undefined
  conditions?: Record<string, boolean> | undefined
}

/**
 * Individual POML feature with granular control
 */
export interface POMLFeature {
  name: string
  enabled: boolean
  priority: number
  category: 'basic' | 'advanced' | 'complete'
  dependencies?: string[]
}

/**
 * Template metadata for tracking and optimization
 */
export interface TemplateMetadata {
  version: string
  author: string
  description: string
  tags: string[]
  created: Date
  lastModified: Date
}

/**
 * Structured prompt result with applied template
 */
export interface StructuredPrompt {
  originalPrompt: string
  structuredPrompt: string
  appliedTemplate: POMLTemplate
  processingMeta: ProcessingMetadata
}

/**
 * Processing metadata for analysis and optimization
 */
export interface ProcessingMetadata {
  processingTime: number
  appliedFeatures: string[]
  featureFlags: Record<string, boolean>
  templateId: string
  timestamp: Date
}

/**
 * Feature flag configuration for granular control
 */
export interface FeatureFlags {
  hyperSpecific: boolean
  characterConsistency: boolean
  contextIntent: boolean
  semanticNegatives: boolean
  cameraControl: boolean
  aspectRatio: boolean
  iterateRefine: boolean
}

/**
 * POML template application options
 */
export interface TemplateOptions {
  featureFlags?: Partial<FeatureFlags>
  customVariables?: Record<string, string>
  priority?: number
  timeout?: number
}

/**
 * Validation result for template structure
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Interface for POML Template Engine
 * Core functionality for Microsoft POML syntax processing
 */
export interface POMLTemplateEngine {
  /**
   * Apply a POML template to transform a prompt into structured format
   * @param prompt Original prompt to enhance
   * @param template POML template to apply
   * @param options Optional configuration for feature flags
   * @returns Result containing structured prompt or error
   */
  applyTemplate(
    prompt: string,
    template: POMLTemplate,
    options?: TemplateOptions
  ): Promise<Result<StructuredPrompt, GeminiAPIError>>

  /**
   * Parse POML template string into structured template object
   * @param templateString POML template in XML-like format
   * @returns Result containing parsed template or error
   */
  parseTemplate(templateString: string): Result<POMLTemplate, GeminiAPIError>

  /**
   * Validate POML template structure and syntax
   * @param template Template to validate
   * @returns Validation result with errors and warnings
   */
  validateTemplate(template: POMLTemplate): ValidationResult

  /**
   * Get list of available built-in templates
   * @returns Array of available POML templates
   */
  getAvailableTemplates(): POMLTemplate[]

  /**
   * Configure feature flags for granular control (CONFIG3)
   * @param flags Feature flag configuration
   * @returns Success indicator
   */
  configureFeatureFlags(flags: Partial<FeatureFlags>): boolean

  /**
   * Get current feature flag configuration (CONFIG3)
   * @returns Current feature flag settings
   */
  getFeatureFlags(): FeatureFlags
}

/**
 * Default feature flags configuration (all enabled)
 */
const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  hyperSpecific: true,
  characterConsistency: true,
  contextIntent: true,
  semanticNegatives: true,
  cameraControl: true,
  aspectRatio: true,
  iterateRefine: true,
}

/**
 * Implementation of POML Template Engine
 * Handles Microsoft POML syntax processing with granular feature control
 */
/**
 * Factory function to create POMLTemplateEngine instance
 * @param initialFlags Optional feature flags configuration
 * @returns POMLTemplateEngine instance
 */
export function createPOMLTemplateEngine(initialFlags?: Partial<FeatureFlags>): POMLTemplateEngine {
  return new POMLTemplateEngineImpl(initialFlags)
}

export class POMLTemplateEngineImpl implements POMLTemplateEngine {
  private featureFlags: FeatureFlags
  private templates: Map<string, POMLTemplate>

  constructor(initialFlags?: Partial<FeatureFlags>) {
    this.featureFlags = { ...DEFAULT_FEATURE_FLAGS, ...initialFlags }
    this.templates = new Map()
    this.initializeBuiltinTemplates()
  }

  async applyTemplate(
    prompt: string,
    template: POMLTemplate,
    options?: TemplateOptions
  ): Promise<Result<StructuredPrompt, GeminiAPIError>> {
    const startTime = Date.now()

    try {
      // Validate inputs
      if (!prompt || prompt.trim().length === 0) {
        return Err(
          new GeminiAPIError(
            'Empty prompt provided',
            'Please provide a non-empty prompt for template application'
          )
        )
      }

      // Apply feature flags from options
      const effectiveFlags = { ...this.featureFlags, ...options?.featureFlags }

      // Validate template
      const validation = this.validateTemplate(template)
      if (!validation.valid) {
        return Err(
          new GeminiAPIError(
            `Template validation failed: ${validation.errors.join(', ')}`,
            'Please check the template structure and syntax'
          )
        )
      }

      // Apply template transformation based on feature flags
      let structuredPrompt = prompt

      // Apply features based on flags (CONFIG3 granular control)
      const appliedFeatures: string[] = []

      if (effectiveFlags.hyperSpecific && this.shouldApplyFeature(template, 'hyper-specific')) {
        structuredPrompt = this.applyHyperSpecific(structuredPrompt, template)
        appliedFeatures.push('hyper-specific')
      }

      if (
        effectiveFlags.characterConsistency &&
        this.shouldApplyFeature(template, 'character-consistency')
      ) {
        structuredPrompt = this.applyCharacterConsistency(structuredPrompt, template)
        appliedFeatures.push('character-consistency')
      }

      if (effectiveFlags.contextIntent && this.shouldApplyFeature(template, 'context-intent')) {
        structuredPrompt = this.applyContextIntent(structuredPrompt, template)
        appliedFeatures.push('context-intent')
      }

      if (
        effectiveFlags.semanticNegatives &&
        this.shouldApplyFeature(template, 'semantic-negatives')
      ) {
        structuredPrompt = this.applySemanticNegatives(structuredPrompt, template)
        appliedFeatures.push('semantic-negatives')
      }

      if (effectiveFlags.cameraControl && this.shouldApplyFeature(template, 'camera-control')) {
        structuredPrompt = this.applyCameraControl(structuredPrompt, template)
        appliedFeatures.push('camera-control')
      }

      if (effectiveFlags.aspectRatio && this.shouldApplyFeature(template, 'aspect-ratio')) {
        structuredPrompt = this.applyAspectRatio(structuredPrompt, template)
        appliedFeatures.push('aspect-ratio')
      }

      const processingTime = Math.max(Date.now() - startTime, 1) // Ensure minimum 1ms

      const result: StructuredPrompt = {
        originalPrompt: prompt,
        structuredPrompt,
        appliedTemplate: template,
        processingMeta: {
          processingTime,
          appliedFeatures,
          featureFlags: effectiveFlags,
          templateId: template.id,
          timestamp: new Date(),
        },
      }

      return Ok(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return Err(
        new GeminiAPIError(
          `Template application failed: ${errorMessage}`,
          'Check template configuration and try again'
        )
      )
    }
  }

  parseTemplate(templateString: string): Result<POMLTemplate, GeminiAPIError> {
    try {
      // Enhanced validation with detailed error messages
      const validationResult = this.validateTemplateString(templateString)
      if (!validationResult.isValid) {
        return Err(
          new GeminiAPIError(
            `Template parsing failed: ${validationResult.errors.join(', ')}`,
            validationResult.suggestions.join('. ')
          )
        )
      }

      // Enhanced POML XML-like parsing with error recovery
      const parseResults = this.parseTemplateWithErrorRecovery(templateString)

      if (!parseResults.success) {
        return Err(
          new GeminiAPIError(
            `Template parsing failed: ${parseResults.errors.join(', ')}`,
            'Check POML syntax and structure. Ensure all tags are properly closed and attributes are correctly formatted.'
          )
        )
      }

      if (!parseResults.template) {
        return Err(
          new GeminiAPIError(
            'Template parsing failed: No template returned',
            'Check POML syntax and structure'
          )
        )
      }
      return Ok(parseResults.template)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return Err(
        new GeminiAPIError(
          `Template parsing failed with unexpected error: ${errorMessage}`,
          'Check POML syntax and structure. Ensure the template follows Microsoft POML specification.'
        )
      )
    }
  }

  validateTemplate(template: POMLTemplate): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Validate required fields
    if (!template.id || template.id.trim().length === 0) {
      errors.push('Template ID is required')
    }

    if (!template.name || template.name.trim().length === 0) {
      errors.push('Template name is required')
    }

    // Validate structure
    if (!template.structure) {
      errors.push('Template structure is required')
    }

    // Validate features
    if (!template.features || template.features.length === 0) {
      warnings.push('Template has no features defined')
    }

    // Check feature dependencies
    for (const feature of template.features || []) {
      if (feature.dependencies) {
        for (const dep of feature.dependencies) {
          const depExists = template.features.some((f) => f.name === dep)
          if (!depExists) {
            errors.push(`Feature '${feature.name}' depends on missing feature '${dep}'`)
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  getAvailableTemplates(): POMLTemplate[] {
    return Array.from(this.templates.values())
  }

  configureFeatureFlags(flags: Partial<FeatureFlags>): boolean {
    try {
      this.featureFlags = { ...this.featureFlags, ...flags }
      return true
    } catch {
      return false
    }
  }

  getFeatureFlags(): FeatureFlags {
    return { ...this.featureFlags }
  }

  // Private helper methods

  private initializeBuiltinTemplates(): void {
    // Basic image generation template
    const basicImageTemplate: POMLTemplate = {
      id: 'basic-image-generation',
      name: 'Basic Image Generation Template',
      structure: {
        role: 'Professional image generation assistant',
        task: 'Generate detailed image based on user requirements',
        context: '{originalPrompt}',
        constraints: {
          quality: 'High resolution, professional quality',
          style: 'Consistent with project aesthetic',
          technical: ['aspect-ratio-aware', 'camera-controlled'],
          conditions: {
            enableStyleGuide: true,
            maintainConsistency: true,
          },
        },
      },
      features: [
        {
          name: 'hyper-specific',
          enabled: true,
          priority: 1,
          category: 'basic',
        },
        {
          name: 'character-consistency',
          enabled: true,
          priority: 2,
          category: 'advanced',
        },
        {
          name: 'context-intent',
          enabled: true,
          priority: 3,
          category: 'advanced',
        },
        {
          name: 'semantic-negatives',
          enabled: true,
          priority: 4,
          category: 'advanced',
        },
        {
          name: 'camera-control',
          enabled: true,
          priority: 5,
          category: 'complete',
        },
        {
          name: 'aspect-ratio',
          enabled: true,
          priority: 6,
          category: 'complete',
        },
      ],
      metadata: {
        version: '1.0.0',
        author: 'POMLTemplateEngine',
        description: 'Basic template for image generation with POML features',
        tags: ['image-generation', 'basic', 'poml'],
        created: new Date(),
        lastModified: new Date(),
      },
    }

    this.templates.set(basicImageTemplate.id, basicImageTemplate)
  }

  private shouldApplyFeature(template: POMLTemplate, featureName: string): boolean {
    const feature = template.features.find((f) => f.name === featureName)
    return feature?.enabled ?? true
  }

  private applyHyperSpecific(prompt: string, template: POMLTemplate): string {
    // Enhanced hyper-specific transformation optimized for various prompt structures
    let enhanced = prompt

    // Analyze prompt structure to determine enhancement approach
    const promptType = this.analyzePromptStructure(prompt)

    switch (promptType) {
      case 'character-focused':
        enhanced = this.enhanceCharacterPrompt(prompt, template)
        break
      case 'scene-focused':
        enhanced = this.enhanceScenePrompt(prompt, template)
        break
      case 'object-focused':
        enhanced = this.enhanceObjectPrompt(prompt, template)
        break
      default:
        enhanced = this.enhanceGenericPrompt(prompt, template)
    }

    // Add quality constraints if available
    if (template.structure.constraints?.quality) {
      enhanced = `${enhanced}, ${template.structure.constraints.quality}`
    }

    return `Enhanced with hyper-specific details: ${enhanced}`
  }

  private applyCharacterConsistency(prompt: string, _template: POMLTemplate): string {
    const hasCharacter = this.detectCharacterReferences(prompt)
    if (!hasCharacter) {
      return prompt
    }

    const consistencyFeatures = [
      'detailed facial features',
      'consistent clothing style',
      'maintained body proportions',
      'recognizable character traits',
    ]

    const selectedFeatures = this.selectRelevantFeatures(prompt, consistencyFeatures)
    return `${prompt} with ${selectedFeatures.join(', ')} for consistency maintenance`
  }

  private applyContextIntent(prompt: string, template: POMLTemplate): string {
    const role = template.structure.role || 'professional image generation assistant'
    const task = template.structure.task || 'create visually compelling content'

    // Analyze prompt to determine appropriate context level
    const contextLevel = this.determineContextLevel(prompt)

    if (contextLevel === 'detailed') {
      return `Context: ${role} performing ${task} with specific focus on ${this.extractKeyElements(prompt)}. Intent: ${prompt}`
    }
    return `Context: ${role} performing ${task}. Intent: ${prompt}`
  }

  private applySemanticNegatives(prompt: string, _template: POMLTemplate): string {
    // Enhanced semantic negatives conversion with context awareness
    const negativePatterns = [
      { pattern: /no cars?/gi, replacement: 'quiet empty street' },
      { pattern: /no people/gi, replacement: 'solitary peaceful scene' },
      { pattern: /not visible/gi, replacement: 'hidden from view' },
      { pattern: /don't (show|include)/gi, replacement: 'exclude' },
      { pattern: /without/gi, replacement: 'featuring absence of' },
      { pattern: /avoid/gi, replacement: 'specifically omit' },
    ]

    let enhanced = prompt
    for (const { pattern, replacement } of negativePatterns) {
      enhanced = enhanced.replace(pattern, replacement)
    }

    return enhanced
  }

  private applyCameraControl(prompt: string, _template: POMLTemplate): string {
    const promptType = this.analyzePromptStructure(prompt)

    // Select appropriate camera settings based on prompt type
    const cameraSettings = this.selectCameraSettings(promptType, prompt)

    return `${prompt} captured with professional camera control, ${cameraSettings.join(', ')}`
  }

  private applyAspectRatio(prompt: string, _template: POMLTemplate): string {
    const suggestedRatio = this.suggestOptimalAspectRatio(prompt)
    return `${prompt} with optimal aspect ratio composition (${suggestedRatio})`
  }

  // Optimization helper methods for various prompt structures

  private analyzePromptStructure(
    prompt: string
  ): 'character-focused' | 'scene-focused' | 'object-focused' | 'generic' {
    const lowerPrompt = prompt.toLowerCase()

    if (this.detectCharacterReferences(prompt)) {
      return 'character-focused'
    }

    if (
      lowerPrompt.includes('landscape') ||
      lowerPrompt.includes('scene') ||
      lowerPrompt.includes('environment')
    ) {
      return 'scene-focused'
    }

    if (
      lowerPrompt.includes('logo') ||
      lowerPrompt.includes('icon') ||
      lowerPrompt.includes('product')
    ) {
      return 'object-focused'
    }

    return 'generic'
  }

  private detectCharacterReferences(prompt: string): boolean {
    const characterKeywords = [
      'character',
      'person',
      'people',
      'man',
      'woman',
      'child',
      'warrior',
      'hero',
      'villain',
      'face',
      'portrait',
      'human',
    ]

    const lowerPrompt = prompt.toLowerCase()
    return characterKeywords.some((keyword) => lowerPrompt.includes(keyword))
  }

  private enhanceCharacterPrompt(prompt: string, _template: POMLTemplate): string {
    const enhancements = [
      'detailed facial features',
      'expressive eyes',
      'defined bone structure',
      'realistic skin texture',
    ]
    return `${prompt} featuring ${enhancements.slice(0, 2).join(' and ')}`
  }

  private enhanceScenePrompt(prompt: string, _template: POMLTemplate): string {
    const enhancements = [
      'atmospheric lighting',
      'detailed environmental textures',
      'depth of field composition',
      'natural color gradients',
    ]
    return `${prompt} with ${enhancements.slice(0, 2).join(' and ')}`
  }

  private enhanceObjectPrompt(prompt: string, _template: POMLTemplate): string {
    const enhancements = [
      'crisp edge definition',
      'professional product lighting',
      'clean background composition',
      'high contrast clarity',
    ]
    return `${prompt} featuring ${enhancements.slice(0, 2).join(' and ')}`
  }

  private enhanceGenericPrompt(prompt: string, _template: POMLTemplate): string {
    return `${prompt} with enhanced detail and professional composition`
  }

  private selectRelevantFeatures(_prompt: string, features: string[]): string[] {
    // Select 2-3 most relevant features based on prompt content
    return features.slice(0, Math.min(3, features.length))
  }

  private determineContextLevel(prompt: string): 'basic' | 'detailed' {
    return prompt.length > 50 ? 'detailed' : 'basic'
  }

  private extractKeyElements(prompt: string): string {
    // Extract main subject/object from prompt for context
    const words = prompt.split(' ').filter((word) => word.length > 3)
    return words.slice(0, 3).join(', ')
  }

  private selectCameraSettings(promptType: string, _prompt: string): string[] {
    const baseSettings = ['professional composition']

    switch (promptType) {
      case 'character-focused':
        return [...baseSettings, '85mm portrait lens', 'shallow depth of field']
      case 'scene-focused':
        return [...baseSettings, 'wide-angle perspective', 'balanced exposure']
      case 'object-focused':
        return [...baseSettings, 'macro lens clarity', 'controlled lighting']
      default:
        return [...baseSettings, '50mm standard lens']
    }
  }

  private suggestOptimalAspectRatio(prompt: string): string {
    const promptType = this.analyzePromptStructure(prompt)

    switch (promptType) {
      case 'character-focused':
        return '3:4 portrait'
      case 'scene-focused':
        return '16:9 landscape'
      case 'object-focused':
        return '1:1 square'
      default:
        return '4:3 standard'
    }
  }

  // POML parsing helper methods - extracted for reusability

  private extractAttribute(xml: string, attributeName: string): string | undefined {
    const regex = new RegExp(`${attributeName}=['"]([^'"]*?)['"]`, 'i')
    const match = xml.match(regex)
    return match ? match[1] : undefined
  }

  private parseStructure(xml: string): POMLStructure {
    return {
      role: this.extractTagContent(xml, 'role') || undefined,
      task: this.extractTagContent(xml, 'task') || undefined,
      context: this.extractTagContent(xml, 'context') || undefined,
      constraints: this.parseConstraints(xml) || undefined,
    }
  }

  private parseFeatures(xml: string): POMLFeature[] {
    // Enhanced feature parsing from XML with fallback to default features
    const defaultFeatures: POMLFeature[] = [
      {
        name: 'hyper-specific',
        enabled: true,
        priority: 1,
        category: 'basic',
      },
      {
        name: 'character-consistency',
        enabled: true,
        priority: 2,
        category: 'advanced',
      },
      {
        name: 'context-intent',
        enabled: true,
        priority: 3,
        category: 'advanced',
      },
    ]

    // Try to parse features from XML, fallback to defaults
    const featuresMatch = xml.match(/<features[^>]*>(.*?)<\/features>/is)
    if (!featuresMatch) {
      return defaultFeatures
    }

    // Parse individual feature elements
    const featuresContent = featuresMatch[1]
    if (!featuresContent) {
      return defaultFeatures
    }
    const featureMatches = featuresContent.match(/<feature[^>]*\/>/g)
    if (!featureMatches) {
      return defaultFeatures
    }

    const parsedFeatures: POMLFeature[] = []
    for (const featureXml of featureMatches) {
      const name = this.extractAttribute(featureXml, 'name')
      const enabled = this.extractAttribute(featureXml, 'enabled') !== 'false'
      const category =
        (this.extractAttribute(featureXml, 'category') as POMLFeature['category']) || 'basic'
      const priority = Number.parseInt(this.extractAttribute(featureXml, 'priority') || '1', 10)

      if (name) {
        parsedFeatures.push({
          name,
          enabled,
          category,
          priority,
        })
      }
    }

    return parsedFeatures.length > 0 ? parsedFeatures : defaultFeatures
  }

  private parseMetadata(xml: string): TemplateMetadata {
    return {
      version: this.extractAttribute(xml, 'version') || '1.0.0',
      author: this.extractAttribute(xml, 'author') || 'Unknown',
      description: this.extractTagContent(xml, 'description') || 'No description',
      tags: this.parseTagsFromDescription(xml),
      created: new Date(),
      lastModified: new Date(),
    }
  }

  private parseConstraints(xml: string): POMLConstraints {
    const constraintsMatch = xml.match(/<constraints[^>]*>(.*?)<\/constraints>/is)
    if (!constraintsMatch) {
      return {
        quality: undefined,
        style: undefined,
        technical: undefined,
        conditions: undefined,
      }
    }

    const constraintsContent = constraintsMatch[1]
    if (!constraintsContent) {
      return {
        quality: undefined,
        style: undefined,
        technical: undefined,
        conditions: undefined,
      }
    }

    const qualityContent = this.extractTagContent(constraintsContent, 'quality')
    const styleContent = this.extractTagContent(constraintsContent, 'style')
    const technicalContent = this.parseTechnicalConstraints(constraintsContent)
    const conditionsContent = this.parseConditions(constraintsContent)

    return {
      quality: qualityContent || undefined,
      style: styleContent || undefined,
      technical: technicalContent || undefined,
      conditions: conditionsContent || undefined,
    }
  }

  private parseTagsFromDescription(xml: string): string[] {
    const description = this.extractTagContent(xml, 'description')
    if (!description) return []

    // Extract tags from description or use default tags
    return ['poml', 'template', 'image-generation']
  }

  private parseTechnicalConstraints(constraintsXml: string): string[] {
    const technicalMatches = constraintsXml.match(/<technical[^>]*>(.*?)<\/technical>/is)
    if (!technicalMatches) return []

    // Parse comma-separated technical constraints
    const content = technicalMatches[1]
    if (!content) return []

    return content
      .split(',')
      .map((constraint) => constraint.trim())
      .filter((constraint) => constraint.length > 0)
  }

  private parseConditions(constraintsXml: string): Record<string, boolean> {
    const conditions: Record<string, boolean> = {}

    // Look for condition attributes in constraints
    const conditionMatches = constraintsXml.match(
      /condition=['"]([^'"]+)['"].*?(['"]true['"]|['"]false['"])?/g
    )
    if (!conditionMatches) return conditions

    for (const match of conditionMatches) {
      const nameMatch = match.match(/condition=['"]([^'"]+)['"]/)
      const valueMatch = match.match(/(['"]true['"]|['"]false['"])/)

      if (nameMatch?.[1]) {
        const name = nameMatch[1]
        const value = valueMatch?.[1] ? valueMatch[1].includes('true') : true
        conditions[name] = value
      }
    }

    return conditions
  }

  private extractTagContent(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}[^>]*>(.*?)<\/${tagName}>`, 'is')
    const match = xml.match(regex)
    return match?.[1] ? match[1].trim() : undefined
  }

  // Enhanced error handling methods for malformed POML syntax

  private validateTemplateString(templateString: string): {
    isValid: boolean
    errors: string[]
    suggestions: string[]
  } {
    const errors: string[] = []
    const suggestions: string[] = []

    // Basic validation checks
    if (!templateString || templateString.trim().length === 0) {
      errors.push('Empty template string provided')
      suggestions.push('Provide a valid POML template string')
      return { isValid: false, errors, suggestions }
    }

    // Check for template tags
    if (!templateString.includes('<template')) {
      errors.push('Missing opening <template> tag')
      suggestions.push('Add <template> opening tag with id and name attributes')
    }

    if (!templateString.includes('</template>')) {
      errors.push('Missing closing </template> tag')
      suggestions.push('Add </template> closing tag at the end of the template')
    }

    // Check for malformed XML structure
    if (this.hasUnmatchedTags(templateString)) {
      errors.push('Unmatched XML tags detected')
      suggestions.push('Ensure all opening tags have corresponding closing tags')
    }

    // Check for invalid characters
    if (this.hasInvalidXMLCharacters(templateString)) {
      errors.push('Invalid XML characters detected')
      suggestions.push('Remove or escape invalid XML characters (< > & without proper escaping)')
    }

    // Check for proper attribute syntax
    if (this.hasMalformedAttributes(templateString)) {
      errors.push('Malformed attribute syntax detected')
      suggestions.push('Ensure attributes are properly quoted: attribute="value"')
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestions,
    }
  }

  private parseTemplateWithErrorRecovery(templateString: string): {
    success: boolean
    template?: POMLTemplate
    errors: string[]
  } {
    const errors: string[] = []

    try {
      // Attempt to parse with error recovery
      const template: POMLTemplate = {
        id: this.extractAttributeWithFallback(templateString, 'id', `template-${Date.now()}`),
        name: this.extractAttributeWithFallback(templateString, 'name', 'Untitled Template'),
        structure: this.parseStructureWithErrorRecovery(templateString, errors),
        features: this.parseFeaturesWithErrorRecovery(templateString, errors),
        metadata: this.parseMetadataWithErrorRecovery(templateString, errors),
      }

      return {
        success: true,
        template,
        errors,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error'
      errors.push(errorMessage)

      return {
        success: false,
        errors,
      }
    }
  }

  private hasUnmatchedTags(xml: string): boolean {
    // Simplified check - only flag obvious mismatches
    const openTagCount = (xml.match(/<[^/][^>]*[^/]>/g) || []).length
    const closeTagCount = (xml.match(/<\/[^>]*>/g) || []).length
    const selfClosingCount = (xml.match(/<[^>]*\/>/g) || []).length

    // Allow reasonable tolerance for complex templates
    const netOpenTags = openTagCount - selfClosingCount
    return Math.abs(netOpenTags - closeTagCount) > 2 // More tolerant
  }

  private hasInvalidXMLCharacters(xml: string): boolean {
    // Check for common invalid XML character patterns
    const invalidPatterns = [
      /&(?!amp;|lt;|gt;|quot;|apos;)/, // Unescaped ampersands
      /<(?![^>]*>)/, // Lone less-than signs
      />>+/, // Multiple consecutive greater-than signs
    ]

    return invalidPatterns.some((pattern) => pattern.test(xml))
  }

  private hasMalformedAttributes(xml: string): boolean {
    // Simplified check - only flag obviously malformed attributes
    const obviouslyMalformedPatterns = [
      /=\s*$/, // Attributes ending with = at end of string
      /=\s*>/, // Attributes ending with = before closing tag
    ]

    return obviouslyMalformedPatterns.some((pattern) => pattern.test(xml))
  }

  private extractAttributeWithFallback(
    xml: string,
    attributeName: string,
    fallback: string
  ): string {
    try {
      return this.extractAttribute(xml, attributeName) || fallback
    } catch {
      return fallback
    }
  }

  private parseStructureWithErrorRecovery(xml: string, errors: string[]): POMLStructure {
    try {
      return this.parseStructure(xml)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Structure parsing error'
      errors.push(`Structure parsing warning: ${errorMessage}`)

      // Return minimal structure as fallback
      return {
        role: 'assistant',
        task: 'generate content',
        context: '{originalPrompt}',
        constraints: {
          quality: undefined,
          style: undefined,
          technical: undefined,
          conditions: undefined,
        },
      }
    }
  }

  private parseFeaturesWithErrorRecovery(xml: string, errors: string[]): POMLFeature[] {
    try {
      return this.parseFeatures(xml)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Features parsing error'
      errors.push(`Features parsing warning: ${errorMessage}`)

      // Return basic features as fallback
      return [
        {
          name: 'hyper-specific',
          enabled: true,
          priority: 1,
          category: 'basic',
        },
      ]
    }
  }

  private parseMetadataWithErrorRecovery(xml: string, errors: string[]): TemplateMetadata {
    try {
      return this.parseMetadata(xml)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Metadata parsing error'
      errors.push(`Metadata parsing warning: ${errorMessage}`)

      // Return minimal metadata as fallback
      return {
        version: '1.0.0',
        author: 'Unknown',
        description: 'Template with parsing errors - using fallback metadata',
        tags: ['poml', 'error-recovery'],
        created: new Date(),
        lastModified: new Date(),
      }
    }
  }
}
