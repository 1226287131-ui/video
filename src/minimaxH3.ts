export const MINIMAX_H3_VIDEO_MODEL = 'MiniMax-H3-933-1440P-GF'
export const MINIMAX_H3_VIDEO_MODELS = [
  MINIMAX_H3_VIDEO_MODEL,
  'MiniMax-H3',
  'minimax_h3',
] as const

export const MINIMAX_H3_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
] as const

export type MiniMaxH3AspectRatio = typeof MINIMAX_H3_ASPECT_RATIOS[number]
export type MiniMaxH3VideoSize = `${number}x${number}`

/**
 * Documented `size` presets after the upstream's default 32-pixel alignment.
 *
 * The UI selects one final `size` value only. It must not also send clarity,
 * resolution, aspect_ratio, megapixels, or metadata.multiple.
 */
export const MINIMAX_H3_STANDARD_SIZES_BY_RATIO: Record<
  MiniMaxH3AspectRatio,
  readonly MiniMaxH3VideoSize[]
> = {
  '1:1': [
    '448x448', '576x576', '640x640', '736x736', '800x800', '864x864', '928x928',
    '960x960', '1024x1024', '1024x1024', '1120x1120', '1248x1248', '1376x1376', '1440x1440',
  ],
  '2:3': [
    '384x576', '448x672', '544x800', '576x896', '640x960', '704x1056', '736x1120',
    '800x1184', '832x1248', '832x1248', '928x1376', '1024x1536', '1120x1696', '1184x1760',
  ],
  '3:2': [
    '576x384', '672x448', '800x544', '896x576', '960x640', '1056x704', '1120x736',
    '1184x800', '1248x832', '1248x832', '1376x928', '1536x1024', '1696x1120', '1760x1184',
  ],
  '3:4': [
    '384x544', '480x640', '576x736', '640x832', '672x928', '736x992', '800x1056',
    '832x1120', '864x1184', '896x1184', '960x1280', '1088x1440', '1184x1600', '1248x1664',
  ],
  '4:3': [
    '544x384', '640x480', '736x576', '832x640', '928x672', '992x736', '1056x800',
    '1120x832', '1184x864', '1184x896', '1280x960', '1440x1088', '1600x1184', '1664x1248',
  ],
  '9:16': [
    '352x608', '416x736', '480x864', '544x960', '608x1056', '640x1152', '672x1216',
    '736x1280', '768x1344', '768x1376', '832x1504', '928x1664', '1024x1824', '1088x1920',
  ],
  '16:9': [
    '608x352', '736x416', '864x480', '960x544', '1056x608', '1152x640', '1216x672',
    '1280x736', '1344x768', '1376x768', '1504x832', '1664x928', '1824x1024', '1920x1088',
  ],
  '21:9': [
    '704x288', '864x352', '992x416', '1120x480', '1216x512', '1312x576', '1408x608',
    '1472x640', '1536x672', '1568x672', '1728x736', '1920x832', '2112x896', '2208x960',
  ],
}

export const MINIMAX_H3_VIDEO_SIZES = [
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['1:1'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['2:3'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['3:2'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['3:4'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['4:3'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['9:16'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['16:9'],
  ...MINIMAX_H3_STANDARD_SIZES_BY_RATIO['21:9'],
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
  return MINIMAX_H3_STANDARD_SIZES_BY_RATIO[normalizedRatio]
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
  const match = /^(\d+)x(\d+)$/.exec(value.trim())
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
