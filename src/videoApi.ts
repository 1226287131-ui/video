import { isVideoV2Model } from './v2Media.ts'
import { isVideoV3Model } from './videoV3.ts'

export { isVideoV2Model, VIDEO_V2_MODELS } from './v2Media.ts'
export { isMiniMaxH3VideoModel, MINIMAX_H3_VIDEO_MODEL } from './minimaxH3.ts'
export {
  getVideoV3MediaLimits,
  isValidVideoV3Duration,
  isValidVideoV3GridStrength,
  isValidVideoV3Ratio,
  isVideoV3Model,
  VIDEO_V3_MAX_DURATION,
  VIDEO_V3_MEDIA_LIMITS,
  VIDEO_V3_MIN_DURATION,
  VIDEO_V3_MODELS,
  VIDEO_V3_RATIOS,
  VIDEO_V3_RESOLUTION,
} from './videoV3.ts'

export const GROK_IMAGINE_VIDEO_MODEL = 'grok-imagine-1.5-video'

export const GROK_VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '2:3', '3:2'] as const
export const GROK_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const
export const GROK_MULTI_REFERENCE_VIDEO_RESOLUTIONS = ['480p', '720p'] as const

export type GrokVideoDuration = number
export type GrokVideoRatio = typeof GROK_VIDEO_ASPECT_RATIOS[number]
export type GrokVideoResolution = typeof GROK_VIDEO_RESOLUTIONS[number]

export function isGrokImagineVideoModel(model: unknown) {
  return String(model || '').trim().toLowerCase() === GROK_IMAGINE_VIDEO_MODEL
}

function usesVideoResourceApi(model: unknown) {
  return isGrokImagineVideoModel(model) || isVideoV2Model(model) || isVideoV3Model(model)
}

export function getVideoSubmitPath(model: string) {
  return usesVideoResourceApi(model) ? '/v1/videos' : '/v1/video/generations'
}

export function getVideoTaskPath(model: string, taskId: string) {
  const encodedTaskId = encodeURIComponent(taskId)
  return usesVideoResourceApi(model)
    ? `/v1/videos/${encodedTaskId}`
    : `/v1/video/generations/${encodedTaskId}`
}

export function getVideoContentPath(model: string, taskId: string) {
  if (!usesVideoResourceApi(model)) return ''
  return `/v1/videos/${encodeURIComponent(taskId)}/content`
}

export function isValidGrokVideoDuration(value: unknown): value is GrokVideoDuration {
  const seconds = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : NaN
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= 15
}

export function isValidGrokVideoAspectRatio(value: unknown): value is GrokVideoRatio {
  return typeof value === 'string' && (GROK_VIDEO_ASPECT_RATIOS as readonly string[]).includes(value)
}

export function isValidGrokVideoResolution(value: unknown): value is GrokVideoResolution {
  return typeof value === 'string' && (GROK_VIDEO_RESOLUTIONS as readonly string[]).includes(value)
}

export function isValidGrokVideoResolutionForReferenceCount(
  value: unknown,
  referenceCount: number,
): value is GrokVideoResolution {
  return isValidGrokVideoResolution(value) && (
    referenceCount < 2 || (GROK_MULTI_REFERENCE_VIDEO_RESOLUTIONS as readonly string[]).includes(value)
  )
}

export type GrokVideoInputReference = {
  blob: Blob
  fileName?: string
}

type GrokVideoFormDataInput = {
  model: string
  prompt: string
  seconds: number
  ratio: string
  resolution: string
  inputReferences?: readonly GrokVideoInputReference[]
}

export function createGrokVideoFormData(input: GrokVideoFormDataInput) {
  if (!isGrokImagineVideoModel(input.model)) {
    throw new Error('Grok 视频表单只能用于 grok-imagine-1.5-video')
  }
  if (!input.prompt.trim()) throw new Error('Prompt 不能为空')
  if (!isValidGrokVideoDuration(input.seconds)) {
    throw new Error('grok-imagine-1.5-video 的 seconds 必须是 1 到 15 之间的整数')
  }
  if (!isValidGrokVideoAspectRatio(input.ratio)) {
    throw new Error('grok-imagine-1.5-video 不支持该画幅')
  }
  const inputReferences = input.inputReferences ?? []
  if (!isValidGrokVideoResolution(input.resolution)) {
    throw new Error('grok-imagine-1.5-video 仅支持 480p、720p 或 1080p')
  }
  if (!isValidGrokVideoResolutionForReferenceCount(input.resolution, inputReferences.length)) {
    throw new Error('grok-imagine-1.5-video 使用多参考图时仅支持 480p 或 720p')
  }
  for (const reference of inputReferences) {
    if (!(reference?.blob instanceof Blob) || reference.blob.size === 0) {
      throw new Error('grok-imagine-1.5-video 必须提供有效参考图文件')
    }
  }

  const formData = new FormData()
  formData.append('model', input.model.trim())
  formData.append('prompt', input.prompt)
  formData.append('aspect_ratio', input.ratio)
  formData.append('seconds', String(input.seconds))
  formData.append('resolution', input.resolution)
  inputReferences.forEach((reference, index) => {
    formData.append('input_reference', reference.blob, reference.fileName || `reference-${index + 1}.png`)
  })
  return formData
}
