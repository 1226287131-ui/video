export const MINIMAX_H3_VIDEO_MODEL = 'MiniMax-H3-933-1440P-GF'
export const MINIMAX_H3_VIDEO_MODELS = [
  MINIMAX_H3_VIDEO_MODEL,
  'MiniMax-H3',
  'minimax_h3',
] as const

export const MINIMAX_H3_ASPECT_RATIOS = [
  '16:9',
  '9:16',
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '21:9',
] as const

export type MiniMaxH3AspectRatio = typeof MINIMAX_H3_ASPECT_RATIOS[number]
export type MiniMaxH3PixelSize = `${number}x${number}`
export const MINIMAX_H3_SUPER_RESOLUTION_SIZES = ['2K', '4K'] as const
export type MiniMaxH3SuperResolutionSize = typeof MINIMAX_H3_SUPER_RESOLUTION_SIZES[number]
export type MiniMaxH3VideoSize = MiniMaxH3PixelSize | MiniMaxH3SuperResolutionSize

/**
 * Fixed `size` presets exposed by the H3 editor.
 *
 * The UI selects one final `size` value only. It must not also send clarity,
 * resolution, aspect_ratio, megapixels, or metadata.multiple.
 */
export const MINIMAX_H3_STANDARD_SIZES_BY_RATIO: Record<
  MiniMaxH3AspectRatio,
  readonly MiniMaxH3PixelSize[]
> = {
  '16:9': ['864x480', '1376x768', '1920x1088'],
  '9:16': ['480x864', '768x1376', '1088x1920'],
  '1:1': ['640x640', '1024x1024', '1440x1440'],
  '2:3': ['544x800', '832x1248', '1184x1760'],
  '3:2': ['800x544', '1248x832', '1760x1184'],
  '3:4': ['576x736', '896x1184', '1248x1664'],
  '4:3': ['736x576', '1184x896', '1664x1248'],
  '21:9': ['992x416', '1568x672', '2208x960'],
}

