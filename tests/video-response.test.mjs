import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCreatedVideoTask } from '../src/videoResponse.ts'

test('parses a normal OpenAI-shaped video task response', () => {
  assert.deepEqual(parseCreatedVideoTask({
    data: { id: 'task-1', status: 'processing', progress: 25 },
  }), {
    taskId: 'task-1',
    id: 'task-1',
    status: 'processing',
    progress: 25,
    statusPath: undefined,
    resultUrl: undefined,
    previewUrl: undefined,
    message: undefined,
  })
})

test('parses the gateway 202 response whose task object is JSON in message', () => {
  assert.deepEqual(parseCreatedVideoTask({
    code: 'fail_to_fetch_task',
    message: '{"id":"task-202","status":"queued","status_url":"/v1/videos/generations/task-202"}',
    data: null,
  }), {
    taskId: 'task-202',
    id: 'task-202',
    status: 'queued',
    progress: 0,
    statusPath: '/v1/videos/generations/task-202',
    resultUrl: undefined,
    previewUrl: undefined,
    message: undefined,
  })
})

test('does not accept an external status URL from a create response', () => {
  const parsed = parseCreatedVideoTask({
    id: 'task-safe',
    status_url: 'https://untrusted.example.invalid/task-safe',
  })
  assert.equal(parsed?.statusPath, undefined)
})
