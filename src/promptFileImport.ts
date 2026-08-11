export type PromptFileKind = 'json' | 'markdown'
export type PromptMergeMode = 'filled' | 'inserted' | 'replaced'

export const MAX_PROMPT_FILE_BYTES = 256 * 1024
export const MAX_IMPORTED_PROMPT_CHARS = 20_000

const PRIMARY_PROMPT_KEYS = [
  'prompt',
  'video_prompt',
  'videoPrompt',
  'positive_prompt',
  'positivePrompt',
  '提示词',
  '正向提示词',
]
const SECONDARY_PROMPT_KEYS = ['text', 'content', 'description', '文本', '内容', '描述', 'caption', 'script', '文案']
const WRAPPER_KEYS = ['input', 'inputs', 'request', 'body', 'data', 'payload', 'parameters', 'params', 'config', 'options']
const MAX_JSON_WRAPPER_DEPTH = 5

function normalizeFieldKey(key: string) {
  return key.toLowerCase().replace(/[\s_-]+/g, '')
}

export function detectPromptFileKind(fileName: string, mimeType = ''): PromptFileKind | null {
  const normalizedName = fileName.trim().toLowerCase()
  if (normalizedName.endsWith('.json')) return 'json'
  if (normalizedName.endsWith('.md') || normalizedName.endsWith('.markdown')) return 'markdown'

  const baseName = normalizedName.split(/[\\/]/).pop() || ''
  if (baseName.includes('.')) return null
  const normalizedMime = mimeType.trim().toLowerCase()
  if (normalizedMime === 'application/json') return 'json'
  if (normalizedMime === 'text/markdown' || normalizedMime === 'text/x-markdown') return 'markdown'
  return null
}

export function decodePromptFile(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let encoding = 'utf-8'
  let offset = 0

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    offset = 3
  } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = 'utf-16le'
    offset = 2
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = 'utf-16be'
    offset = 2
  }

  let decoded: string
  try {
    decoded = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset))
  } catch {
    throw new Error('文件编码无法识别，仅支持 UTF-8 或带 BOM 的 UTF-16 文件')
  }

  if (decoded.includes('\u0000')) throw new Error('文件包含二进制内容，无法导入 Prompt')
  const normalized = decoded.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) throw new Error('文件中没有可导入的文字内容')
  return normalized
}

function formatPromptValue(value: unknown, emptyMessage: string) {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) throw new Error(emptyMessage)
    return text
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    const text = value.map((item) => item.trim()).filter(Boolean).join('\n\n')
    if (!text) throw new Error(emptyMessage)
    return text
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value) && value.length === 0) throw new Error(emptyMessage)
    if (!Array.isArray(value) && Object.keys(value).length === 0) throw new Error(emptyMessage)
    return JSON.stringify(value, null, 2)
  }
  throw new Error(emptyMessage)
}

function findFieldInKnownWrappers(
  value: unknown,
  fieldNames: string[],
  depth = 0,
): { found: boolean; value?: unknown } {
  if (!value || typeof value !== 'object' || depth > MAX_JSON_WRAPPER_DEPTH) return { found: false }
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFieldInKnownWrappers(item, fieldNames, depth)
      if (match.found) return match
    }
    return { found: false }
  }

  const record = value as Record<string, unknown>
  for (const fieldName of fieldNames) {
    const normalizedFieldName = normalizeFieldKey(fieldName)
    const matchingKey = Object.keys(record).find((key) => normalizeFieldKey(key) === normalizedFieldName)
    if (matchingKey) return { found: true, value: record[matchingKey] }
  }
  if (depth === MAX_JSON_WRAPPER_DEPTH) return { found: false }
  for (const wrapperKey of WRAPPER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, wrapperKey)) continue
    const match = findFieldInKnownWrappers(record[wrapperKey], fieldNames, depth + 1)
    if (match.found) return match
  }
  return { found: false }
}

