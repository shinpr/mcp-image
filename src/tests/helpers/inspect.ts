import type { ImageClient } from '../../api/imageClient.js'

/**
 * Runtime-checked readers for test assertions. Each throws a descriptive error
 * instead of asserting over a value, so a malformed subject fails the test at
 * the point of inspection rather than silently type-checking.
 */

/** Runtime check for a plain object, usable as a type guard in filters. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The value when it is a plain object, otherwise an empty object. */
export function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

export function expectRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${what} to be an object, received ${JSON.stringify(value)}`)
  }
  return value
}

export function expectString(value: unknown, what: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${what} to be a string, received ${JSON.stringify(value)}`)
  }
  return value
}

export function expectArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${what} to be an array, received ${JSON.stringify(value)}`)
  }
  return value
}

export function expectDefined<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Expected ${what} to be defined`)
  }
  return value
}

/** Parse JSON that is expected to describe an object. */
export function parseJsonObject(text: string, what = 'JSON payload'): Record<string, unknown> {
  return expectRecord(JSON.parse(text), what)
}

/**
 * Text of a tool result's first content entry. Accepts `unknown` so both the
 * server's own `McpToolResponse` and an MCP client's `CallToolResult` can be
 * inspected through one runtime-checked reader.
 */
export function firstContentText(result: unknown): string {
  const content = expectRecord(result, 'tool result')['content']
  if (!Array.isArray(content)) {
    throw new Error('Expected tool result content to be an array')
  }
  const first = expectRecord(expectDefined(content[0], 'first content entry'), 'content entry')
  return expectString(first['text'], 'first content entry text')
}

/** The first content entry of a tool result, parsed as a JSON object. */
export function parseToolPayload(result: unknown): Record<string, unknown> {
  return parseJsonObject(firstContentText(result), 'tool response payload')
}

/** Read a nested property path, checking that each step is an object. */
export function readPath(source: unknown, ...path: string[]): unknown {
  let current: unknown = source
  const walked: string[] = []
  for (const key of path) {
    current = expectRecord(current, walked.length === 0 ? 'payload' : walked.join('.'))[key]
    walked.push(key)
  }
  return current
}

/** Build an Error carrying a Node-style `code`, without asserting over it. */
export function errorWithCode(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

/**
 * View an image client the way an untyped upstream caller reaches it. Provider
 * clients guard against values their parameter types forbid, and this lets a
 * test exercise those guards without asserting over the client's own contract.
 */
export interface UntypedImageClient {
  generateImage(params: unknown): ReturnType<ImageClient['generateImage']>
}

export function asUntypedCaller(client: ImageClient): UntypedImageClient {
  return client
}
