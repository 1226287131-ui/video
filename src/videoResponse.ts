export type CreatedVideoTask = {
  taskId: string
  id: string
  status: string
  progress: number
  statusPath?: string
  resultUrl?: string
  previewUrl?: string
  message?: string
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function parseJsonString(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return undefined
  try {
    return parseJsonObject(JSON.parse(value))
  } catch {
    return undefined
  }
}

function normalizeStatusPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/v1/')) return undefined
  try {
    const url = new URL(value, 'https://api.kkone.vip')
    return url.origin === 'https://api.kkone.vip' ? `${url.pathname}${url.search}` : undefined
  } catch {
    return undefined
  }
}

/**
 * Supports normal OpenAI-shaped responses and the gateway's 202 envelope,
 * where the created task object is serialized into `message` while `data` is null.
 */
export function parseCreatedVideoTask(payload: unknown): CreatedVideoTask | undefined {
  const root = parseJsonObject(payload)
  if (!root) return undefined
  const rootData = Array.isArray(root.data) ? parseJsonObject(root.data[0]) : parseJsonObject(root.data)
  const messageData = parseJsonString(root.message)
  const candidates = [rootData, messageData, root]

  for (const candidate of candidates) {
    if (!candidate) continue
    const rawTaskId = candidate.task_id ?? candidate.id
    if (typeof rawTaskId !== 'string' && typeof rawTaskId !== 'number') continue
    const rawProgress = Number(candidate.progress ?? root.progress ?? 0)
    const resultUrl = candidate.result_url ?? candidate.video_url ?? candidate.url
    const previewUrl = candidate.preview_url ?? candidate.thumbnail_url ?? candidate.cover_url ?? candidate.poster_url
    return {
      taskId: String(rawTaskId),
      id: String(candidate.id ?? rawTaskId),
      status: String(candidate.status ?? root.status ?? 'queued').toLowerCase(),
      progress: Number.isFinite(rawProgress) ? Math.min(100, Math.max(0, rawProgress)) : 0,
      statusPath: normalizeStatusPath(candidate.status_url ?? candidate.statusPath ?? root.status_url),
      resultUrl: typeof resultUrl === 'string' && resultUrl ? resultUrl : undefined,
      previewUrl: typeof previewUrl === 'string' && previewUrl ? previewUrl : undefined,
      message: typeof root.message === 'string' && !messageData ? root.message : undefined,
    }
  }
  return undefined
}
