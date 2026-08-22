import { isVideoV2Model } from './v2Media.ts'
import {
  isMiniMaxH3VideoModel,
  isValidMiniMaxH3Multiple,
  isValidMiniMaxH3VideoSeconds,
  isValidMiniMaxH3VideoSize,
  MINIMAX_H3_DEFAULT_SECONDS,
  MINIMAX_H3_MAX_AUDIOS,
  MINIMAX_H3_MAX_IMAGES,
  MINIMAX_H3_MAX_VIDEO_AUDIOS,
  MINIMAX_H3_MAX_VIDEOS,
  type MiniMaxH3VideoSize,
} from './minimaxH3.ts'
import {
  isValidVideoV3DurationForProtocol,
  isValidVideoV3GridStrengthForProtocol,
  isValidVideoV3RatioForProtocol,
  isValidVideoV3ResolutionForProtocol,
  isVideoV3Model,
  VIDEO_V3_MEDIA_LIMITS,
  VIDEO_V3_DEFAULT_RESOLUTION,
  VIDEO_V3_QY_DEFAULT_RESOLUTION,
  type VideoV3Protocol,
  type VideoV3Resolution,
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
  /** `duration` takes precedence when both duration aliases are supplied. */
  duration?: number | string
  /** Preferred duration field in the public MiniMax-H3 contract. */
  seconds?: number | string
  size?: MiniMaxH3VideoSize | string
  mode?: 'first_last_frame'
  audio?: boolean
  promptEnhance?: boolean
  prompt_enhance?: boolean
  resolution?: string
  clarity?: string
  aspectRatio?: string
  aspect_ratio?: string
  megapixels?: number | string
  metadata?: { multiple?: number | string }
  metadataMultiple?: number | string
  multiple?: number | string
  images?: readonly string[]
  referenceImages?: readonly string[]
  reference_images?: readonly string[]
  inputReference?: string | readonly string[]
  input_reference?: string | readonly string[]
  image?: string | readonly string[]
  referenceVideos?: readonly string[]
  reference_videos?: readonly string[]
  referenceVideo?: string | readonly string[]
  reference_video?: string | readonly string[]
  referenceVideoAudios?: readonly string[]
  reference_video_audios?: readonly string[]
  referenceVideoAudio?: string | readonly string[]
  reference_video_audio?: string | readonly string[]
  /** Independent reference audio (music, voice-over, etc.). */
  referenceAudios?: readonly string[]
  reference_audios?: readonly string[]
  referenceAudio?: string | readonly string[]
  reference_audio?: string | readonly string[]
  /** Alias used by the existing form for independent reference audio. */
  audios?: readonly string[]
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
  /** Original SD2.5 wire contract, or the QY top-level media contract. */
  protocol?: VideoV3Protocol
  resolution?: VideoV3Resolution
  size?: string
  startFrameUrl?: string
  endFrameUrl?: string
  seed?: number | ''
  bypassFaceCheck?: boolean
  gridStrength?: number | ''
}

type VideoV3PayloadBase = {
  model: string
  duration: number
  ratio: VideoV3Ratio
  resolution: VideoV3Resolution
  generate_audio: boolean
  size?: string
  start_frame_url?: string
  end_frame_url?: string
  images?: string[]
  videos?: string[]
  audios?: string[]
  seed?: number
  bypass_face_check?: boolean
  grid_strength?: number
}

export type VideoV3ContentItem =
  | { type: 'text', text: string }
  | { type: 'image_url', image_url: { url: string } }
  | { type: 'video_url', video_url: { url: string } }
  | { type: 'audio_url', audio_url: { url: string } }

export type VideoV3SubmitPayload = VideoV3PayloadBase & (
  | { prompt: string }
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

/** Normalize MiniMax reference URLs and remove duplicate URLs/file names. */
function normalizeMiniMaxUrls(
  urls: readonly string[] | undefined,
  label: string,
  limit: number,
) {
  if (urls === undefined) return [] as string[]
  if (!Array.isArray(urls)) throw new Error(`MiniMax-H3 的 ${label} 必须是 URL 数组`)

  const unique: string[] = []
  const seenUrls = new Set<string>()
  const seenFileNames = new Set<string>()
  for (const rawUrl of urls) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      throw new Error(`MiniMax-H3 的 ${label} 必须是非空 URL`)
    }
    const url = rawUrl.trim()
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error(`MiniMax-H3 的 ${label} 必须是公网 http/https URL`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`MiniMax-H3 的 ${label} 必须是公网 http/https URL`)
    }

    // The API cannot fetch local paths or loopback/private hosts.
    const hostname = parsed.hostname.toLowerCase()
    const isPrivateIpv4 = /^(10|127|169\.254|192\.168)\./.test(hostname)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
      || hostname === '0.0.0.0'
    if (hostname === 'localhost' || hostname === '[::1]' || isPrivateIpv4) {
      throw new Error(`MiniMax-H3 的 ${label} 必须是公网 http/https URL`)
    }

    const canonicalUrl = parsed.toString()
    const pathName = decodeURIComponent(parsed.pathname).split('/').filter(Boolean).pop()?.trim().toLowerCase() || ''
    const fileNameKey = pathName && /\.[a-z0-9]{1,12}$/i.test(pathName) ? pathName : ''
    if (seenUrls.has(canonicalUrl) || (fileNameKey && seenFileNames.has(fileNameKey))) continue
    seenUrls.add(canonicalUrl)
    if (fileNameKey) seenFileNames.add(fileNameKey)
    unique.push(url)
  }

  if (unique.length > limit) throw new Error(`MiniMax-H3 最多支持 ${limit} 个${label}`)
  return unique
}

