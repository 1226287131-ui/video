import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  Film,
  LoaderCircle,
  Play,
  Sparkles,
  Clock,
  Layout,
  Settings2,
  Terminal,
  KeyRound,
  Cpu,
  Image as ImageIcon,
  Link2,
  Download,
  X,
  Plus,
  Minus,
  History as HistoryIcon,
  Info,
  Search,
  Trash2,
  UploadCloud,
  AtSign,
  FileText,
  Images,
  FileMusic,
  FileVideoCamera,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import './App.css'
import {
  compileReferenceMentions,
  findActiveReferenceMention,
  getReferenceMentionNumbers,
  hasReferenceMentions,
  reindexReferenceMentionsAfterRemoval,
  type ActiveReferenceMention,
} from './referenceMentions'
import {
  createBatchPlans,
  isActiveTaskStatus,
  MAX_ACTIVE_TASKS,
  MAX_GENERATION_COUNT,
  MAX_POST_CONCURRENCY,
  mergeTaskHistory,
  MIN_GENERATION_COUNT,
  parseGenerationCount,
  runWithConcurrency,
} from './taskWorkflow'
import { buildMiniMaxH3SubmitPayload, buildVideoSubmitPayload, buildVideoV2SubmitPayload, buildVideoV3SubmitPayload } from './videoPayload'
import {
  createGrokVideoFormData,
  GROK_MULTI_REFERENCE_VIDEO_RESOLUTIONS,
  getVideoContentPath,
  getVideoSubmitPath,
  getVideoTaskPath,
  isMiniMaxH3VideoModel,
  isGrokImagineVideoModel,
  isVideoV3Model,
  isValidGrokVideoAspectRatio,
  isValidGrokVideoDuration,
  isValidGrokVideoResolutionForReferenceCount,
  type GrokVideoInputReference,
} from './videoApi'
import {
  MINIMAX_H3_MAX_IMAGES,
  MINIMAX_H3_MAX_SECONDS,
  MINIMAX_H3_MIN_SECONDS,
  MINIMAX_H3_VIDEO_SIZES,
  isValidMiniMaxH3VideoSeconds,
  isValidMiniMaxH3VideoSize,
  type MiniMaxH3VideoSize,
} from './minimaxH3'
import {
  isValidVideoV3Duration,
  isValidVideoV3GridStrength,
  isValidVideoV3Ratio,
  VIDEO_V3_MAX_DURATION,
  VIDEO_V3_MEDIA_LIMITS,
  VIDEO_V3_MIN_DURATION,
  VIDEO_V3_RATIOS,
  VIDEO_V3_RESOLUTION,
} from './videoV3'
import {
  getVideoV2MediaLimits,
  isVideoV2FallbackModel,
  isVideoV2Model,
  normalizeVideoV2Mentions,
  VIDEO_V2_MEDIA_LIMITS,
} from './v2Media'
import {
  decodePromptFile,
  detectPromptFileKind,
  extractPromptText,
  MAX_PROMPT_FILE_BYTES,
  mergeImportedPrompt,
} from './promptFileImport'

type VideoDuration = number
type VideoRatio = 'auto' | '21:9' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '2:3' | '3:2'
type VideoQuality = 'sd' | 'hd'
type VideoResolution = '480p' | '720p' | '1080p'
type VideoSize = MiniMaxH3VideoSize
type VideoMode = 'text' | 'image'
type ImageInputMode = 'single' | 'multiple'
type ImageSourceMode = 'url' | 'upload'
type V2MediaKind = 'image' | 'audio' | 'video'
type UploadedAsset = {
  id: string
  url: string
  name?: string
  kind?: V2MediaKind
  mime_type?: string
}

function uniqueUploadedAssetsById(assets: readonly UploadedAsset[]) {
  const ids = new Set<string>()
  return assets.filter((asset) => {
    const id = String(asset?.id || '').trim()
    if (!id || ids.has(id)) return false
    ids.add(id)
    return true
  })
}
type TaskStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'result_pending'
  | 'result_unavailable'
  | 'tracking_paused'
  | 'succeeded'
  | 'failed'

type TaskRecord = {
  id: string
  task_id: string
  object: 'video'
  model: string
  status: TaskStatus | string
  progress: number
  created_at: number
  duration?: VideoDuration
  ratio?: VideoRatio
  quality?: VideoQuality
  resolution?: VideoResolution
  generate_audio?: boolean
  seconds?: number
  size?: VideoSize
  audio?: boolean
  seed?: number
  bypass_face_check?: boolean
  grid_strength?: number
  prompt?: string
  submitted_prompt?: string
  reference_count?: number
  reference_audio_count?: number
  reference_video_count?: number
  reference_upload_ids?: string[]
  reference_audio_upload_ids?: string[]
  reference_video_upload_ids?: string[]
  video_mode?: VideoMode
  image_input_mode?: ImageInputMode
  batch_id?: string
  batch_index?: number
  batch_total?: number
  idempotency_key?: string
  result_url?: string
  preview_url?: string
  message?: string
}

type FormState = {
  prompt: string
  duration: VideoDuration
  ratio: VideoRatio
  quality: VideoQuality
  resolution: VideoResolution
  size: VideoSize
  generateAudio: boolean
  seed: number | ''
  bypassFaceCheck: boolean
  gridStrength: number | ''
  model: string
}

type ModelInfo = {
  id: string
  object: string
  created: number
  owned_by: string
}

type UncertainSubmission = {
  batch_id: string
  batch_index: number
  created_at: number
  idempotency_key: string
}

class SubmissionStateUnknownError extends Error {
  idempotencyKey: string
  batchIndex: number

  constructor(message: string, idempotencyKey: string, batchIndex: number) {
    super(message)
    this.name = 'SubmissionStateUnknownError'
    this.idempotencyKey = idempotencyKey
    this.batchIndex = batchIndex
  }
}

class PollingHttpError extends Error {
  status: number

  constructor(status: number) {
    super(`请求失败: ${status}`)
    this.name = 'PollingHttpError'
    this.status = status
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || 'https://api.kkone.vip'
const VIDEO_ASSET_BASE_URL = 'https://api2.qingyanzhiying.top'
const STORAGE_KEY = 'video-v1-studio:last-task'
const HISTORY_STORAGE_KEY = 'video-v1-studio:history'
const HISTORY_COLLAPSED_STORAGE_KEY = 'video-v1-studio:history-collapsed'
const UNCERTAIN_SUBMISSIONS_STORAGE_KEY = 'video-v1-studio:uncertain-submissions'
const API_KEY_STORAGE = 'video-v1-studio:api-key'
const HISTORY_LIMIT = 20
const MAX_REFERENCE_IMAGES = 9
const MAX_GROK_REFERENCE_IMAGES = 7
const MAX_MINIMAX_IMAGES = MINIMAX_H3_MAX_IMAGES
const MAX_VIDEO_V2_IMAGES = VIDEO_V2_MEDIA_LIMITS.images
const MAX_VIDEO_V2_AUDIOS = VIDEO_V2_MEDIA_LIMITS.audios
const MAX_VIDEO_V2_VIDEOS = VIDEO_V2_MEDIA_LIMITS.videos
const MAX_REFERENCE_FILE_MB = 12
const MAX_REFERENCE_FILE_BYTES = MAX_REFERENCE_FILE_MB * 1024 * 1024
const MAX_GROK_REFERENCE_FILE_MB = 20
const MAX_GROK_REFERENCE_FILE_BYTES = MAX_GROK_REFERENCE_FILE_MB * 1024 * 1024
const MAX_VIDEO_V2_IMAGE_MB = 15
const MAX_VIDEO_V2_IMAGE_BYTES = MAX_VIDEO_V2_IMAGE_MB * 1024 * 1024
const MAX_VIDEO_V3_IMAGE_MB = 20
const MAX_VIDEO_V3_IMAGE_BYTES = MAX_VIDEO_V3_IMAGE_MB * 1024 * 1024
const MAX_REFERENCE_AUDIO_MB = 16
const MAX_REFERENCE_AUDIO_BYTES = MAX_REFERENCE_AUDIO_MB * 1024 * 1024
const MAX_REFERENCE_VIDEO_MB = 48
const MAX_REFERENCE_VIDEO_BYTES = MAX_REFERENCE_VIDEO_MB * 1024 * 1024
const MAX_POLL_ERRORS = 12
const MAX_RESULT_WAIT_POLLS = 30
const VIDEO_PROXY_HOST_SUFFIXES = ['.douyin.com', '.douyinvod.com', '.byteimg.com', '.ibytedtos.com']
const VIDEO_V2_15MB_IMAGE_MODELS = new Set(['video-v2', 'video-v2-fast'])

function getVideoV2ImageSizeLimit(model: unknown) {
  const normalizedModel = String(model || '').trim().toLowerCase()
  if (isVideoV3Model(normalizedModel)) {
    return { maxMegabytes: MAX_VIDEO_V3_IMAGE_MB, maxBytes: MAX_VIDEO_V3_IMAGE_BYTES }
  }
  return VIDEO_V2_15MB_IMAGE_MODELS.has(normalizedModel)
    ? { maxMegabytes: MAX_VIDEO_V2_IMAGE_MB, maxBytes: MAX_VIDEO_V2_IMAGE_BYTES }
    : { maxMegabytes: MAX_REFERENCE_FILE_MB, maxBytes: MAX_REFERENCE_FILE_BYTES }
}

const initialForm: FormState = {
  prompt: '',
  duration: 5,
  ratio: '16:9',
  quality: 'hd',
  resolution: '480p',
  size: '2560x1440',
  generateAudio: true,
  seed: '',
  bypassFaceCheck: false,
  gridStrength: '',
  model: 'video-v1' // 默认回退模型
}

const statusLabel: Record<string, string> = {
  draft: '待提交',
  queued: '排队中',
  processing: '生成中',
  result_pending: '获取链接中',
  result_unavailable: '链接待刷新',
  tracking_paused: '查询暂停',
  succeeded: '已完成',
  failed: '失败',
  SUCCESS: '已完成',
  FAILED: '失败',
}

const durationPresets: VideoDuration[] = [5, 10, 15]
const grokDurationPresets: VideoDuration[] = Array.from({ length: 15 }, (_, index) => index + 1)
const miniMaxDurationPresets: VideoDuration[] = Array.from(
  { length: MINIMAX_H3_MAX_SECONDS - MINIMAX_H3_MIN_SECONDS + 1 },
  (_, index) => index + MINIMAX_H3_MIN_SECONDS,
)
const videoV2FallbackDurationPresets: VideoDuration[] = [15]
const ratioPresets: VideoRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4']
const videoV2RatioPresets: VideoRatio[] = ['21:9', '16:9', '9:16', '4:3', '1:1', '3:4']
const videoV3DurationPresets: VideoDuration[] = Array.from(
  { length: VIDEO_V3_MAX_DURATION - VIDEO_V3_MIN_DURATION + 1 },
  (_, index) => index + VIDEO_V3_MIN_DURATION,
)
const videoV3RatioPresets: VideoRatio[] = [...VIDEO_V3_RATIOS]
const grokRatioPresets: VideoRatio[] = ['16:9', '9:16', '1:1', '4:3', '3:4', '2:3', '3:2']
const videoV2FallbackRatioPresets: VideoRatio[] = ['16:9', '9:16']
const qualityPresets: VideoQuality[] = ['hd', 'sd']
const videoResolutionPresets: VideoResolution[] = ['480p', '720p', '1080p']

const videoV2MediaConfig = {
  image: {
    label: '参考图',
    token: 'Image',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    formats: 'JPG / PNG / WebP',
    maxItems: MAX_VIDEO_V2_IMAGES,
    maxMegabytes: MAX_REFERENCE_FILE_MB,
    maxBytes: MAX_REFERENCE_FILE_BYTES,
  },
  audio: {
    label: '参考音频',
    token: 'Audio',
    accept: '.mp3,.wav,.m4a,.aac,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/x-m4a,audio/aac,audio/x-aac,audio/ogg,application/ogg',
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/x-aac', 'audio/ogg', 'application/ogg'],
    formats: 'MP3 / WAV / M4A / AAC / OGG',
    maxItems: MAX_VIDEO_V2_AUDIOS,
    maxMegabytes: MAX_REFERENCE_AUDIO_MB,
    maxBytes: MAX_REFERENCE_AUDIO_BYTES,
  },
  video: {
    label: '参考视频',
    token: 'Video',
    accept: '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime',
    mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
    formats: 'MP4 / WebM / MOV',
    maxItems: MAX_VIDEO_V2_VIDEOS,
    maxMegabytes: MAX_REFERENCE_VIDEO_MB,
    maxBytes: MAX_REFERENCE_VIDEO_BYTES,
  },
} as const

const videoV2ExtensionMimeTypes: Record<V2MediaKind, Record<string, string>> = {
  image: {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  },
  audio: {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
  },
  video: {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
  },
}

function hasCanonicalVideoV2Mention(prompt: string) {
  return /(^|[^A-Za-z0-9._%+-])[@＠](Image|Video|Audio)\d+(?![A-Za-z0-9_])/iu.test(prompt)
}

function hasVideoV2MentionAtOrAfter(prompt: string, kind: V2MediaKind, referenceNumber: number) {
  const token = videoV2MediaConfig[kind].token
  const aliases = kind === 'image'
    ? `${token}|参考图`
    : kind === 'video'
      ? `${token}|参考视频|视频`
      : `${token}|参考音频|音频`
  const pattern = new RegExp(`[@＠](?:${aliases})(\\d+)`, 'giu')
  return [...prompt.matchAll(pattern)].some((match) => Number(match[1]) >= referenceNumber)
}

function sortHistoryRecords(records: TaskRecord[]) {
  return mergeTaskHistory([], records, HISTORY_LIMIT)
}

function resolveVideoHref(rawUrl = '') {
  if (!rawUrl) return ''
  if (rawUrl.startsWith('http')) {
    try {
      const host = new URL(rawUrl).hostname
      const proxyable = VIDEO_PROXY_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
      if (proxyable) return `/api/video-proxy?url=${encodeURIComponent(rawUrl)}`
    } catch {
      return rawUrl
    }
    return rawUrl
  }
  return rawUrl.startsWith('/api/') ? `${VIDEO_ASSET_BASE_URL}${rawUrl}` : rawUrl
}

function resolveAssetHref(rawUrl = '') {
  if (!rawUrl) return ''
  return rawUrl.startsWith('/api/') ? `${VIDEO_ASSET_BASE_URL}${rawUrl}` : rawUrl
}

function App() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [history, setHistory] = useState<TaskRecord[]>([])
  const [uncertainSubmissions, setUncertainSubmissions] = useState<UncertainSubmission[]>([])
  const [message, setMessage] = useState('等待输入 Prompt 构建视频')
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [grokVideoObjectUrl, setGrokVideoObjectUrl] = useState('')
  const [loadingGrokVideo, setLoadingGrokVideo] = useState(false)
  const pollersRef = useRef(new Map<string, {
    timeoutId: number | null
    errorCount: number
    resultWaitCount: number
  }>())
  const apiKeyRef = useRef('')
  const selectedTaskRef = useRef<TaskRecord | null>(null)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const promptFileInputRef = useRef<HTMLInputElement | null>(null)
  const promptFileImportInFlightRef = useRef(false)
  const promptFileDragDepthRef = useRef(0)
  const detailDialogRef = useRef<HTMLDialogElement | null>(null)
  const uploadInFlightRef = useRef(false)
  const submissionInFlightRef = useRef(false)
  const [mode, setMode] = useState<VideoMode>('text')
  const [imageInputMode, setImageInputMode] = useState<ImageInputMode>('single')
  const [imageUrls, setImageUrls] = useState<string[]>([''])
  const [imageSourceMode, setImageSourceMode] = useState<ImageSourceMode>('upload')
  const [uploadedImages, setUploadedImages] = useState<UploadedAsset[]>([])
  const [grokReferenceImages, setGrokReferenceImages] = useState<UploadedAsset[]>([])
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAsset[]>([])
  const [uploadedVideos, setUploadedVideos] = useState<UploadedAsset[]>([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadingMediaKind, setUploadingMediaKind] = useState<V2MediaKind | null>(null)
  const [draggingImages, setDraggingImages] = useState(false)
  const [draggingMediaKind, setDraggingMediaKind] = useState<V2MediaKind | null>(null)
  const [draggingPromptFile, setDraggingPromptFile] = useState(false)
  const [importingPromptFile, setImportingPromptFile] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyCollapsed, setHistoryCollapsed] = useState(false)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)
  const [generationCount, setGenerationCount] = useState(MIN_GENERATION_COUNT)
  const [activeMention, setActiveMention] = useState<ActiveReferenceMention | null>(null)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  
  // 展开/收起设置项的开关
  const [showSettings, setShowSettings] = useState(false)
  const task = history.find((item) => item.task_id === selectedTaskId) ?? history[0] ?? null
  const detailTask = history.find((item) => item.task_id === detailTaskId) ?? null
  const miniMaxModelSelected = isMiniMaxH3VideoModel(form.model)
  const grokModelSelected = isGrokImagineVideoModel(form.model)
  const videoV3ModelSelected = isVideoV3Model(form.model)
  const videoV2ModelSelected = isVideoV2Model(form.model)
  const videoResourceModelSelected = videoV2ModelSelected || videoV3ModelSelected
  const videoV2FallbackModelSelected = isVideoV2FallbackModel(form.model)
  const grokUsesMultipleReferences = grokModelSelected && mode === 'image' && uniqueUploadedAssetsById(grokReferenceImages).length > 1
  const videoV2MediaLimits = videoV3ModelSelected ? VIDEO_V3_MEDIA_LIMITS : getVideoV2MediaLimits(form.model)
  const videoV2ImageSizeLimit = getVideoV2ImageSizeLimit(form.model)
  const getVideoV2MediaLimit = (kind: V2MediaKind) => (
    kind === 'image'
      ? videoV2MediaLimits.images
      : kind === 'audio'
        ? videoV2MediaLimits.audios
        : videoV2MediaLimits.videos
  )
  const playbackTaskId = task?.task_id || ''
  const playbackTaskModel = task?.model || ''
  const playbackTaskStatus = String(task?.status || '').toLowerCase()
  const playbackTaskResultUrl = task?.result_url || ''
  selectedTaskRef.current = task

