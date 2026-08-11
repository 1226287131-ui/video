export const MIN_GENERATION_COUNT = 1
export const MAX_GENERATION_COUNT = 10
export const MAX_POST_CONCURRENCY = 5
export const MAX_ACTIVE_TASKS = 20

export type WorkflowTask = {
  task_id: string
  status: string
  created_at: number
  batch_id?: string
  batch_index?: number
}

export type BatchPlan<T> = {
  index: number
  idempotencyKey: string
  payload: T
}

export function parseGenerationCount(value: unknown) {
  const count = Number(value)
  if (!Number.isInteger(count) || count < MIN_GENERATION_COUNT || count > MAX_GENERATION_COUNT) return null
  return count
}

export function isActiveTaskStatus(status: unknown) {
  return ['queued', 'processing', 'in_progress', 'result_pending'].includes(String(status || '').toLowerCase())
}

function compareTasks(left: WorkflowTask, right: WorkflowTask) {
  const timeDifference = (Number(right.created_at) || 0) - (Number(left.created_at) || 0)
  if (timeDifference !== 0) return timeDifference
  if (left.batch_id && left.batch_id === right.batch_id) {
    return (left.batch_index || 0) - (right.batch_index || 0)
  }
  return left.task_id.localeCompare(right.task_id)
}

export function mergeTaskHistory<T extends WorkflowTask>(current: T[], additions: T[], limit: number) {
  const records = new Map(current.map((item) => [item.task_id, item]))
  additions.forEach((item) => records.set(item.task_id, item))
  const sorted = [...records.values()].sort(compareTasks)
  const active = sorted.filter((item) => isActiveTaskStatus(item.status))
  const terminalSlots = Math.max(0, limit - active.length)
  const terminal = sorted.filter((item) => !isActiveTaskStatus(item.status)).slice(0, terminalSlots)
  return [...active, ...terminal].sort(compareTasks)
}

export function createBatchPlans<T>(
  count: number,
  payload: T,
  createIdempotencyKey: (index: number) => string,
): BatchPlan<T>[] {
  if (parseGenerationCount(count) === null) throw new Error('invalid generation count')
  return Array.from({ length: count }, (_, index) => ({
    index,
    idempotencyKey: createIdempotencyKey(index),
    payload: structuredClone(payload),
  }))
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }))

  return results
}
