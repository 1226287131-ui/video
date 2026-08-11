import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createBatchPlans,
  isActiveTaskStatus,
  mergeTaskHistory,
  parseGenerationCount,
  runWithConcurrency,
} from '../src/taskWorkflow.ts'

test('parseGenerationCount accepts only integers from 1 through 10', () => {
  assert.equal(parseGenerationCount(1), 1)
  assert.equal(parseGenerationCount('5'), 5)
  assert.equal(parseGenerationCount(10), 10)
  for (const value of ['', 0, -1, 1.5, 11, Number.NaN]) assert.equal(parseGenerationCount(value), null)
})

test('createBatchPlans clones payloads and creates one key per task', () => {
  const payload = { prompt: 'same prompt', images: ['one', 'two'] }
  const plans = createBatchPlans(5, payload, (index) => `batch-${index + 1}`)

  assert.equal(plans.length, 5)
  assert.equal(new Set(plans.map((plan) => plan.idempotencyKey)).size, 5)
  assert.deepEqual(plans.map((plan) => plan.payload), Array(5).fill(payload))
  assert.notEqual(plans[0].payload, plans[1].payload)
  assert.notEqual(plans[0].payload.images, plans[1].payload.images)
})

test('runWithConcurrency preserves result order, caps concurrency, and keeps partial failures', async () => {
  let active = 0
  let maximumActive = 0
  const results = await runWithConcurrency([0, 1, 2, 3, 4], 2, async (item) => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
    if (item === 2) throw new Error('failed item')
    return item * 10
  })

  assert.equal(maximumActive, 2)
  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled'])
  assert.equal(results[4].value, 40)
})

test('mergeTaskHistory keeps every active task and deterministically orders a batch', () => {
  const records = [
    { task_id: 'old', status: 'succeeded', created_at: 1 },
    { task_id: 'two', status: 'queued', created_at: 3, batch_id: 'batch', batch_index: 2 },
    { task_id: 'one', status: 'processing', created_at: 3, batch_id: 'batch', batch_index: 1 },
    { task_id: 'new', status: 'succeeded', created_at: 4 },
  ]
  const merged = mergeTaskHistory(records, [], 2)

  assert.deepEqual(merged.map((item) => item.task_id), ['one', 'two'])
  assert.equal(isActiveTaskStatus('PROCESSING'), true)
  assert.equal(isActiveTaskStatus('in_progress'), true)
  assert.equal(isActiveTaskStatus('result_pending'), true)
  assert.equal(isActiveTaskStatus('failed'), false)
})
