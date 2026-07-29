import { execFile } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_SIZE } from '../../business/inputValidator.js'
import { createMCPServer } from '../mcpServer.js'

const fileSystem = vi.hoisted(() => ({
  actualOpen: undefined as typeof import('node:fs/promises').open | undefined,
  open: vi.fn(),
}))

const transports = vi.hoisted(() => ({
  fetch: vi.fn(),
  googleConstructor: vi.fn(),
  googleEnhancedText: '',
  googleGenerateContent: vi.fn(),
  googleTextError: undefined as Error | undefined,
  openAIConstructorError: undefined as Error | undefined,
  openAIConstructorOptions: [] as unknown[],
  openAIImageEdit: vi.fn(),
  openAIImageGenerate: vi.fn(),
  openAIResponsesCreate: vi.fn(),
  toFile: vi.fn(),
}))

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>()
  fileSystem.actualOpen = actual.open
  fileSystem.open.mockImplementation(actual.open)
  return {
    ...actual,
    open: fileSystem.open,
  }
})

vi.mock('@google/genai', async (importActual) => {
  const actual = await importActual<typeof import('@google/genai')>()
  return {
    ...actual,
    GoogleGenAI: class {
      readonly models = {
        generateContent: transports.googleGenerateContent,
      }

      constructor(...args: unknown[]) {
        transports.googleConstructor(...args)
      }
    },
  }
})

vi.mock('openai', () => {
  class OpenAITransportDouble {
    readonly images = {
      edit: transports.openAIImageEdit,
      generate: transports.openAIImageGenerate,
    }

    readonly responses = {
      create: transports.openAIResponsesCreate,
    }

    constructor(options: unknown) {
      transports.openAIConstructorOptions.push(options)
      if (transports.openAIConstructorError) {
        throw transports.openAIConstructorError
      }
    }
  }

  return {
    default: OpenAITransportDouble,
    toFile: transports.toFile,
  }
})

const API_ENDPOINT = 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations'
const ARK_DUMMY_KEY = 'ark-dummy-seedream-integration-key'
const AUTHORIZATION_VALUE = `Bearer ${ARK_DUMMY_KEY}`
const ORIGINAL_PROMPT = 'private-seedream-prompt-marker'
const ENHANCED_PROMPT = 'fixture-enhanced-seedream-prompt'
const RAW_BODY_MARKER = 'private-upstream-body-marker'
const INPUT_IMAGE_MARKER = 'private-input-image-marker'
const FALLBACK_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x47, 0x45, 0x4d, 0x49, 0x4e, 0x49,
])
const FEATURE_INSTRUCTIONS = {
  blendImages:
    'MUST describe spatial and visual integration: Multiple visual elements need concrete spatial relationships. Define how elements interact: overlap, reflection, shared lighting, color echo between foreground and background. Clearly describe foreground (X% of frame), midground, and background elements with their relative scales and how they physically interact within the composition.',
  maintainCharacterConsistency:
    'Character consistency is CRITICAL - MUST include distinctive character features: This character needs at least 3 recognizable visual markers that would identify them across different scenes. Include specific details like "distinctive scar", "signature clothing item", "unique hairstyle", or "characteristic accessory". Use words like "signature", "distinctive", "always wears/has" to emphasize these consistent features.',
  useWorldKnowledge:
    'Apply accurate real-world knowledge - MUST incorporate authentic details: Apply accurate real-world knowledge about cultures, locations, or historical elements. Use specific terminology like "traditional [culture] style", "authentic [location] architecture", "typical of [region]", "historically accurate [period]". Be precise about cultural elements, geographical features, and factual details.',
} as const
const ALL_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
] as const
const TRACKED_ENV = [
  'ARK_API_KEY',
  'GEMINI_API_KEY',
  'IMAGE_OUTPUT_DIR',
  'IMAGE_PROVIDER',
  'IMAGE_QUALITY',
  'NODE_ENV',
  'OPENAI_API_KEY',
  'SKIP_PROMPT_ENHANCEMENT',
] as const

let originalEnv: Partial<Record<(typeof TRACKED_ENV)[number], string>>
const temporaryDirectories = new Set<string>()

function resetTransportDoubles(): void {
  if (!fileSystem.actualOpen) {
    throw new Error('node:fs/promises.open test delegate is not initialized')
  }
  fileSystem.open.mockReset()
  fileSystem.open.mockImplementation(fileSystem.actualOpen)
  transports.fetch.mockReset()
  transports.googleConstructor.mockReset()
  transports.googleGenerateContent.mockReset()
  transports.openAIImageEdit.mockReset()
  transports.openAIImageGenerate.mockReset()
  transports.openAIResponsesCreate.mockReset()
  transports.toFile.mockReset()
  transports.googleTextError = undefined
  transports.googleEnhancedText = ENHANCED_PROMPT
  transports.openAIConstructorError = undefined
  transports.openAIConstructorOptions.length = 0

  transports.googleGenerateContent.mockImplementation(async (params: { model?: string }) => {
    if (params.model === 'gemini-2.5-flash') {
      if (transports.googleTextError) {
        throw transports.googleTextError
      }
      return { text: transports.googleEnhancedText }
    }

    return {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: FALLBACK_PNG_BYTES.toString('base64'),
                  mimeType: 'image/png',
                },
              },
            ],
          },
        },
      ],
      modelVersion: 'gemini-fallback-must-not-run',
      responseId: 'gemini-response-sentinel',
    }
  })
  transports.openAIResponsesCreate.mockResolvedValue({
    output_text: ENHANCED_PROMPT,
  })
  transports.toFile.mockResolvedValue({ name: 'fixture.png' })
  transports.fetch.mockImplementation(async () =>
    createSuccessfulImageResponse(FALLBACK_PNG_BYTES, 'default-response-sentinel')
  )
}

function createSuccessfulImageResponse(imageBytes: Buffer, responseSentinel: string): Response {
  return new Response(
    JSON.stringify({
      response_sentinel: responseSentinel,
      data: [
        {
          b64_json: imageBytes.toString('base64'),
          size: '1024x1024',
          output_format: 'png',
        },
      ],
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  )
}

function createPngFixture(sentinel: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(sentinel),
  ])
}

function createJpegFixture(sentinel: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(sentinel)])
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function createOutputDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mcp-image-seedream-'))
  temporaryDirectories.add(directory)
  return directory
}

function configureSeedream(
  outputDirectory: string,
  options: {
    arkApiKey?: string
    imageQuality?: 'fast' | 'balanced' | 'quality'
    skipPromptEnhancement?: boolean
  } = {}
): void {
  process.env.IMAGE_PROVIDER = 'seedream'
  process.env.ARK_API_KEY = options.arkApiKey ?? ARK_DUMMY_KEY
  process.env.GEMINI_API_KEY = 'gemini-dummy-integration-key'
  process.env.OPENAI_API_KEY = 'openai-dummy-integration-key'
  process.env.IMAGE_OUTPUT_DIR = outputDirectory
  process.env.IMAGE_QUALITY = options.imageQuality ?? 'fast'
  process.env.SKIP_PROMPT_ENHANCEMENT = String(options.skipPromptEnhancement ?? false)
  process.env.NODE_ENV = 'test'
}

function configureGemini(outputDirectory: string): void {
  process.env.IMAGE_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'gemini-dummy-integration-key'
  process.env.OPENAI_API_KEY = 'openai-dummy-integration-key'
  process.env.ARK_API_KEY = ARK_DUMMY_KEY
  process.env.IMAGE_OUTPUT_DIR = outputDirectory
  process.env.IMAGE_QUALITY = 'fast'
  process.env.SKIP_PROMPT_ENHANCEMENT = 'true'
  process.env.NODE_ENV = 'test'
}

function parsePublicResponse(
  result: Awaited<ReturnType<ReturnType<typeof createMCPServer>['callTool']>>
) {
  const firstContent = result.content.at(0)
  if (firstContent?.type !== 'text') {
    return {}
  }

  return JSON.parse(firstContent.text) as Record<string, unknown>
}

function observeLastImageRequest(): {
  body: Record<string, unknown>
  headers: Headers
  init: RequestInit | undefined
  url: string
} {
  const lastCall = transports.fetch.mock.calls.at(-1)
  const url = lastCall?.[0]
  const init = lastCall?.[1] as RequestInit | undefined
  let body: Record<string, unknown> = {}

  if (typeof init?.body === 'string') {
    try {
      body = JSON.parse(init.body) as Record<string, unknown>
    } catch {
      body = {}
    }
  }

  return {
    body,
    headers: new Headers(init?.headers),
    init,
    url: typeof url === 'string' ? url : '',
  }
}

