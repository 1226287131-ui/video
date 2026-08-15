import { isVideoV2FallbackModel } from './v2Media.ts'
import {
  isMiniMaxH3VideoModel,
  isValidMiniMaxH3VideoSeconds,
  isValidMiniMaxH3VideoSize,
  MINIMAX_H3_MAX_IMAGES,
  type MiniMaxH3VideoSize,
} from './minimaxH3.ts'
import {
  isValidVideoV3Duration,
  isValidVideoV3GridStrength,
  isValidVideoV3Ratio,
  isVideoV3Model,
  VIDEO_V3_MEDIA_LIMITS,
  VIDEO_V3_RESOLUTION,
  type VideoV3Ratio,
} from './videoV3.ts'

export type VideoPayloadForm = {
  model: string
  duration: number
  ratio: string
  quality: string
}

export type VideoPayloadMode = 'text' | 'image'
export type VideoPayloadImageMode = 'single' | 'multiple'

export type VideoV2SubmitPayloadInput = {
  model: string
  prompt: string
  images: readonly string[]
  videos: readonly string[]
  audios: readonly string[]
  aspectRatio: string
  duration: number
  resolution: '480p' | '720p' | '1080p'
  generateAudio: boolean
}

export type MiniMaxH3SubmitPayloadInput = {
  model: string
  prompt: string
  seconds: number
  size: MiniMaxH3VideoSize
  audio: boolean
  images: readonly string[]
}

export type VideoV3SubmitPayloadInput = {
  model: string
  prompt: string
  duration: number
  ratio: string
  images: readonly string[]
  videos: readonly string[]
  audios: readonly string[]
  generateAudio: boolean
  seed?: number | ''
  bypassFaceCheck?: boolean
  gridStrength?: number | ''
}

export type VideoV3ContentItem =
  | { type: 'text', text: string }
  | { type: 'image_url', image_url: { url: string } }
  | { type: 'video_url', video_url: { url: string } }
  | { type: 'audio_url', audio_url: { url: string } }

type VideoV3PayloadBase = {
  model: string
  duration: number
  ratio: VideoV3Ratio
  resolution: typeof VIDEO_V3_RESOLUTION
  generate_audio: boolean
  seed?: number
  bypass_face_check?: boolean
  grid_strength?: number
}

export type VideoV3SubmitPayload = VideoV3PayloadBase & (
  | { prompt: string, images?: string[] }
  | { content: VideoV3ContentItem[] }
)

function normalizeUrls(urls: readonly string[], label: string, limit: number) {
  const normalized = urls.map((url) => {
    if (typeof url !== 'string' || !url.trim()) throw new Error(`SD2.5 的 ${label} 必须是非空 URL`)
    return url.trim()
  })
  const unique = [...new Set(normalized)]
  if (unique.length > limit) throw new Error(`SD2.5 最多支持 ${limit} 个${label}`)
  return unique
}

/** Build the documented SD2.5 JSON protocol for video-v3. */
export function buildVideoV3SubmitPayload(input: VideoV3SubmitPayloadInput) {
  if (!isVideoV3Model(input.model)) throw new Error('SD2.5 视频表单只能用于 video-v3 系列模型')
  if (!input.prompt.trim()) throw new Error('Prompt 不能为空')
  if (!isValidVideoV3Duration(input.duration)) throw new Error('video-v3 的 duration 必须是 4 到 30 之间的整数')
  if (!isValidVideoV3Ratio(input.ratio)) throw new Error('video-v3 不支持该画幅')
  if (typeof input.generateAudio !== 'boolean') throw new Error('video-v3 的 generate_audio 必须是布尔值')

  const images = normalizeUrls(input.images, '图片参考', VIDEO_V3_MEDIA_LIMITS.images)
  const videos = normalizeUrls(input.videos, '视频参考', VIDEO_V3_MEDIA_LIMITS.videos)
  const audios = normalizeUrls(input.audios, '音频参考', VIDEO_V3_MEDIA_LIMITS.audios)

  if (input.seed !== undefined && input.seed !== '') {
    if (!Number.isSafeInteger(input.seed)) throw new Error('video-v3 的 seed 必须是整数')
  }
  if (input.bypassFaceCheck !== undefined && typeof input.bypassFaceCheck !== 'boolean') {
    throw new Error('video-v3 的 bypass_face_check 必须是布尔值')
  }
  if (input.gridStrength !== undefined && input.gridStrength !== '' && !isValidVideoV3GridStrength(input.gridStrength)) {
    throw new Error('video-v3 的 grid_strength 必须在 0 到 1 之间')
  }

  const payloadBase: VideoV3PayloadBase = {
    model: input.model.trim(),
    duration: input.duration,
    ratio: input.ratio,
    resolution: VIDEO_V3_RESOLUTION,
    generate_audio: input.generateAudio,
  }
  if (input.seed !== undefined && input.seed !== '') payloadBase.seed = input.seed
  if (input.bypassFaceCheck !== undefined) payloadBase.bypass_face_check = input.bypassFaceCheck
  if (input.gridStrength !== undefined && input.gridStrength !== '') payloadBase.grid_strength = input.gridStrength

  // The SD2.5 contract documents audio and video references through content[].
  // Keep all references in that array when either media type is present.
  if (videos.length > 0 || audios.length > 0) {
    const content: VideoV3ContentItem[] = [
      { type: 'text', text: input.prompt },
      ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ...videos.map((url) => ({ type: 'video_url' as const, video_url: { url } })),
      ...audios.map((url) => ({ type: 'audio_url' as const, audio_url: { url } })),
    ]
    return { ...payloadBase, content }
  }

  const payload: VideoV3SubmitPayload = { ...payloadBase, prompt: input.prompt }
  if (images.length > 0) payload.images = images
  return payload
}