type MiniMaxUrlValue = string | readonly string[] | undefined

function miniMaxUrlValues(value: MiniMaxUrlValue, label: string) {
  if (value === undefined) return [] as string[]
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) throw new Error(`MiniMax-H3 的 ${label} 必须是 URL 或 URL 数组`)
  return [...value]
}

function normalizeOptionalMiniMaxString(value: unknown, wireKey: string) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`MiniMax-H3 的 ${wireKey} 必须是字符串`)
  const normalized = value.trim()
  return normalized || undefined
}

/** Build the documented SD2.5 JSON protocol for video-v3. */
export function buildVideoV3SubmitPayload(input: VideoV3SubmitPayloadInput) {
  if (!isVideoV3Model(input.model)) throw new Error('SD2.5 视频表单只能用于 video-v3 系列模型')
  if (!input.prompt.trim()) throw new Error('Prompt 不能为空')
  const protocol = input.protocol ?? 'legacy'
  if (protocol !== 'legacy' && protocol !== 'qy') throw new Error('video-v3 的协议类型无效')
  if (!isValidVideoV3DurationForProtocol(input.duration, protocol)) {
    throw new Error(protocol === 'qy'
      ? 'QY 协议的 duration 必须是 4 到 29 之间的整数'
      : '原协议的 duration 必须是 4 到 30 之间的整数')
  }
  if (!isValidVideoV3RatioForProtocol(input.ratio, protocol)) {
    throw new Error(protocol === 'qy' ? 'QY 协议不支持该画幅' : 'video-v3 不支持该画幅')
  }
  if (typeof input.generateAudio !== 'boolean') throw new Error('video-v3 的 generate_audio 必须是布尔值')

  const resolution = input.resolution ?? (protocol === 'qy' ? VIDEO_V3_QY_DEFAULT_RESOLUTION : VIDEO_V3_DEFAULT_RESOLUTION)
  if (!isValidVideoV3ResolutionForProtocol(resolution, protocol)) {
    throw new Error(protocol === 'qy'
      ? 'QY 协议的 resolution 仅支持 480p 或 720p'
      : '原协议的 resolution 固定为 720p')
  }

  const normalizeOptionalUrl = (value: unknown, label: string) => {
    if (value === undefined) return undefined
    if (typeof value !== 'string') throw new Error(`video-v3 的 ${label} 必须是字符串`)
    const normalized = value.trim()
    if (!normalized) return undefined
    try {
      const parsed = new URL(normalized)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
    } catch {
      throw new Error(`video-v3 的 ${label} 必须是公网 http/https URL`)
    }
    return normalized
  }
  const size = input.size === undefined ? undefined : String(input.size).trim()
  if (protocol === 'legacy' && (size || input.startFrameUrl?.trim() || input.endFrameUrl?.trim())) {
    throw new Error('原 video-v3 协议不支持 size、start_frame_url 或 end_frame_url，请切换到 QY 协议')
  }
  if (size !== undefined && size && !/^\d+x\d+$/i.test(size)) throw new Error('QY 协议的 size 必须是宽x高格式，例如 1280x720')
  const startFrameUrl = normalizeOptionalUrl(input.startFrameUrl, 'start_frame_url')
  const endFrameUrl = normalizeOptionalUrl(input.endFrameUrl, 'end_frame_url')

  const images = normalizeUrls(input.images, '图片参考', VIDEO_V3_MEDIA_LIMITS.images)
  const videos = normalizeUrls(input.videos, '视频参考', VIDEO_V3_MEDIA_LIMITS.videos)
  const audios = normalizeUrls(input.audios, '音频参考', VIDEO_V3_MEDIA_LIMITS.audios)

  if (input.seed !== undefined && input.seed !== '') {
    const seedIsValid = protocol === 'qy'
      ? Number.isSafeInteger(input.seed) && input.seed >= 0 && input.seed <= 4294967295
      : Number.isSafeInteger(input.seed)
    if (!seedIsValid) throw new Error(protocol === 'qy' ? 'QY 协议的 seed 必须是 0 到 4294967295 之间的整数' : 'video-v3 的 seed 必须是整数')
  }
  if (input.bypassFaceCheck !== undefined && typeof input.bypassFaceCheck !== 'boolean') {
    throw new Error('video-v3 的 bypass_face_check 必须是布尔值')
  }
  if (input.gridStrength !== undefined && input.gridStrength !== '' && !isValidVideoV3GridStrengthForProtocol(input.gridStrength, protocol)) {
    throw new Error(protocol === 'qy' ? 'QY 协议的 grid_strength 必须在 0.01 到 0.5 之间' : 'video-v3 的 grid_strength 必须在 0 到 1 之间')
  }

  const payloadBase: VideoV3PayloadBase = {
    model: input.model.trim(),
    duration: input.duration,
    ratio: input.ratio,
    resolution,
    generate_audio: input.generateAudio,
  }
  if (protocol === 'qy' && size) payloadBase.size = size
  if (protocol === 'qy' && startFrameUrl) payloadBase.start_frame_url = startFrameUrl
  if (protocol === 'qy' && endFrameUrl) payloadBase.end_frame_url = endFrameUrl
  if ((startFrameUrl || endFrameUrl) && images.length > 0) {
    throw new Error('video-v3 的 start_frame_url/end_frame_url 不能与图片参考同时使用')
  }
  if (input.seed !== undefined && input.seed !== '') payloadBase.seed = input.seed
  if (input.bypassFaceCheck !== undefined) payloadBase.bypass_face_check = input.bypassFaceCheck
  if (input.gridStrength !== undefined && input.gridStrength !== '') payloadBase.grid_strength = input.gridStrength

  if (protocol === 'legacy' && (videos.length > 0 || audios.length > 0)) {
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
  if (videos.length > 0) payload.videos = videos
  if (audios.length > 0) payload.audios = audios
  return payload
}

/** Build the documented JSON protocol for MiniMax-H3. */
export function buildMiniMaxH3SubmitPayload(input: MiniMaxH3SubmitPayloadInput) {
  if (!isMiniMaxH3VideoModel(input.model)) {
    throw new Error('MiniMax-H3 视频表单只能用于 MiniMax-H3')
  }
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) throw new Error('Prompt 不能为空')

  // Keep the wire alias supplied by the caller. If both are present, the
  // documented precedence is duration over seconds.
  const hasDuration = input.duration !== undefined && input.duration !== ''
  const hasSeconds = input.seconds !== undefined && input.seconds !== ''
  const selectedDuration = hasDuration
    ? input.duration
    : hasSeconds
      ? input.seconds
      : MINIMAX_H3_DEFAULT_SECONDS
  if (!isValidMiniMaxH3VideoSeconds(selectedDuration)) {
    throw new Error('MiniMax-H3 的 duration/seconds 必须是 4 到 15 之间的整数')
  }
  const normalizedDuration = Number(selectedDuration)

  let size: MiniMaxH3VideoSize | undefined
  if (input.size !== undefined && input.size !== '') {
    if (!isValidMiniMaxH3VideoSize(input.size)) {
      throw new Error('MiniMax-H3 不支持该视频尺寸')
    }
    size = input.size.trim() as MiniMaxH3VideoSize
  }

  if (input.audio !== undefined && typeof input.audio !== 'boolean') {
    throw new Error('MiniMax-H3 的 audio 必须是布尔值')
  }
  const promptEnhance = input.promptEnhance ?? input.prompt_enhance
  if (promptEnhance !== undefined && typeof promptEnhance !== 'boolean') {
    throw new Error('MiniMax-H3 的 prompt_enhance 必须是布尔值')
  }

  const resolution = normalizeOptionalMiniMaxString(input.resolution, 'resolution')
  const clarity = normalizeOptionalMiniMaxString(input.clarity, 'clarity')
  const aspectRatio = normalizeOptionalMiniMaxString(input.aspectRatio ?? input.aspect_ratio, 'aspect_ratio')
  const megapixels = input.megapixels
  const hasMegapixels = megapixels !== undefined && !(typeof megapixels === 'string' && !megapixels.trim())
  let normalizedMegapixels: number | undefined
  if (hasMegapixels) {
    normalizedMegapixels = typeof megapixels === 'number' ? megapixels : Number(megapixels)
    if (!Number.isFinite(normalizedMegapixels) || normalizedMegapixels <= 0) {
      throw new Error('MiniMax-H3 的 megapixels 必须是正数')
    }
  }

  const hasOptionalValue = (value: unknown) => value !== undefined && !(typeof value === 'string' && !value.trim())
  const metadataMultiple = hasOptionalValue(input.metadataMultiple)
    ? input.metadataMultiple
    : hasOptionalValue(input.multiple)
      ? input.multiple
      : hasOptionalValue(input.metadata?.multiple)
        ? input.metadata?.multiple
        : undefined
  if (metadataMultiple !== undefined && metadataMultiple !== '' && !isValidMiniMaxH3Multiple(metadataMultiple)) {
    throw new Error('MiniMax-H3 的 metadata.multiple 必须是 8-128 且为 4 的倍数')
  }
  const normalizedMultiple = metadataMultiple === undefined || metadataMultiple === ''
    ? undefined
    : Number(metadataMultiple)

  const images = normalizeMiniMaxUrls(
    [
      ...miniMaxUrlValues(input.images, '参考图片'),
      ...miniMaxUrlValues(input.referenceImages, '参考图片'),
      ...miniMaxUrlValues(input.reference_images, '参考图片'),
      ...miniMaxUrlValues(input.inputReference, '参考图片'),
      ...miniMaxUrlValues(input.input_reference, '参考图片'),
      ...miniMaxUrlValues(input.image, '参考图片'),
    ],
    '参考图片',
    MINIMAX_H3_MAX_IMAGES,
  )
  const referenceVideos = normalizeMiniMaxUrls(
    [
      ...miniMaxUrlValues(input.referenceVideos, '参考视频'),
      ...miniMaxUrlValues(input.reference_videos, '参考视频'),
      ...miniMaxUrlValues(input.referenceVideo, '参考视频'),
      ...miniMaxUrlValues(input.reference_video, '参考视频'),
    ],
    '参考视频',
    MINIMAX_H3_MAX_VIDEOS,
  )
  const referenceVideoAudios = normalizeMiniMaxUrls(
    [
      ...miniMaxUrlValues(input.referenceVideoAudios, '视频配套音频'),
      ...miniMaxUrlValues(input.reference_video_audios, '视频配套音频'),
      ...miniMaxUrlValues(input.referenceVideoAudio, '视频配套音频'),
      ...miniMaxUrlValues(input.reference_video_audio, '视频配套音频'),
    ],
    '视频配套音频',
    MINIMAX_H3_MAX_VIDEO_AUDIOS,
  )
  const referenceAudios = normalizeMiniMaxUrls(
    [
      ...miniMaxUrlValues(input.audios, '独立参考音频'),
      ...miniMaxUrlValues(input.referenceAudios, '独立参考音频'),
      ...miniMaxUrlValues(input.reference_audios, '独立参考音频'),
      ...miniMaxUrlValues(input.referenceAudio, '独立参考音频'),
      ...miniMaxUrlValues(input.reference_audio, '独立参考音频'),
    ],
    '独立参考音频',
    MINIMAX_H3_MAX_AUDIOS,
  )

  if (input.mode !== undefined && input.mode !== 'first_last_frame') {
    throw new Error('MiniMax-H3 的 mode 仅支持 first_last_frame')
  }
  if (input.mode === 'first_last_frame') {
    if (images.length !== 2) throw new Error('MiniMax-H3 的首尾帧模式必须恰好提供两张参考图片')
    if (referenceVideos.length || referenceVideoAudios.length || referenceAudios.length) {
      throw new Error('MiniMax-H3 的首尾帧模式不能同时使用参考视频或参考音频')
    }
  }

  const payload: Record<string, unknown> = {
    model: input.model.trim(),
    prompt: input.prompt,
  }
  if (hasDuration || !hasSeconds) payload.duration = normalizedDuration
  else payload.seconds = normalizedDuration
  if (size) payload.size = size
  if (input.mode) payload.mode = input.mode
  if (input.audio !== undefined) payload.audio = input.audio
  if (promptEnhance !== undefined) payload.prompt_enhance = promptEnhance
  if (resolution !== undefined) payload.resolution = resolution
  if (clarity !== undefined) payload.clarity = clarity
  if (aspectRatio !== undefined) payload.aspect_ratio = aspectRatio
  if (normalizedMegapixels !== undefined) payload.megapixels = normalizedMegapixels
  if (images.length > 0) payload.images = images
  if (referenceVideos.length > 0) payload.reference_videos = referenceVideos
  if (referenceVideoAudios.length > 0) payload.reference_video_audios = referenceVideoAudios
  if (referenceAudios.length > 0) payload.reference_audios = referenceAudios
  if (normalizedMultiple !== undefined) payload.metadata = { multiple: normalizedMultiple }
  return payload
}

export function buildVideoV2SubmitPayload(input: VideoV2SubmitPayloadInput) {
  if (!isVideoV2Model(input.model)) {
    throw new Error('video-v2 视频表单只能用于 video-v2 或 video-v2-fast')
  }
  const mediaPayload = {
    model: input.model,
    prompt: input.prompt,
    images: [...input.images],
    videos: [...input.videos],
    audios: [...input.audios],
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
