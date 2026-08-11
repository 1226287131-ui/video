export const MINIMAX_H3_VIDEO_MODEL = 'MiniMax-H3-933-1440P-GF'

export const MINIMAX_H3_VIDEO_SIZES = [
  '3360x1440',
  '2560x1440',
  '1920x1440',
  '1440x1440',
  '1440x1920',
  '1440x2560',
] as const

export type MiniMaxH3VideoSize = typeof MINIMAX_H3_VIDEO_SIZES[number]

export const MINIMAX_H3_MIN_SECONDS = 5
export const MINIMAX_H3_MAX_SECONDS = 15
export const MINIMAX_H3_MAX_IMAGES = 5

export function isMiniMaxH3VideoModel(model: unknown) {
  return String(model || '').trim().toLowerCase() === MINIMAX_H3_VIDEO_MODEL.toLowerCase()
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
  return typeof value === 'string' && (MINIMAX_H3_VIDEO_SIZES as readonly string[]).includes(value)
}