function extractTextInput(request: Record<string, unknown>): string {
  if (typeof request.input === 'string') {
    return request.input
  }
  if (!Array.isArray(request.input)) {
    return ''
  }

  for (const item of request.input) {
    if (!item || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    const textPart = content.find(
      (part) =>
        part && typeof part === 'object' && (part as { type?: unknown }).type === 'input_text'
    ) as { text?: unknown } | undefined
    if (typeof textPart?.text === 'string') {
      return textPart.text
    }
  }

  return ''
}

function capturedLogs(): string {
  return vi
    .mocked(console.error)
    .mock.calls.flatMap((call) => call.map(String))
    .join('\n')
}

async function assertSavedPng(
  result: Awaited<ReturnType<ReturnType<typeof createMCPServer>['callTool']>>,
  outputDirectory: string,
  fileName: string,
  expectedBytes: Buffer,
  expectedModel: string
): Promise<void> {
  const files = await readdir(outputDirectory)
  const expectedPath = join(outputDirectory, fileName)
  const bytes = files[0] ? await readFile(expectedPath) : Buffer.alloc(0)
  const publicResponse = parsePublicResponse(result)

  expect.soft(result.isError).toBe(false)
  expect.soft(Object.keys(result).sort()).toEqual(['content', 'isError'])
  expect.soft(files).toEqual([fileName])
  expect.soft(bytes).toEqual(expectedBytes)
  expect.soft(publicResponse).toEqual({
    type: 'resource',
    resource: {
      uri: `file://${expectedPath}`,
      name: fileName,
      mimeType: 'image/png',
    },
    metadata: {
      model: expectedModel,
      provider: 'seedream',
      processingTime: 0,
      contextMethod: 'structured_prompt',
      timestamp: expect.any(String),
    },
  })
  expect.soft(result).not.toHaveProperty('structuredContent')
  expect.soft(publicResponse).not.toHaveProperty('metadata.prompt')
  expect.soft(JSON.stringify(publicResponse)).not.toContain(ORIGINAL_PROMPT)
  expect.soft(JSON.stringify(publicResponse)).not.toContain(ENHANCED_PROMPT)
}

beforeEach(() => {
  originalEnv = Object.fromEntries(
    TRACKED_ENV.flatMap((name) => {
      const value = process.env[name]
      return value === undefined ? [] : [[name, value]]
    })
  )
  resetTransportDoubles()
  vi.stubGlobal('fetch', transports.fetch)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(async () => {
  for (const name of TRACKED_ENV) {
    const value = originalEnv[name]
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }

  await Promise.all(
    [...temporaryDirectories].map((directory) => rm(directory, { force: true, recursive: true }))
  )
  temporaryDirectories.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// BytePlus Seedream Provider Integration Test Skeleton
// Design Doc: docs/design/byteplus-seedream-provider-design.md
// ADR: docs/adr/ADR-0001-byteplus-modelark-provider-integration.md
// Generated: 2026-07-28 | Budget Used: 3/3 integration, 0/3 fixture-e2e,
// 0/2 service-integration-e2e
// Artifact state: three executable behavior groups remain intentionally RED until the Seedream
// implementation task supplies the missing production behavior.
// Implementation pattern: follow the repository's function-style Vitest describe/it pattern;
// use parameterized cases where a proof obligation names multiple boundary inputs.
//
// Candidate selection:
// - Selected: additive Seedream selection through the existing lazy initialization (Value Score 110)
// - Selected: exact supported-flow propagation to sanitized file response (Value Score 110)
// - Selected: stage-aware failure containment without artifacts or secret leakage (Value Score 50)
// - Merged: enhancement success/fallback/skip and route/default branches are boundary rows of
//   the supported-flow propagation invariant, not separate tests.
// - Merged: preflight, invalid wire response, abort, and upstream errors are boundary rows of
//   the failure-containment invariant, not separate tests.
// - Deduplicated: AC-11 Gemini/OpenAI public-output compatibility remains in the existing
//   src/server/__tests__/mcpServer.test.ts and
//   src/business/__tests__/responseBuilder.test.ts regression suites.
//
// Test case: existing lazy initialization selects Seedream clients
// AC: "AC-01 When `seedream` configが有効なら、systemは既存遅延初期化branchでSeedream
// text/image clientsを選択する。prompt enhancement skip時はtext clientを作らない。"
// AC: "AC-13 While clientsが初期化済みなら、systemは既存cache behaviorを維持し、
// requestごとのprovider再選択やruntime env reloadを追加しない。"
// AC: "AC-14 If Seedream client構築が失敗したら、then 既存error pathでrequestを失敗させ、
// 別provider/modelへのfallbackを行わない。"
// Claim: the selected provider uses Seedream factories while preserving the existing skip/cache rules.
// Value Score: 110 | Business Value: 10 (enables Seedream requests) |
// User Frequency: 10 (every Seedream request uses initialization) | Legal: false |
// Defect Detection: 10 (primary detector for wrong-provider or unnecessary text initialization)
// Behavior: initialize Seedream clients through existing branches; exercise skip/cache/failure paths.
// @category: integration
// @lane: integration
// @dependency: createMCPServer, Config, TextClient, ImageClient, Seedream capability preflight
// @real-dependency: existing MCPServer initializeClients fields and lazy cache
// @complexity: medium
// Primary failure mode: Seedream selects a Gemini/OpenAI factory, initializes text while enhancement
// is skipped, or silently falls back after a factory failure.
// Boundary: empty existing fields -> selected lazy branch -> required Seedream clients or explicit error.
// Observable state:
// - Before: existing text/image client fields are empty.
// - Action: initialize from one Seedream Config; separately fail one client construction.
// - After: success uses required Seedream clients; skipped enhancement makes no text client; failure
//   is explicit and does not select another provider/model.
// Mock-boundary rationale: replace only network-touching SDK/HTTP transports with deterministic
// test doubles. Keep Config selection, existing initialization fields, provider identity checks,
// and request orchestration real because they are the boundary under proof.
// Proof obligation: assert factory selection, skip/cache behavior, and explicit failure through the
// public call boundary.
// Verification items:
// - Text/image Seedream factories are selected when enhancement is enabled.
// - Enhancement skip initializes only the image client.
// - Failed initialization returns an error without calling preflight, text, image, or file save.
// - Initialized clients follow the existing cache behavior on the next request.
// Expected result: successful calls use Seedream; skip/cache remain unchanged; failure has no fallback.
// Pass criteria: every verification item is asserted through callTool-visible results, collaborator
// call records, and client identity; no source-code inspection is accepted as proof.
// Residual: this deterministic test does not prove the live ModelArk contract; the Phase 2 one-call
// Method 1 probe owns the only remaining vendor unknown required by this MVP.
//
// Test case: supported inputs propagate exact effective values to one sanitized file response
// AC: "AC-04 When enhancement が成功したら、system はexact enhanced promptをselected promptとし、
// quality非依存のratio suffixを一回だけ付与したfinal promptをimage requestとmetadata.promptへ渡す。"
// AC: "AC-05 If enhancement が失敗したら、then system はoriginal promptをselected promptとし、
// 同じratio suffixを一回だけ付与したfinal promptを渡し、provider/model/valueは切り替えない。"
// AC: "AC-06 While Seedream text を呼ぶとき、serialized request body の top-level に
// `thinking={type:'disabled'}` を含め、`extra_body` を含めない。"
// AC: "AC-07 When routing すると、system は
// `effectiveQuality=request.quality??capturedConfig.imageQuality` を先に決め、request quality を常に優先し、
// fast→Pro fast、balanced|quality→Pro standard を選ぶ。"
// AC: "AC-08 When image を呼ぶと、system は AP `POST /images/generations` に Bearer auth、
// selected model/provider-local ratio suffix付きprompt/optional single image/effective resolution
// token、`response_format=b64_json`,
// default `output_format=png`, `stream=false`, `watermark=false` とroute別の
// `optimize_prompt_options.mode=fast|standard` を送り、
// `sequential_image_generation` は送らない。"
// AC: "AC-10 When 成功したら、既存 sanitized save/file URI と `structuredContent` 非存在を維持し、
// internal `metadata.mimeType=image/png`、public metadata に prompt なしとする。"
// AC: "AC-15 When request を解決すると、system は
// `quality/default → route → resolution/default → aspect/default` の順序を使う。例: captured fast +
// request `quality=quality` + size/ratio omitted は Pro standard + `size='1K'` +
// `Output aspect ratio: 1:1.`となる。"
// AC: "AC-17 When `SKIP_PROMPT_ENHANCEMENT=true` なら、preflight 後 text calls 0、original
// prompt で image calls 1 とする。"
// AC: "AC-18 When false の prompt flags が来たら instruction を追加せず受理し、true の
// prompt-only flags/purpose は共通 enhancement にだけ反映する。"
// Claim: for every supported branch, one exact effective prompt and one exact route are propagated
// once through the real provider adapter, PNG Buffer, sanitized save, and public MCP response.
// Value Score: 110 | Business Value: 10 (core image-generation outcome) |
// User Frequency: 10 (every successful request) | Legal: false |
// Defect Detection: 10 (primary detector for cross-layer propagation drift)
// Behavior: supported generate_image input -> preflight, optional single enhancement, deterministic
// routing, direct-HTTP fixture decode, real file save/response build -> one PNG file URI response
// with the exact effective values internally and no prompt exposed publicly.
// @category: core-functionality
// @lane: integration
// @dependency: createMCPServer, existing client initialization, StructuredPromptGenerator,
// SeedreamTextClient, SeedreamImageClient, FileManager, ResponseBuilder, temporary filesystem
// @real-dependency: MCP validation/orchestration, client initialization/preflight, Seedream adapters,
// prompt selection, PNG parser, FileManager, ResponseBuilder
// @complexity: high
// Primary failure mode: a supported request is enhanced more than once, uses the wrong provider,
// model, size, or prompt, emits a model-invalid wire field, mutates decoded bytes, or leaks internal
// prompt metadata through the public MCP response.
// Boundary: validated MCP params -> preflight -> prompt selection -> route/default selection ->
// Seedream wire request -> exactly-one PNG Buffer -> real temporary file -> public file URI response.
// Observable state:
// - Before: the per-case temporary output directory is empty and transport call counts are zero.
// - Action: call generate_image with a parameterized supported-flow row.
// - After: exactly one image request is made, its decoded PNG bytes are saved byte-for-byte, and
//   the public response has the expected file URI/MIME allow-list with no prompt or structuredContent.
// Mock-boundary rationale: intercept only the OpenAI Responses network transport and direct image
// HTTP transport with fixed contract fixtures. Keep both Seedream adapters, effective-value rules,
// prompt selection, b64/PNG parsing, FileManager, and ResponseBuilder real; mocking any of them would
// hide the propagation boundary this test must prove.
// Proof obligation: implement one parameterized Vitest case for the rows below. Assert exact request
// payload presence and absence, call counts, internal metadata, saved bytes, and public response.
// Supported-flow boundary rows:
// - Enhancement success: one text request with top-level `thinking={type:'disabled'}`; its exact
//   enhanced string is selected, then one ratio suffix forms the image prompt and metadata.prompt.
// - Enhancement failure: the exact original prompt is selected before the same suffix, without
//   switching provider/model/value.
// - Enhancement skipped: preflight runs first, text calls remain 0, original prompt is used, and
//   image calls equal 1.
// - Captured fast plus request quality=quality plus omitted imageSize/aspectRatio: request wins;
//   select `dola-seedream-5-0-pro-260628`, standard mode, `size='1K'`, and one
//   `Output aspect ratio: 1:1.` suffix.
// - Every public aspect ratio is accepted through the same suffix rule; the request never constructs
//   exact WxH or applies ratio-specific rounding.
// - Fast route: select `dola-seedream-5-0-pro-260628` with native fast optimization.
// - Every route omits the `sequential_image_generation` property entirely.
// - Every PNG matrix request includes `response_format='b64_json'`, `output_format='png'`, stream=false,
//   watermark=false, the route-specific optimize_prompt_options.mode, captured Bearer auth, and
//   only the optional single-image field allowed by preflight.
// - False prompt flags add no enhancement instruction; true prompt-only flags/purpose affect only
//   the one text enhancement input and never add native image wire fields.
// - Seedream image HTTP uses an AbortSignal derived from the provider-local fixed 300000 ms without
//   changing existing apiTimeout=30000.
// Verification items:
// - Preflight occurs before any text or image transport call.
// - Prompt generator call count is 0 or 1 according to the boundary row, never more than 1.
// - Effective quality is selected before model, model before default resolution, and resolution
//   before aspect/default suffix construction.
// - Wire field values, model-specific field absence/presence, endpoint, and auth header are exact.
// - The fixed valid response is exactly one strict base64 PNG; response format metadata is optional
//   and must agree with PNG when present.
// - Saved bytes equal the decoded fixture Buffer; the output path is sanitized.
// - Public response contains the sanitized file URI and image/png MIME.
// - Public response has no `structuredContent` property and no prompt field/value.
// Expected result: each supported row returns one successful public resource response whose saved
// PNG and internal prompt exactly match the one selected request path.
// Pass criteria: every row asserts before/action/after state and exact propagation; assertions on
// mock invocation alone are insufficient unless paired with saved bytes and public response checks.
// Residual: deterministic fixtures prove repository contract construction, not current vendor
// acceptance or visual quality; the Phase 2 one-call probe owns Method 1 acceptance and no CI test
// owns stochastic aesthetic evaluation.
//
// Test case: failed Seedream requests stop before the next side effect and expose sanitized errors
// AC: "AC-02 If `ARK_API_KEY` が欠落/空なら、then 外部 request 前に `ConfigError` を返し、
// key 値を応答/log に含めない。"
// AC: "AC-03 If Google Search、model/resolution combination、または input-image capability が
// 非対応/未確認なら、
// then preflight は enhancement 前に失敗し text/image external request count は共に 0 となる。"
// AC: "AC-09 If exactly one `data[0].b64_json` PNG でない（missing/extra images、URL-only、
// stream event、不正/空 base64、stream-read中にbody>48MiB、decode前にdecoded>32MiB、
// PNG magic不一致、または存在するformat metadataがPNGと矛盾）、またはtimeout/abortなら、
// then normalized errorを返しfileを作らない。"
// AC: "AC-12 When 4xx/5xx/timeout/network error なら、既存 taxonomy へ秘密/prompt なしで正規化する。"
// AC: "AC-16 When resolution が全routeでProの1K/2Kなら許可する。
// 4Kを含むそれ以外はtext/image calls 0でrejectする。公開14 aspect ratioは同じMethod 1 ruleで送る。"
// AC: "AC-19 When Seedream image requestを開始すると、systemはprovider-local固定`300000` msから
// AbortSignalを構成する。timeout到達時はnormalized timeout errorを返してfileを作らない。"
// Claim: every failure is contained at its owning stage, returns the existing normalized taxonomy,
// and cannot create a file or expose ARK_API_KEY, Authorization, prompt, image, or raw wire bodies.
// Value Score: 50 | Business Value: 10 (security and corrupt-artifact prevention) |
// User Frequency: 4 (failure/unsupported paths) | Legal: false |
// Defect Detection: 10 (primary cross-layer detector for side effects after failure)
// Behavior: invalid config/capability or failed image transport/contract -> stage-specific stop and
// normalized error -> zero durable files and no secret/prompt/raw-body disclosure.
// @category: edge-case
// @lane: integration
// @dependency: Config validation, ProviderCapabilityPreflight, SeedreamImageClient,
// error normalization, logger, FileManager, ResponseBuilder, temporary filesystem
// @real-dependency: validation/preflight ordering, response parser and limits, error taxonomy,
// logger sanitizer, FileManager boundary, public error response builder
// @complexity: high
// Primary failure mode: a rejected or failed request still calls a later external stage, saves
// attacker-controlled/partial bytes, or returns/logs credentials, prompt, image, or raw payload.
// Boundary: request/config validation and preflight before external I/O; after image I/O begins,
// strict response parsing and abort/error normalization before FileManager.
// Observable state:
// - Before: a unique temporary output directory is empty; text/image/save counters are zero.
// - Action: call generate_image once for each parameterized failure row below.
// - After: the normalized public error matches the owning failure class; the directory is still
//   empty; call counts stop at the expected stage; captured logs and response contain no secrets.
// Mock-boundary rationale: inject deterministic failures only at config input, capability input,
// external SDK/HTTP response, and AbortSignal boundaries. Keep ordering, response validation,
// size limits, error classification, sanitization, file decision, and public response construction
// real because those side-effect and disclosure boundaries are the proof target.
// Proof obligation: assert before/action/after state for every row; verify exact stage call counts,
// normalized error code/category, empty output directory, and negative string/property checks for
// credentials, Authorization, prompt, image data, and request/response bodies.
// Failure boundary rows:
// - Missing and empty ARK_API_KEY -> ConfigError; text=0, image=0, save=0.
// - useGoogleSearch=true, unsupported input-image combination, and any quality+4K ->
//   preflight error; text=0, image=0, save=0; no coercion/fallback.
// - Missing data, extra images, URL-only data, stream event, malformed base64, empty base64,
//   chunked response crossing 48 MiB, pre-decode size crossing 32 MiB, non-PNG magic, and MIME
//   metadata contradicting PNG -> normalized image contract error; save=0 for every row.
// - Abort/timeout -> AbortSignal is derived from fixed 300000 ms; normalized timeout
//   error is returned and save=0.
// - Representative 4xx, 5xx, and network failure -> existing ImageAPIError/NetworkError taxonomy;
//   no provider/model/value fallback and save=0.
// Verification items:
// - Preflight rejection occurs before enhancement and both external transports.
// - Failures after image transport still occur before FileManager.saveImage.
// - No rejected value is rounded, coerced, or rerouted to another model/provider/default.
// - Every public error and captured log excludes the key, Authorization, prompt, input image,
//   request body, response body, and internal metadata.prompt.
// - Output directory remains empty after every failure row.
// Expected result: each failure is observable as a stable normalized, sanitized error with no file
// and no calls beyond the boundary that detected it.
// Pass criteria: all listed rows assert stage call counts, error taxonomy, disclosure absence, and
// filesystem absence; a returned error without the no-file/no-leak probes does not satisfy the test.
// Residual: adapter L1 tests should still isolate parser and numeric-limit arithmetic for precise
// diagnostics; this integration case proves those failures cannot escape into files or responses.

describe('BytePlus Seedream integration', () => {
  it('routes Seedream requests and reuses the prompt client through public effects', async () => {
    const skipOutput = await createOutputDirectory()
    configureSeedream(skipOutput, { skipPromptEnhancement: true })
    const skippedServer = createMCPServer()

    expect(await readdir(skipOutput)).toEqual([])

    const skippedFirst = await skippedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'skip-first.png',
    })
    const skippedSecond = await skippedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'skip-second.png',
    })

    expect.soft(transports.googleConstructor).not.toHaveBeenCalled()
    expect.soft(transports.openAIConstructorOptions).toHaveLength(0)
    expect.soft(transports.openAIResponsesCreate).not.toHaveBeenCalled()
    expect.soft(transports.fetch).toHaveBeenCalledTimes(2)
    expect.soft(skippedFirst.isError).toBe(false)
    expect.soft(skippedSecond.isError).toBe(false)
    expect.soft((await readdir(skipOutput)).sort()).toEqual(['skip-first.png', 'skip-second.png'])

    resetTransportDoubles()
    const cachedOutput = await createOutputDirectory()
    configureSeedream(cachedOutput)
    const cachedServer = createMCPServer()

    expect(await readdir(cachedOutput)).toEqual([])

    const cachedFirst = await cachedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'cache-first.png',
    })
    const cachedSecond = await cachedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'cache-second.png',
    })

    expect.soft(transports.googleConstructor).not.toHaveBeenCalled()
    expect.soft(transports.openAIConstructorOptions).toEqual([
      {
        apiKey: ARK_DUMMY_KEY,
        baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
      },
    ])
    expect.soft(transports.openAIResponsesCreate).toHaveBeenCalledTimes(2)
    expect.soft(transports.fetch).toHaveBeenCalledTimes(2)
    expect.soft(cachedFirst.isError).toBe(false)
    expect.soft(cachedSecond.isError).toBe(false)
    expect
      .soft((await readdir(cachedOutput)).sort())
      .toEqual(['cache-first.png', 'cache-second.png'])

    resetTransportDoubles()
    const failureOutput = await createOutputDirectory()
    configureSeedream(failureOutput)
    transports.openAIConstructorError = new Error('synthetic Seedream factory failure')
    const failedServer = createMCPServer()

    expect(await readdir(failureOutput)).toEqual([])

    const failed = await failedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'must-not-exist.png',
    })
    const failedPublicResponse = parsePublicResponse(failed)
    const failureExposure = `${JSON.stringify(failedPublicResponse)}\n${capturedLogs()}`

    expect.soft(failed.isError).toBe(true)
    expect.soft(transports.googleConstructor).not.toHaveBeenCalled()
    expect.soft(transports.openAIConstructorOptions).toHaveLength(1)
    expect.soft(transports.openAIResponsesCreate).not.toHaveBeenCalled()
    expect.soft(transports.fetch).not.toHaveBeenCalled()
    expect
      .soft((failedPublicResponse.error as { message?: string } | undefined)?.message)
      .toContain('synthetic Seedream factory failure')
    expect.soft(await readdir(failureOutput)).toEqual([])
    expect.soft(failureExposure).not.toContain(ARK_DUMMY_KEY)
    expect.soft(failureExposure).not.toContain(ORIGINAL_PROMPT)
  })

  it('propagates supported effective values to one sanitized PNG file response', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const jsonParseSpy = vi.spyOn(JSON, 'parse')
    const bufferFromSpy = vi.spyOn(Buffer, 'from')
    type SupportedRow = {
      args: Record<string, unknown>
      expectedAspectRatio: (typeof ALL_ASPECT_RATIOS)[number]
      expectedModel: 'dola-seedream-5-0-pro-260628'
      expectedQuality: 'fast' | 'balanced' | 'quality'
      expectedResolution: '1K' | '2K'
      inputImage?: boolean
      name: string
      skipPromptEnhancement?: boolean
      textFailure?: boolean
    }

    const supportedRows: SupportedRow[] = [
      {
        name: 'prompt-baseline',
        args: {},
        expectedAspectRatio: '1:1',
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'fast',
        expectedResolution: '1K',
      },
      {
        name: 'enhancement-failure-original-fallback',
        args: { aspectRatio: '4:3', quality: 'balanced' },
        expectedAspectRatio: '4:3',
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'balanced',
        expectedResolution: '1K',
        textFailure: true,
      },
      {
        name: 'enhancement-skip',
        args: { aspectRatio: '9:16', imageSize: '2K', quality: 'quality' },
        expectedAspectRatio: '9:16',
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'quality',
        expectedResolution: '2K',
        skipPromptEnhancement: true,
      },
      {
        name: 'fast-route',
        args: { quality: 'fast' },
        expectedAspectRatio: '1:1',
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'fast',
        expectedResolution: '1K',
      },
      {
        name: 'balanced-route',
        args: { quality: 'balanced' },
        expectedAspectRatio: '1:1',
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'balanced',
        expectedResolution: '1K',
      },
      {
        name: 'quality-request-overrides-captured-fast',
        args: { quality: 'quality' },
        expectedAspectRatio: '1:1',
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'quality',
        expectedResolution: '1K',
      },
      {
        name: 'single-input-image',
        args: { quality: 'quality' },
        expectedAspectRatio: '1:1',
        expectedModel: 'dola-seedream-5-0-pro-260628',
        expectedQuality: 'quality',
        expectedResolution: '1K',
        inputImage: true,
      },
      ...ALL_ASPECT_RATIOS.map(
        (aspectRatio): SupportedRow => ({
          name: `aspect-${aspectRatio}`,
          args: { aspectRatio, imageSize: '2K', quality: 'fast' },
          expectedAspectRatio: aspectRatio,
          expectedModel: 'dola-seedream-5-0-pro-260628',
          expectedQuality: 'fast',
          expectedResolution: '2K',
        })
      ),
      ...[
        'blendImages',
        'maintainCharacterConsistency',
        'useWorldKnowledge',
        'useGoogleSearch',
      ].map(
        (flag): SupportedRow => ({
          name: `false-${flag}`,
          args: { [flag]: false },
          expectedAspectRatio: '1:1',
          expectedModel: 'dola-seedream-5-0-pro-260628',
          expectedQuality: 'fast',
          expectedResolution: '1K',
        })
      ),
      ...[
        ['blendImages', true],
        ['maintainCharacterConsistency', true],
        ['useWorldKnowledge', true],
        ['purpose', 'cookbook cover'],
      ].map(
        ([flag, value]): SupportedRow => ({
          name: `prompt-only-${String(flag)}`,
          args: { [String(flag)]: value },
          expectedAspectRatio: '1:1',
          expectedModel: 'dola-seedream-5-0-pro-260628',
          expectedQuality: 'fast',
          expectedResolution: '1K',
        })
      ),
    ]

    for (const [index, row] of supportedRows.entries()) {
      resetTransportDoubles()
      vi.mocked(console.error).mockClear()
      const outputDirectory = await createOutputDirectory()
      const fileName = `supported-${index}.png`
      const requestPrompt = `${ORIGINAL_PROMPT}:${row.name}:request-body-sentinel`
      const enhancedPrompt = `${ENHANCED_PROMPT}:${row.name}:image-body-sentinel`
      const responseSentinel = `${row.name}:response-body-sentinel`
      const imageSentinel = `${row.name}:decoded-image-sentinel`
      const expectedImageBytes = createPngFixture(imageSentinel)
      const expectedBase64 = expectedImageBytes.toString('base64')
      const inputImageBytes = row.inputImage
        ? createPngFixture(`${row.name}:input-image-sentinel`)
        : undefined
      const inputDirectory = row.inputImage ? await createOutputDirectory() : undefined
      const inputImagePath =
        inputDirectory && row.inputImage ? join(inputDirectory, `${row.name}-input.png`) : undefined
      if (inputImagePath && inputImageBytes) {
        await writeFile(inputImagePath, inputImageBytes)
      }

      configureSeedream(outputDirectory, {
        imageQuality: 'fast',
        skipPromptEnhancement: row.skipPromptEnhancement,
      })
      transports.googleEnhancedText = enhancedPrompt
      transports.openAIResponsesCreate.mockResolvedValue({ output_text: enhancedPrompt })
      transports.fetch.mockImplementation(async () =>
        createSuccessfulImageResponse(expectedImageBytes, responseSentinel)
      )

      if (row.textFailure) {
        const enhancementError = new Error('synthetic enhancement failure')
        transports.openAIResponsesCreate.mockRejectedValue(enhancementError)
        transports.googleTextError = enhancementError
      }

      const server = createMCPServer()
      const beforeTimeoutCalls = timeoutSpy.mock.calls.length
      const beforeParseCalls = jsonParseSpy.mock.calls.length
      const beforeDecodeCalls = bufferFromSpy.mock.calls.length

      expect.soft(await readdir(outputDirectory), row.name).toEqual([])

      const result = await server.callTool('generate_image', {
        prompt: requestPrompt,
        fileName,
        ...(inputImagePath && { inputImagePath }),
        ...row.args,
      })

      const parseCount = jsonParseSpy.mock.calls
        .slice(beforeParseCalls)
        .filter(([value]) => typeof value === 'string' && value.includes(responseSentinel)).length
      const decodeCount = bufferFromSpy.mock.calls
        .slice(beforeDecodeCalls)
        .filter(([value, encoding]) => value === expectedBase64 && encoding === 'base64').length
      const imageRequest = observeLastImageRequest()
      const textRequest =
        (transports.openAIResponsesCreate.mock.calls.at(-1)?.[0] as
          | Record<string, unknown>
          | undefined) ?? {}
      const selectedPrompt =
        row.skipPromptEnhancement || row.textFailure ? requestPrompt : enhancedPrompt
      const finalPrompt = `${selectedPrompt}\n\nOutput aspect ratio: ${row.expectedAspectRatio}.`
      const rowTimeouts = timeoutSpy.mock.calls
        .slice(beforeTimeoutCalls)
        .map(([timeout]) => timeout)
      const expectedImageRequest = {
        model: row.expectedModel,
        prompt: finalPrompt,
        size: row.expectedResolution,
        response_format: 'b64_json',
        output_format: 'png',
        stream: false,
        watermark: false,
        optimize_prompt_options: {
          mode: row.expectedQuality === 'fast' ? 'fast' : 'standard',
        },
        ...(inputImageBytes && {
          image: `data:image/png;base64,${inputImageBytes.toString('base64')}`,
        }),
      }
      const expectedImageKeys = Object.keys(expectedImageRequest).sort()
      const textInput = extractTextInput(textRequest)

      expect.soft(transports.googleConstructor, row.name).not.toHaveBeenCalled()
      expect
        .soft(transports.openAIResponsesCreate, row.name)
        .toHaveBeenCalledTimes(row.skipPromptEnhancement ? 0 : 1)
      expect.soft(transports.fetch, row.name).toHaveBeenCalledTimes(1)
      expect.soft(imageRequest.url, row.name).toBe(API_ENDPOINT)
      expect.soft(imageRequest.init?.method, row.name).toBe('POST')
      expect.soft(imageRequest.headers.get('authorization'), row.name).toBe(AUTHORIZATION_VALUE)
      expect.soft(Object.keys(imageRequest.body).sort(), row.name).toEqual(expectedImageKeys)
      expect.soft(imageRequest.body, row.name).toEqual(expectedImageRequest)
      expect.soft(rowTimeouts, row.name).toContain(300000)
      expect.soft(parseCount, row.name).toBe(1)
      expect.soft(decodeCount, row.name).toBe(1)

      if (row.skipPromptEnhancement) {
        expect.soft(textRequest, row.name).toEqual({})
      } else {
        expect
          .soft(Object.keys(textRequest).sort(), row.name)
          .toEqual([
            'input',
            'instructions',
            'max_output_tokens',
            'model',
            'temperature',
            'thinking',
            'top_p',
          ])
        expect.soft(textRequest.model, row.name).toBe('seed-2-0-lite-260428')
        expect.soft(textRequest.thinking, row.name).toEqual({ type: 'disabled' })
        expect.soft(textRequest.max_output_tokens, row.name).toBe(384)
        expect.soft(textRequest.temperature, row.name).toBe(0.7)
        expect.soft(textRequest.top_p, row.name).toBe(0.95)
        expect.soft(typeof textRequest.instructions, row.name).toBe('string')
        expect.soft(countOccurrences(textInput, requestPrompt), row.name).toBe(1)

        for (const [flag, instruction] of Object.entries(FEATURE_INSTRUCTIONS)) {
          expect
            .soft(textInput.includes(instruction), `${row.name}:${flag}`)
            .toBe(row.args[flag] === true)
        }

        const purpose = typeof row.args.purpose === 'string' ? row.args.purpose : undefined
        const purposeInstruction = purpose
          ? `INTENDED USE: ${purpose}\nTailor the visual style, quality level, and details to match this purpose.`
          : 'INTENDED USE:'
        expect
          .soft(textInput.includes(purposeInstruction), `${row.name}:purpose`)
          .toBe(Boolean(purpose))

        if (inputImageBytes) {
          expect.soft(textRequest.input, row.name).toEqual([
            {
              role: 'user',
              content: [
                { type: 'input_text', text: textInput },
                {
                  type: 'input_image',
                  image_url: `data:image/png;base64,${inputImageBytes.toString('base64')}`,
                  detail: 'auto',
                },
              ],
            },
          ])
        } else {
          expect.soft(textRequest.input, row.name).toBe(textInput)
        }
      }

      await assertSavedPng(result, outputDirectory, fileName, expectedImageBytes, row.expectedModel)

      const publicAndLogs = `${JSON.stringify(parsePublicResponse(result))}\n${capturedLogs()}`
      for (const sensitiveValue of [
        ARK_DUMMY_KEY,
        AUTHORIZATION_VALUE,
        requestPrompt,
        enhancedPrompt,
        responseSentinel,
        imageSentinel,
        inputImageBytes?.toString('base64') ?? '',
      ].filter(Boolean)) {
        expect.soft(publicAndLogs, `${row.name}:${sensitiveValue}`).not.toContain(sensitiveValue)
      }
    }
  })

  it('propagates .jpg through Seedream JPEG wire, bytes, save, and public resource', async () => {
    resetTransportDoubles()
    const outputDirectory = await createOutputDirectory()
    const fileName = 'seedream-native-output.jpg'
    const expectedBytes = createJpegFixture('seedream-jpeg-integration')
    configureSeedream(outputDirectory, { skipPromptEnhancement: true })
    transports.fetch.mockResolvedValue(
      createJsonResponse({
        data: [
          {
            b64_json: expectedBytes.toString('base64'),
            mime_type: 'image/jpeg',
            output_format: 'jpeg',
          },
        ],
      })
    )

    const result = await createMCPServer().callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName,
      quality: 'fast',
    })

    expect.soft(result.isError).toBe(false)
    expect.soft(observeLastImageRequest().body).toMatchObject({
      output_format: 'jpeg',
      response_format: 'b64_json',
    })
    expect.soft(await readFile(join(outputDirectory, fileName))).toEqual(expectedBytes)
    expect.soft(parsePublicResponse(result)).toMatchObject({
      type: 'resource',
      resource: {
        name: fileName,
        mimeType: 'image/jpeg',
      },
      metadata: {
        provider: 'seedream',
      },
    })
  })

  // AC: SEC-FILE-BOUND-01, SEC-FILE-TYPE-02, INPUT-SIZE-CONTRACT-04, RESOURCE-CLEANUP-05
  // Behavior: file-backed input -> opened-handle bounded read -> exact-limit success or contained
  // validation error with no base64/downstream side effect and guaranteed handle cleanup.
  // @category: integration
  // @lane: integration
  // @dependency: createMCPServer, input validation, Gemini ImageClient, FileManager, ResponseBuilder
  // @real-dependency: path sanitization and temporary filesystem
  // @complexity: high
  // Value Score: 110
  // Budget justification: this task explicitly requires an independent common file-boundary proof;
  // it is not a Seedream transport variant covered by the original three annotated integration cases.
  it('bounds file-backed input before base64 and downstream side effects', async () => {
    const inputDirectory = await createOutputDirectory()
    const expectedInputOpenFlags =
      fsConstants.O_RDONLY |
      (typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0) |
      (typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0)
    const bufferAllocSpy = vi.spyOn(Buffer, 'alloc')
    const bufferToStringSpy = vi.spyOn(Buffer.prototype, 'toString')

    resetTransportDoubles()
    const exactOutputDirectory = await createOutputDirectory()
    const exactInputPath = join(inputDirectory, 'exact-limit.png')
    await writeFile(exactInputPath, Buffer.alloc(MAX_IMAGE_SIZE, 0x61))
    configureGemini(exactOutputDirectory)
    let exactCloseSpy: ReturnType<typeof vi.spyOn> | undefined
    fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
      if (!fileSystem.actualOpen) {
        throw new Error('node:fs/promises.open test delegate is not initialized')
      }
      const handle = await fileSystem.actualOpen(filePath, flags)
      if (filePath.endsWith('/exact-limit.png')) {
        exactCloseSpy = vi.spyOn(handle, 'close')
      }
      return handle
    })
    const exactServer = createMCPServer()
    const beforeExactAllocCalls = bufferAllocSpy.mock.calls.length

    expect.soft(await readdir(exactOutputDirectory), 'exact-limit:before').toEqual([])
    const exactResult = await exactServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'exact-limit-output.png',
      inputImagePath: exactInputPath,
    })
    const exactAllocSizes = bufferAllocSpy.mock.calls
      .slice(beforeExactAllocCalls)
      .map(([size]) => size)

    expect.soft(exactResult.isError, 'exact-limit').toBe(false)
    expect.soft(fileSystem.open, 'exact-limit').toHaveBeenCalledTimes(1)
    expect
      .soft(fileSystem.open, 'exact-limit')
      .toHaveBeenCalledWith(expect.stringMatching(/\/exact-limit\.png$/), expectedInputOpenFlags)
    expect.soft(exactCloseSpy, 'exact-limit').toHaveBeenCalledTimes(1)
    expect.soft(exactAllocSizes, 'exact-limit:allocation').toContain(MAX_IMAGE_SIZE + 1)
    expect
      .soft(
        exactAllocSizes.every((size) => size <= MAX_IMAGE_SIZE + 1),
        'exact-limit:ceiling'
      )
      .toBe(true)
    expect.soft(transports.openAIResponsesCreate, 'exact-limit:text').not.toHaveBeenCalled()
    expect.soft(transports.googleGenerateContent, 'exact-limit:image').toHaveBeenCalledTimes(1)
    expect
      .soft(await readdir(exactOutputDirectory), 'exact-limit:after')
      .toEqual(['exact-limit-output.png'])

    resetTransportDoubles()
    const oversizedOutputDirectory = await createOutputDirectory()
    const oversizedInputPath = join(inputDirectory, 'over-limit.png')
    await writeFile(oversizedInputPath, Buffer.alloc(MAX_IMAGE_SIZE + 1, 0x62))
    configureGemini(oversizedOutputDirectory)
    let oversizedReadSpy: ReturnType<typeof vi.spyOn> | undefined
    let oversizedCloseSpy: ReturnType<typeof vi.spyOn> | undefined
    fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
      if (!fileSystem.actualOpen) {
        throw new Error('node:fs/promises.open test delegate is not initialized')
      }
      const handle = await fileSystem.actualOpen(filePath, flags)
      if (filePath.endsWith('/over-limit.png')) {
        oversizedReadSpy = vi.spyOn(handle, 'read')
        oversizedCloseSpy = vi.spyOn(handle, 'close')
      }
      return handle
    })
    const oversizedServer = createMCPServer()
    const beforeOversizedAllocCalls = bufferAllocSpy.mock.calls.length
    const beforeOversizedBase64Calls = bufferToStringSpy.mock.calls.length

    expect.soft(await readdir(oversizedOutputDirectory), 'over-limit:before').toEqual([])
    const oversizedResult = await oversizedServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'over-limit-output.png',
      inputImagePath: oversizedInputPath,
    })
    const oversizedAllocSizes = bufferAllocSpy.mock.calls
      .slice(beforeOversizedAllocCalls)
      .map(([size]) => size)
    const oversizedBase64Calls = bufferToStringSpy.mock.calls
      .slice(beforeOversizedBase64Calls)
      .filter(([encoding]) => encoding === 'base64')
    const oversizedError = (parsePublicResponse(oversizedResult).error ?? {}) as Record<
      string,
      unknown
    >

    expect.soft(oversizedResult.isError, 'over-limit').toBe(true)
    expect.soft(oversizedError.code, 'over-limit').toBe('INPUT_VALIDATION_ERROR')
    expect.soft(oversizedError.message, 'over-limit').toContain('10.0MB')
    expect.soft(fileSystem.open, 'over-limit').toHaveBeenCalledTimes(1)
    expect.soft(oversizedReadSpy, 'over-limit:read').not.toHaveBeenCalled()
    expect.soft(oversizedCloseSpy, 'over-limit').toHaveBeenCalledTimes(1)
    expect.soft(oversizedAllocSizes, 'over-limit:allocation').toEqual([])
    expect.soft(oversizedBase64Calls, 'over-limit:base64').toEqual([])
    expect.soft(transports.openAIResponsesCreate, 'over-limit:text').not.toHaveBeenCalled()
    expect.soft(transports.googleGenerateContent, 'over-limit:image').not.toHaveBeenCalled()
    expect.soft(await readdir(oversizedOutputDirectory), 'over-limit:after').toEqual([])

    resetTransportDoubles()
    const growthOutputDirectory = await createOutputDirectory()
    const growthInputPath = join(inputDirectory, 'growth.png')
    await writeFile(growthInputPath, Buffer.from('initial-file'))
    const sanitizedGrowthInputPath = await realpath(growthInputPath)
    configureGemini(growthOutputDirectory)
    let growthObservedBytes = 0
    let growthLargestReadEnd = 0
    const growthClose = vi.fn(async () => undefined)
    const growthRead = vi.fn(
      async (buffer: Buffer, offset: number, length: number, _position: number | null) => {
        const bytesRead = Math.min(length, MAX_IMAGE_SIZE + 1 - growthObservedBytes)
        buffer.fill(0x63, offset, offset + bytesRead)
        growthObservedBytes += bytesRead
        growthLargestReadEnd = Math.max(growthLargestReadEnd, offset + length)
        return { buffer, bytesRead }
      }
    )
    const growthHandle = {
      close: growthClose,
      read: growthRead,
      stat: vi.fn(async () => ({
        isFile: () => true,
        size: MAX_IMAGE_SIZE,
      })),
    }
    // Mock-boundary rationale: simulate only the external growing-file handle/stat/read sequence;
    // path selection, bounded reading, MCP orchestration, transports, saves, and other fs access stay real.
    fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
      if (filePath === sanitizedGrowthInputPath) {
        return growthHandle
      }
      if (!fileSystem.actualOpen) {
        throw new Error('node:fs/promises.open test delegate is not initialized')
      }
      return fileSystem.actualOpen(filePath, flags)
    })
    const growthServer = createMCPServer()
    const beforeGrowthAllocCalls = bufferAllocSpy.mock.calls.length
    const beforeGrowthBase64Calls = bufferToStringSpy.mock.calls.length

    expect.soft(await readdir(growthOutputDirectory), 'growth:before').toEqual([])
    const growthResult = await growthServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'growth-output.png',
      inputImagePath: growthInputPath,
    })
    const growthAllocSizes = bufferAllocSpy.mock.calls
      .slice(beforeGrowthAllocCalls)
      .map(([size]) => size)
    const growthBase64Calls = bufferToStringSpy.mock.calls
      .slice(beforeGrowthBase64Calls)
      .filter(([encoding]) => encoding === 'base64')
    const growthError = (parsePublicResponse(growthResult).error ?? {}) as Record<string, unknown>

    expect.soft(growthResult.isError, 'growth').toBe(true)
    expect.soft(growthError.code, 'growth').toBe('INPUT_VALIDATION_ERROR')
    expect.soft(growthError.message, 'growth').toContain('10.0MB')
    expect.soft(fileSystem.open, 'growth').toHaveBeenCalledTimes(1)
    expect
      .soft(fileSystem.open, 'growth')
      .toHaveBeenCalledWith(sanitizedGrowthInputPath, expectedInputOpenFlags)
    expect.soft(growthHandle.stat, 'growth:stat').toHaveBeenCalledTimes(1)
    expect.soft(growthRead, 'growth:read').toHaveBeenCalled()
    expect.soft(growthObservedBytes, 'growth:observed-bytes').toBe(MAX_IMAGE_SIZE + 1)
    expect
      .soft(growthLargestReadEnd, 'growth:allocation-ceiling')
      .toBeLessThanOrEqual(MAX_IMAGE_SIZE + 1)
    expect.soft(growthAllocSizes, 'growth:allocation').toContain(MAX_IMAGE_SIZE + 1)
    expect
      .soft(
        growthAllocSizes.every((size) => size <= MAX_IMAGE_SIZE + 1),
        'growth:ceiling'
      )
      .toBe(true)
    expect.soft(growthClose, 'growth:close').toHaveBeenCalledTimes(1)
    expect.soft(growthBase64Calls, 'growth:base64').toEqual([])
    expect.soft(transports.openAIResponsesCreate, 'growth:text').not.toHaveBeenCalled()
    expect.soft(transports.googleGenerateContent, 'growth:image').not.toHaveBeenCalled()
    expect.soft(await readdir(growthOutputDirectory), 'growth:after').toEqual([])

    resetTransportDoubles()
    const nonRegularOutputDirectory = await createOutputDirectory()
    const nonRegularInputPath = join(inputDirectory, 'non-regular.png')
    await mkdir(nonRegularInputPath)
    configureGemini(nonRegularOutputDirectory)
    let nonRegularReadSpy: ReturnType<typeof vi.spyOn> | undefined
    let nonRegularCloseSpy: ReturnType<typeof vi.spyOn> | undefined
    fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
      if (!fileSystem.actualOpen) {
        throw new Error('node:fs/promises.open test delegate is not initialized')
      }
      const handle = await fileSystem.actualOpen(filePath, flags)
      if (filePath.endsWith('/non-regular.png')) {
        nonRegularReadSpy = vi.spyOn(handle, 'read')
        nonRegularCloseSpy = vi.spyOn(handle, 'close')
      }
      return handle
    })
    const nonRegularServer = createMCPServer()
    const beforeNonRegularAllocCalls = bufferAllocSpy.mock.calls.length
    const beforeNonRegularBase64Calls = bufferToStringSpy.mock.calls.length

    expect.soft(await readdir(nonRegularOutputDirectory), 'non-regular:before').toEqual([])
    const nonRegularResult = await nonRegularServer.callTool('generate_image', {
      prompt: ORIGINAL_PROMPT,
      fileName: 'non-regular-output.png',
      inputImagePath: nonRegularInputPath,
    })
    const nonRegularAllocSizes = bufferAllocSpy.mock.calls
      .slice(beforeNonRegularAllocCalls)
      .map(([size]) => size)
    const nonRegularBase64Calls = bufferToStringSpy.mock.calls
      .slice(beforeNonRegularBase64Calls)
      .filter(([encoding]) => encoding === 'base64')
    const nonRegularError = (parsePublicResponse(nonRegularResult).error ?? {}) as Record<
      string,
      unknown
    >

    expect.soft(nonRegularResult.isError, 'non-regular').toBe(true)
    expect.soft(nonRegularError.code, 'non-regular').toBe('INPUT_VALIDATION_ERROR')
    expect.soft(fileSystem.open, 'non-regular').toHaveBeenCalledTimes(1)
    expect.soft(nonRegularReadSpy, 'non-regular:read').not.toHaveBeenCalled()
    expect.soft(nonRegularCloseSpy, 'non-regular:close').toHaveBeenCalledTimes(1)
    expect.soft(nonRegularAllocSizes, 'non-regular:allocation').toEqual([])
    expect.soft(nonRegularBase64Calls, 'non-regular:base64').toEqual([])
    expect.soft(transports.openAIResponsesCreate, 'non-regular:text').not.toHaveBeenCalled()
    expect.soft(transports.googleGenerateContent, 'non-regular:image').not.toHaveBeenCalled()
    expect.soft(await readdir(nonRegularOutputDirectory), 'non-regular:after').toEqual([])

    // Windows does not provide POSIX named FIFOs; Unix-family CI exercises the real FIFO open.
    if (process.platform !== 'win32') {
      resetTransportDoubles()
      const fifoOutputDirectory = await createOutputDirectory()
      const fifoInputPath = join(inputDirectory, 'named-pipe.png')
      await new Promise<void>((resolve, reject) => {
        execFile('/usr/bin/mkfifo', [fifoInputPath], (error) => {
          if (error) reject(error)
          else resolve()
        })
      })
      const sanitizedFifoInputPath = await realpath(fifoInputPath)
      configureGemini(fifoOutputDirectory)
      let fifoCloseSpy: ReturnType<typeof vi.spyOn> | undefined
      fileSystem.open.mockImplementation(async (filePath: string, flags: string | number) => {
        if (!fileSystem.actualOpen) {
          throw new Error('node:fs/promises.open test delegate is not initialized')
        }
        const handle = await fileSystem.actualOpen(filePath, flags)
        if (filePath === sanitizedFifoInputPath) {
          fifoCloseSpy = vi.spyOn(handle, 'close')
        }
        return handle
      })
      const fifoServer = createMCPServer()
      const beforeFifoAllocCalls = bufferAllocSpy.mock.calls.length
      const beforeFifoBase64Calls = bufferToStringSpy.mock.calls.length

      expect.soft(await readdir(fifoOutputDirectory), 'fifo:before').toEqual([])
      const fifoCall = fifoServer.callTool('generate_image', {
        prompt: ORIGINAL_PROMPT,
        fileName: 'fifo-output.png',
        inputImagePath: fifoInputPath,
      })
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined
      const completionState = await Promise.race([
        fifoCall.then(() => 'completed' as const),
        new Promise<'deadline'>((resolve) => {
          deadlineTimer = setTimeout(() => resolve('deadline'), 500)
        }),
      ])
      if (deadlineTimer) {
        clearTimeout(deadlineTimer)
      }

      if (completionState === 'deadline') {
        await Promise.all([
          fifoCall,
          writeFile(fifoInputPath, Buffer.from('unblock-old-reader')).catch(() => undefined),
        ])
      }
      const fifoResult = await fifoCall
      const fifoAllocSizes = bufferAllocSpy.mock.calls
        .slice(beforeFifoAllocCalls)
        .map(([size]) => size)
      const fifoBase64Calls = bufferToStringSpy.mock.calls
        .slice(beforeFifoBase64Calls)
        .filter(([encoding]) => encoding === 'base64')
      const fifoError = (parsePublicResponse(fifoResult).error ?? {}) as Record<string, unknown>

      expect.soft(completionState, 'fifo:deadline').toBe('completed')
      expect.soft(fifoResult.isError, 'fifo').toBe(true)
      expect.soft(fifoError.code, 'fifo').toBe('INPUT_VALIDATION_ERROR')
      expect.soft(fileSystem.open, 'fifo').toHaveBeenCalledTimes(1)
      expect
        .soft(fileSystem.open, 'fifo')
        .toHaveBeenCalledWith(sanitizedFifoInputPath, expectedInputOpenFlags)
      expect.soft(fifoCloseSpy, 'fifo:close').toHaveBeenCalledTimes(1)
      expect.soft(fifoAllocSizes, 'fifo:allocation').toEqual([])
      expect.soft(fifoBase64Calls, 'fifo:base64').toEqual([])
      expect.soft(transports.openAIResponsesCreate, 'fifo:text').not.toHaveBeenCalled()
      expect.soft(transports.googleGenerateContent, 'fifo:image').not.toHaveBeenCalled()
      expect.soft(await readdir(fifoOutputDirectory), 'fifo:after').toEqual([])
      await rm(fifoInputPath, { force: true })
    }
  })

  it('contains Seedream failures before the next side effect without disclosure', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const jsonParseSpy = vi.spyOn(JSON, 'parse')
    const bufferFromSpy = vi.spyOn(Buffer, 'from')
    type FailureRow = {
      args?: Record<string, unknown>
      arkApiKey?: string
      deleteArkApiKey?: boolean
      expectedCode: string
      expectedDecodeCalls: number
      expectedImageCalls: number
      expectedParseCalls: number
      expectedTextCalls: number
      fetchError?: Error
      name: string
      responseFactory?: (responseSentinel: string, imageSentinel: string) => Response
      sensitiveValues?: string[]
      skipPromptEnhancement?: boolean
    }

    const failureRows: FailureRow[] = [
      {
        name: 'missing-key',
        deleteArkApiKey: true,
        expectedCode: 'CONFIG_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
      },
      {
        name: 'empty-key',
        arkApiKey: '   ',
        expectedCode: 'CONFIG_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
      },
      {
        name: 'google-search',
        args: { useGoogleSearch: true },
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
      },
      {
        name: 'google-search-string',
        args: { useGoogleSearch: 'private-invalid-google-search-string' },
        expectedCode: 'INPUT_VALIDATION_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        sensitiveValues: ['private-invalid-google-search-string'],
      },
      {
        name: 'google-search-number',
        args: { useGoogleSearch: 8675309 },
        expectedCode: 'INPUT_VALIDATION_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        sensitiveValues: ['8675309'],
      },
      {
        name: 'google-search-null',
        args: { useGoogleSearch: null },
        expectedCode: 'INPUT_VALIDATION_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
      },
      {
        name: 'google-search-object',
        args: { useGoogleSearch: { marker: 'private-invalid-google-search-object' } },
        expectedCode: 'INPUT_VALIDATION_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        sensitiveValues: ['private-invalid-google-search-object'],
      },
      {
        name: 'fast-pro-4k',
        args: { imageSize: '4K', quality: 'fast' },
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
      },
      {
        name: 'pro-4k',
        args: { imageSize: '4K', quality: 'quality' },
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
      },
      {
        name: 'unsupported-editing-input',
        args: { inputImagePath: '__CREATE_UNSUPPORTED_INPUT__' },
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 0,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
      },
      {
        name: 'missing-data',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 1,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) =>
          createJsonResponse({
            response_sentinel: responseSentinel,
            image_sentinel: imageSentinel,
          }),
      },
      {
        name: 'extra-images',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 1,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) => {
          const imageBytes = createPngFixture(imageSentinel)
          return createJsonResponse({
            response_sentinel: responseSentinel,
            data: [
              { b64_json: imageBytes.toString('base64'), mime_type: 'image/png' },
              { b64_json: imageBytes.toString('base64'), mime_type: 'image/png' },
            ],
          })
        },
      },
      {
        name: 'url-only',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 1,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) =>
          createJsonResponse({
            response_sentinel: responseSentinel,
            image_sentinel: imageSentinel,
            data: [{ url: `https://attacker.invalid/${imageSentinel}.png` }],
          }),
      },
      {
        name: 'stream-event',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) =>
          new Response(
            `data: ${JSON.stringify({
              response_sentinel: responseSentinel,
              image_sentinel: imageSentinel,
              data: [],
            })}\n\n`,
            {
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
            }
          ),
      },
      {
        name: 'malformed-base64',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 1,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) => {
          const validBase64 = createPngFixture(imageSentinel).toString('base64')
          return createJsonResponse({
            response_sentinel: responseSentinel,
            data: [
              {
                b64_json: `${validBase64.slice(0, -1)}*`,
                mime_type: 'image/png',
              },
            ],
          })
        },
      },
      {
        name: 'empty-base64',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 1,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) =>
          createJsonResponse({
            response_sentinel: responseSentinel,
            image_sentinel: imageSentinel,
            data: [{ b64_json: '', mime_type: 'image/png' }],
          }),
      },
      {
        name: 'content-length-over-48-mib',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) =>
          new Response(`${responseSentinel}:${imageSentinel}`, {
            status: 200,
            headers: {
              'content-length': String(48 * 1024 * 1024 + 1),
              'content-type': 'application/json',
            },
          }),
      },
      {
        name: 'chunked-body-over-48-mib',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
      },
      {
        name: 'decoded-size-over-32-mib',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 1,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) =>
          createJsonResponse({
            response_sentinel: responseSentinel,
            image_sentinel: imageSentinel,
            data: [
              {
                b64_json: 'A'.repeat(Math.ceil(((32 * 1024 * 1024 + 1) * 4) / 3)),
                mime_type: 'image/png',
              },
            ],
          }),
      },
      {
        name: 'non-png-magic',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 1,
        expectedImageCalls: 1,
        expectedParseCalls: 1,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) =>
          createJsonResponse({
            response_sentinel: responseSentinel,
            data: [
              {
                b64_json: Buffer.from(`not-a-png:${imageSentinel}`).toString('base64'),
                mime_type: 'image/png',
              },
            ],
          }),
      },
      {
        name: 'wrong-mime',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 1,
        expectedImageCalls: 1,
        expectedParseCalls: 1,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) => {
          const imageBytes = createPngFixture(imageSentinel)
          return createJsonResponse({
            response_sentinel: responseSentinel,
            data: [{ b64_json: imageBytes.toString('base64'), mime_type: 'image/jpeg' }],
          })
        },
      },
      {
        name: 'abort-timeout',
        expectedCode: 'NETWORK_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        fetchError: new DOMException('synthetic timeout', 'AbortError'),
      },
      {
        name: 'http-401',
        expectedCode: 'IMAGE_API_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) =>
          createJsonResponse(
            {
              response_sentinel: responseSentinel,
              image_sentinel: imageSentinel,
              error: { message: RAW_BODY_MARKER },
            },
            401
          ),
      },
      {
        name: 'http-500',
        expectedCode: 'NETWORK_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        responseFactory: (responseSentinel, imageSentinel) =>
          createJsonResponse(
            {
              response_sentinel: responseSentinel,
              image_sentinel: imageSentinel,
              error: { message: RAW_BODY_MARKER },
            },
            500
          ),
      },
      {
        name: 'network-failure',
        expectedCode: 'NETWORK_ERROR',
        expectedDecodeCalls: 0,
        expectedImageCalls: 1,
        expectedParseCalls: 0,
        expectedTextCalls: 0,
        skipPromptEnhancement: true,
        fetchError: new TypeError(`fetch failed: ${RAW_BODY_MARKER}`),
      },
    ]

    for (const [index, row] of failureRows.entries()) {
      resetTransportDoubles()
      vi.mocked(console.error).mockClear()
      const outputDirectory = await createOutputDirectory()
      const requestSentinel = `${ORIGINAL_PROMPT}:${row.name}:request-body-sentinel`
      const responseSentinel = `${row.name}:response-body-sentinel`
      const imageSentinel = `${row.name}:decoded-image-sentinel`
      configureSeedream(outputDirectory, {
        arkApiKey: row.arkApiKey,
        skipPromptEnhancement: row.skipPromptEnhancement,
      })
      if (row.deleteArkApiKey) {
        delete process.env.ARK_API_KEY
      }

      let chunkedCancel: ReturnType<typeof vi.fn> | undefined
      if (row.name === 'chunked-body-over-48-mib') {
        chunkedCancel = vi.fn()
        transports.fetch.mockImplementation(async () => {
          let emittedChunks = 0
          const markerChunk = new TextEncoder().encode(`${responseSentinel}:${imageSentinel}`)
          return new Response(
            new ReadableStream<Uint8Array>({
              cancel: chunkedCancel,
              pull(controller) {
                if (emittedChunks === 0) {
                  controller.enqueue(markerChunk)
                  emittedChunks += 1
                } else if (emittedChunks < 50) {
                  controller.enqueue(new Uint8Array(1024 * 1024))
                  emittedChunks += 1
                } else {
                  controller.close()
                }
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        })
      } else if (row.fetchError) {
        const message = `${row.fetchError.message}:${responseSentinel}:${imageSentinel}`
        const error =
          row.fetchError instanceof DOMException
            ? new DOMException(message, row.fetchError.name)
            : new TypeError(message)
        transports.fetch.mockRejectedValue(error)
      } else if (row.responseFactory) {
        transports.fetch.mockImplementation(async () =>
          row.responseFactory?.(responseSentinel, imageSentinel)
        )
      }

      let args: Record<string, unknown> = {
        prompt: requestSentinel,
        fileName: `failure-${index}.png`,
        ...row.args,
      }
      if (row.args?.inputImagePath === '__CREATE_UNSUPPORTED_INPUT__') {
        const unsupportedInputPath = join(outputDirectory, 'unsupported.gif')
        await writeFile(unsupportedInputPath, `${INPUT_IMAGE_MARKER}:${row.name}`)
        args = {
          ...args,
          inputImagePath: unsupportedInputPath,
        }
      }

      const beforeFiles = await readdir(outputDirectory)
      const beforeTimeoutCalls = timeoutSpy.mock.calls.length
      const server = createMCPServer()
      const beforeParseCalls = jsonParseSpy.mock.calls.length
      const beforeDecodeCalls = bufferFromSpy.mock.calls.length
      const result = await server.callTool('generate_image', args)
      const afterFiles = await readdir(outputDirectory)
      const parseCount = jsonParseSpy.mock.calls
        .slice(beforeParseCalls)
        .filter(([value]) => typeof value === 'string' && value.includes(responseSentinel)).length
      const pngBase64 = createPngFixture(imageSentinel).toString('base64')
      const malformedBase64 = `${pngBase64.slice(0, -1)}*`
      const nonPngBase64 = Buffer.from(`not-a-png:${imageSentinel}`).toString('base64')
      const oversizedBase64Length = Math.ceil(((32 * 1024 * 1024 + 1) * 4) / 3)
      const decodeCount = bufferFromSpy.mock.calls
        .slice(beforeDecodeCalls)
        .filter(([value, encoding]) => {
          if (encoding !== 'base64' || typeof value !== 'string') {
            return false
          }

          if (row.name === 'extra-images' || row.name === 'wrong-mime') {
            return value === pngBase64
          }
          if (row.name === 'malformed-base64') {
            return value === malformedBase64
          }
          if (row.name === 'empty-base64') {
            return value === ''
          }
          if (row.name === 'decoded-size-over-32-mib') {
            return value.length === oversizedBase64Length && value.startsWith('A')
          }
          if (row.name === 'non-png-magic') {
            return value === nonPngBase64
          }

          return false
        }).length
      const publicResponse = parsePublicResponse(result)
      const publicError = (publicResponse.error ?? {}) as Record<string, unknown>
      const exposed = `${JSON.stringify(publicResponse)}\n${capturedLogs()}`
      const rowTimeouts = timeoutSpy.mock.calls
        .slice(beforeTimeoutCalls)
        .map(([timeout]) => timeout)

      expect
        .soft(
          beforeFiles.filter((file) => file !== 'unsupported.gif'),
          row.name
        )
        .toEqual([])
      expect.soft(result.isError, row.name).toBe(true)
      expect.soft(publicError.code, row.name).toBe(row.expectedCode)
      expect.soft(Object.keys(result).sort(), row.name).toEqual(['content', 'isError'])
      expect.soft(Object.keys(publicResponse), row.name).toEqual(['error'])
      expect
        .soft(
          Object.keys(publicError).every((key) => {
            return ['code', 'details', 'message', 'suggestion', 'timestamp'].includes(key)
          }),
          row.name
        )
        .toBe(true)
      const publicDetails = publicError.details as Record<string, unknown> | undefined
      if (publicDetails) {
        expect
          .soft(
            Object.keys(publicDetails).every((key) => {
              return ['provider', 'stage', 'statusCode', 'upstreamMessage'].includes(key)
            }),
            row.name
          )
          .toBe(true)
      }
      expect.soft(transports.googleConstructor, row.name).not.toHaveBeenCalled()
      expect
        .soft(transports.openAIResponsesCreate, row.name)
        .toHaveBeenCalledTimes(row.expectedTextCalls)
      expect.soft(transports.fetch, row.name).toHaveBeenCalledTimes(row.expectedImageCalls)
      expect.soft(parseCount, row.name).toBe(row.expectedParseCalls)
      expect.soft(decodeCount, row.name).toBe(row.expectedDecodeCalls)
      expect
        .soft(
          afterFiles.filter((file) => file !== 'unsupported.gif'),
          row.name
        )
        .toEqual([])

      if (row.expectedImageCalls === 0) {
        expect.soft(rowTimeouts, row.name).not.toContain(300000)
      } else {
        expect.soft(rowTimeouts, row.name).toContain(300000)
      }
      if (row.name === 'url-only') {
        expect.soft(transports.fetch, row.name).toHaveBeenCalledTimes(1)
      }
      if (row.name === 'chunked-body-over-48-mib') {
        expect.soft(chunkedCancel, row.name).toBeDefined()
        expect.soft(chunkedCancel?.mock.calls.length ?? 0, row.name).toBe(1)
      }

      for (const sensitiveValue of [
        ARK_DUMMY_KEY,
        AUTHORIZATION_VALUE,
        requestSentinel,
        INPUT_IMAGE_MARKER,
        RAW_BODY_MARKER,
        responseSentinel,
        imageSentinel,
        ...(row.sensitiveValues ?? []),
      ]) {
        expect.soft(exposed, `${row.name}:${sensitiveValue}`).not.toContain(sensitiveValue)
      }
    }
  })
})
