import type { TextClient } from '../api/textClient.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { GeminiAPIError } from '../utils/errors.js'

const SYSTEM_PROMPT = `You are an expert at crafting prompts for image generation models. Your role is to transform user requests into rich, detailed prompts that maximize image generation quality.

Structure your enhancement around three core elements:

1. SUBJECT (What): The main focus of the image
   - Physical characteristics: textures, materials, colors, scale
   - Actions, poses, expressions if applicable
   - Distinctive features that define the subject

2. CONTEXT (Where/When): The environment and conditions
   - Setting, background, spatial relationships (foreground, midground, background)
   - Time of day, weather, atmospheric conditions
   - Mood and emotional tone of the scene

3. STYLE (How): The visual treatment
   - Artistic or photographic approach: reference specific artists, movements, or styles
   - Lighting design: direction, quality, color temperature, shadows
   - Camera/lens choices: specify focal length, aperture, and shooting angle when photographic

Core principles:
- Add visual details only in areas the user left unspecified; keep all user-specified elements unchanged
- Focus on what should be present rather than what should be absent
- Include photographic or artistic terminology when appropriate
- Maintain clarity while adding richness and specificity

Your output should weave these elements into a single, natural flowing description - not a structured list. Make it vivid, engaging, and unambiguous.`
const IMAGE_EDITING_CONTEXT = `

IMPORTANT: An input image has been provided. Your task is to:
1. Analyze the visual context, style, and atmosphere of the input image
2. Preserve the original image's core characteristics (color palette, lighting style, composition) while applying the requested changes
3. Focus on maintaining visual consistency - describe modifications relative to the existing image
4. Be specific about what to keep unchanged vs what to modify
5. Use phrases like "maintain the existing...", "preserve the original...", "keep the same..." to ensure fidelity to source`

export interface FeatureFlags {
  maintainCharacterConsistency?: boolean
  blendImages?: boolean
  useWorldKnowledge?: boolean
}

export interface StructuredPromptOptions {
  /** Defaults to no feature flags. */
  features?: FeatureFlags
  /** Base64 image data; when present the editing system instruction is used. */
  inputImageData?: string
  purpose?: string
  inputImageMimeType?: string
  signal?: AbortSignal
}

export interface StructuredPromptGenerator {
  generateStructuredPrompt(
    userPrompt: string,
    options?: StructuredPromptOptions
  ): Promise<Result<string, Error>>
}

export class StructuredPromptGeneratorImpl implements StructuredPromptGenerator {
  constructor(
    private readonly textClient: TextClient,
    private readonly maxTokens: number
  ) {}

  async generateStructuredPrompt(
    userPrompt: string,
    options: StructuredPromptOptions = {}
  ): Promise<Result<string, Error>> {
    const { features = {}, inputImageData, purpose, inputImageMimeType, signal } = options
    try {
      if (!userPrompt || userPrompt.trim().length === 0) {
        return Err(new GeminiAPIError('User prompt cannot be empty'))
      }

      const completePrompt = this.buildCompletePrompt(
        userPrompt,
        features,
        !!inputImageData,
        purpose
      )

      const systemInstruction = inputImageData
        ? SYSTEM_PROMPT + IMAGE_EDITING_CONTEXT
        : SYSTEM_PROMPT

      const config = {
        ...(signal && { signal }),
        temperature: 0.7,
        maxTokens: this.maxTokens,
        systemInstruction,
        ...(inputImageData && { inputImage: inputImageData }),
        ...(inputImageMimeType && { inputImageMimeType }),
      }
      const result = await this.textClient.generateText(completePrompt, config)

      if (!result.success) {
        return Err(result.error)
      }

      return Ok(result.data)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      return Err(new GeminiAPIError(`Failed to generate structured prompt: ${errorMessage}`))
    }
  }

  private buildCompletePrompt(
    userPrompt: string,
    features: FeatureFlags,
    hasInputImage: boolean,
    purpose?: string
  ): string {
    const featureContext = this.buildEnhancedFeatureContext(features)

    const imageEditingInstruction = hasInputImage
      ? `\nNOTE: An input image has been provided. Focus on preserving its original characteristics while applying the requested modifications. Maintain consistency with the source image's style, colors, and atmosphere.\n`
      : ''

    const purposeContext = purpose
      ? `\nINTENDED USE: ${purpose}\nTailor the visual style, quality level, and details to match this purpose.\n`
      : ''

    return `Transform this image generation request into a detailed, vivid prompt that will produce high-quality results:

"${userPrompt}"
${imageEditingInstruction}
${purposeContext}
${featureContext}

Consider these aspects as you enhance the prompt:
- Visual details: textures, lighting, colors, materials, composition
- Spatial relationships and scale between elements
- Artistic or photographic style that fits the subject
- Emotional tone paired with visual indicators (e.g., serene → soft diffused light, muted palette; ominous → low contrast, heavy shadows)
- Technical specifications if relevant (lens type, camera angle, etc.)

Create a natural, flowing description that brings the scene to life. Focus on what should be present rather than what should be absent.

Example of a well-enhanced prompt:
Input: "A happy dog in a park"
Enhanced: "Golden retriever mid-leap catching a red frisbee, ears flying, tongue out in joy, in a sunlit urban park. Soft morning light filtering through oak trees creates dappled shadows on emerald grass. Background shows families on picnic blankets, slightly out of focus. Shot from low angle emphasizing the dog's athletic movement, with motion blur on the paws suggesting speed."

Now transform the user's request with similar attention to detail and creative enhancement.`
  }

  private buildEnhancedFeatureContext(features: FeatureFlags): string {
    const requirements: string[] = []

    if (features.maintainCharacterConsistency) {
      requirements.push(
        'Character consistency is CRITICAL - MUST include distinctive character features: This character needs at least 3 recognizable visual markers that would identify them across different scenes. Include specific details like "distinctive scar", "signature clothing item", "unique hairstyle", or "characteristic accessory". Use words like "signature", "distinctive", "always wears/has" to emphasize these consistent features.'
      )
    }

    if (features.blendImages) {
      requirements.push(
        'MUST describe spatial and visual integration: Multiple visual elements need concrete spatial relationships. Define how elements interact: overlap, reflection, shared lighting, color echo between foreground and background. Clearly describe foreground (X% of frame), midground, and background elements with their relative scales and how they physically interact within the composition.'
      )
    }

    if (features.useWorldKnowledge) {
      requirements.push(
        'Apply accurate real-world knowledge - MUST incorporate authentic details: Apply accurate real-world knowledge about cultures, locations, or historical elements. Use specific terminology like "traditional [culture] style", "authentic [location] architecture", "typical of [region]", "historically accurate [period]". Be precise about cultural elements, geographical features, and factual details.'
      )
    }

    if (requirements.length > 0) {
      return `\nMANDATORY REQUIREMENTS - These MUST be clearly reflected in your enhanced prompt:\n\n${requirements.join('\n\n')}\n`
    }

    return ''
  }
}

export function createStructuredPromptGenerator(
  textClient: TextClient,
  maxTokens: number
): StructuredPromptGenerator {
  return new StructuredPromptGeneratorImpl(textClient, maxTokens)
}