export const MINIMAX_H3_VIDEO_SIZES = [
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['16:9'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['9:16'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['1:1'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['2:3'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['3:2'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['3:4'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['4:3'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['21:9'],
  ...MINIMAX_H3_SUPER_RESOLUTION_SIZES,
] as const

export const MINIMAX_H3_DEFAULT_ASPECT_RATIO: MiniMaxH3AspectRatio = '16:9'
export const MINIMAX_H3_DEFAULT_SIZE: MiniMaxH3VideoSize = '1920x1088'

export const MINIMAX_H3_MIN_SECONDS = 4
export const MINIMAX_H3_MAX_SECONDS = 15
export const MINIMAX_H3_MAX_IMAGES = 9
export const MINIMAX_H3_MAX_VIDEOS = 3
export const MINIMAX_H3_MAX_VIDEO_AUDIOS = 3
export const MINIMAX_H3_MAX_AUDIOS = 3
export const MINIMAX_H3_DEFAULT_SECONDS = 5
export const MINIMAX_H3_MIN_MULTIPLE = 8
export const MINIMAX_H3_MAX_MULTIPLE = 128

/** Workflow IDs used by the H3 editor and its automatic submission rules. */
export const MINIMAX_H3_WORKFLOW_IDS = [
  'text-to-video',
  'multi-reference',
  'cf-multi-reference',
] as const

export type MiniMaxH3WorkflowId = typeof MINIMAX_H3_WORKFLOW_IDS[number]
export type MiniMaxH3WorkflowSelection = 'auto' | MiniMaxH3WorkflowId
/** @deprecated Use MiniMaxH3SuperResolutionSize and send it as `size`. */
export type MiniMaxH3WorkflowSize = MiniMaxH3SuperResolutionSize
export const MINIMAX_H3_DEFAULT_WORKFLOW_ID: MiniMaxH3WorkflowId = 'multi-reference'
/** @deprecated Use MINIMAX_H3_SUPER_RESOLUTION_SIZES. */
export const MINIMAX_H3_WORKFLOW_SIZES = MINIMAX_H3_SUPER_RESOLUTION_SIZES

export function isValidMiniMaxH3WorkflowId(value: unknown): value is MiniMaxH3WorkflowId {
  return typeof value === 'string' && (MINIMAX_H3_WORKFLOW_IDS as readonly string[]).includes(value)
}

export function isValidMiniMaxH3WorkflowSize(value: unknown): value is MiniMaxH3WorkflowSize {
  return isMiniMaxH3SuperResolutionSize(value)
}

export function isMiniMaxH3SuperResolutionSize(value: unknown): value is MiniMaxH3SuperResolutionSize {
  return typeof value === 'string' && (MINIMAX_H3_SUPER_RESOLUTION_SIZES as readonly string[]).includes(value)
}

export function inferMiniMaxH3WorkflowId(input: {
  images: number
  videos: number
  audios: number
  size?: unknown
  mode?: 'first_last_frame'
}): MiniMaxH3WorkflowId {
  // H3's supported workflows are selected from the media the user can
  // actually provide. Reference videos/audio do not select a reference
  // workflow on their own because those workflows require at least one image.
  if (input.images <= 0) return 'text-to-video'
  return isMiniMaxH3SuperResolutionSize(input.size) ? 'cf-multi-reference' : MINIMAX_H3_DEFAULT_WORKFLOW_ID
}

export type MiniMaxH3MediaMentionCounts = {
  images: number
  videos: number
  audios: number
}

export type MiniMaxH3MentionResult = {
  prompt: string
  invalidTokens: string[]
  valid: boolean
}

const MINIMAX_H3_MEDIA_MENTION_PATTERN = /(?<![A-Za-z0-9._%+-])[@＠](Image|Video|Audio|参考图|参考视频|视频|参考音频|音频)(\d+)(?![A-Za-z0-9_]|\.[A-Za-z0-9_])/giu
const MINIMAX_H3_AUTOMATIC_MENTION_INSTRUCTION_PATTERN = /^参考素材严格按传入数组顺序编号：(?:(?:images|reference_videos|reference_audios)\[\d+\] 是第\d+(?:张参考图|个参考视频|个参考音频))(?:；(?:images|reference_videos|reference_audios)\[\d+\] 是第\d+(?:张参考图|个参考视频|个参考音频))*。请按这些编号理解下方指令，不要混淆不同参考素材。\r?\n\r?\n/u

const MINIMAX_H3_MEDIA_ALIASES: Record<string, { kind: keyof MiniMaxH3MediaMentionCounts, label: string }> = {
  image: { kind: 'images', label: '张参考图' },
  '参考图': { kind: 'images', label: '张参考图' },
  video: { kind: 'videos', label: '个参考视频' },
  '参考视频': { kind: 'videos', label: '个参考视频' },
  '视频': { kind: 'videos', label: '个参考视频' },
  audio: { kind: 'audios', label: '个参考音频' },
  '参考音频': { kind: 'audios', label: '个参考音频' },
  '音频': { kind: 'audios', label: '个参考音频' },
}

function safeMentionCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function splitMiniMaxH3AutomaticMentionInstructions(prompt: string) {
  let body = prompt
  let instruction = ''
  let match = MINIMAX_H3_AUTOMATIC_MENTION_INSTRUCTION_PATTERN.exec(body)

  while (match) {
    if (!instruction) instruction = match[0]
    body = body.slice(match[0].length)
    match = MINIMAX_H3_AUTOMATIC_MENTION_INSTRUCTION_PATTERN.exec(body)
  }

  return { body, instruction }
}

/** Compile UI media mentions into explicit array-order instructions for H3's JSON contract. */
export function normalizeMiniMaxH3Mentions(
  prompt: string,
  counts: MiniMaxH3MediaMentionCounts,
): MiniMaxH3MentionResult {
  // Older local history may contain a previously compiled Prompt. Keep one
  // generated instruction block so retrying it cannot accumulate duplicates.
  const { body: sourcePrompt, instruction: existingInstruction } = splitMiniMaxH3AutomaticMentionInstructions(prompt)
  const invalidTokens: string[] = []
  const safeCounts = {
    images: safeMentionCount(counts.images),
    videos: safeMentionCount(counts.videos),
    audios: safeMentionCount(counts.audios),
  }
  const referenced = new Map<keyof MiniMaxH3MediaMentionCounts, number[]>()
  const normalizedPrompt = sourcePrompt.replace(
    MINIMAX_H3_MEDIA_MENTION_PATTERN,
    (token, rawAlias: string, rawNumber: string) => {
      const media = MINIMAX_H3_MEDIA_ALIASES[rawAlias.toLowerCase()]
      const mediaNumber = Number(rawNumber)
      const inRange = media && Number.isSafeInteger(mediaNumber) && mediaNumber >= 1 && mediaNumber <= safeCounts[media.kind] && rawNumber === String(mediaNumber)
      if (!inRange) {
        if (!invalidTokens.includes(token)) invalidTokens.push(token)
        return token
      }
      const numbers = referenced.get(media.kind) ?? []
      if (!numbers.includes(mediaNumber)) numbers.push(mediaNumber)
      referenced.set(media.kind, numbers)
      return `第${mediaNumber}${media.label}`
    },
  )

  if (invalidTokens.length > 0 || referenced.size === 0) {
    return {
      prompt: existingInstruction ? `${existingInstruction}${normalizedPrompt}` : prompt,
      invalidTokens,
      valid: invalidTokens.length === 0,
    }
  }

  const mappings: string[] = []
  const mappingLabels: Record<keyof MiniMaxH3MediaMentionCounts, string> = {
    images: 'images',
    videos: 'reference_videos',
    audios: 'reference_audios',
  }
  for (const [kind, numbers] of referenced) {
    for (const number of numbers) {
      mappings.push(`${mappingLabels[kind]}[${number - 1}] 是第${number}${MINIMAX_H3_MEDIA_ALIASES[kind === 'images' ? '参考图' : kind === 'videos' ? '参考视频' : '参考音频'].label}`)
    }
  }
  return {
    prompt: `参考素材严格按传入数组顺序编号：${mappings.join('；')}。请按这些编号理解下方指令，不要混淆不同参考素材。\n\n${normalizedPrompt}`,
    invalidTokens,
    valid: true,
  }
}

export function isMiniMaxH3VideoModel(model: unknown) {
  const normalized = String(model || '').trim().toLowerCase()
  return MINIMAX_H3_VIDEO_MODELS.some((candidate) => candidate.toLowerCase() === normalized)
}

export function isValidMiniMaxH3AspectRatio(value: unknown): value is MiniMaxH3AspectRatio {
  return typeof value === 'string' && (MINIMAX_H3_ASPECT_RATIOS as readonly string[]).includes(value)
}

export function getMiniMaxH3VideoSizesForAspectRatio(ratio: unknown) {
  const normalizedRatio = isValidMiniMaxH3AspectRatio(ratio)
    ? ratio
    : MINIMAX_H3_DEFAULT_ASPECT_RATIO
  return [
    ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO[normalizedRatio],
    ...MINIMAX_H3_SUPER_RESOLUTION_SIZES,
  ] as const
}

export function isValidMiniMaxH3VideoSeconds(value: unknown): value is number {
  const seconds = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : NaN
  return Number.isInteger(seconds) && seconds >= MINIMAX_H3_MIN_SECONDS && seconds <= MINIMAX_H3_MAX_SECONDS
}

export function isValidMiniMaxH3VideoSize(value: unknown): value is MiniMaxH3VideoSize {
  if (typeof value !== 'string') return false
  const normalizedValue = value.trim()
  if (isMiniMaxH3SuperResolutionSize(normalizedValue)) return true
  const match = /^(\d+)x(\d+)$/.exec(normalizedValue)
  if (!match) return false
  const width = Number(match[1])
  const height = Number(match[2])
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
}

export function isValidMiniMaxH3Multiple(value: unknown): value is number {
  const multiple = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : NaN
  return Number.isInteger(multiple)
    && multiple >= MINIMAX_H3_MIN_MULTIPLE
    && multiple <= MINIMAX_H3_MAX_MULTIPLE
    && multiple % 4 === 0
}
