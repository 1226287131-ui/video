export const VIDEO_V3_MODELS = [
  'video-v3',
  'video-v3-480p',
  'video-v3（限时低价渠道）',
  'wan-3.0',
  'seedance-2.5',
  'seedance2.5',
  'sd-2.5',
  'sd2.5',
] as const

export const VIDEO_V3_FIXED_480P_MODELS = [
  'video-v3-480p',
] as const

export const VIDEO_V3_LOW_PRICE_MODELS = [
  'video-v3（限时低价渠道）',
] as const

// Keep the earlier duplicated-label spelling usable for already-issued history records.
const VIDEO_V3_LOW_PRICE_LEGACY_MODEL = 'video-v3（限时低价低价渠道）' as const
const VIDEO_V3_ADAPTER_MODELS = [...VIDEO_V3_MODELS, VIDEO_V3_LOW_PRICE_LEGACY_MODEL] as const

export const VIDEO_V3_MEDIA_LIMITS = {
  images: 30,
  videos: 10,
  audios: 10,
} as const

export const VIDEO_V3_MIN_DURATION = 4
export const VIDEO_V3_MAX_DURATION = 30
export const VIDEO_V3_QY_MAX_DURATION = 29
export const VIDEO_V3_RESOLUTIONS = ['480p', '720p'] as const
export const VIDEO_V3_DEFAULT_RESOLUTION = '720p' as const
export const VIDEO_V3_QY_DEFAULT_RESOLUTION = '480p' as const
// Compatibility export for the original SD2.5/video-v3 form.
export const VIDEO_V3_RESOLUTION = VIDEO_V3_DEFAULT_RESOLUTION

export const VIDEO_V3_RATIOS = [
  'auto',
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
] as const
export const VIDEO_V3_QY_RATIOS = ['16:9', '1:1', '9:16'] as const

export type VideoV3Ratio = typeof VIDEO_V3_RATIOS[number]
export type VideoV3Resolution = typeof VIDEO_V3_RESOLUTIONS[number]
export type VideoV3Protocol = 'legacy' | 'qy'
export type VideoV3MediaCounts = typeof VIDEO_V3_MEDIA_LIMITS

export function isVideoV3Model(model: unknown) {
  const normalizedModel = String(model || '').trim().toLowerCase()
  return (VIDEO_V3_ADAPTER_MODELS as readonly string[]).some((candidate) => candidate === normalizedModel)
}

export function isVideoV3Fixed480pModel(model: unknown) {
  const normalizedModel = String(model || '').trim().toLowerCase()
  return (VIDEO_V3_FIXED_480P_MODELS as readonly string[]).some((candidate) => candidate === normalizedModel)
}

export function getVideoV3DefaultResolution(model: unknown, protocol: VideoV3Protocol = 'legacy'): VideoV3Resolution {
  if (isVideoV3Fixed480pModel(model)) return '480p'
  return protocol === 'qy' ? VIDEO_V3_QY_DEFAULT_RESOLUTION : VIDEO_V3_DEFAULT_RESOLUTION
}

/** The wan-3.0 gateway validates prompt as a top-level field for multimedia requests. */
export function usesVideoV3TopLevelMedia(model: unknown) {
  return String(model || '').trim().toLowerCase() === 'wan-3.0'
}

export function isValidVideoV3Duration(value: unknown): value is number {
  const duration = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : NaN
  return Number.isInteger(duration) && duration >= VIDEO_V3_MIN_DURATION && duration <= VIDEO_V3_MAX_DURATION
}

export function isValidVideoV3DurationForProtocol(value: unknown, protocol: VideoV3Protocol) {
  const duration = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : NaN
  const maxDuration = protocol === 'qy' ? VIDEO_V3_QY_MAX_DURATION : VIDEO_V3_MAX_DURATION
  return Number.isInteger(duration) && duration >= VIDEO_V3_MIN_DURATION && duration <= maxDuration
}

export function isValidVideoV3Ratio(value: unknown): value is VideoV3Ratio {
  return typeof value === 'string' && (VIDEO_V3_RATIOS as readonly string[]).includes(value)
}

export function isValidVideoV3RatioForProtocol(value: unknown, protocol: VideoV3Protocol): value is VideoV3Ratio {
  return protocol === 'qy'
    ? typeof value === 'string' && (VIDEO_V3_QY_RATIOS as readonly string[]).includes(value)
    : isValidVideoV3Ratio(value)
}

export function isValidVideoV3Resolution(value: unknown): value is VideoV3Resolution {
  return typeof value === 'string' && (VIDEO_V3_RESOLUTIONS as readonly string[]).includes(value)
}

export function isValidVideoV3ResolutionForProtocol(value: unknown, protocol: VideoV3Protocol) {
  return protocol === 'qy'
    ? isValidVideoV3Resolution(value)
    : value === VIDEO_V3_DEFAULT_RESOLUTION
}

export function isValidVideoV3ResolutionForModel(value: unknown, model: unknown, protocol: VideoV3Protocol) {
  if (isVideoV3Fixed480pModel(model)) return value === '480p'
  return isValidVideoV3ResolutionForProtocol(value, protocol)
}

export function isValidVideoV3GridStrength(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

export function isValidVideoV3GridStrengthForProtocol(value: unknown, protocol: VideoV3Protocol) {
  return protocol === 'qy'
    ? typeof value === 'number' && Number.isFinite(value) && value >= 0.01 && value <= 0.5
    : isValidVideoV3GridStrength(value)
}

export function getVideoV3MediaLimits() {
  return VIDEO_V3_MEDIA_LIMITS
}