  // 恢复历史状态
  useEffect(() => {
    const savedKey = window.localStorage.getItem(API_KEY_STORAGE)
    if (savedKey) {
      setApiKey(savedKey)
    }
    setHistoryCollapsed(window.localStorage.getItem(HISTORY_COLLAPSED_STORAGE_KEY) === 'true')

    const rawUncertainSubmissions = window.localStorage.getItem(UNCERTAIN_SUBMISSIONS_STORAGE_KEY)
    try {
      const parsedUncertainSubmissions = rawUncertainSubmissions ? JSON.parse(rawUncertainSubmissions) : []
      if (Array.isArray(parsedUncertainSubmissions)) {
        setUncertainSubmissions(parsedUncertainSubmissions.filter((item): item is UncertainSubmission => (
          item && typeof item.idempotency_key === 'string' && typeof item.batch_id === 'string'
        )))
      }
    } catch {
      window.localStorage.removeItem(UNCERTAIN_SUBMISSIONS_STORAGE_KEY)
    }

    const rawHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    const rawLastTask = window.localStorage.getItem(STORAGE_KEY)
    try {
      const parsedHistory = rawHistory ? JSON.parse(rawHistory) : []
      const parsedLastTask = rawLastTask ? JSON.parse(rawLastTask) as TaskRecord : null
      const restoredHistory = Array.isArray(parsedHistory)
        ? parsedHistory.filter((item): item is TaskRecord => item && typeof item.task_id === 'string')
        : []
      const records = sortHistoryRecords(restoredHistory.length > 0
        ? restoredHistory
        : parsedLastTask
          ? [parsedLastTask]
          : [])
      if (records.length === 0) return
      const parsed = records[0]
      setSelectedTaskId(parsed.task_id)
      setHistory(records)
      setForm((current) => ({
        ...current,
        duration: parsed.seconds ?? parsed.duration ?? current.duration,
        ratio: parsed.ratio ?? current.ratio,
        quality: parsed.quality ?? current.quality,
        resolution: parsed.resolution ?? current.resolution,
        size: parsed.size ?? current.size,
        generateAudio: parsed.audio ?? parsed.generate_audio ?? current.generateAudio,
        seed: parsed.seed ?? current.seed,
        bypassFaceCheck: parsed.bypass_face_check ?? current.bypassFaceCheck,
        gridStrength: parsed.grid_strength ?? current.gridStrength,
      }))
      setMessage(`已恢复最近任务：${parsed.task_id}`)
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records))
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
      window.localStorage.removeItem(HISTORY_STORAGE_KEY)
    }
  }, [])

  // 防抖加载模型列表
  useEffect(() => {
    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
      setModels([])
      return
    }
    
    window.localStorage.setItem(API_KEY_STORAGE, apiKey)
    const timeoutId = setTimeout(() => {
      fetchModels(apiKey)
    }, 600)

    return () => clearTimeout(timeoutId)
  }, [apiKey])

  async function fetchModels(key: string) {
    setLoadingModels(true)
    try {
      const res = await fetch(`${API_BASE_URL}/v1/models`, {
        headers: { Authorization: `Bearer ${key}` }
      })
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data.data) ? data.data : []
        // 这里尝试过滤一下只含有视频属性的模型，如果没有特殊属性就全展出
        const videoModels = items.filter((m: ModelInfo) => {
          const id = String(m.id || '').toLowerCase()
          return id.includes('video') || id.includes('sora') || id.includes('runway') || id.includes('kling') || id.includes('minimax') || id.includes('h3') || id.includes('seedance') || id.includes('sd2.5') || id.includes('sd-2.5')
        })
        const targetModels = videoModels.length > 0 ? videoModels : items
        
        setModels(targetModels)
        setMessage(`成功加载可用模型 (共 ${targetModels.length} 个)，当前固定使用 ${initialForm.model}`)
      }
    } catch (err) {
      console.error('获取模型失败:', err)
      setMessage('获取可用模型失败，请检查 API Key')
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    apiKeyRef.current = apiKey
  }, [apiKey])

  useEffect(() => () => clearAllPolling(), [])

  useEffect(() => {
    const activeTaskIds = new Set(history.filter((item) => isActiveTaskStatus(item.status)).map((item) => item.task_id))
    for (const taskId of pollersRef.current.keys()) {
      if (!apiKey || !activeTaskIds.has(taskId)) stopPolling(taskId)
    }
    if (!apiKey) return
    history.filter((item) => isActiveTaskStatus(item.status)).forEach((item) => startPolling(item))
  })

  useEffect(() => {
    const currentTask = selectedTaskRef.current
    const status = String(currentTask?.status || '').toLowerCase()
    if (!apiKey || !currentTask?.task_id || !['succeeded', 'success', 'completed', 'result_unavailable'].includes(status)) return
    void refreshTaskResult(currentTask, apiKey)
  }, [apiKey, task?.task_id, task?.status])

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    const contentPath = getVideoContentPath(playbackTaskModel, playbackTaskId)
    const canLoad = Boolean(
      contentPath &&
      !playbackTaskResultUrl &&
      apiKey.trim() &&
      ['succeeded', 'success', 'completed'].includes(playbackTaskStatus),
    )

    setGrokVideoObjectUrl('')
    if (!canLoad) {
      setLoadingGrokVideo(false)
      return () => controller.abort()
    }

    setLoadingGrokVideo(true)
    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}${contentPath}`, {
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const video = await response.blob()
        if (!video.size) throw new Error('上游返回了空视频')
        objectUrl = URL.createObjectURL(video)
        if (!controller.signal.aborted) setGrokVideoObjectUrl(objectUrl)
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          setMessage(`鉴权视频加载失败：${error?.message || '无法获取视频内容'}`)
        }
      } finally {
        if (!controller.signal.aborted) setLoadingGrokVideo(false)
      }
    })()

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [apiKey, playbackTaskId, playbackTaskModel, playbackTaskResultUrl, playbackTaskStatus])

  useEffect(() => {
    const dialog = detailDialogRef.current
    if (!dialog) return
    if (detailTask && !dialog.open) dialog.showModal()
    if (!detailTask && dialog.open) dialog.close()
  }, [detailTask])

  useEffect(() => {
    if (!grokUsesMultipleReferences || form.resolution !== '1080p') return
    setForm((current) => current.resolution === '1080p'
      ? { ...current, resolution: '720p' }
      : current)
    setMessage('Grok 多参考图仅支持 480p 或 720p，已自动切换为 720p')
  }, [form.resolution, grokUsesMultipleReferences])

  const currentStatus = task?.status ?? 'draft'
  const currentLabel = statusLabel[currentStatus] ?? String(currentStatus)
  const selectedTaskUsesProtectedContent = Boolean(task && getVideoContentPath(task.model, task.task_id) && !task.result_url)
  const resultHref = selectedTaskUsesProtectedContent ? grokVideoObjectUrl : resolveVideoHref(task?.result_url)
  const visibleDurationPresets = miniMaxModelSelected
    ? miniMaxDurationPresets
    : videoV3ModelSelected
      ? videoV3DurationPresets
    : grokModelSelected
    ? grokDurationPresets
    : videoV2FallbackModelSelected
      ? videoV2FallbackDurationPresets
      : durationPresets
  const visibleRatioPresets = videoV3ModelSelected
    ? videoV3RatioPresets
    : grokModelSelected
    ? grokRatioPresets
    : videoV2FallbackModelSelected
      ? videoV2FallbackRatioPresets
    : videoV2ModelSelected
      ? videoV2RatioPresets
      : ratioPresets
  const visibleGrokResolutionPresets = grokUsesMultipleReferences
    ? GROK_MULTI_REFERENCE_VIDEO_RESOLUTIONS
    : videoResolutionPresets
  const referenceImageLimit = grokModelSelected
    ? MAX_GROK_REFERENCE_IMAGES
    : miniMaxModelSelected
      ? MAX_MINIMAX_IMAGES
      : MAX_REFERENCE_IMAGES
  // Grok requires native multipart image files. Keep its selection isolated so files
  // uploaded for another model cannot silently become extra input_reference fields.
  const currentUploadedImages = grokModelSelected ? uniqueUploadedAssetsById(grokReferenceImages) : uploadedImages
  const activeTasks = history.filter((item) => isActiveTaskStatus(item.status))
  const activeReferenceUploadIds = new Set(activeTasks.flatMap((item) => item.reference_upload_ids ?? []))
  const activeMediaUploadIds = new Set(activeTasks.flatMap((item) => [
    ...(item.reference_upload_ids ?? []),
    ...(item.reference_audio_upload_ids ?? []),
    ...(item.reference_video_upload_ids ?? []),
  ]))
  const referenceEditingLocked = submitting
  const referenceControlsLocked = referenceEditingLocked || uploadingImages || Boolean(uploadingMediaKind)
  const isHttpUrl = (value: string) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }
  const configuredReferenceItems = videoResourceModelSelected
    ? currentUploadedImages.slice(0, videoV2MediaLimits.images)
        .map((item, index) => ({ key: item.id, number: index + 1, url: item.url }))
    : imageSourceMode === 'upload'
      ? (grokModelSelected || miniMaxModelSelected || imageInputMode === 'multiple'
        ? currentUploadedImages.slice(0, referenceImageLimit)
        : currentUploadedImages.slice(0, 1))
        .map((item, index) => ({ key: item.id, number: index + 1, url: item.url }))
      : (imageInputMode === 'multiple' ? imageUrls : imageUrls.slice(0, 1))
        .map((url, index) => ({ key: `url-${index}`, number: index + 1, url: url.trim() }))
  const configuredImageUrls = configuredReferenceItems.map((item) => item.url)
  const legacyReferenceInputPresent = mode === 'image' && (
    currentUploadedImages.length > 0 || imageUrls.some((value) => value.trim())
  )
  const referencePreviewItems = configuredReferenceItems.filter((item) => isHttpUrl(item.url))
  const mentionOptions = activeMention && !grokModelSelected && !miniMaxModelSelected
    ? referencePreviewItems.filter((item) => `参考图${item.number}`.startsWith(activeMention.query))
    : []
  const mentionMenuOpen = mode === 'image' && !referenceEditingLocked && Boolean(activeMention) && mentionOptions.length > 0
  const normalizedHistoryQuery = historyQuery.trim().toLowerCase()
  const orderedHistory = sortHistoryRecords(history)
  const filteredHistory = normalizedHistoryQuery
    ? orderedHistory.filter((item) => [item.prompt, item.task_id, item.model, item.ratio]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedHistoryQuery)))
    : orderedHistory

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function changeModel(nextModel: string) {
    if (isMiniMaxH3VideoModel(nextModel)) {
      setForm((current) => ({
        ...current,
        model: nextModel,
        duration: isValidMiniMaxH3VideoSeconds(current.duration) ? current.duration : MINIMAX_H3_MIN_SECONDS,
        ratio: ratioPresets.includes(current.ratio) ? current.ratio : '16:9',
        quality: 'hd',
        resolution: '480p',
        size: isValidMiniMaxH3VideoSize(current.size) ? current.size : '2560x1440',
        generateAudio: true,
      }))
      setImageInputMode('multiple')
      setImageSourceMode('upload')
      setMessage('MiniMax-H3-933-1440P-GF 支持文生和最多 5 张参考图；时长 5-15 秒，输出尺寸按接口枚举，默认生成音频')
      return
    }

    if (isVideoV3Model(nextModel)) {
      setForm((current) => ({
        ...current,
        model: nextModel,
        duration: isValidVideoV3Duration(current.duration) ? current.duration : VIDEO_V3_MIN_DURATION,
        ratio: isValidVideoV3Ratio(current.ratio) ? current.ratio : '16:9',
        quality: 'hd',
        resolution: VIDEO_V3_RESOLUTION,
        generateAudio: current.generateAudio,
      }))
      setImageInputMode('multiple')
      setImageSourceMode('upload')
      setMessage(`SD2.5 / ${nextModel} 支持 4-30 秒、固定 720p、${VIDEO_V3_MEDIA_LIMITS.images} 图 · ${VIDEO_V3_MEDIA_LIMITS.videos} 视频 · ${VIDEO_V3_MEDIA_LIMITS.audios} 音频参考`)
      return
    }

    if (!isGrokImagineVideoModel(nextModel)) {
      const nextModelUsesVideoV2 = isVideoV2Model(nextModel)
      const nextModelUsesFallback = isVideoV2FallbackModel(nextModel)
      setForm((current) => ({
        ...current,
        model: nextModel,
        duration: nextModelUsesFallback
          ? 15
          : durationPresets.includes(current.duration) ? current.duration : 5,
        ratio: nextModelUsesFallback
          ? (videoV2FallbackRatioPresets.includes(current.ratio) ? current.ratio : '16:9')
          : nextModelUsesVideoV2
          ? (isVideoV2Model(current.model) && videoV2RatioPresets.includes(current.ratio) ? current.ratio : '21:9')
          : (ratioPresets.includes(current.ratio) ? current.ratio : '16:9'),
        quality: nextModelUsesVideoV2 ? 'hd' : current.quality,
        resolution: nextModelUsesFallback
          ? '720p'
          : nextModelUsesVideoV2
          ? (isVideoV2Model(current.model) ? current.resolution : '480p')
          : current.resolution,
        generateAudio: nextModelUsesFallback
          ? false
          : nextModelUsesVideoV2
          ? (isVideoV2Model(current.model) ? current.generateAudio : true)
          : current.generateAudio,
      }))
      if (nextModelUsesVideoV2) {
        setImageSourceMode('upload')
        setImageInputMode('multiple')
        const limits = getVideoV2MediaLimits(nextModel)
        setMessage(nextModelUsesFallback
          ? `${nextModel} 固定 15 秒、720p，仅支持 16:9 或 9:16；可上传 ${limits.images} 图、${limits.audios} 音频、${limits.videos} 视频作为参考素材`
          : `${nextModel} 使用 /v1/videos：可纯文本生成，也可上传 ${limits.images} 图、${limits.audios} 音频、${limits.videos} 视频作为参考素材`)
      }
      return
    }

    setForm((current) => ({
      ...current,
      model: nextModel,
      duration: isValidGrokVideoDuration(current.duration) ? current.duration : 5,
      ratio: grokRatioPresets.includes(current.ratio) ? current.ratio : '16:9',
      quality: 'hd',
      resolution: '720p',
      generateAudio: false,
    }))
    setImageInputMode('multiple')
    setImageSourceMode('upload')
    setMessage('Grok Imagine 1.5 支持文生和最多 7 张参考图生视频：请在当前模型下上传参考图，文件会按上传顺序以重复 input_reference 字段提交；支持 1 到 15 秒、7 种画幅与 480p/720p/1080p')
  }

  function updateActiveMention(value: string, cursor: number | null) {
    const nextMention = findActiveReferenceMention(value, cursor ?? value.length)
    setActiveMention((current) => {
      const unchanged = current?.start === nextMention?.start &&
        current?.end === nextMention?.end &&
        current?.query === nextMention?.query
      if (!unchanged) setActiveMentionIndex(0)
      return nextMention
    })
  }

  function handlePromptChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value
    updateField('prompt', value)
    updateActiveMention(value, event.target.selectionStart)
  }

  function handlePromptCursorChange(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget
    updateActiveMention(target.value, target.selectionStart)
  }

  function isFileDrag(dataTransfer: DataTransfer | null) {
    return Boolean(dataTransfer && Array.from(dataTransfer.types).includes('Files'))
  }

  async function handlePromptFiles(files: FileList | null) {
    const selectedFiles = Array.from(files || [])
    if (selectedFiles.length === 0) return
    if (selectedFiles.length !== 1) {
      setMessage('一次只能导入一个 JSON 或 Markdown 文件，请重新选择')
      return
    }
    if (promptFileImportInFlightRef.current) {
      setMessage('正在读取上一个 Prompt 文件，请稍候')
      return
    }

    const file = selectedFiles[0]
    const kind = detectPromptFileKind(file.name, file.type)
    if (!kind) {
      setMessage('仅支持 .json、.md 或 .markdown 文件，图片请拖到参考图区域')
      return
    }
    if (file.size > MAX_PROMPT_FILE_BYTES) {
      setMessage(`文件超过 ${Math.round(MAX_PROMPT_FILE_BYTES / 1024)}KB，请精简后重新导入`)
      return
    }

    promptFileImportInFlightRef.current = true
    setImportingPromptFile(true)
    setMessage(`正在读取 ${file.name}...`)
    try {
      const rawText = decodePromptFile(await file.arrayBuffer())
      const importedText = extractPromptText(rawText, kind)
      const textarea = promptRef.current
      const currentPrompt = textarea?.value ?? form.prompt
      const selectionStart = textarea?.selectionStart ?? currentPrompt.length
      const selectionEnd = textarea?.selectionEnd ?? selectionStart
      const merged = mergeImportedPrompt(currentPrompt, importedText, selectionStart, selectionEnd)

      updateField('prompt', merged.prompt)
      setActiveMention(null)
      setActiveMentionIndex(0)
      setMessage(`${file.name} 已${merged.mode === 'filled' ? '填入' : merged.mode === 'replaced' ? '替换选中内容' : '插入'}，共 ${importedText.length.toLocaleString('zh-CN')} 字`)
      window.requestAnimationFrame(() => {
        textarea?.focus()
        textarea?.setSelectionRange(merged.cursor, merged.cursor)
      })
    } catch (error: any) {
      setMessage(error?.message || '文件读取失败，原 Prompt 未改变')
    } finally {
      promptFileImportInFlightRef.current = false
      setImportingPromptFile(false)
    }
  }

  function handlePromptDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    promptFileDragDepthRef.current += 1
    setDraggingPromptFile(true)
  }

  function handlePromptDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDraggingPromptFile(true)
  }

  function handlePromptDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event.dataTransfer) && !draggingPromptFile) return
    event.preventDefault()
    event.stopPropagation()
    promptFileDragDepthRef.current = Math.max(0, promptFileDragDepthRef.current - 1)
    if (promptFileDragDepthRef.current === 0) setDraggingPromptFile(false)
  }

  function handlePromptDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event.dataTransfer) || event.dataTransfer.files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    promptFileDragDepthRef.current = 0
    setDraggingPromptFile(false)
    void handlePromptFiles(event.dataTransfer.files)
  }

  function insertReferenceMention(referenceNumber: number) {
    if (referenceEditingLocked) {
      setMessage('当前批次正在调度，完成后可继续编辑')
      return
    }
    const textarea = promptRef.current
    const selectionStart = textarea?.selectionStart ?? form.prompt.length
    const selectionEnd = textarea?.selectionEnd ?? selectionStart
    const replacementRange = activeMention && activeMention.end === selectionStart
      ? activeMention
      : { start: selectionStart, end: selectionEnd }
    const token = videoResourceModelSelected ? `@Image${referenceNumber}` : `@参考图${referenceNumber}`
    const before = form.prompt.slice(0, replacementRange.start)
    const after = form.prompt.slice(replacementRange.end)
    const leadingSpace = before && !/[\s（(，,。.!！？?：:；;]$/.test(before) ? ' ' : ''
    const trailingSpace = after.startsWith(' ') ? '' : ' '
    const insertion = `${leadingSpace}${token}${trailingSpace}`
    const nextPrompt = `${before}${insertion}${after}`
    const nextCursor = before.length + insertion.length

    updateField('prompt', nextPrompt)
    setActiveMention(null)
    setActiveMentionIndex(0)
    window.requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function handlePromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionMenuOpen) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveMentionIndex((current) => (current + direction + mentionOptions.length) % mentionOptions.length)
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const selected = mentionOptions[activeMentionIndex] ?? mentionOptions[0]
      if (selected) insertReferenceMention(selected.number)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setActiveMention(null)
    }
  }

  function changeVideoMode(nextMode: VideoMode) {
    if (referenceControlsLocked || uploadInFlightRef.current) {
      setMessage(uploadingImages || uploadInFlightRef.current ? '参考图正在上传，完成后再切换生成模式' : '当前批次正在调度，请稍候')
      return
    }
    const v2Mentions = videoResourceModelSelected
      ? normalizeVideoV2Mentions(form.prompt, { images: 0, videos: 0, audios: 0 }).invalidTokens
      : []
    if (nextMode === 'text' && ((!grokModelSelected && hasReferenceMentions(form.prompt)) || v2Mentions.length > 0)) {
      setMessage(videoResourceModelSelected
        ? 'Prompt 中存在参考素材引用，请先移除 @Image、@Video、@Audio 后再切换纯文本'
        : 'Prompt 中存在参考图引用，请先移除 @参考图 后再切换文生视频')
      promptRef.current?.focus()
      return
    }
    setMode(nextMode)
    if (videoResourceModelSelected && nextMode === 'text' && (uploadedImages.length || uploadedAudios.length || uploadedVideos.length)) {
      setMessage('已切换纯文本；上传的参考素材会保留，但本次不会提交')
    }
  }

  function changeImageSourceMode(nextMode: ImageSourceMode) {
    if (nextMode === imageSourceMode) return
    if ((grokModelSelected || miniMaxModelSelected || videoResourceModelSelected) && nextMode !== 'upload') {
      setMessage(grokModelSelected
        ? 'grok-imagine-1.5-video 需要上传真实参考图文件，不能使用图片 URL'
        : miniMaxModelSelected
          ? 'MiniMax-H3-933-1440P-GF 需要先上传参考图生成公网外链，不能直接使用图片 URL'
          : `${form.model} 参考素材必须先上传到项目域名生成外链，不能直接切换到图片 URL`)
      return
    }
    if (referenceControlsLocked || uploadInFlightRef.current) {
      setMessage(uploadingImages || uploadInFlightRef.current ? '参考图正在上传，完成后再切换图片来源' : '当前批次正在调度，请稍候')
      return
    }
    const hasConfiguredReferences = uploadedImages.length > 0 || imageUrls.some((value) => value.trim())
    if (hasReferenceMentions(form.prompt) && hasConfiguredReferences) {
      setMessage('Prompt 中存在 @参考图 引用，请先移除引用后再切换图片来源')
      promptRef.current?.focus()
      return
    }
    setImageSourceMode(nextMode)
  }

  function updateImageUrl(index: number, value: string) {
    setImageUrls((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))
  }

  function handleImageUrlBlur(index: number) {
    if (getReferenceMentionNumbers(form.prompt).includes(index + 1) && isHttpUrl(imageUrls[index]?.trim() || '')) {
      setMessage(`已更新 @参考图${index + 1} 对应的图片 URL`)
    }
  }

  function clearImageUrl(index: number) {
    if (getReferenceMentionNumbers(form.prompt).includes(index + 1)) {
      setMessage(`Prompt 正在使用 @参考图${index + 1}，请先删除该引用再清空图片`)
      promptRef.current?.focus()
      return
    }
    setImageUrls((current) => current.map((item, itemIndex) => itemIndex === index ? '' : item))
  }

  function removeImageUrl(index: number) {
    const referenceNumber = index + 1
    if (getReferenceMentionNumbers(form.prompt).includes(referenceNumber)) {
      setMessage(`Prompt 正在使用 @参考图${referenceNumber}，请先删除该引用再移除图片`)
      promptRef.current?.focus()
      return
    }
    setImageUrls((current) => current.filter((_, itemIndex) => itemIndex !== index))
    updateField('prompt', reindexReferenceMentionsAfterRemoval(form.prompt, referenceNumber))
    setMessage(`已移除参考图${referenceNumber}，后续参考图编号已自动更新`)
  }

  async function copyJson(text: string) {
    await window.navigator.clipboard.writeText(text)
    setMessage('已复制到剪贴板')
  }

  async function refreshTaskResult(item: TaskRecord, key: string) {
    try {
      const protectedContentTask = Boolean(getVideoContentPath(item.model, item.task_id))
      const response = await fetch(`${API_BASE_URL}${getVideoTaskPath(item.model, item.task_id)}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!response.ok) return
      const payload = await response.json()
      const nestedData = payload?.data && !Array.isArray(payload.data) ? payload.data : payload
      const nestedResultData = nestedData?.result?.data || payload?.result?.data
      const resultItem = Array.isArray(nestedData?.data)
        ? nestedData.data[0]
        : Array.isArray(nestedResultData)
          ? nestedResultData[0]
          : undefined
      const resultUrl =
        payload?.result_url ||
        payload?.video_url ||
        payload?.url ||
        payload?.metadata?.url ||
        resultItem?.url ||
        nestedData?.result_url ||
        nestedData?.video_url ||
        nestedData?.url ||
        nestedData?.metadata?.url
      const previewUrl =
        payload?.preview_url ||
        payload?.thumbnail_url ||
        payload?.cover_url ||
        payload?.poster_url ||
        nestedData?.preview_url ||
        nestedData?.thumbnail_url ||
        nestedData?.cover_url ||
        nestedData?.poster_url ||
        resultItem?.preview_url ||
        resultItem?.thumbnail_url ||
        resultItem?.cover_url ||
        resultItem?.poster_url

      if (protectedContentTask) {
        const remoteStatus = String(payload?.status || nestedData?.status || item.status || '').toLowerCase()
        const remoteError = payload?.error ?? nestedData?.error
        const errorMessage = typeof remoteError === 'string'
          ? remoteError
          : remoteError?.message || payload?.message || nestedData?.message
        const nextStatus: TaskStatus = resultUrl || remoteStatus === 'completed' || remoteStatus === 'success' || remoteStatus === 'succeeded'
          ? 'succeeded'
          : remoteStatus === 'failed' || remoteStatus === 'failure'
            ? 'failed'
            : remoteStatus === 'queued'
              ? 'queued'
              : 'processing'
        const nextProgress = nextStatus === 'succeeded'
          ? 100
          : Number(payload?.progress ?? nestedData?.progress ?? item.progress) || 0
        persistTask({
          ...item,
          status: nextStatus,
          progress: nextProgress,
          result_url: resultUrl || item.result_url,
          preview_url: previewUrl || item.preview_url,
          message: nextStatus === 'failed'
            ? errorMessage || '视频生成失败'
            : nextStatus === 'succeeded'
              ? resultUrl
                ? '视频链接已就绪'
                : '视频已生成，可通过鉴权内容接口播放和下载'
              : payload?.message || nestedData?.message || item.message,
        })
        setMessage(nextStatus === 'succeeded' ? '视频结果已就绪' : `任务状态已刷新：${statusLabel[nextStatus]}`)
        return
      }
      const nextResultUrl = resultUrl || item.result_url
      const nextPreviewUrl = previewUrl || item.preview_url
      if (nextResultUrl === item.result_url && nextPreviewUrl === item.preview_url) return

      persistTask({
        ...item,
        result_url: nextResultUrl,
        preview_url: nextPreviewUrl,
        status: 'succeeded',
        progress: 100,
      })
      setMessage('已刷新视频链接')
    } catch (error) {
      console.warn('刷新历史视频链接失败，将继续使用已有链接', error)
    }
  }

  async function downloadVideo() {
    const authenticatedContentPath = task && !task.result_url ? getVideoContentPath(task.model, task.task_id) : ''
    const downloadHref = authenticatedContentPath ? `${API_BASE_URL}${authenticatedContentPath}` : resultHref
    if (!downloadHref || downloading) return
    setDownloading(true)
    setMessage('正在准备下载视频...')
    const filename = `video-${task?.task_id || Date.now()}.mp4`
    try {
      if (authenticatedContentPath && grokVideoObjectUrl) {
        const link = document.createElement('a')
        link.href = grokVideoObjectUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        setMessage('下载已开始')
        return
      }
      const response = await fetch(downloadHref, {
        headers: authenticatedContentPath && apiKey.trim()
          ? { Authorization: `Bearer ${apiKey.trim()}` }
          : undefined,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      setMessage('下载已开始')
    } catch (error) {
      console.warn('视频下载失败', error)
      if (authenticatedContentPath) {
        setMessage('鉴权视频下载失败，请检查 API Key 或稍后重试')
      } else {
        window.open(resultHref, '_blank', 'noopener,noreferrer')
        setMessage('浏览器无法直接下载，已打开视频链接，请使用播放器菜单保存')
      }
    } finally {
      setDownloading(false)
    }
  }

  async function cleanupUploadedAssets(assets: UploadedAsset[]) {
    const removableAssets = assets.filter((item) => !activeMediaUploadIds.has(item.id))
    if (removableAssets.length === 0) return
    try {
      await fetch('/api/uploads/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: removableAssets.map((item) => ({ id: item.id })) }),
        keepalive: true,
      })
    } catch (error) {
      console.warn('清理临时参考图失败，将由服务器 TTL 自动清理', error)
    }
  }

  async function handleImageFiles(files: FileList | null) {
    if (referenceEditingLocked) {
      setMessage('当前批次正在调度，请稍候再上传')
      return
    }
    if (uploadInFlightRef.current) return
    const selected = Array.from(files || [])
    if (selected.length === 0) return
    const imageMimeTypes = videoV2MediaConfig.image.mimeTypes as readonly string[]
    const normalizedFiles = selected.map((file) => {
      const currentType = file.type.toLowerCase()
      if (imageMimeTypes.includes(currentType)) return file
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      const inferredType = videoV2ExtensionMimeTypes.image[extension]
      return inferredType
        ? new File([file], file.name, { type: inferredType, lastModified: file.lastModified })
        : file
    })
    const invalidFile = normalizedFiles.find((file) => !imageMimeTypes.includes(file.type.toLowerCase()))
    if (invalidFile) {
      setMessage(`${invalidFile.name} 格式不支持；本站参考图仅支持 JPG、PNG、WebP`)
      return
    }
    const maxReferenceFileMb = grokModelSelected ? MAX_GROK_REFERENCE_FILE_MB : MAX_REFERENCE_FILE_MB
    const maxReferenceFileBytes = grokModelSelected ? MAX_GROK_REFERENCE_FILE_BYTES : MAX_REFERENCE_FILE_BYTES
    const oversizedFile = normalizedFiles.find((file) => file.size > maxReferenceFileBytes)
    if (oversizedFile) {
      setMessage(`${oversizedFile.name} 超过 ${maxReferenceFileMb}MB，请压缩后重新上传`)
      return
    }
    const targetImages = grokModelSelected ? grokReferenceImages : uploadedImages
    const appendImages = grokModelSelected || miniMaxModelSelected || imageInputMode === 'multiple'
    const availableSlots = appendImages
      ? referenceImageLimit - uniqueUploadedAssetsById(targetImages).length
      : 1
    if (availableSlots <= 0) {
      setMessage(`最多上传 ${referenceImageLimit} 张参考图，请先移除一张`)
      return
    }
    const limited = Number.isFinite(availableSlots)
      ? normalizedFiles.slice(0, availableSlots)
      : normalizedFiles
    const ignoredCount = normalizedFiles.length - limited.length
    uploadInFlightRef.current = true
    setUploadingImages(true)
    setMessage('正在上传临时参考图...')
    const previous = targetImages
    const uploaded: UploadedAsset[] = []
    const appendUploadedImages = () => {
      if (uploaded.length === 0) return
      if (grokModelSelected) {
        setGrokReferenceImages((current) => uniqueUploadedAssetsById([...current, ...uploaded]).slice(0, referenceImageLimit))
        return
      }
      setUploadedImages((current) => uniqueUploadedAssetsById([...current, ...uploaded]).slice(0, referenceImageLimit))
    }
    try {
      for (const [index, file] of limited.entries()) {
        setMessage(grokModelSelected
          ? `正在上传 Grok 参考图 (${index + 1}/${limited.length})...`
          : `正在上传临时参考图 (${index + 1}/${limited.length})...`)
        const formData = new FormData()
        formData.append('files', file)
        const response = await fetch('/api/uploads', { method: 'POST', body: formData })
        const data = await response.json().catch(() => ({}))
        const received = Array.isArray(data.files)
          ? data.files.find((item: UploadedAsset) => item?.kind === 'image')
          : null
        if (!response.ok || !received) throw new Error(data.error || `HTTP ${response.status}`)
        uploaded.push(received)
      }
      if (appendImages) {
        appendUploadedImages()
        setMessage(`已添加 ${uploaded.length} 张参考图${ignoredCount > 0 ? `，另有 ${ignoredCount} 张因达到当前模式上限未上传` : ''}`)
      } else {
        const currentPrompt = promptRef.current?.value ?? form.prompt
        if (!grokModelSelected && !miniMaxModelSelected && previous.length > 0 && hasReferenceMentions(currentPrompt)) {
          await cleanupUploadedAssets(uploaded)
          setMessage('Prompt 正在引用参考图1，本次替换已取消；请先移除引用')
          return
        }
        await cleanupUploadedAssets(previous)
        setUploadedImages(uploaded.slice(0, 1))
        setMessage(previous.length > 0 ? '已替换参考图1' : '已上传参考图1')
      }
    } catch (error: any) {
      if (appendImages) appendUploadedImages()
      setMessage(uploaded.length > 0
        ? `已上传 ${uploaded.length} 张参考图，后续文件失败：${error?.message || '未知错误'}`
        : `图片上传失败: ${error?.message || '未知错误'}`)
    } finally {
      uploadInFlightRef.current = false
      setUploadingImages(false)
    }
  }

  function handleImageDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDraggingImages(false)
    if (uploadingImages) return
    void handleImageFiles(event.dataTransfer.files)
  }

  function getVideoV2Assets(kind: V2MediaKind) {
    if (kind === 'image') return uploadedImages
    if (kind === 'audio') return uploadedAudios
    return uploadedVideos
  }

  function appendVideoV2Assets(kind: V2MediaKind, assets: UploadedAsset[]) {
    if (assets.length === 0) return
    const limit = getVideoV2MediaLimit(kind)
    if (kind === 'image') {
      setUploadedImages((current) => [...current, ...assets].slice(0, limit))
    } else if (kind === 'audio') {
      setUploadedAudios((current) => [...current, ...assets].slice(0, limit))
    } else {
      setUploadedVideos((current) => [...current, ...assets].slice(0, limit))
    }
  }

  async function handleVideoV2MediaFiles(kind: V2MediaKind, files: FileList | null) {
    if (referenceEditingLocked) {
      setMessage('当前批次正在调度，请稍候再上传')
      return
    }
    if (uploadInFlightRef.current) {
      setMessage('另一个参考文件仍在上传，请稍候')
      return
    }

    const selected = Array.from(files || [])
    if (selected.length === 0) return
    const config = {
      ...videoV2MediaConfig[kind],
      maxItems: getVideoV2MediaLimit(kind),
      ...(kind === 'image' ? videoV2ImageSizeLimit : {}),
    }
    const normalizedFiles = selected.map((file) => {
      const currentType = file.type.toLowerCase()
      if ((config.mimeTypes as readonly string[]).includes(currentType)) return file
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      const inferredType = videoV2ExtensionMimeTypes[kind][extension]
      return inferredType
        ? new File([file], file.name, { type: inferredType, lastModified: file.lastModified })
        : file
    })
    const invalidFile = normalizedFiles.find((file) => !(config.mimeTypes as readonly string[]).includes(file.type.toLowerCase()))
    if (invalidFile) {
      setMessage(`${invalidFile.name} 格式不支持；${config.label}仅支持 ${config.formats}`)
      return
    }
    const oversizedFile = normalizedFiles.find((file) => file.size > config.maxBytes)
    if (oversizedFile) {
      setMessage(`${oversizedFile.name} 超过 ${config.maxMegabytes}MB，请压缩后重新上传`)
      return
    }

    const existing = getVideoV2Assets(kind)
    const availableSlots = config.maxItems - existing.length
    if (availableSlots <= 0) {
      setMessage(`${config.label}最多上传 ${config.maxItems} 个，请先移除一个`)
      return
    }
    const limited = normalizedFiles.slice(0, availableSlots)
    const uploaded: UploadedAsset[] = []
    uploadInFlightRef.current = true
    setUploadingMediaKind(kind)
    setMessage(`正在上传${config.label}...`)

    try {
       // 逐个上传，避免多个参考视频合并后超过请求体上限。
      for (const file of limited) {
        const formData = new FormData()
        formData.append('files', file)
        const response = await fetch('/api/uploads', { method: 'POST', body: formData })
        const data = await response.json().catch(() => ({}))
        const received = Array.isArray(data.files)
          ? data.files.find((item: UploadedAsset) => item?.kind === kind)
          : null
        if (!response.ok || !received) throw new Error(data.error || `HTTP ${response.status}`)
        uploaded.push(received)
      }

      appendVideoV2Assets(kind, uploaded)
      const ignoredCount = selected.length - limited.length
      setMessage(`已添加 ${uploaded.length} 个${config.label}${ignoredCount > 0 ? `，另有 ${ignoredCount} 个因达到上限未上传` : ''}`)
    } catch (error: any) {
      appendVideoV2Assets(kind, uploaded)
      setMessage(uploaded.length > 0
        ? `已上传 ${uploaded.length} 个${config.label}，后续文件失败：${error?.message || '未知错误'}`
        : `${config.label}上传失败：${error?.message || '未知错误'}`)
    } finally {
      uploadInFlightRef.current = false
      setUploadingMediaKind(null)
    }
  }

  function handleVideoV2MediaDrop(kind: V2MediaKind, event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDraggingMediaKind(null)
    if (uploadingMediaKind) return
    void handleVideoV2MediaFiles(kind, event.dataTransfer.files)
  }

  async function removeVideoV2Asset(kind: V2MediaKind, asset: UploadedAsset) {
    if (referenceEditingLocked) {
      setMessage('当前批次正在调度，请稍候再编辑参考素材')
      return
    }
    if (activeMediaUploadIds.has(asset.id)) {
      setMessage(`这个${videoV2MediaConfig[kind].label}仍被生成中的任务使用，任务结束后才能删除`)
      return
    }

    const assets = getVideoV2Assets(kind)
    const referenceNumber = assets.findIndex((item) => item.id === asset.id) + 1
    if (referenceNumber < 1) return
    if (hasVideoV2MentionAtOrAfter(form.prompt, kind, referenceNumber)) {
      setMessage(`Prompt 正在使用 @${videoV2MediaConfig[kind].token}${referenceNumber} 或后续编号，请先删除相关引用`)
      promptRef.current?.focus()
      return
    }

    if (kind === 'image') setUploadedImages((current) => current.filter((item) => item.id !== asset.id))
    else if (kind === 'audio') setUploadedAudios((current) => current.filter((item) => item.id !== asset.id))
    else setUploadedVideos((current) => current.filter((item) => item.id !== asset.id))
    await cleanupUploadedAssets([asset])
    setMessage(`已移除${videoV2MediaConfig[kind].label}${referenceNumber}`)
  }

  function insertVideoV2MediaMention(kind: V2MediaKind, referenceNumber: number) {
    if (referenceEditingLocked) {
      setMessage('当前批次正在调度，完成后可继续编辑')
      return
    }
    const textarea = promptRef.current
    const selectionStart = textarea?.selectionStart ?? form.prompt.length
    const selectionEnd = textarea?.selectionEnd ?? selectionStart
    const token = `@${videoV2MediaConfig[kind].token}${referenceNumber}`
    const before = form.prompt.slice(0, selectionStart)
    const after = form.prompt.slice(selectionEnd)
    const leadingSpace = before && !/[\s（(，,。.!！？?：:；;]$/.test(before) ? ' ' : ''
    const trailingSpace = after.startsWith(' ') ? '' : ' '
    const insertion = `${leadingSpace}${token}${trailingSpace}`
    const nextPrompt = `${before}${insertion}${after}`
    const nextCursor = before.length + insertion.length
    updateField('prompt', nextPrompt)
    window.requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function changeImageInputMode(nextMode: ImageInputMode) {
    if (nextMode === imageInputMode) return
    if (videoResourceModelSelected) {
      setMessage(`${form.model} 固定按多素材数组提交，图片最多 ${videoV2MediaLimits.images} 张`)
      return
    }
    if (grokModelSelected) {
      setImageInputMode('multiple')
      setMessage('grok-imagine-1.5-video 会将全部已上传参考图按顺序作为重复 input_reference 文件字段提交')
      return
    }
    if (miniMaxModelSelected) {
      setImageInputMode('multiple')
      setMessage(`MiniMax-H3-933-1440P-GF 固定使用 images 数组，最多 ${MAX_MINIMAX_IMAGES} 张参考图`)
      return
    }
    if (referenceControlsLocked || uploadInFlightRef.current) {
      setMessage(uploadingImages || uploadInFlightRef.current ? '参考图正在上传，完成后再切换图片数量' : '当前批次正在调度，请稍候')
      return
    }
    if (hasReferenceMentions(form.prompt)) {
      setMessage('Prompt 中存在 @参考图 引用，请先移除引用后再切换单图或多图')
      promptRef.current?.focus()
      return
    }
    setImageInputMode(nextMode)
    if (nextMode === 'multiple') {
      setImageUrls((current) => current.length >= 2 ? current : [...current, ''])
      return
    }
    const [firstImage, ...extraImages] = uploadedImages
    setUploadedImages(firstImage ? [firstImage] : [])
    setImageUrls((current) => current.length > 0 ? current.slice(0, 1) : [''])
    void cleanupUploadedAssets(extraImages)
    setMessage('已切换为单图模式，并保留第一张参考图')
  }

  async function removeUploadedImage(image: { id: string; url: string }) {
    if (referenceEditingLocked) {
      setMessage('当前批次正在调度，请稍候再编辑参考图')
      return
    }
    if (activeReferenceUploadIds.has(image.id)) {
      setMessage('这张参考图仍被生成中的任务使用，任务结束后才能删除')
      return
    }
    const imageAssets = grokModelSelected ? grokReferenceImages : uploadedImages
    const referenceNumber = imageAssets.findIndex((item) => item.id === image.id) + 1
    if (referenceNumber < 1) return
    if (!grokModelSelected && !miniMaxModelSelected && getReferenceMentionNumbers(form.prompt).includes(referenceNumber)) {
      setMessage(`Prompt 正在使用 @参考图${referenceNumber}，请先删除该引用再移除图片`)
      promptRef.current?.focus()
      return
    }
    if (grokModelSelected) setGrokReferenceImages((current) => current.filter((item) => item.id !== image.id))
    else setUploadedImages((current) => current.filter((item) => item.id !== image.id))
    if (!grokModelSelected && !miniMaxModelSelected) updateField('prompt', reindexReferenceMentionsAfterRemoval(form.prompt, referenceNumber))
    await cleanupUploadedAssets([image])
    setMessage(`已移除参考图${referenceNumber}，后续参考图编号已自动更新`)
  }

  function persistTask(nextTask: TaskRecord) {
    setHistory((currentHistory) => {
      const nextHistory = mergeTaskHistory(currentHistory, [nextTask], HISTORY_LIMIT)
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory))
      if (nextHistory[0]) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory[0]))
      return nextHistory
    })
  }

  function rememberUncertainSubmissions(items: UncertainSubmission[]) {
    if (items.length === 0) return
    setUncertainSubmissions((current) => {
      const records = new Map(current.map((item) => [item.idempotency_key, item]))
      items.forEach((item) => records.set(item.idempotency_key, item))
      const nextItems = [...records.values()]
        .sort((left, right) => right.created_at - left.created_at)
        .slice(0, 50)
      window.localStorage.setItem(UNCERTAIN_SUBMISSIONS_STORAGE_KEY, JSON.stringify(nextItems))
      return nextItems
    })
  }

  function clearUncertainSubmissions() {
    setUncertainSubmissions([])
    window.localStorage.removeItem(UNCERTAIN_SUBMISSIONS_STORAGE_KEY)
    setMessage('已清除核对完成的状态未知记录')
  }

  function toggleHistoryCollapsed() {
    setHistoryCollapsed((collapsed) => {
      const nextCollapsed = !collapsed
      window.localStorage.setItem(HISTORY_COLLAPSED_STORAGE_KEY, String(nextCollapsed))
      return nextCollapsed
    })
  }

  function selectHistoryItem(item: TaskRecord) {
    const wasAlreadySelected = item.task_id === selectedTaskId
    setSelectedTaskId(item.task_id)
    setDetailTaskId(item.task_id)
    if (item.status === 'tracking_paused') {
      if (!apiKey.trim()) {
        setMessage('配置 API Key 后才能恢复查询该任务')
        setShowSettings(true)
        return
      }
      const resumedTask: TaskRecord = {
        ...item,
        status: 'processing',
        message: '已手动恢复任务状态查询',
      }
      persistTask(resumedTask)
      startPolling(resumedTask)
      setMessage(`已恢复查询任务：${item.task_id}`)
      return
    }
    if (item.status === 'result_unavailable' && wasAlreadySelected) {
      if (apiKey.trim()) void refreshTaskResult(item, apiKey.trim())
      else {
        setMessage('配置 API Key 后才能重新获取播放链接')
        setShowSettings(true)
      }
      return
    }
    setMessage(item.status === 'succeeded' ? '已打开历史视频详情' : `已打开任务详情：${item.task_id}`)
  }

  function reuseHistoryPrompt(item: TaskRecord) {
    if (!item.prompt) {
      setMessage('这条历史任务没有可复用的 Prompt')
      return
    }
    const historyUsesVideoV2 = isVideoV2Model(item.model)
    const historyUsesVideoV3 = isVideoV3Model(item.model)
    const historyUsesVideoResource = historyUsesVideoV2 || historyUsesVideoV3
    const historyUsesMiniMax = isMiniMaxH3VideoModel(item.model)
    const historyUsesGrok = isGrokImagineVideoModel(item.model)
    const historyVideoV2Limits = historyUsesVideoV3 ? VIDEO_V3_MEDIA_LIMITS : getVideoV2MediaLimits(item.model)
    const referenceNumbers = historyUsesGrok ? [] : getReferenceMentionNumbers(item.prompt)
    const expectedReferenceCount = Math.max(Number(item.reference_count) || 0, ...referenceNumbers, 0)
    const expectedAudioCount = historyUsesVideoResource ? Number(item.reference_audio_count) || 0 : 0
    const expectedVideoCount = historyUsesVideoResource ? Number(item.reference_video_count) || 0 : 0
    const imageLimit = historyUsesVideoResource
      ? historyVideoV2Limits.images
      : historyUsesMiniMax
        ? MAX_MINIMAX_IMAGES
      : historyUsesGrok
        ? MAX_GROK_REFERENCE_IMAGES
        : MAX_REFERENCE_IMAGES
    if (expectedReferenceCount > imageLimit || expectedAudioCount > historyVideoV2Limits.audios || expectedVideoCount > historyVideoV2Limits.videos) {
      setMessage('这条历史任务的参考素材数量超过当前模型限制，无法直接复用')
      return
    }
    const expectedMediaCount = expectedReferenceCount + expectedAudioCount + expectedVideoCount
    const draftHasMedia = uploadedImages.length > 0 || grokReferenceImages.length > 0 || uploadedAudios.length > 0 || uploadedVideos.length > 0 || imageUrls.some((value) => value.trim())
    if (expectedMediaCount > 0 && draftHasMedia) {
      setMessage('当前草稿已有参考素材，为避免错绑，请先清空后再复用历史 Prompt')
      return
    }
    setForm((current) => ({
      ...current,
        prompt: item.prompt ?? current.prompt,
        duration: item.seconds ?? item.duration ?? current.duration,
        ratio: item.ratio ?? current.ratio,
        quality: item.quality ?? current.quality,
        resolution: item.resolution ?? current.resolution,
        size: item.size ?? current.size,
        generateAudio: item.audio ?? item.generate_audio ?? current.generateAudio,
        seed: item.seed ?? current.seed,
        bypassFaceCheck: item.bypass_face_check ?? current.bypassFaceCheck,
        gridStrength: item.grid_strength ?? current.gridStrength,
        model: item.model || current.model,
    }))
    setConsoleCollapsed(false)
    if (expectedMediaCount > 0) {
      setMode('image')
      setImageSourceMode('upload')
      setImageInputMode(historyUsesVideoResource || historyUsesGrok || historyUsesMiniMax ? 'multiple' : 'single')
      setImageUrls(Array.from({ length: expectedReferenceCount > 1 ? Math.max(2, expectedReferenceCount) : 1 }, () => ''))
      setMessage(historyUsesVideoResource
        ? `该任务使用 ${expectedReferenceCount} 图、${expectedAudioCount} 音频、${expectedVideoCount} 视频；历史记录不保存原文件，请按编号重新上传`
        : `该历史任务使用了 ${expectedReferenceCount} 张参考图，历史记录不保存原图，请按编号重新上传`)
    } else {
      setMessage('已将历史 Prompt 载入生成控制台')
    }
    window.requestAnimationFrame(() => promptRef.current?.focus())
  }

  function removeHistoryItem(taskId: string) {
    const targetTask = history.find((item) => item.task_id === taskId)
    if (targetTask && isActiveTaskStatus(targetTask.status)) {
      setMessage('该任务仍在生成，完成后才能删除记录')
      return
    }
    const nextHistory = sortHistoryRecords(history.filter((item) => item.task_id !== taskId))
    setHistory(nextHistory)
    if (nextHistory.length > 0) {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory))
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory[0]))
    } else {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY)
      window.localStorage.removeItem(STORAGE_KEY)
    }
    if (task?.task_id === taskId) {
      setSelectedTaskId(nextHistory[0]?.task_id ?? null)
    }
    if (detailTaskId === taskId) setDetailTaskId(null)
    setMessage(nextHistory.length > 0 ? '已删除一条历史记录' : '历史记录已清空')
  }

  function clearHistory() {
    if (activeTasks.length > 0 || submitting) {
      setMessage('仍有任务正在生成，全部结束后才能清空历史记录')
      return
    }
    clearAllPolling()
    setHistory([])
    setSelectedTaskId(null)
    setDetailTaskId(null)
    window.localStorage.removeItem(HISTORY_STORAGE_KEY)
    window.localStorage.removeItem(STORAGE_KEY)
    setMessage('历史记录已清空')
  }

  function formatTaskDate(timestamp?: number) {
    if (!timestamp) return '时间未知'
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(timestamp * 1000))
  }

  function stopPolling(taskId: string) {
    const poller = pollersRef.current.get(taskId)
    if (!poller) return
    if (poller.timeoutId !== null) window.clearTimeout(poller.timeoutId)
    pollersRef.current.delete(taskId)
  }

  function clearAllPolling() {
    for (const taskId of [...pollersRef.current.keys()]) stopPolling(taskId)
  }

  function startPolling(baseTask: TaskRecord) {
    const taskId = baseTask.task_id
    if (pollersRef.current.has(taskId)) return
    const poller = {
      timeoutId: null as number | null,
      errorCount: 0,
      resultWaitCount: 0,
    }
    let pollingTask = { ...baseTask }
    pollersRef.current.set(taskId, poller)

    const scheduleNext = (delay = 4000) => {
      if (pollersRef.current.get(taskId) !== poller) return
      poller.timeoutId = window.setTimeout(() => void poll(), delay)
    }

    const poll = async () => {
      poller.timeoutId = null
      try {
        const protectedContentTask = Boolean(getVideoContentPath(pollingTask.model, taskId))
        const res = await fetch(`${API_BASE_URL}${getVideoTaskPath(pollingTask.model, taskId)}`, {
          headers: apiKeyRef.current ? { Authorization: `Bearer ${apiKeyRef.current}` } : {},
        })
        if (!res.ok) throw new PollingHttpError(res.status)
        
        const json = await res.json()
        if (pollersRef.current.get(taskId) !== poller) return
        poller.errorCount = 0
        const data = json.data || json
        const nestedData = data?.data && !Array.isArray(data.data) ? data.data : data
        const statusStr = String(json.status || data.status || nestedData.status || 'processing').toLowerCase()
        let status: TaskStatus = 'processing'
        if (statusStr === 'success' || statusStr === 'succeeded' || statusStr === 'completed') status = 'succeeded'
        else if (statusStr === 'failed' || statusStr === 'failure') status = 'failed'
        else if (statusStr === 'queued') status = 'queued'

        const nestedResultData =
          nestedData?.result?.data ||
          data?.result?.data ||
          json?.result?.data
        const resultItem = Array.isArray(nestedData?.data)
          ? nestedData.data[0]
          : Array.isArray(nestedResultData)
            ? nestedResultData[0]
            : undefined
        const rawProgressValue = json.progress ?? data.progress ?? nestedData.progress ?? 0
        const rawProgress = typeof rawProgressValue === 'string'
          ? parseInt(rawProgressValue, 10)
          : rawProgressValue
        const resultUrl =
          json.result_url ||
          json.video_url ||
          json.url ||
          json.metadata?.url ||
          resultItem?.url ||
          data.result_url ||
          data.video_url ||
          data.url ||
          data.metadata?.url ||
          nestedData.result_url ||
          nestedData.video_url ||
          nestedData.url ||
          nestedData.metadata?.url
        const previewUrl =
          json.preview_url ||
          json.thumbnail_url ||
          json.cover_url ||
          json.poster_url ||
          data.preview_url ||
          data.thumbnail_url ||
          data.cover_url ||
          data.poster_url ||
          nestedData.preview_url ||
          nestedData.thumbnail_url ||
          nestedData.cover_url ||
          nestedData.poster_url ||
          resultItem?.preview_url ||
          resultItem?.thumbnail_url ||
          resultItem?.cover_url ||
          resultItem?.poster_url

        const existingResultUrl = pollingTask.result_url || ''
        const existingPreviewUrl = pollingTask.preview_url || ''
        const nextResultUrl = resultUrl || existingResultUrl
        const nextPreviewUrl = previewUrl || existingPreviewUrl

        if (nextResultUrl && status !== 'failed') status = 'succeeded'
        const authenticatedContentReady = protectedContentTask && status === 'succeeded'
        const waitingForResult = status === 'succeeded' && !nextResultUrl && !authenticatedContentReady
        if (waitingForResult) poller.resultWaitCount += 1
        else poller.resultWaitCount = 0
        const resultWaitExpired = waitingForResult && poller.resultWaitCount >= MAX_RESULT_WAIT_POLLS
        const effectiveStatus: TaskStatus = resultWaitExpired
          ? 'result_unavailable'
          : waitingForResult
            ? 'result_pending'
            : status
        const progress = nextResultUrl || authenticatedContentReady
          ? 100
          : waitingForResult
            ? 99
          : isNaN(rawProgress)
            ? (status === 'succeeded' ? 100 : 50)
            : rawProgress

        const remoteError = json?.error ?? data?.error ?? nestedData?.error
        const remoteErrorMessage = typeof remoteError === 'string'
          ? remoteError
          : remoteError?.message
        const updated: TaskRecord = {
          ...pollingTask,
          id: json.id || data.id || taskId,
          task_id: taskId,
          object: 'video',
          // 上游可能返回 cvk-* canonical 名称；路由必须沿用用户选择的 video-v2 别名。
          model: pollingTask.model,
          status: effectiveStatus,
          progress,
          created_at: pollingTask.created_at,
          duration: pollingTask.duration,
          ratio: pollingTask.ratio,
          quality: pollingTask.quality,
          prompt: pollingTask.prompt,
          result_url: nextResultUrl,
          preview_url: nextPreviewUrl,
          message: resultWaitExpired
            ? '视频任务已完成，但上游暂未返回播放链接；点击历史记录可再次查询'
            : waitingForResult
              ? '视频已生成，正在等待上游返回播放链接'
              : status === 'failed'
                ? remoteErrorMessage || json.message || data.message || nestedData.message || '视频生成失败'
                : authenticatedContentReady
                  ? '视频已生成，可通过鉴权内容接口播放和下载'
                  : json.message || data.message || nestedData.message || pollingTask.message,
        }

        persistTask(updated)
        pollingTask = { ...updated }
        if (effectiveStatus === 'succeeded' || effectiveStatus === 'failed' || effectiveStatus === 'result_unavailable') {
          pollersRef.current.delete(taskId)
          setMessage(effectiveStatus === 'succeeded'
            ? `任务 ${taskId} 渲染完成`
            : effectiveStatus === 'result_unavailable'
              ? `任务 ${taskId} 已完成，但播放链接暂未返回；可从历史记录再次查询`
              : `任务 ${taskId} 生成失败，参考图已保留`)
        } else {
          setMessage(effectiveStatus === 'result_pending'
            ? `任务 ${taskId} 已生成，正在获取播放链接`
            : `${pollersRef.current.size || 1} 个任务云端渲染中，${taskId} 当前 ${progress}%`)
          scheduleNext()
        }
      } catch (err: any) {
        if (pollersRef.current.get(taskId) !== poller) return
        poller.errorCount += 1
        const httpStatus = err instanceof PollingHttpError ? err.status : null
        const permanentHttpError = httpStatus !== null && (
          [400, 401, 403, 410, 422].includes(httpStatus) ||
          (httpStatus === 404 && poller.errorCount >= 3)
        )
        const retriesExhausted = poller.errorCount >= MAX_POLL_ERRORS
        if (permanentHttpError || retriesExhausted) {
          const failureReason = httpStatus
            ? `任务查询返回 HTTP ${httpStatus}`
            : `任务查询连续失败 ${poller.errorCount} 次`
          const pausedTask: TaskRecord = {
            ...pollingTask,
            status: 'tracking_paused',
            message: `${failureReason}，已停止自动轮询`,
          }
          persistTask(pausedTask)
          pollingTask = pausedTask
          pollersRef.current.delete(taskId)
          setMessage(`${failureReason}，查询已暂停；点击该历史任务可恢复查询`)
          return
        }
        const retryDelay = Math.min(30000, 4000 * 2 ** Math.min(poller.errorCount - 1, 3))
        setMessage(`任务 ${taskId} 查询失败（${poller.errorCount}/${MAX_POLL_ERRORS}），将自动重试`)
        scheduleNext(retryDelay)
      }
    }

    scheduleNext(1000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submissionInFlightRef.current) {
      setMessage('当前批次仍在调度，请稍候')
      return
    }
    const requestedCount = parseGenerationCount(generationCount)
    if (requestedCount === null) {
      setMessage(`生成次数必须是 ${MIN_GENERATION_COUNT} 到 ${MAX_GENERATION_COUNT} 之间的整数`)
      return
    }
    const availableTaskSlots = MAX_ACTIVE_TASKS - activeTasks.length
    if (requestedCount > availableTaskSlots) {
      setMessage(availableTaskSlots > 0
        ? `当前已有 ${activeTasks.length} 个任务生成中，本次最多还能提交 ${availableTaskSlots} 个`
        : `同时生成任务已达上限 ${MAX_ACTIVE_TASKS}，请等待部分任务完成`)
      return
    }
    const rawPrompt = form.prompt.trim()
    const selectedModelUsesMiniMax = isMiniMaxH3VideoModel(form.model)
    const selectedModelUsesVideoV3 = isVideoV3Model(form.model)
    const selectedModelUsesVideoV2 = isVideoV2Model(form.model)
    const selectedModelUsesVideoResource = selectedModelUsesVideoV2 || selectedModelUsesVideoV3
    const selectedModelUsesGrok = isGrokImagineVideoModel(form.model)
    if (!rawPrompt && (selectedModelUsesVideoResource || selectedModelUsesGrok || selectedModelUsesMiniMax || !legacyReferenceInputPresent)) {
      setMessage('请先输入镜头描述')
      return
    }
    if (uploadingImages || uploadingMediaKind || uploadInFlightRef.current) {
      setMessage('参考文件仍在上传，请等待上传完成后再提交')
      return
    }
    const textModeV2Mentions = selectedModelUsesVideoResource
      ? normalizeVideoV2Mentions(rawPrompt, { images: 0, videos: 0, audios: 0 }).invalidTokens
      : []
    if (mode === 'text' && ((!selectedModelUsesGrok && !selectedModelUsesMiniMax && !selectedModelUsesVideoResource && hasReferenceMentions(rawPrompt)) || textModeV2Mentions.length > 0)) {
      setMessage(selectedModelUsesVideoResource
        ? 'Prompt 中存在参考素材引用，请切换到参考素材模式并上传对应文件'
        : 'Prompt 中存在 @参考图 引用，请切换图生视频并上传对应图片')
      promptRef.current?.focus()
      return
    }
    if (!selectedModelUsesVideoResource && hasCanonicalVideoV2Mention(rawPrompt)) {
      setMessage('@Image、@Video、@Audio 引用仅适用于 video-v2 系列模型')
      promptRef.current?.focus()
      return
    }

    const formSnapshot = { ...form, prompt: rawPrompt }
    const useGrokApi = selectedModelUsesGrok
    const useMiniMaxApi = selectedModelUsesMiniMax
    const useVideoV3Api = isVideoV3Model(formSnapshot.model)
    const useVideoV2Api = isVideoV2Model(formSnapshot.model)
    const useVideoResourceApi = useVideoV3Api || useVideoV2Api
    const useVideoV2Fallback = isVideoV2FallbackModel(formSnapshot.model)
    const videoV2SubmissionLimits = useVideoV3Api ? VIDEO_V3_MEDIA_LIMITS : getVideoV2MediaLimits(formSnapshot.model)
    const submissionMode = mode
    const submissionInputMode = imageInputMode
    const submissionImageSourceMode = imageSourceMode
    if (useVideoResourceApi && submissionMode === 'image') {
      const overLimit = uploadedImages.length > videoV2SubmissionLimits.images ||
        uploadedVideos.length > videoV2SubmissionLimits.videos ||
        uploadedAudios.length > videoV2SubmissionLimits.audios
      if (overLimit) {
        setMessage(`${formSnapshot.model} 最多支持 ${videoV2SubmissionLimits.images} 张图、${videoV2SubmissionLimits.videos} 个视频、${videoV2SubmissionLimits.audios} 个音频，请移除多余素材`)
        return
      }
    }
    if (useMiniMaxApi) {
      if (!isValidMiniMaxH3VideoSeconds(form.duration)) {
        setMessage('MiniMax-H3-933-1440P-GF 的时长必须是 5 到 15 秒之间的整数')
        setShowSettings(true)
        return
      }
      if (!isValidMiniMaxH3VideoSize(form.size)) {
        setMessage('MiniMax-H3-933-1440P-GF 的输出尺寸不支持')
        setShowSettings(true)
        return
      }
      if (uploadedImages.length > MAX_MINIMAX_IMAGES) {
        setMessage(`MiniMax-H3-933-1440P-GF 最多支持 ${MAX_MINIMAX_IMAGES} 张参考图，请移除多余图片`)
        return
      }
      if (uploadedAudios.length > 0 || uploadedVideos.length > 0) {
        setMessage('MiniMax-H3-933-1440P-GF 只支持参考图片，不支持参考音频或参考视频')
        return
      }
    }
    const miniMaxImages = useMiniMaxApi && submissionMode === 'image'
      ? uploadedImages.slice(0, MAX_MINIMAX_IMAGES)
      : []
    const videoV2Images = useVideoResourceApi && submissionMode === 'image'
      ? uploadedImages.slice(0, videoV2SubmissionLimits.images)
      : []
    const grokUploadedImages = useGrokApi && submissionMode === 'image'
      ? uniqueUploadedAssetsById(grokReferenceImages)
      : []
    const videoV2Audios = useVideoResourceApi && submissionMode === 'image'
      ? uploadedAudios.slice(0, videoV2SubmissionLimits.audios)
      : []
    const videoV2Videos = useVideoResourceApi && submissionMode === 'image'
      ? uploadedVideos.slice(0, videoV2SubmissionLimits.videos)
      : []
    const referenceUrls = useMiniMaxApi
      ? miniMaxImages.map((item) => item.url)
      : useVideoResourceApi
      ? videoV2Images.map((item) => item.url)
      : useGrokApi
        ? grokUploadedImages.map((item) => item.url)
        : [...configuredImageUrls]
    const referenceAudioUrls = videoV2Audios.map((item) => item.url)
    const referenceVideoUrls = videoV2Videos.map((item) => item.url)
    const referenceUploadIds = submissionMode === 'image' && (useVideoResourceApi || useMiniMaxApi || submissionImageSourceMode === 'upload')
      ? (useVideoResourceApi
          ? videoV2Images
          : useMiniMaxApi
            ? miniMaxImages
          : useGrokApi
            ? grokUploadedImages
            : submissionInputMode === 'multiple'
              ? uploadedImages
              : uploadedImages.slice(0, 1)).map((item) => item.id)
      : []
    const referenceAudioUploadIds = videoV2Audios.map((item) => item.id)
    const referenceVideoUploadIds = videoV2Videos.map((item) => item.id)
    let submittedPrompt = rawPrompt

    if (useGrokApi) {
      if (submissionMode === 'image' && submissionImageSourceMode !== 'upload') {
        setMessage('grok-imagine-1.5-video 需要上传真实参考图文件，不能提交图片 URL')
        return
      }
      if (!isValidGrokVideoDuration(formSnapshot.duration)) {
        setMessage('grok-imagine-1.5-video 的时长必须是 1 到 15 秒之间的整数')
        setShowSettings(true)
        return
      }
      if (!isValidGrokVideoAspectRatio(formSnapshot.ratio)) {
        setMessage('grok-imagine-1.5-video 仅支持 16:9、9:16、1:1、4:3、3:4、2:3 或 3:2 画幅')
        setShowSettings(true)
        return
      }
      if (!isValidGrokVideoResolutionForReferenceCount(formSnapshot.resolution, grokUploadedImages.length)) {
        setMessage(grokUploadedImages.length > 1
          ? 'grok-imagine-1.5-video 使用多参考图时仅支持 480p 或 720p 分辨率'
          : 'grok-imagine-1.5-video 仅支持 480p、720p 或 1080p 分辨率')
        setShowSettings(true)
        return
      }
      if (grokUploadedImages.length > MAX_GROK_REFERENCE_IMAGES) {
        setMessage(`grok-imagine-1.5-video 最多支持 ${MAX_GROK_REFERENCE_IMAGES} 张参考图，请移除多余图片`)
        return
      }
    }

    if (useVideoV3Api) {
      if (!isValidVideoV3Duration(formSnapshot.duration)) {
        setMessage('video-v3 的时长必须是 4 到 30 秒之间的整数')
        setShowSettings(true)
        return
      }
      if (!isValidVideoV3Ratio(formSnapshot.ratio)) {
        setMessage('video-v3 仅支持 auto、21:9、16:9、4:3、1:1、3:4 或 9:16 画幅')
        setShowSettings(true)
        return
      }
      if (formSnapshot.seed !== '' && !Number.isSafeInteger(formSnapshot.seed)) {
        setMessage('video-v3 的 seed 必须是整数，留空则由上游随机生成')
        setShowSettings(true)
        return
      }
      if (formSnapshot.gridStrength !== '' && !isValidVideoV3GridStrength(formSnapshot.gridStrength)) {
        setMessage('video-v3 的 grid_strength 必须在 0 到 1 之间')
        setShowSettings(true)
        return
      }
    }

    if (useVideoResourceApi) {
      if (useVideoV2Fallback) {
        if (formSnapshot.duration !== 15) {
          setMessage('video-v2-满血兜底版固定生成 15 秒视频')
          setShowSettings(true)
          return
        }
        if (!videoV2FallbackRatioPresets.includes(formSnapshot.ratio)) {
          setMessage('video-v2-满血兜底版仅支持 16:9 或 9:16 画幅')
          setShowSettings(true)
          return
        }
      }
      const totalReferences = referenceUrls.length + referenceAudioUrls.length + referenceVideoUrls.length
      if (submissionMode === 'image' && totalReferences === 0) {
        setMessage('参考素材模式至少需要上传一张图片、一个音频或一个视频')
        return
      }
      const compilation = normalizeVideoV2Mentions(rawPrompt, {
        images: referenceUrls.length,
        audios: referenceAudioUrls.length,
        videos: referenceVideoUrls.length,
      })
      if (!compilation.valid) {
        setMessage(`${compilation.invalidTokens.join('、')} 没有对应素材；请检查图片、音频、视频编号`)
        promptRef.current?.focus()
        return
      }
      submittedPrompt = compilation.prompt
    } else if (useMiniMaxApi && submissionMode === 'image' && referenceUrls.length === 0) {
      setMessage('MiniMax-H3-933-1440P-GF 的参考图模式至少需要上传一张图片')
      return
    } else if (submissionMode === 'image') {
      const minimumReferences = useGrokApi || useMiniMaxApi ? 1 : submissionInputMode === 'multiple' ? 2 : 1
      if (referenceUrls.length < minimumReferences) {
        setMessage(useMiniMaxApi
          ? 'MiniMax-H3-933-1440P-GF 的参考图模式至少需要 1 张图片'
          : submissionInputMode === 'multiple' ? '多图生视频至少需要 2 张参考图' : '图生视频需要 1 张参考图')
        return
      }
      if (useMiniMaxApi) {
        const invalidReferenceIndex = referenceUrls.findIndex((url) => !isHttpUrl(url))
        if (invalidReferenceIndex >= 0) {
          setMessage(`第${invalidReferenceIndex + 1}张参考图外链无效，请重新上传图片`)
          return
        }
      }
      if (!useGrokApi && !useMiniMaxApi) {
        const invalidReferenceIndex = referenceUrls.findIndex((url) => !isHttpUrl(url))
        if (invalidReferenceIndex >= 0) {
          setMessage(`参考图${invalidReferenceIndex + 1}的 URL 为空或格式不正确，请补充或移除该行`)
          return
        }
        const compilation = compileReferenceMentions(rawPrompt, referenceUrls.length)
        if (compilation.invalidTokens.length > 0) {
          setMessage(`${compilation.invalidTokens.join('、')} 没有对应图片，当前共有 ${referenceUrls.length} 张参考图`)
          promptRef.current?.focus()
          return
        }
        if (compilation.incomplete) {
          setMessage('Prompt 中有未完成的 @参考图 引用，请选择具体编号或删除该引用')
          promptRef.current?.focus()
          return
        }
        submittedPrompt = compilation.prompt
      }
    }
    const submissionApiKey = apiKey.trim()
    if (!submissionApiKey) {
      setMessage('请先配置 API Key')
      setShowSettings(true)
      return
    }

    // Lock before any asynchronous file reads so a second click cannot schedule a duplicate batch.
    submissionInFlightRef.current = true
    setSubmitting(true)
    try {
      let grokReferences: GrokVideoInputReference[] = []
      if (useGrokApi && submissionMode === 'image') {
        if (grokUploadedImages.length === 0) {
          setMessage('请先上传至少一张 Grok 参考图')
          return
        }
        try {
          grokReferences = await Promise.all(grokUploadedImages.map(async (uploadedReference, index) => {
            const response = await fetch(`/api/uploads/${encodeURIComponent(uploadedReference.id)}`)
            if (!response.ok) throw new Error(`第 ${index + 1} 张参考图读取失败: HTTP ${response.status}`)
            const blob = await response.blob()
            if (!blob.size) throw new Error(`第 ${index + 1} 张参考图文件为空`)
            if (blob.size > MAX_GROK_REFERENCE_FILE_BYTES) throw new Error(`第 ${index + 1} 张参考图超过 ${MAX_GROK_REFERENCE_FILE_MB}MB`)
            return { id: uploadedReference.id, blob, fileName: uploadedReference.id }
          }))
        } catch (error: any) {
          setMessage(`读取 Grok 参考图失败：${error?.message || '请重新上传图片'}`)
          return
        }
      }

      const payload = useGrokApi
      ? { model: formSnapshot.model, prompt: submittedPrompt }
      : useMiniMaxApi
        ? buildMiniMaxH3SubmitPayload({
            model: formSnapshot.model,
            prompt: submittedPrompt,
            seconds: formSnapshot.duration,
            size: formSnapshot.size,
            audio: formSnapshot.generateAudio,
            images: referenceUrls,
          })
      : useVideoV3Api
        ? buildVideoV3SubmitPayload({
            model: formSnapshot.model,
            prompt: submittedPrompt,
            duration: formSnapshot.duration,
            ratio: formSnapshot.ratio,
            images: referenceUrls,
            videos: referenceVideoUrls,
            audios: referenceAudioUrls,
            generateAudio: formSnapshot.generateAudio,
            seed: formSnapshot.seed,
            bypassFaceCheck: formSnapshot.bypassFaceCheck,
            gridStrength: formSnapshot.gridStrength,
          })
      : useVideoV2Api
        ? buildVideoV2SubmitPayload({
            model: formSnapshot.model,
            prompt: submittedPrompt,
            images: referenceUrls,
            audios: referenceAudioUrls,
            videos: referenceVideoUrls,
            aspectRatio: formSnapshot.ratio,
            duration: formSnapshot.duration,
            resolution: formSnapshot.resolution,
            generateAudio: formSnapshot.generateAudio,
          })
        : buildVideoSubmitPayload(
          formSnapshot,
          submittedPrompt,
          submissionMode,
          submissionInputMode,
          referenceUrls,
          )
      const createToken = () => typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const batchId = `batch_${createToken()}`
      const batchCreatedAt = Date.now() / 1000
      const plans = createBatchPlans(
        requestedCount,
        payload,
        (index) => `${batchId}_${index + 1}_${createToken()}`,
      )

      setMessage(`正在并发调度 ${requestedCount} 个任务...`)

      const results = await runWithConcurrency(plans, MAX_POST_CONCURRENCY, async (plan) => {
        let res: Response
        try {
          const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${submissionApiKey}`,
            'Idempotency-Key': plan.idempotencyKey,
          }
          let requestBody: BodyInit
          if (useGrokApi) {
            if (submissionMode === 'image' && grokReferences.length === 0) throw new Error('Grok 参考图尚未就绪')
            requestBody = createGrokVideoFormData({
              model: formSnapshot.model,
              prompt: submittedPrompt,
              seconds: formSnapshot.duration,
              ratio: formSnapshot.ratio,
              resolution: formSnapshot.resolution,
              inputReferences: grokReferences,
            })
          } else {
            headers['Content-Type'] = 'application/json'
            requestBody = JSON.stringify(plan.payload)
          }

          res = await fetch(`${API_BASE_URL}${getVideoSubmitPath(formSnapshot.model)}`, {
            method: 'POST',
            headers,
            body: requestBody,
          })
        } catch (error: any) {
          throw new SubmissionStateUnknownError(
            `网络中断，无法确认服务端是否已接收任务：${error?.message || '未知网络错误'}`,
            plan.idempotencyKey,
            plan.index + 1,
          )
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          if (res.status === 408 || res.status >= 500) {
            throw new SubmissionStateUnknownError(
              `网关返回 HTTP ${res.status}，无法确认上游是否已创建任务${errText ? `：${errText}` : ''}`,
              plan.idempotencyKey,
              plan.index + 1,
            )
          }
          throw new Error(`HTTP ${res.status}: ${errText}`)
        }

        let json: any
        try {
          json = await res.json()
        } catch {
          throw new SubmissionStateUnknownError('服务端已响应成功，但响应内容无法识别', plan.idempotencyKey, plan.index + 1)
        }
        const rawData = json?.data ?? json
        const data = Array.isArray(rawData) ? rawData[0] : rawData
        const rawTaskId = data?.task_id || data?.id || json?.task_id || json?.id
        if (!rawTaskId) {
          throw new SubmissionStateUnknownError('服务端已响应成功，但未返回 task_id', plan.idempotencyKey, plan.index + 1)
        }
        const taskId = String(rawTaskId)
        const responseStatus = String(data?.status || json?.status || 'queued').toLowerCase()
        const initialStatus: TaskStatus = ['success', 'succeeded', 'completed'].includes(responseStatus)
          ? 'succeeded'
          : ['failed', 'failure'].includes(responseStatus)
            ? 'failed'
            : ['processing', 'in_progress'].includes(responseStatus)
              ? 'processing'
              : 'queued'
        const resultUrl = data?.result_url || data?.video_url || data?.url || data?.metadata?.url || json?.result_url || json?.url || json?.metadata?.url
        const rawInitialProgress = Number(data?.progress ?? json?.progress ?? 0)
        const initialProgress = Number.isFinite(rawInitialProgress)
          ? Math.min(100, Math.max(0, rawInitialProgress))
          : 0
        const newTask: TaskRecord = {
          id: data?.id || taskId,
          task_id: taskId,
          object: 'video',
          model: formSnapshot.model,
          status: resultUrl ? 'succeeded' : initialStatus,
          progress: resultUrl ? 100 : initialProgress,
          created_at: batchCreatedAt,
          duration: formSnapshot.duration,
          seconds: useMiniMaxApi ? formSnapshot.duration : undefined,
          ratio: formSnapshot.ratio,
          quality: formSnapshot.quality,
          resolution: useGrokApi ? formSnapshot.resolution : useVideoV2Fallback ? '720p' : useVideoV3Api ? VIDEO_V3_RESOLUTION : useVideoV2Api ? formSnapshot.resolution : undefined,
          generate_audio: useVideoV2Fallback ? false : useVideoResourceApi ? formSnapshot.generateAudio : undefined,
          size: useMiniMaxApi ? formSnapshot.size : undefined,
          audio: useMiniMaxApi ? formSnapshot.generateAudio : undefined,
          seed: useVideoV3Api && formSnapshot.seed !== '' ? formSnapshot.seed : undefined,
          bypass_face_check: useVideoV3Api ? formSnapshot.bypassFaceCheck : undefined,
          grid_strength: useVideoV3Api && formSnapshot.gridStrength !== '' ? formSnapshot.gridStrength : undefined,
          prompt: rawPrompt,
          submitted_prompt: submittedPrompt,
          reference_count: submissionMode === 'image' ? referenceUrls.length : 0,
          reference_audio_count: useVideoResourceApi ? referenceAudioUrls.length : 0,
          reference_video_count: useVideoResourceApi ? referenceVideoUrls.length : 0,
          reference_upload_ids: referenceUploadIds,
          reference_audio_upload_ids: referenceAudioUploadIds,
          reference_video_upload_ids: referenceVideoUploadIds,
          video_mode: submissionMode,
          image_input_mode: submissionMode === 'image' ? submissionInputMode : undefined,
          batch_id: batchId,
          batch_index: plan.index + 1,
          batch_total: requestedCount,
          idempotency_key: plan.idempotencyKey,
          result_url: resultUrl,
          preview_url: data?.preview_url || data?.thumbnail_url || data?.cover_url || data?.poster_url,
          message: data?.message || json?.message,
        }

        persistTask(newTask)
        if (isActiveTaskStatus(newTask.status)) startPolling(newTask)
        return newTask
      })

      const successfulTasks = results
        .filter((result): result is PromiseFulfilledResult<TaskRecord> => result.status === 'fulfilled')
        .map((result) => result.value)
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      const uncertainFailures = failures
        .map((result) => result.reason)
        .filter((reason): reason is SubmissionStateUnknownError => reason instanceof SubmissionStateUnknownError)
      rememberUncertainSubmissions(uncertainFailures.map((failure) => ({
        batch_id: batchId,
        batch_index: failure.batchIndex,
        created_at: batchCreatedAt,
        idempotency_key: failure.idempotencyKey,
      })))

      if (successfulTasks[0]) setSelectedTaskId(successfulTasks[0].task_id)
      if (successfulTasks.length === 0) {
        if (uncertainFailures.length > 0) {
          setMessage(`${uncertainFailures.length} 个请求状态未知，请勿立即重复提交；全部幂等键已保留在页面警告中`)
        } else {
          const firstFailure = failures[0]?.reason
          setMessage(`提交失败: ${firstFailure instanceof Error ? firstFailure.message : '所有任务均提交失败'}；参考图已保留`)
        }
        return
      }
      setMessage(uncertainFailures.length > 0
        ? `已接管 ${successfulTasks.length} 个任务，另有 ${uncertainFailures.length} 个状态未知；请勿重复提交未知部分，全部幂等键已保留`
        : failures.length > 0
          ? `已接管 ${successfulTasks.length} 个任务，${failures.length} 个明确提交失败；可按失败数量重新提交`
          : `已接管 ${successfulTasks.length} 个任务，正在异步生成；可立即提交下一批`)
      setShowSettings(false)
    } catch (err: any) {
      setMessage(`提交过程异常: ${err.message || '未知错误'}；请先核对历史记录再决定是否重试`)
    } finally {
      submissionInFlightRef.current = false
      setSubmitting(false)
    }
  }

  function renderVideoV2MediaSection(kind: V2MediaKind) {
    const config = {
      ...videoV2MediaConfig[kind],
      maxItems: getVideoV2MediaLimit(kind),
      ...(kind === 'image' ? videoV2ImageSizeLimit : {}),
    }
    const assets = getVideoV2Assets(kind)
    const Icon = kind === 'image' ? Images : kind === 'audio' ? FileMusic : FileVideoCamera
    const isUploading = uploadingMediaKind === kind
    const isDragging = draggingMediaKind === kind
    const inputId = `video-v2-${kind}-file`

    return (
      <section className={`video-v2-media-section media-${kind}`} key={kind} aria-labelledby={`${inputId}-title`}>
        <div className="video-v2-media-heading">
          <span id={`${inputId}-title`}><Icon size={16} aria-hidden="true" />{config.label}</span>
          <span className="video-v2-media-count">{assets.length}/{config.maxItems}</span>
        </div>
        <label
          className={`video-v2-media-dropzone ${isDragging ? 'is-dragging' : ''} ${referenceControlsLocked ? 'is-disabled' : ''}`}
          htmlFor={inputId}
          onDragEnter={(event) => {
            event.preventDefault()
            if (!referenceControlsLocked) setDraggingMediaKind(kind)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            if (draggingMediaKind === kind) setDraggingMediaKind(null)
          }}
          onDrop={(event) => handleVideoV2MediaDrop(kind, event)}
        >
          <input
            id={inputId}
            type="file"
            accept={config.accept}
            multiple
            disabled={referenceControlsLocked || assets.length >= config.maxItems}
            aria-describedby={`${inputId}-hint`}
            onChange={(event) => {
              void handleVideoV2MediaFiles(kind, event.target.files)
              event.target.value = ''
            }}
          />
          <span className="video-v2-media-drop-icon" aria-hidden="true">
            {isUploading ? <LoaderCircle className="spin" size={20} /> : <UploadCloud size={20} />}
          </span>
          <span className="video-v2-media-drop-copy">
            <strong>{isUploading ? '正在上传...' : isDragging ? `松开添加${config.label}` : `选择或拖入${config.label}`}</strong>
            <span>{config.formats} · 单个 {config.maxMegabytes}MB</span>
          </span>
        </label>
        <span id={`${inputId}-hint`} className="sr-only">最多 {config.maxItems} 个，文件会在项目域名暂存 12 小时。</span>
        {assets.length > 0 && (
          <div className="video-v2-media-list">
            {assets.map((asset, index) => (
              <div className="video-v2-media-item" key={asset.id}>
                {kind === 'image' ? (
                  <img src={asset.url} alt="" aria-hidden="true" loading="lazy" />
                ) : (
                  <span className="video-v2-media-type" aria-hidden="true"><Icon size={15} /></span>
                )}
                <span className="video-v2-media-name" title={asset.name || asset.id}>{asset.name || asset.id}</span>
                <button
                  type="button"
                  className="video-v2-mention-btn"
                  onClick={() => insertVideoV2MediaMention(kind, index + 1)}
                  disabled={referenceEditingLocked}
                  aria-label={`在 Prompt 中插入 @${config.token}${index + 1}`}
                  title={`插入 @${config.token}${index + 1}`}
                >
                  <AtSign size={13} aria-hidden="true" />{config.token}{index + 1}
                </button>
                <button
                  type="button"
                  className="video-v2-remove-btn"
                  onClick={() => void removeVideoV2Asset(kind, asset)}
                  disabled={activeMediaUploadIds.has(asset.id) || referenceEditingLocked}
                  aria-label={`移除${config.label}${index + 1}`}
                  title={activeMediaUploadIds.has(asset.id) ? '生成中的任务仍在使用这个文件' : `移除${config.label}`}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <main className="studio-shell">
      <section className="hero-band">
        <div className="eyebrow">
          <Sparkles size={14} />
          Gen-Video Studio
        </div>
        <h1>构建你的光影视界</h1>
        <p className="lede">输入镜头描述与运动轨迹，强大的云端架构即时为你生成电影级画面，完美适配各类画幅与模型引擎。</p>
        <div className="status-row">
          <span className={`status-pill status-${String(currentStatus).toLowerCase()}`}>
            <LoaderCircle className={['processing', 'result_pending'].includes(String(currentStatus).toLowerCase()) ? 'spin' : ''} size={14} />
            {currentLabel}
          </span>
          <span className="badge" role="status" aria-live="polite" aria-atomic="true">
            <Terminal size={14} />
            {message}
          </span>
        </div>
      </section>

      <section className="workspace-grid">
        <aside className="retention-notice" role="note">
          <Info size={18} aria-hidden="true" />
          <p><strong>温馨提示：</strong>平台不会永久保存数据，生成的视频仅保留 48 小时，请及时下载备份，逾期丢失概不负责。</p>
        </aside>

        {uncertainSubmissions.length > 0 && (
          <aside className="submission-warning" role="alert">
            <Info size={18} aria-hidden="true" />
            <div className="submission-warning-content">
              <strong>有 {uncertainSubmissions.length} 个提交请求状态未知</strong>
              <p>服务端可能已经创建并计费，请勿直接重复提交。请使用下列幂等键核对任务。</p>
              <details>
                <summary>查看全部幂等键</summary>
                <div className="submission-warning-keys">
                  {uncertainSubmissions.map((item) => (
                    <code key={item.idempotency_key}>批次 {item.batch_index} · {formatTaskDate(item.created_at)} · {item.idempotency_key}</code>
                  ))}
                </div>
              </details>
            </div>
            <div className="submission-warning-actions">
              <button
                type="button"
                onClick={() => void copyJson(uncertainSubmissions.map((item) => item.idempotency_key).join('\n'))}
                aria-label="复制全部状态未知幂等键"
                title="复制全部幂等键"
              >
                <Copy size={16} />
              </button>
              <button
                type="button"
                onClick={clearUncertainSubmissions}
                aria-label="清除已核对的状态未知记录"
                title="核对完成后清除"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </aside>
        )}
        
        {/* 沉浸式主舞台 */}
        {resultHref ? (
          <div className="player-container">
            <video
              key={resultHref}
              className="player"
              controls
              playsInline
              autoPlay
              loop
              preload="metadata"
              {...({ referrerPolicy: 'no-referrer' } as Record<string, string>)}
              onError={() => setMessage(selectedTaskUsesProtectedContent
                ? '鉴权视频流加载失败，请检查 API Key 后重试'
                : '视频流加载失败，请检查服务器的 /api/video-proxy 反代配置')}
              src={resultHref}
            />
            <div className="player-meta" style={{ padding: '16px' }}>
              <div className="mono result-url" style={{ fontSize: 13, opacity: 0.7 }}>
                {selectedTaskUsesProtectedContent ? '鉴权视频流（仅当前浏览器会话可播放）' : resultHref}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={downloadVideo}
                  disabled={downloading}
                  aria-busy={downloading}
                  title="下载视频"
                >
                  {downloading ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
                  {downloading ? '准备中' : '下载视频'}
                </button>
                {!selectedTaskUsesProtectedContent && (
                  <button type="button" className="ghost-btn" onClick={() => copyJson(resultHref)}>
                    <Copy size={16} /> 复制链接
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : selectedTaskUsesProtectedContent && loadingGrokVideo ? (
          <div className="player-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="empty-state" style={{ border: 'none', background: 'transparent' }} role="status" aria-live="polite">
              <LoaderCircle className="spin" size={42} style={{ opacity: 0.72, marginBottom: 16 }} />
              <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>正在加载鉴权视频</div>
              <p style={{ marginTop: 8, color: 'rgba(255,255,255,0.4)' }}>视频内容会临时保存在浏览器内存中，不写入服务器磁盘</p>
            </div>
          </div>
        ) : (
          <div className="player-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="empty-state" style={{ border: 'none', background: 'transparent' }}>
              <Film size={54} style={{ opacity: 0.15, marginBottom: 16 }} />
              <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>大幕将启</div>
              <p style={{ marginTop: 8, color: 'rgba(255,255,255,0.4)' }}>配置密钥并输入描述，生成的画面将在此全景播放</p>
            </div>
          </div>
        )}

        {/* 弱化的任务状态和历史展示 */}
        {task && (
          <div className="task-card">
            <div className="task-topline">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={`status-pill status-${String(task.status).toLowerCase()}`} style={{ border: 'none', background: 'rgba(0,0,0,0.3)' }}>
                  {task.progress}%
                </span>
                <span className="mono" style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>ID: {task.task_id}</span>
                <span className="badge" style={{ border: 'none', background: 'rgba(255,255,255,0.05)' }}>{task.model}</span>
              </div>
              <button type="button" className="inline-btn" onClick={() => copyJson(task.task_id)}>
                <Copy size={14} />
              </button>
            </div>

            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${task.progress}%` }} />
            </div>

          </div>
        )}

        {history.length > 0 && (
          <section className={`history-panel ${historyCollapsed ? 'is-collapsed' : ''}`} aria-labelledby="history-title">
            <div className="history-panel-head">
              <div>
                <div className="history-title-row">
                  <HistoryIcon size={18} />
                  <h2 id="history-title">历史视频</h2>
                  <span className="history-count">{history.length}</span>
                </div>
                <p>保留最近 {HISTORY_LIMIT} 条，记录只存于当前浏览器。</p>
              </div>
              <div className="history-header-actions">
                <button
                  type="button"
                  className="history-clear-btn"
                  onClick={clearHistory}
                  disabled={activeTasks.length > 0 || submitting}
                  title={activeTasks.length > 0 || submitting ? '仍有任务生成中，暂不可清空' : '清空历史记录'}
                >
                  <Trash2 size={15} /> 清空
                </button>
                <button
                  type="button"
                  className="history-collapse-btn"
                  aria-expanded={!historyCollapsed}
                  aria-controls="history-content"
                  aria-label={historyCollapsed ? '展开历史记录' : '收起历史记录'}
                  title={historyCollapsed ? '展开历史记录' : '收起历史记录'}
                  onClick={toggleHistoryCollapsed}
                >
                  {historyCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>
              </div>
            </div>

            <div id="history-content" className="history-content" hidden={historyCollapsed}>
              <div className="history-toolbar">
                <div className="history-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder="搜索 Prompt、任务 ID 或模型"
                    aria-label="搜索历史视频"
                  />
                  {historyQuery && (
                    <button type="button" className="history-search-clear" onClick={() => setHistoryQuery('')} aria-label="清除搜索">
                      <X size={15} />
                    </button>
                  )}
                </div>
                <span className="history-result-count">{filteredHistory.length} 条结果</span>
              </div>

              {filteredHistory.length > 0 ? (
                <div className="history-list">
                  {filteredHistory.map((item) => {
                    const isCurrent = item.task_id === task?.task_id
                    const itemStatus = String(item.status).toLowerCase()
                    const itemVideoHref = resolveVideoHref(item.result_url)
                    const itemPreviewHref = resolveAssetHref(item.preview_url)
                    return (
                      <article key={item.task_id} className={`history-item ${isCurrent ? 'is-current' : ''}`}>
                        <button
                          type="button"
                          className="history-item-main"
                          onClick={() => selectHistoryItem(item)}
                          aria-haspopup="dialog"
                          aria-label={`查看任务详情，${statusLabel[item.status] ?? item.status}${item.batch_total && item.batch_total > 1 ? `，批次 ${item.batch_index}/${item.batch_total}` : ''}，任务 ${item.task_id}`}
                        >
                          <span className="history-item-preview" aria-hidden="true">
                            <Film className="history-item-preview-fallback" size={18} />
                            {itemPreviewHref ? (
                              <img
                                src={itemPreviewHref}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(event) => { event.currentTarget.hidden = true }}
                              />
                            ) : itemVideoHref ? (
                              <video
                                src={itemVideoHref}
                                muted
                                playsInline
                                preload="metadata"
                                {...({ referrerPolicy: 'no-referrer' } as Record<string, string>)}
                                onLoadedMetadata={(event) => {
                                  if (Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0.1) {
                                    event.currentTarget.currentTime = 0.1
                                  }
                                }}
                                onError={(event) => { event.currentTarget.hidden = true }}
                              />
                            ) : null}
                          </span>
                          <span className="history-item-copy">
                            <strong>{item.prompt || '未记录 Prompt 的视频任务'}</strong>
                            <span className="history-item-meta">
                              {formatTaskDate(item.created_at)} <span aria-hidden="true">·</span> {item.seconds ?? item.duration ?? '-'}s <span aria-hidden="true">·</span> {isMiniMaxH3VideoModel(item.model) ? item.size ?? '-' : item.ratio ?? '-'} <span aria-hidden="true">·</span> {isMiniMaxH3VideoModel(item.model) ? (item.audio === undefined ? '-' : item.audio ? '音频' : '无音频') : item.resolution ?? item.quality?.toUpperCase() ?? '-'}
                              {item.batch_total && item.batch_total > 1 ? <> <span aria-hidden="true">·</span> 批次 {item.batch_index}/{item.batch_total}</> : null}
                            </span>
                            <span className="history-item-id mono">{item.model} / {item.task_id}</span>
                          </span>
                        </button>
                        <div className="history-item-actions">
                          <span className={`history-status status-${itemStatus}`}>{statusLabel[item.status] ?? item.status}</span>
                          <button type="button" className="inline-btn" onClick={() => reuseHistoryPrompt(item)} aria-label="复用这条 Prompt" title="复用 Prompt">
                            <Sparkles size={15} />
                          </button>
                          <button type="button" className="inline-btn" onClick={() => copyJson(item.task_id)} aria-label="复制任务 ID" title="复制任务 ID">
                            <Copy size={15} />
                          </button>
                          <button
                            type="button"
                            className="inline-btn danger-btn"
                            onClick={() => removeHistoryItem(item.task_id)}
                            disabled={isActiveTaskStatus(item.status)}
                            aria-label={isActiveTaskStatus(item.status) ? '该任务生成中，暂不可删除' : '删除历史记录'}
                            title={isActiveTaskStatus(item.status) ? '该任务生成中，暂不可删除' : '删除历史记录'}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="history-empty">没有匹配的历史视频</div>
              )}
            </div>
          </section>
        )}

      </section>

      {/* 底部悬浮控制舱 */}
      <div className={`floating-console ${consoleCollapsed ? 'is-collapsed' : ''}`}>
        <form className="console-form" onSubmit={handleSubmit}>
          <div className="console-header">
            <span className="console-title">
              <Sparkles size={14} /> 生成控制
            </span>
            <button
              type="button"
              className="console-toggle"
              aria-expanded={!consoleCollapsed}
              aria-label={consoleCollapsed ? '展开生成输入' : '收起生成输入'}
              title={consoleCollapsed ? '展开生成输入' : '收起生成输入'}
              onClick={() => setConsoleCollapsed((value) => !value)}
            >
              {consoleCollapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>

          <div className="console-collapsible">
            <div className="mode-toolbar" role="group" aria-label="生成模式">
              <span className="options-group-label">
                <Sparkles size={14} /> 生成模式
              </span>
              <div className="segmented mode-segmented">
                <button
                  type="button"
                  className={`segmented-item ${mode === 'text' ? 'is-active' : ''}`}
                  aria-pressed={mode === 'text'}
                  onClick={() => changeVideoMode('text')}
                  disabled={referenceControlsLocked}
                >
                  <Terminal size={14} /> 文生视频
                </button>
                <button
                  type="button"
                  className={`segmented-item ${mode === 'image' ? 'is-active' : ''}`}
                  aria-pressed={mode === 'image'}
                  onClick={() => changeVideoMode('image')}
                  disabled={referenceControlsLocked}
                >
                  <ImageIcon size={14} /> {videoResourceModelSelected ? '参考素材' : '图生视频'}
                </button>
              </div>
            </div>

            {mode === 'image' && (videoResourceModelSelected ? (
              <div className="video-v2-media-panel">
                <div className="video-v2-media-panel-head">
                  <div>
                    <strong>参考素材</strong>
                     <span>提交时会以外链数组发送给当前模型的 JSON 协议</span>
                  </div>
                  <span className="badge">{videoV2MediaLimits.images} 图 · {videoV2MediaLimits.audios} 音频 · {videoV2MediaLimits.videos} 视频</span>
                </div>
                <div className="video-v2-media-grid">
                  {(['image', 'audio', 'video'] as V2MediaKind[]).map(renderVideoV2MediaSection)}
                </div>
                <div className="field-hint">
                  {videoV3ModelSelected
                    ? 'SD2.5 以 images、videos、audios 外链数组提交；图片最多 30 张，视频和音频各最多 10 个。同一类重复外链会自动去重。'
                    : 'Prompt 可使用 @Image1、@Video1、@Audio1 指定素材；不填写引用时仍会提交全部已上传素材。'}
                </div>
              </div>
            ) : (
              <div className="reference-image-panel">
                <div className="reference-image-fields">
                  <div className="reference-image-toolbar">
                    <span className="field-label">参考图输入</span>
                    <div className="segmented image-source-segmented" role="group" aria-label="参考图来源">
                      <button
                        type="button"
                        className={`segmented-item ${imageSourceMode === 'upload' ? 'is-active' : ''}`}
                        aria-pressed={imageSourceMode === 'upload'}
                        onClick={() => changeImageSourceMode('upload')}
                        disabled={referenceControlsLocked}
                      >
                        本地上传
                      </button>
                      <button
                        type="button"
                        className={`segmented-item ${imageSourceMode === 'url' ? 'is-active' : ''}`}
                        aria-pressed={imageSourceMode === 'url'}
                        onClick={() => changeImageSourceMode('url')}
                          disabled={referenceControlsLocked || grokModelSelected || miniMaxModelSelected}
                      >
                        图片 URL
                      </button>
                    </div>
                  </div>
                  {grokModelSelected || miniMaxModelSelected ? (
                    <div className="reference-image-toolbar">
                      <span className="field-label">参考图提交</span>
                      <span className="badge">最多 {referenceImageLimit} 张 · 按上传顺序发送</span>
                    </div>
                  ) : (
                    <div className="reference-image-toolbar">
                      <span className="field-label">图片数量</span>
                      <div className="segmented image-input-segmented" role="group" aria-label="参考图数量">
                        <button
                          type="button"
                          className={`segmented-item ${imageInputMode === 'single' ? 'is-active' : ''}`}
                          aria-pressed={imageInputMode === 'single'}
                          onClick={() => changeImageInputMode('single')}
                          disabled={referenceControlsLocked}
                        >
                          单图
                        </button>
                        <button
                          type="button"
                          className={`segmented-item ${imageInputMode === 'multiple' ? 'is-active' : ''}`}
                          aria-pressed={imageInputMode === 'multiple'}
                          onClick={() => changeImageInputMode('multiple')}
                          disabled={referenceControlsLocked}
                        >
                          多图
                        </button>
                      </div>
                    </div>
                  )}

                  {imageSourceMode === 'upload' ? (
                    <div className="field">
                      <span className="field-label">上传参考图</span>
                      <label
                        className={`image-dropzone ${draggingImages ? 'is-dragging' : ''} ${uploadingImages || referenceEditingLocked ? 'is-disabled' : ''}`}
                        htmlFor="reference-image-file"
                        onDragEnter={(event) => {
                          event.preventDefault()
                          if (!uploadingImages && !referenceEditingLocked) setDraggingImages(true)
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'copy'
                        }}
                        onDragLeave={(event) => {
                          event.preventDefault()
                          setDraggingImages(false)
                        }}
                        onDrop={handleImageDrop}
                      >
                        <input
                          id="reference-image-file"
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          multiple={grokModelSelected || miniMaxModelSelected || imageInputMode === 'multiple'}
                          aria-describedby="reference-image-upload-hint"
                          onChange={(event) => {
                            void handleImageFiles(event.target.files)
                            event.target.value = ''
                          }}
                          disabled={uploadingImages || referenceEditingLocked}
                        />
                        <span className="image-dropzone-icon" aria-hidden="true">
                          {uploadingImages ? <LoaderCircle className="spin" size={22} /> : <UploadCloud size={22} />}
                        </span>
                        <span className="image-dropzone-copy">
                          <strong>{uploadingImages ? '正在上传...' : draggingImages ? '松开即可添加图片' : '点击选择或拖拽图片到这里'}</strong>
                          <span>{grokModelSelected || miniMaxModelSelected ? `支持分批添加，最多 ${referenceImageLimit} 张` : imageInputMode === 'multiple' ? `支持分批添加，最多 ${referenceImageLimit} 张` : '单图模式会替换当前图片'}</span>
                        </span>
                        <span className="image-dropzone-count">
                          {grokModelSelected || miniMaxModelSelected ? `${currentUploadedImages.length}/${referenceImageLimit}` : imageInputMode === 'multiple' ? `${currentUploadedImages.length}/${referenceImageLimit}` : currentUploadedImages.length > 0 ? '1/1' : '0/1'}
                        </span>
                      </label>
                      <div className="field-hint" id="reference-image-upload-hint">图片会暂存到项目域名下并保留 12 小时；本站单张最大 {grokModelSelected ? MAX_GROK_REFERENCE_FILE_MB : MAX_REFERENCE_FILE_MB}MB。</div>
                      {currentUploadedImages.length > 0 && (
                        <div className="uploaded-image-list">
                          {currentUploadedImages.map((item, index) => (
                            <span className="uploaded-image-name" key={item.id} title={item.id}>
                              <span>{index + 1}. {item.id}</span>
                              <button
                                type="button"
                                onClick={() => void removeUploadedImage(item)}
                                aria-label={`移除第 ${index + 1} 张参考图`}
                                title={activeReferenceUploadIds.has(item.id) ? '生成中的任务仍在使用这张图' : '移除参考图'}
                                disabled={activeReferenceUploadIds.has(item.id) || referenceEditingLocked}
                              >
                                <X size={14} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : imageInputMode === 'single' ? (
                    <div className="field">
                      <label className="field-label" htmlFor="reference-image-url">参考图 URL</label>
                      <div className="input-with-icon">
                        <Link2 size={16} aria-hidden="true" />
                        <input
                          id="reference-image-url"
                          type="url"
                          value={imageUrls[0] ?? ''}
                          onChange={(e) => updateImageUrl(0, e.target.value)}
                          onBlur={() => handleImageUrlBlur(0)}
                          placeholder="https://example.com/reference.jpg"
                          aria-describedby="reference-image-hint"
                          required
                          disabled={referenceControlsLocked}
                        />
                        {imageUrls[0] && (
                          <button
                            type="button"
                            className="clear-input-btn"
                            onClick={() => clearImageUrl(0)}
                            aria-label="清除参考图 URL"
                            title="清除参考图 URL"
                            disabled={referenceControlsLocked}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="field">
                      <label className="field-label" htmlFor="reference-image-url-0">参考图 URL（每行一张，至少 2 张）</label>
                      <div className="multi-image-url-list">
                        {imageUrls.map((value, index) => (
                          <div className="input-with-icon" key={`image-url-${index}`}>
                            <Link2 size={16} aria-hidden="true" />
                            <input
                              id={`reference-image-url-${index}`}
                              type="url"
                              value={value}
                              onChange={(e) => updateImageUrl(index, e.target.value)}
                              onBlur={() => handleImageUrlBlur(index)}
                              placeholder={`https://example.com/reference-${index + 1}.jpg`}
                              required
                              disabled={referenceControlsLocked}
                            />
                            {imageUrls.length > 1 && (
                              <button
                                type="button"
                                className="clear-input-btn"
                                onClick={() => removeImageUrl(index)}
                                aria-label={`移除第 ${index + 1} 张参考图 URL`}
                                title="移除这张参考图"
                                disabled={referenceControlsLocked}
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          className="secondary-btn add-image-btn"
                          onClick={() => setImageUrls((current) => [...current, ''])}
                          disabled={referenceControlsLocked || imageUrls.length >= MAX_REFERENCE_IMAGES}
                        >
                          <Plus size={15} /> {imageUrls.length >= MAX_REFERENCE_IMAGES ? `已达 ${MAX_REFERENCE_IMAGES} 张` : '添加图片'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="field-hint" id="reference-image-hint">
                    {grokModelSelected
                      ? 'Grok Imagine 1.5 仅支持本地上传的真实参考图文件；提交时会按上传顺序重复写入 multipart 的 input_reference 字段，不使用图片 URL 或 @参考图引用。实际格式、数量与请求体限制以渠道返回为准。'
                      : miniMaxModelSelected
                        ? 'MiniMax-H3-933-1440P-GF 使用项目域名生成临时图片外链，提交时以 images URL 数组发送，最多 5 张；服务器每 12 小时清理过期文件。'
                      : imageSourceMode === 'upload'
                        ? '任务成功或失败后仍可复用，服务器每 12 小时清理一次已超过 12 小时的图片。'
                        : '使用上游可访问的图片直链，只发送 URL，不上传文件到服务器。'}
                  </div>
                </div>
                {referencePreviewItems.length > 0 && (
                  <div className={`reference-image-previews ${!grokModelSelected && imageInputMode === 'single' ? 'is-single' : ''}`}>
                    {referencePreviewItems.map((item) => grokModelSelected || miniMaxModelSelected ? (
                      <div className="reference-image-static" key={item.key}>
                        <img className="reference-image-preview" src={item.url} alt={`${miniMaxModelSelected ? 'MiniMax-H3' : 'Grok'} 参考图${item.number}`} loading="lazy" />
                        <span>参考图{item.number}</span>
                      </div>
                    ) : (
                      <button
                        key={item.key}
                        type="button"
                        className="reference-image-mention"
                        onClick={() => insertReferenceMention(item.number)}
                        disabled={referenceEditingLocked}
                        aria-label={`在 Prompt 中插入 @参考图${item.number}`}
                        title={`插入 @参考图${item.number}`}
                      >
                        <img className="reference-image-preview" src={item.url} alt={`参考图${item.number}`} loading="lazy" />
                        <span><AtSign size={12} aria-hidden="true" />参考图{item.number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* 输入主区域 */}
            <div className="console-main-row prompt-row">
              <div className="field prompt-field">
                <div
                  className={`prompt-editor ${draggingPromptFile ? 'is-file-dragging' : ''}`}
                  onDragEnter={handlePromptDragEnter}
                  onDragOver={handlePromptDragOver}
                  onDragLeave={handlePromptDragLeave}
                  onDrop={handlePromptDrop}
                >
                <input
                  ref={promptFileInputRef}
                  className="prompt-file-input"
                  type="file"
                  accept=".json,.md,.markdown,application/json,text/markdown"
                  aria-label="选择 JSON 或 Markdown Prompt 文件"
                  onChange={(event) => {
                    void handlePromptFiles(event.target.files)
                    event.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="prompt-file-import-btn"
                  onClick={() => promptFileInputRef.current?.click()}
                  disabled={importingPromptFile}
                  aria-label="从 JSON 或 Markdown 导入 Prompt"
                  title="从 JSON 或 Markdown 导入 Prompt"
                >
                  {importingPromptFile ? <LoaderCircle className="spin" size={17} /> : <FileText size={17} />}
                </button>
                {draggingPromptFile && (
                  <div className="prompt-file-drop-overlay" role="status" aria-live="polite">
                    <FileText size={20} aria-hidden="true" />
                    <span>松开导入 JSON / Markdown</span>
                  </div>
                )}
                <textarea
                  ref={promptRef}
                  id="video-prompt"
                  value={form.prompt}
                  onChange={handlePromptChange}
                  onClick={handlePromptCursorChange}
                  onSelect={handlePromptCursorChange}
                  onKeyDown={handlePromptKeyDown}
                  onBlur={() => setActiveMention(null)}
                  placeholder="描述你要生成的视频画面（例如：光晕掠过湿润的赛博朋克街道，镜头平稳推进，雨水从黑色风衣滴落...）"
                  aria-label="视频生成 Prompt"
                  aria-describedby="prompt-file-import-hint"
                  aria-busy={importingPromptFile}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={mentionMenuOpen}
                  aria-controls={mentionMenuOpen ? 'reference-mention-options' : undefined}
                  aria-activedescendant={mentionMenuOpen ? `reference-mention-option-${mentionOptions[activeMentionIndex]?.number ?? mentionOptions[0]?.number}` : undefined}
                  required={videoResourceModelSelected || grokModelSelected || miniMaxModelSelected || !legacyReferenceInputPresent}
                />
                  <span id="prompt-file-import-hint" className="sr-only">支持导入 JSON 或 Markdown 文件内容并插入当前 Prompt。</span>
                  {mentionMenuOpen && (
                    <div id="reference-mention-options" className="reference-mention-menu" role="listbox" aria-label="选择参考图">
                      {mentionOptions.map((item, index) => (
                        <button
                          key={item.key}
                          id={`reference-mention-option-${item.number}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeMentionIndex}
                          className={index === activeMentionIndex ? 'is-active' : ''}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => insertReferenceMention(item.number)}
                        >
                          <img src={item.url} alt="" aria-hidden="true" />
                          <span><strong>@参考图{item.number}</strong><small>REFERENCE_{item.number - 1}</small></span>
                          <AtSign size={16} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="console-actions">
                <label className="generation-count-control">
                  <span>生成次数</span>
                  <span className="generation-stepper">
                    <button
                      type="button"
                      onClick={() => setGenerationCount((count) => Math.max(MIN_GENERATION_COUNT, count - 1))}
                      disabled={submitting || generationCount <= MIN_GENERATION_COUNT}
                      aria-label="减少生成次数"
                      title="减少生成次数"
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="number"
                      min={MIN_GENERATION_COUNT}
                      max={MAX_GENERATION_COUNT}
                      step="1"
                      inputMode="numeric"
                      value={generationCount}
                      onChange={(event) => {
                        const nextCount = Number(event.target.value)
                        if (Number.isFinite(nextCount)) {
                          setGenerationCount(Math.min(MAX_GENERATION_COUNT, Math.max(MIN_GENERATION_COUNT, Math.trunc(nextCount))))
                        }
                      }}
                      disabled={submitting}
                      aria-label="生成次数"
                    />
                    <button
                      type="button"
                      onClick={() => setGenerationCount((count) => Math.min(MAX_GENERATION_COUNT, count + 1))}
                      disabled={submitting || generationCount >= MAX_GENERATION_COUNT}
                      aria-label="增加生成次数"
                      title="增加生成次数"
                    >
                      <Plus size={15} />
                    </button>
                  </span>
                </label>
                <button 
                  type="submit" 
                  className="primary-btn" 
                  disabled={referenceControlsLocked}
                >
                  {submitting ? <LoaderCircle className="spin" size={18} /> : <Play size={18} fill="currentColor" />}
                  {submitting ? '调度中' : `开始构建 ×${generationCount}`}
                </button>
                <button 
                  type="button" 
                  className="secondary-btn"
                  onClick={() => setShowSettings(!showSettings)}
                  style={{ height: '40px', borderRadius: '16px' }}
                >
                  <Settings2 size={16} /> 
                  {showSettings ? '收起配置' : '展开配置'}
                </button>
              </div>
            </div>

            {/* 展开的选项与配置区域 */}
            {showSettings && (
              <div className="console-settings-panel" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', marginTop: '8px' }}>
              
              <div className="options-grid">
                
                {/* 鉴权配置 */}
                <div className="settings-group" style={{ gridColumn: '1 / -1', display: 'flex', gap: '16px' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <div className="options-group-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <KeyRound size={14} /> Base API Key
                    </div>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      style={{ padding: '12px 16px', borderRadius: '14px', background: 'rgba(0,0,0,0.3)' }}
                    />
                  </div>
                  
                  <div className="field" style={{ flex: 1 }}>
                    <div className="options-group-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Cpu size={14} /> 视频生成引擎
                      {loadingModels && <LoaderCircle className="spin" size={12} style={{ marginLeft: 6, opacity: 0.5 }}/>}
                    </div>
                    {models.length > 0 ? (
                       <select 
                         className="model-select"
                         value={form.model}
                         onChange={(e) => changeModel(e.target.value)}
                       >
                         {models.map(m => (
                           <option key={m.id} value={m.id}>{m.id}</option>
                         ))}
                       </select>
                    ) : (
                      <input 
                        type="text"
                        value={form.model}
                        onChange={(e) => changeModel(e.target.value)}
                        placeholder="填入API Key自动拉取，或手动指定模型"
                        style={{ padding: '12px 16px', borderRadius: '14px', background: 'rgba(0,0,0,0.3)' }}
                      />
                    )}
                  </div>
                </div>

                <div className={`options-group ${grokModelSelected ? 'grok-option-group' : ''}`} style={{ marginTop: 8 }}>
                  <span className="options-group-label"><Clock size={14} /> 渲染时长</span>
                  {videoV3ModelSelected ? (
                    <label className="video-v3-number-control">
                      <input
                        type="number"
                        min={VIDEO_V3_MIN_DURATION}
                        max={VIDEO_V3_MAX_DURATION}
                        step="1"
                        inputMode="numeric"
                        value={form.duration}
                        onChange={(event) => {
                          const nextDuration = Number(event.target.value)
                          if (Number.isFinite(nextDuration)) updateField('duration', Math.trunc(nextDuration))
                        }}
                        aria-label="video-v3 渲染时长"
                      />
                      <span>秒（{VIDEO_V3_MIN_DURATION}-{VIDEO_V3_MAX_DURATION}）</span>
                    </label>
                  ) : (
                    <div className="segmented">
                      {visibleDurationPresets.map((val) => (
                        <button
                          type="button"
                          key={val}
                          className={`segmented-item ${form.duration === val ? 'is-active' : ''}`}
                          onClick={() => updateField('duration', val)}
                        >
                          {val}s
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {!miniMaxModelSelected && (
                  <div className={`options-group ${grokModelSelected ? 'grok-option-group' : ''}`} style={{ marginTop: 8 }}>
                    <span className="options-group-label"><Layout size={14} /> 裁切画幅</span>
                    <div className="segmented">
                      {visibleRatioPresets.map((val) => (
                        <button
                          type="button"
                          key={val}
                          className={`segmented-item ${form.ratio === val ? 'is-active' : ''}`}
                          onClick={() => updateField('ratio', val)}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {miniMaxModelSelected ? (
                  <>
                    <div className="options-group" style={{ marginTop: 8 }}>
                      <span className="options-group-label"><Settings2 size={14} /> 输出尺寸</span>
                      <div className="segmented size-segmented">
                        {MINIMAX_H3_VIDEO_SIZES.map((val) => (
                          <button
                            type="button"
                            key={val}
                            className={`segmented-item ${form.size === val ? 'is-active' : ''}`}
                            onClick={() => updateField('size', val)}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="options-group" style={{ marginTop: 8 }}>
                      <span className="options-group-label"><Settings2 size={14} /> 生成音频</span>
                      <div className="segmented">
                        <button
                          type="button"
                          className={`segmented-item ${form.generateAudio ? 'is-active' : ''}`}
                          onClick={() => updateField('generateAudio', true)}
                        >
                          开启
                        </button>
                        <button
                          type="button"
                          className={`segmented-item ${!form.generateAudio ? 'is-active' : ''}`}
                          onClick={() => updateField('generateAudio', false)}
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                  </>
                ) : videoV3ModelSelected ? (
                  <>
                    <div className="options-group" style={{ marginTop: 8 }}>
                      <span className="options-group-label"><Settings2 size={14} /> 输出清晰度</span>
                      <span className="badge">固定 {VIDEO_V3_RESOLUTION}</span>
                    </div>
                    <div className="options-group" style={{ marginTop: 8 }}>
                      <span className="options-group-label"><Settings2 size={14} /> 生成音频</span>
                      <div className="segmented">
                        <button
                          type="button"
                          className={`segmented-item ${form.generateAudio ? 'is-active' : ''}`}
                          onClick={() => updateField('generateAudio', true)}
                        >
                          开启
                        </button>
                        <button
                          type="button"
                          className={`segmented-item ${!form.generateAudio ? 'is-active' : ''}`}
                          onClick={() => updateField('generateAudio', false)}
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                    <div className="options-group video-v3-advanced-group" style={{ marginTop: 8 }}>
                      <label className="options-group-label" htmlFor="video-v3-seed"><Settings2 size={14} /> 随机种子（可选）</label>
                      <input
                        id="video-v3-seed"
                        type="number"
                        step="1"
                        inputMode="numeric"
                        value={form.seed}
                        onChange={(event) => updateField('seed', event.target.value === '' ? '' : Number(event.target.value))}
                        placeholder="留空随机"
                      />
                    </div>
                    <div className="options-group video-v3-advanced-group" style={{ marginTop: 8 }}>
                      <label className="options-group-label" htmlFor="video-v3-grid-strength"><Settings2 size={14} /> 素材融合强度（可选）</label>
                      <input
                        id="video-v3-grid-strength"
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        inputMode="decimal"
                        value={form.gridStrength}
                        onChange={(event) => updateField('gridStrength', event.target.value === '' ? '' : Number(event.target.value))}
                        placeholder="0-1"
                      />
                    </div>
                    <div className="options-group video-v3-advanced-group" style={{ marginTop: 8 }}>
                      <label className="video-v3-toggle" htmlFor="video-v3-bypass-face-check">
                        <input
                          id="video-v3-bypass-face-check"
                          type="checkbox"
                          checked={form.bypassFaceCheck}
                          onChange={(event) => updateField('bypassFaceCheck', event.target.checked)}
                        />
                        <span>透传 bypass_face_check</span>
                      </label>
                    </div>
                  </>
                ) : videoV2FallbackModelSelected ? (
                  <>
                    <div className="options-group" style={{ marginTop: 8 }}>
                      <span className="options-group-label"><Settings2 size={14} /> 输出规格</span>
                      <span className="badge">固定 720p</span>
                    </div>
                    <div className="options-group" style={{ marginTop: 8 }}>
                      <span className="options-group-label"><Settings2 size={14} /> 生成音频</span>
                      <span className="badge">当前模型不支持</span>
                    </div>
                  </>
                ) : videoV2ModelSelected ? (
                  <>
                    <div className="options-group" style={{ marginTop: 8 }}>
                      <span className="options-group-label"><Settings2 size={14} /> 输出清晰度</span>
                      <div className="segmented">
                        {videoResolutionPresets.map((val) => (
                          <button
                            type="button"
                            key={val}
                            className={`segmented-item ${form.resolution === val ? 'is-active' : ''}`}
                            onClick={() => updateField('resolution', val)}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="options-group" style={{ marginTop: 8 }}>
                      <span className="options-group-label"><Settings2 size={14} /> 生成音频</span>
                      <div className="segmented">
                        <button
                          type="button"
                          className={`segmented-item ${form.generateAudio ? 'is-active' : ''}`}
                          onClick={() => updateField('generateAudio', true)}
                        >
                          开启
                        </button>
                        <button
                          type="button"
                          className={`segmented-item ${!form.generateAudio ? 'is-active' : ''}`}
                          onClick={() => updateField('generateAudio', false)}
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                  </>
                ) : grokModelSelected ? (
                  <div className="options-group grok-option-group" style={{ marginTop: 8 }}>
                    <span className="options-group-label"><Settings2 size={14} /> {grokUsesMultipleReferences ? '输出清晰度（多参考图）' : '输出清晰度'}</span>
                    <div className="segmented">
                      {visibleGrokResolutionPresets.map((val) => (
                        <button
                          type="button"
                          key={val}
                          className={`segmented-item ${form.resolution === val ? 'is-active' : ''}`}
                          onClick={() => updateField('resolution', val)}
                        >
                          {val}
                        </button>
                        ))}
                    </div>
                    {grokUsesMultipleReferences && <span className="field-hint">多张参考图仅支持 480p 或 720p。</span>}
                  </div>
                ) : (
                  <div className="options-group" style={{ marginTop: 8 }}>
                    <span className="options-group-label"><Settings2 size={14} /> 纹理质感</span>
                    <div className="segmented">
                      {qualityPresets.map((val) => (
                        <button
                          type="button"
                          key={val}
                          className={`segmented-item ${form.quality === val ? 'is-active' : ''}`}
                          onClick={() => updateField('quality', val)}
                        >
                          {val.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>
              </div>
            )}
          </div>
        </form>
      </div>

      <dialog
        ref={detailDialogRef}
        className="task-detail-dialog"
        aria-labelledby="task-detail-title"
        onCancel={(event) => {
          event.preventDefault()
          setDetailTaskId(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDetailTaskId(null)
        }}
        onClose={() => setDetailTaskId(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDetailTaskId(null)
        }}
      >
        {detailTask && (
          <div className="task-detail-content">
            <header className="task-detail-header">
              <div>
                <span className="task-detail-eyebrow">{statusLabel[detailTask.status] ?? detailTask.status}</span>
                <h2 id="task-detail-title">任务详情</h2>
                <p className="task-detail-header-id mono">{detailTask.task_id}</p>
              </div>
              <button
                type="button"
                className="task-detail-close"
                onClick={() => setDetailTaskId(null)}
                aria-label="关闭任务详情"
                title="关闭"
              >
                <X size={19} />
              </button>
            </header>

            <div className="task-detail-body">
              {detailTask.message && <p className="task-detail-message">{detailTask.message}</p>}
              <section className="task-detail-prompt" aria-labelledby="task-detail-prompt-title">
                <h3 id="task-detail-prompt-title">Prompt</h3>
                <p>{detailTask.prompt || '该历史任务未保存 Prompt。'}</p>
              </section>

              {detailTask.submitted_prompt && detailTask.submitted_prompt !== detailTask.prompt && (
                <details className="task-detail-submitted-prompt">
                  <summary>查看实际提交 Prompt</summary>
                  <p>{detailTask.submitted_prompt}</p>
                </details>
              )}

              <dl className="task-detail-grid">
                <div><dt>状态</dt><dd>{statusLabel[detailTask.status] ?? detailTask.status} · {detailTask.progress}%</dd></div>
                <div><dt>模型</dt><dd>{detailTask.model || '-'}</dd></div>
                <div><dt>生成模式</dt><dd>{(isVideoV2Model(detailTask.model) || isVideoV3Model(detailTask.model)) ? (detailTask.video_mode === 'image' ? '参考素材' : '文生视频') : (detailTask.video_mode ?? (detailTask.reference_count ? 'image' : 'text')) === 'image' ? '图生视频' : '文生视频'}</dd></div>
                <div><dt>参考图</dt><dd>{detailTask.reference_count ?? 0} 张{detailTask.image_input_mode === 'multiple' ? ' · 多图' : detailTask.image_input_mode === 'single' ? ' · 单图' : ''}</dd></div>
                {(isVideoV2Model(detailTask.model) || isVideoV3Model(detailTask.model)) && <div><dt>参考音频</dt><dd>{detailTask.reference_audio_count ?? 0} 个</dd></div>}
                {(isVideoV2Model(detailTask.model) || isVideoV3Model(detailTask.model)) && <div><dt>参考视频</dt><dd>{detailTask.reference_video_count ?? 0} 个</dd></div>}
                {(isVideoV2Model(detailTask.model) || isVideoV3Model(detailTask.model) || isMiniMaxH3VideoModel(detailTask.model)) && <div><dt>生成音频</dt><dd>{isMiniMaxH3VideoModel(detailTask.model) ? (detailTask.audio === undefined ? '-' : detailTask.audio ? '开启' : '关闭') : detailTask.generate_audio === undefined ? '-' : detailTask.generate_audio ? '开启' : '关闭'}</dd></div>}
                <div><dt>视频时长</dt><dd>{(detailTask.seconds ?? detailTask.duration) ? `${detailTask.seconds ?? detailTask.duration} 秒` : '-'}</dd></div>
                {!isMiniMaxH3VideoModel(detailTask.model) && <div><dt>画幅</dt><dd>{detailTask.ratio ?? '-'}</dd></div>}
                <div><dt>输出规格</dt><dd>{isMiniMaxH3VideoModel(detailTask.model) ? detailTask.size ?? '-' : detailTask.resolution ?? detailTask.quality?.toUpperCase() ?? '-'}</dd></div>
                {isVideoV3Model(detailTask.model) && detailTask.seed !== undefined && <div><dt>随机种子</dt><dd>{detailTask.seed}</dd></div>}
                {isVideoV3Model(detailTask.model) && detailTask.grid_strength !== undefined && <div><dt>素材融合强度</dt><dd>{detailTask.grid_strength}</dd></div>}
                {isVideoV3Model(detailTask.model) && detailTask.bypass_face_check !== undefined && <div><dt>人脸校验透传</dt><dd>{detailTask.bypass_face_check ? '开启' : '关闭'}</dd></div>}
                <div><dt>提交时间</dt><dd>{formatTaskDate(detailTask.created_at)}</dd></div>
                <div><dt>批次</dt><dd>{detailTask.batch_total && detailTask.batch_total > 1 ? `${detailTask.batch_index}/${detailTask.batch_total}` : '单次任务'}</dd></div>
                <div className="task-detail-id"><dt>任务 ID</dt><dd className="mono">{detailTask.task_id}</dd></div>
                {detailTask.idempotency_key && <div className="task-detail-id"><dt>幂等键</dt><dd className="mono">{detailTask.idempotency_key}</dd></div>}
              </dl>
            </div>
          </div>
        )}
      </dialog>
    </main>
  )
}

export default App
