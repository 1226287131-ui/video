const REFERENCE_TOKEN_SOURCE = String.raw`(?<![A-Za-z0-9._%+-])[@＠]参考图(\d+)(?![\p{N}A-Za-z_]|\.[A-Za-z0-9_])`
const REFERENCE_TOKEN_PATTERN = new RegExp(REFERENCE_TOKEN_SOURCE, 'gu')
const REFERENCE_TOKEN_TEST_PATTERN = new RegExp(REFERENCE_TOKEN_SOURCE, 'u')
const INCOMPLETE_REFERENCE_PATTERN = /(?<![A-Za-z0-9._%+-])[@＠](?:参|参考|参考图)(?![\p{L}\p{N}_])/u
const ACTIVE_REFERENCE_PATTERN = /(?<![A-Za-z0-9._%+-])[@＠]([^@＠\s，。！？；：,.!?;:]*)$/u

export type ActiveReferenceMention = {
  start: number
  end: number
  query: string
}

export type ReferenceCompilation = {
  prompt: string
  referencedNumbers: number[]
  invalidTokens: string[]
  incomplete: boolean
}

function isCanonicalReferenceNumber(rawNumber: string, referenceCount = Number.POSITIVE_INFINITY) {
  const referenceNumber = Number(rawNumber)
  return Number.isSafeInteger(referenceNumber) &&
    referenceNumber >= 1 &&
    referenceNumber <= referenceCount &&
    rawNumber === String(referenceNumber)
}

function isActiveReferenceQuery(query: string) {
  if (query === '') return true
  if ('参考图'.startsWith(query)) return true
  return /^参考图[1-9]\d*$/u.test(query)
}

export function getReferenceMentionNumbers(prompt: string, referenceCount = Number.POSITIVE_INFINITY) {
  const numbers: number[] = []
  for (const match of prompt.matchAll(REFERENCE_TOKEN_PATTERN)) {
    const rawNumber = match[1]
    if (!isCanonicalReferenceNumber(rawNumber, referenceCount)) continue
    const referenceNumber = Number(rawNumber)
    if (!numbers.includes(referenceNumber)) numbers.push(referenceNumber)
  }
  return numbers
}

export function hasReferenceMentions(prompt: string) {
  return REFERENCE_TOKEN_TEST_PATTERN.test(prompt) || INCOMPLETE_REFERENCE_PATTERN.test(prompt)
}

export function compileReferenceMentions(prompt: string, referenceCount: number): ReferenceCompilation {
  const rawPrompt = prompt.trim()
  const referencedNumbers: number[] = []
  const invalidTokens: string[] = []

  for (const match of rawPrompt.matchAll(REFERENCE_TOKEN_PATTERN)) {
    const token = match[0]
    const rawNumber = match[1]
    if (!isCanonicalReferenceNumber(rawNumber, referenceCount)) {
      if (!invalidTokens.includes(token)) invalidTokens.push(token)
      continue
    }
    const referenceNumber = Number(rawNumber)
    if (!referencedNumbers.includes(referenceNumber)) referencedNumbers.push(referenceNumber)
  }

  const incomplete = INCOMPLETE_REFERENCE_PATTERN.test(rawPrompt)
  if (invalidTokens.length > 0 || incomplete || referencedNumbers.length === 0) {
    return { prompt: rawPrompt, referencedNumbers, invalidTokens, incomplete }
  }

  const compiledBody = rawPrompt.replace(REFERENCE_TOKEN_PATTERN, (token, rawNumber: string) => {
    if (!isCanonicalReferenceNumber(rawNumber, referenceCount)) return token
    const referenceNumber = Number(rawNumber)
    return `第${referenceNumber}张参考图（REFERENCE_${referenceNumber - 1}）`
  })
  const mapping = [...referencedNumbers]
    .sort((left, right) => left - right)
    .map((referenceNumber) => `第${referenceNumber}张参考图对应 REFERENCE_${referenceNumber - 1}`)
    .join('；')
  const instruction = `参考图严格按传入顺序编号：${mapping}。请严格按照这些编号理解下方指令，不要混淆不同参考图。`

  return {
    prompt: `${instruction}\n\n${compiledBody}`,
    referencedNumbers,
    invalidTokens,
    incomplete,
  }
}

export function findActiveReferenceMention(value: string, cursor: number): ActiveReferenceMention | null {
  const safeCursor = Math.max(0, Math.min(cursor, value.length))
  const beforeCursor = value.slice(0, safeCursor)
  const match = beforeCursor.match(ACTIVE_REFERENCE_PATTERN)
  if (!match) return null
  const query = match[1]
  if (!isActiveReferenceQuery(query)) return null
  return {
    start: safeCursor - match[0].length,
    end: safeCursor,
    query,
  }
}

export function reindexReferenceMentionsAfterRemoval(prompt: string, removedNumber: number) {
  if (!Number.isSafeInteger(removedNumber) || removedNumber < 1) return prompt
  return prompt.replace(REFERENCE_TOKEN_PATTERN, (token, rawNumber: string) => {
    if (!isCanonicalReferenceNumber(rawNumber)) return token
    const referenceNumber = Number(rawNumber)
    if (referenceNumber <= removedNumber) return token
    return `${token[0]}参考图${referenceNumber - 1}`
  })
}
