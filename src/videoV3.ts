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
export const VIDEO_V3_MAX_DURATION = 29
export const VIDEO_V3_RESOLUTIONS = ['480p', '720p'] as const
export const VIDEO_V3_DEFAULT_RESOLUTION = '480p' as const
// Kept as a compatibility export for existing callers; V3 now allows both resolutions.
export const VIDEO_V3_RESOLUTION = VIDEO_V3_DEFAULT_RESOLUTION

export const VIDEO_V3_RATIOS = [
  '16:9',
  '1:1',
  '9:16',
] as const

export type VideoV3Ratio = typeof VIDEO_V3_RATIOS[number]
export type VideoV3Resolution = typeof VIDEO_V3_RESOLUTIONS[number]
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

export function isValidVideoV3Resolution(value: unknown): value is VideoV3Resolution {
  return typeof value === 'string' && (VIDEO_V3_RESOLUTIONS as readonly string[]).includes(value)
}

export function isValidVideoV3GridStrength(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.01 && value <= 0.5
}

export function getVideoV3MediaLimits() {
  return VIDEO_V3_MEDIA_LIMITS
}
