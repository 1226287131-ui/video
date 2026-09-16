export const VIDEO_V2_MEDIA_LIMITS = {
  images: 9,
  videos: 3,
  audios: 3,
} as const

/** Canonical model ids handled by the shared Video V2 adapter. */
export const VIDEO_V2_MODEL = 'video-v2' as const
export const VIDEO_V2_FAST_MODEL = 'video-v2-fast' as const
/** Additional special-price channel backed by the standard V2 request adapter. */
export const VIDEO_V2_SPECIAL_PRICE_MODEL = 'video-v2-特价版' as const
export const VIDEO_V2_SPECIAL_PRICE_MODELS = [VIDEO_V2_SPECIAL_PRICE_MODEL] as const
/** Additional low-price channel ids backed by the same V2 adapters. */
export const VIDEO_V2_LOW_PRICE_MODEL = 'video-v2（限时低价渠道）' as const
export const VIDEO_V2_FAST_LOW_PRICE_MODEL = 'video-v2-fast（限时低价渠道）' as const
// Keep the earlier duplicated-label spelling usable for already-issued model ids.
const VIDEO_V2_LOW_PRICE_LEGACY_MODEL = 'video-v2（限时低价低价渠道）' as const
const VIDEO_V2_FAST_LOW_PRICE_LEGACY_MODEL = 'video-v2-fast（限时低价低价渠道）' as const
export const VIDEO_V2_MODELS = [
  VIDEO_V2_MODEL,
  VIDEO_V2_FAST_MODEL,
  VIDEO_V2_LOW_PRICE_MODEL,
  VIDEO_V2_FAST_LOW_PRICE_MODEL,
] as const

export const VIDEO_V2_LOW_PRICE_MODELS = [
  VIDEO_V2_LOW_PRICE_MODEL,
  VIDEO_V2_FAST_LOW_PRICE_MODEL,
] as const

const VIDEO_V2_ADAPTER_MODELS = [
  ...VIDEO_V2_MODELS,
  ...VIDEO_V2_SPECIAL_PRICE_MODELS,
  VIDEO_V2_LOW_PRICE_LEGACY_MODEL,
  VIDEO_V2_FAST_LOW_PRICE_LEGACY_MODEL,
] as const

/** Both low-price V2 channels accept an integer duration from 5 to 15 seconds. */
export const VIDEO_V2_MIN_DURATION = 5
export const VIDEO_V2_MAX_DURATION = 15

export type VideoV2MediaCounts = {
  images: number
  videos: number
  audios: number
}

const VIDEO_V2_SPECIAL_PRICE_MEDIA_LIMITS = {
  images: 9,
  videos: 3,
  audios: 3,
} as const

export type VideoV2MentionResult = {
  prompt: string
  invalidTokens: string[]
  valid: boolean
}

type VideoV2MediaKind = keyof VideoV2MediaCounts

const MEDIA_MENTION_PATTERN = /(?<![A-Za-z0-9._%+-])[@＠](Image|Video|Audio|参考图|参考视频|视频|参考音频|音频)(\d+)(?![A-Za-z0-9_]|\.[A-Za-z0-9_])/giu

const MEDIA_ALIASES: Record<string, { kind: VideoV2MediaKind, canonical: string }> = {
  image: { kind: 'images', canonical: 'Image' },
  '参考图': { kind: 'images', canonical: 'Image' },
  video: { kind: 'videos', canonical: 'Video' },
  '参考视频': { kind: 'videos', canonical: 'Video' },
  '视频': { kind: 'videos', canonical: 'Video' },
  audio: { kind: 'audios', canonical: 'Audio' },
  '参考音频': { kind: 'audios', canonical: 'Audio' },
  '音频': { kind: 'audios', canonical: 'Audio' },
}

function getSafeCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function isVideoV2Model(model: unknown) {
  const normalizedModel = String(model || '').trim().toLowerCase()
  return VIDEO_V2_ADAPTER_MODELS.some((candidate) => candidate === normalizedModel)
}

export function isVideoV2SpecialPriceModel(model: unknown) {
  const normalizedModel = String(model || '').trim().toLowerCase()
  return normalizedModel === VIDEO_V2_SPECIAL_PRICE_MODEL
}

export function getVideoV2MediaLimitsForModel(model: unknown): VideoV2MediaCounts {
  return isVideoV2SpecialPriceModel(model)
    ? VIDEO_V2_SPECIAL_PRICE_MEDIA_LIMITS
    : VIDEO_V2_MEDIA_LIMITS
}

export function isVideoV2FastModel(model: unknown) {
  const normalizedModel = String(model || '').trim().toLowerCase()
  return normalizedModel === VIDEO_V2_FAST_MODEL
    || normalizedModel === VIDEO_V2_FAST_LOW_PRICE_MODEL
    || normalizedModel === VIDEO_V2_FAST_LOW_PRICE_LEGACY_MODEL
}

export function isValidVideoV2Duration(value: unknown): value is number {
  const duration = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : NaN
  return Number.isInteger(duration) && duration >= VIDEO_V2_MIN_DURATION && duration <= VIDEO_V2_MAX_DURATION
}

function analyzeVideoV2Mentions(prompt: string, counts: VideoV2MediaCounts): VideoV2MentionResult {
  const invalidTokens: string[] = []
  const safeCounts: VideoV2MediaCounts = {
    images: getSafeCount(counts.images),
    videos: getSafeCount(counts.videos),
    audios: getSafeCount(counts.audios),
  }

  const normalizedPrompt = prompt.replace(
    MEDIA_MENTION_PATTERN,
    (token, rawAlias: string, rawNumber: string) => {
      const media = MEDIA_ALIASES[rawAlias.toLowerCase()]
      const mediaNumber = Number(rawNumber)
      const inRange = Number.isSafeInteger(mediaNumber) &&
        mediaNumber >= 1 &&
        mediaNumber <= safeCounts[media.kind] &&
        rawNumber === String(mediaNumber)

      if (!inRange) {
        if (!invalidTokens.includes(token)) invalidTokens.push(token)
        return token
      }

      return `@${media.canonical}${mediaNumber}`
    },
  )

  return {
    prompt: normalizedPrompt,
    invalidTokens,
    valid: invalidTokens.length === 0,
  }
}

export function normalizeVideoV2Mentions(prompt: string, counts: VideoV2MediaCounts) {
  return analyzeVideoV2Mentions(prompt, counts)
}

export function validateVideoV2Mentions(prompt: string, counts: VideoV2MediaCounts) {
  const result = analyzeVideoV2Mentions(prompt, counts)
  return {
    valid: result.valid,
    invalidTokens: result.invalidTokens,
  }
}
