export const VIDEO_V3_MODELS = [
  'video-v3',
  'seedance-2.5',
  'seedance2.5',
  'sd-2.5',
  'sd2.5',
] as const

export const VIDEO_V3_MEDIA_LIMITS = {
  images: 30,
  videos: 10,
  audios: 10,
} as const

export const VIDEO_V3_MIN_DURATION = 4
export const VIDEO_V3_MAX_DURATION = 30
export const VIDEO_V3_RESOLUTION = '720p' as const

export const VIDEO_V3_RATIOS = [
  'auto',
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
] as const

export type VideoV3Ratio = typeof VIDEO_V3_RATIOS[number]
export type VideoV3MediaCounts = typeof VIDEO_V3_MEDIA_LIMITS

export function isVideoV3Model(model: unknown) {
  const normalizedModel = String(model || '').trim().toLowerCase()
  return (VIDEO_V3_MODELS as readonly string[]).some((candidate) => candidate === normalizedModel)
}

export function isValidVideoV3Duration(value: unknown): value is number {
  const duration = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : NaN
  return Number.isInteger(duration) && duration >= VIDEO_V3_MIN_DURATION && duration <= VIDEO_V3_MAX_DURATION
}

export function isValidVideoV3Ratio(value: unknown): value is VideoV3Ratio {
  return typeof value === 'string' && (VIDEO_V3_RATIOS as readonly string[]).includes(value)
}

export function isValidVideoV3GridStrength(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

export function getVideoV3MediaLimits() {
  return VIDEO_V3_MEDIA_LIMITS
}
