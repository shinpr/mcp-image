import type { TextClient } from '../api/textClient.js'
import type { ReferenceImage } from '../types/image.js'
import type { ImageCategory } from '../types/mcp.js'
import type { Result } from '../types/result.js'
import { Err, Ok } from '../types/result.js'
import { GeminiAPIError } from '../utils/errors.js'

const BASE_INSTRUCTION = `You are an expert at crafting prompts for image generation models. Your role is to transform user requests into prompts that produce the image the user intends.

Decide in this order. A later step never works against an earlier one.

1. Purpose: what the image is for, taken from the intended use or, when none is given, from the request itself (for example wrapping paper, an app icon, a picture-book page). The purpose sets how the picture is made: its medium, composition, tone, and level of finish.

2. The user's requirements: keep every element the user specified unchanged, and make their intent explicit where the wording leaves it implicit. This clarifies what was asked; it does not add to it. The image's copy comes only from what the user gave, and the prompt has no placeholder for other copy, because the image model draws whatever the prompt describes.

3. Completion: decide the presentation for the purpose.`

const PRESENCE_INSTRUCTION = 'Describe what should be present rather than what should be absent.'

const SCENE_MATERIAL = [
  'Subject: physical characteristics (textures, materials, colors, scale); actions, poses, expressions if applicable; distinctive features',
  'Context: setting, background, spatial relationships (foreground, midground, background); time of day, weather, atmospheric conditions; mood shown through visible cues (serene → soft diffused light, muted palette; ominous → low contrast, heavy shadows)',
] as const

/** Completion material per kind of image; `kind` completes "The image is …" and "For …". */
const CATEGORY_MATERIAL: Record<ImageCategory, { kind: string; material: readonly string[] }> = {
  photo: {
    kind: 'a photograph',
    material: [
      ...SCENE_MATERIAL,
      'Photography: lighting (direction, quality, color temperature, shadows) and camera choices (focal length, aperture, shooting angle)',
    ],
  },
  illustration: {
    kind: 'an illustration or artwork',
    material: [
      ...SCENE_MATERIAL,
      'Style: medium and technique, referencing specific artists, movements, or styles',
    ],
  },
  asset: {
    kind: 'a standalone asset such as an icon, logo, sticker, or isolated object',
    material: ['The element and any lettering: shape, colors, distinctive features'],
  },
  'ui-screen': {
    kind: 'an app or web interface screen',
    material: [
      'The image is the screen itself, filling the frame edge to edge; a device, hands, or surroundings appear only when the request asks for a device mockup',
      'Screen: layout, components, content, color scheme, typography',
    ],
  },
  'graphic-design': {
    kind: 'a poster, banner, thumbnail, or other graphic with text',
    material: ['Design: layout, typography, imagery, color scheme'],
  },
  diagram: {
    kind: 'a diagram or infographic',
    material: [
      'Content: the elements and relationships the request covers, with labels',
      'Design: layout and reading order, color coding, visual style',
    ],
  },
  'pattern-texture': {
    kind: 'a pattern or texture',
    material: ['Motif, density and arrangement, color palette, surface detail'],
  },
}

const bulletList = (lines: readonly string[]): string =>
  lines.map((line) => `   - ${line}`).join('\n')

function buildCompletionMaterial(category?: ImageCategory): string {
  if (category) {
    const { kind, material } = CATEGORY_MATERIAL[category]
    return `   The image is ${kind}; draw on this material:\n${bulletList(material)}`
  }
  const sections = Object.values(CATEGORY_MATERIAL).map(
    ({ kind, material }) => `   For ${kind}:\n${bulletList(material)}`
  )
  return `   Draw on the material for the kind of image it fits best:\n\n${sections.join('\n\n')}`
}

const INPUT_IMAGE_INSTRUCTION = `Input images are attached in order as Image 1, Image 2, and so on; refer to them by number, read their visual style, details, and atmosphere, and use each one the way the request asks. For an image the request asks to change, describe the modifications relative to it, preserve its core characteristics (color palette, lighting style, composition) outside the requested changes, and say what stays the same ("maintain the existing…", "keep the same…").`

const OUTPUT_INSTRUCTION =
  'Your reply is sent to the image model unchanged, so it contains only the prompt: one natural, flowing, unambiguous description rather than a structured list. Write it in English; copy stays in its original language, exactly, in double quotes.'