function findLastUserMessage(value: unknown, depth = 0): unknown {
  if (!value || typeof value !== 'object' || depth > MAX_JSON_WRAPPER_DEPTH) return undefined
  if (Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Array.isArray(record.messages)) {
    for (let index = record.messages.length - 1; index >= 0; index -= 1) {
      const message = record.messages[index]
      if (!message || typeof message !== 'object' || Array.isArray(message)) continue
      const messageRecord = message as Record<string, unknown>
      if (String(messageRecord.role || '').toLowerCase() !== 'user') continue
      if (typeof messageRecord.content === 'string') return messageRecord.content
      if (Array.isArray(messageRecord.content)) {
        const parts = messageRecord.content
          .map((part) => part && typeof part === 'object' && !Array.isArray(part) ? (part as Record<string, unknown>).text : undefined)
          .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
        return parts
      }
      return messageRecord.content
    }
  }
  if (depth === MAX_JSON_WRAPPER_DEPTH) return undefined
  for (const wrapperKey of WRAPPER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, wrapperKey)) continue
    const result = findLastUserMessage(record[wrapperKey], depth + 1)
    if (result !== undefined) return result
  }
  return undefined
}

function enforcePromptLength(text: string) {
  if (text.length > MAX_IMPORTED_PROMPT_CHARS) {
    throw new Error(`导入内容超过 ${MAX_IMPORTED_PROMPT_CHARS.toLocaleString('en-US')} 字符，请精简后重试`)
  }
  return text
}

export function extractPromptText(rawText: string, kind: PromptFileKind) {
  if (kind === 'markdown') return enforcePromptLength(rawText)

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('JSON 文件格式无效，请检查逗号、引号和括号')
  }

  if (typeof parsed === 'string') return enforcePromptLength(formatPromptValue(parsed, 'JSON 中的 Prompt 为空'))
  if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
    return enforcePromptLength(formatPromptValue(parsed, 'JSON 中的 Prompt 为空'))
  }

  const primaryField = findFieldInKnownWrappers(parsed, PRIMARY_PROMPT_KEYS)
  if (primaryField.found) {
    return enforcePromptLength(formatPromptValue(primaryField.value, 'JSON 中的 Prompt 为空'))
  }

  const userMessage = findLastUserMessage(parsed)
  if (userMessage !== undefined) {
    return enforcePromptLength(formatPromptValue(userMessage, 'JSON 中最后一条用户消息为空'))
  }

  const secondaryField = findFieldInKnownWrappers(parsed, SECONDARY_PROMPT_KEYS)
  if (secondaryField.found) {
    return enforcePromptLength(formatPromptValue(secondaryField.value, 'JSON 中的文字内容为空'))
  }

  if (parsed === null) throw new Error('JSON 中没有可导入的文字内容')
  return enforcePromptLength(JSON.stringify(parsed, null, 2))
}

export function mergeImportedPrompt(
  currentPrompt: string,
  importedText: string,
  selectionStart = currentPrompt.length,
  selectionEnd = selectionStart,
): { prompt: string; cursor: number; mode: PromptMergeMode } {
  if (!currentPrompt) return { prompt: importedText, cursor: importedText.length, mode: 'filled' }

  const start = Math.max(0, Math.min(currentPrompt.length, selectionStart))
  const end = Math.max(start, Math.min(currentPrompt.length, selectionEnd))
  if (end > start) {
    const prompt = `${currentPrompt.slice(0, start)}${importedText}${currentPrompt.slice(end)}`
    return { prompt, cursor: start + importedText.length, mode: 'replaced' }
  }

  const before = currentPrompt.slice(0, start)
  const after = currentPrompt.slice(start)
  const beforeSeparator = before && !/\s$/.test(before) ? '\n\n' : ''
  const afterSeparator = after && !/^\s/.test(after) ? '\n\n' : ''
  const insertion = `${beforeSeparator}${importedText}${afterSeparator}`
  return {
    prompt: `${before}${insertion}${after}`,
    cursor: before.length + beforeSeparator.length + importedText.length,
    mode: 'inserted',
  }
}