/** Build only the fields accepted by MiniMax-H3-933-1440P-GF. */
export function buildMiniMaxH3SubmitPayload(input: MiniMaxH3SubmitPayloadInput) {
  if (!isMiniMaxH3VideoModel(input.model)) {
    throw new Error('MiniMax-H3 视频表单只能用于 MiniMax-H3-933-1440P-GF')
  }
  if (!input.prompt.trim()) throw new Error('Prompt 不能为空')
  if (!isValidMiniMaxH3VideoSeconds(input.seconds)) {
    throw new Error('MiniMax-H3-933-1440P-GF 的 seconds 必须是 5 到 15 之间的整数')
  }
  if (!isValidMiniMaxH3VideoSize(input.size)) {
    throw new Error('MiniMax-H3-933-1440P-GF 不支持该视频尺寸')
  }
  if (!Array.isArray(input.images) || input.images.length > MINIMAX_H3_MAX_IMAGES) {
    throw new Error(`MiniMax-H3-933-1440P-GF 最多支持 ${MINIMAX_H3_MAX_IMAGES} 张参考图`)
  }
  if (input.images.some((url) => typeof url !== 'string' || !url.trim())) {
    throw new Error('MiniMax-H3-933-1440P-GF 的 images 必须是非空 URL')
  }
  if (typeof input.audio !== 'boolean') {
    throw new Error('MiniMax-H3-933-1440P-GF 的 audio 必须是布尔值')
  }

  const payload: {
    model: string
    prompt: string
    seconds: number
    size: MiniMaxH3VideoSize
    audio: boolean
    images?: string[]
  } = {
    model: input.model.trim(),
    prompt: input.prompt,
    seconds: input.seconds,
    size: input.size,
    audio: input.audio,
  }
  if (input.images.length > 0) payload.images = [...input.images]
  return payload
}

export function buildVideoV2SubmitPayload(input: VideoV2SubmitPayloadInput) {
  const mediaPayload = {
    model: input.model,
    prompt: input.prompt,
    images: [...input.images],
    videos: [...input.videos],
    audios: [...input.audios],
  }

  if (isVideoV2FallbackModel(input.model)) {
    if (input.aspectRatio !== '16:9' && input.aspectRatio !== '9:16') {
      throw new Error('video-v2-满血兜底版仅支持 16:9 或 9:16 画幅')
    }
    return {
      ...mediaPayload,
      aspect_ratio: input.aspectRatio,
      duration: 15,
    }
  }

  return {
    ...mediaPayload,
    aspect_ratio: input.aspectRatio,
    duration: input.duration,
    resolution: input.resolution,
    generate_audio: input.generateAudio,
  }
}

export function buildVideoSubmitPayload(
  form: VideoPayloadForm,
  prompt: string,
  mode: VideoPayloadMode,
  imageMode: VideoPayloadImageMode,
  referenceUrls: readonly string[],
) {
  const payload = {
    model: form.model,
    prompt,
    duration: form.duration,
    aspect_ratio: form.ratio,
  }

  if (mode !== 'image') return payload
  if (imageMode === 'multiple' || imageMode === 'single') return { ...payload, images: [...referenceUrls] }
  return payload
}
