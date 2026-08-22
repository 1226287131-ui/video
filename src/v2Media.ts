export const VIDEO_V2_MEDIA_LIMITS = {
  images: 9,
  videos: 3,
  audios: 3,
} as const

export const VIDEO_V2_MODELS = [
  'video-v2',
  'video-v2-fast',
] as const

export type VideoV2MediaCounts = {
  images: number
  videos: number
  audios: number
}

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
  return VIDEO_V2_MODELS.some((candidate) => candidate === normalizedModel)
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