/**
 * The image model reads the enhanced prompt by the same priority the enhancer
 * wrote it with; without this it fills gaps by convention (for example invented
 * dates and venues on posters).
 */
const IMAGE_MODEL_DISCIPLINE =
  'This prompt already describes everything the image needs, written for its purpose. Draw only what it describes, and add no elements or text of its own.'

/**
 * Constraints the image model reads last, per kind of image. Only kinds with an
 * observed failure have one: posters and similar graphics otherwise gain copy,
 * dates, and venues the user never gave.
 */
const IMAGE_CONSTRAINTS: Partial<Record<ImageCategory, string>> = {
  'graphic-design':
    'The quoted copy is the only text: each piece exactly as written, once. No other text, logos, or watermarks.',
}

function buildImagePrompt(description: string, category?: ImageCategory): string {
  const constraints = category ? IMAGE_CONSTRAINTS[category] : undefined
  return [IMAGE_MODEL_DISCIPLINE, description.trim(), ...(constraints ? [constraints] : [])].join(
    '\n\n'
  )
}

const FEATURE_GUIDANCE: ReadonlyArray<readonly [keyof FeatureFlags, string]> = [
  [
    'maintainCharacterConsistency',
    'Character consistency: this character must stay recognizable across scenes. Describe the visual features that identify them concretely, drawing on the request and input images.',
  ],
  [
    'blendImages',
    'Blending: several visual elements share one composition. Describe how they relate in space and light: placement, overlap, relative scale, shared lighting.',
  ],
  [
    'useWorldKnowledge',
    'World knowledge: real cultures, places, or history appear. Describe them with accurate, specific details.',
  ],
]

export interface FeatureFlags {
  maintainCharacterConsistency?: boolean
  blendImages?: boolean
  useWorldKnowledge?: boolean
}

export interface StructuredPromptOptions {
  /** Defaults to no feature flags. */
  features?: FeatureFlags
  /** Ordered reference images; the request decides how each one is used. */
  inputImages?: ReferenceImage[]
  purpose?: string
  /** Limits completion material to one kind of image; all kinds are offered when omitted. */
  category?: ImageCategory
  signal?: AbortSignal
}

export interface StructuredPromptGenerator {
  generateStructuredPrompt(
    userPrompt: string,
    options?: StructuredPromptOptions
  ): Promise<Result<string, Error>>
}

function buildSystemInstruction(hasInputImages: boolean, category?: ImageCategory): string {
  return [
    BASE_INSTRUCTION,
    buildCompletionMaterial(category),
    PRESENCE_INSTRUCTION,
    ...(hasInputImages ? [INPUT_IMAGE_INSTRUCTION] : []),
    OUTPUT_INSTRUCTION,
  ].join('\n\n')
}

function buildRequest(userPrompt: string, features: FeatureFlags, purpose?: string): string {
  const featureLines = FEATURE_GUIDANCE.filter(([feature]) => features[feature]).map(
    ([, guidance]) => `- ${guidance}`
  )

  return [
    `Request:\n"""\n${userPrompt}\n"""`,
    ...(purpose ? [`Intended use: ${purpose}`] : []),
    ...(featureLines.length > 0 ? [`Also reflect:\n${featureLines.join('\n')}`] : []),
  ].join('\n\n')
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
    const { features = {}, inputImages = [], purpose, category, signal } = options
    try {
      if (!userPrompt || userPrompt.trim().length === 0) {
        return Err(new GeminiAPIError('User prompt cannot be empty'))
      }

      const config = {
        ...(signal && { signal }),
        temperature: 0.7,
        maxTokens: this.maxTokens,
        systemInstruction: buildSystemInstruction(inputImages.length > 0, category),
        ...(inputImages.length > 0 && { inputImages }),
      }
      const result = await this.textClient.generateText(
        buildRequest(userPrompt, features, purpose),
        config
      )

      if (!result.success) {
        return Err(result.error)
      }

      return Ok(buildImagePrompt(result.data, category))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      return Err(new GeminiAPIError(`Failed to generate structured prompt: ${errorMessage}`))
    }
  }
}

export function createStructuredPromptGenerator(
  textClient: TextClient,
  maxTokens: number
): StructuredPromptGenerator {
  return new StructuredPromptGeneratorImpl(textClient, maxTokens)
}
