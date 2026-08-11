import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GROK_VIDEO_ASPECT_RATIOS,
  GROK_VIDEO_RESOLUTIONS,
  createGrokVideoFormData,
  getVideoContentPath,
  getVideoSubmitPath,
  getVideoTaskPath,
  isGrokImagineVideoModel,
  isValidGrokVideoAspectRatio,
  isValidGrokVideoDuration,
  isValidGrokVideoResolution,
  isValidGrokVideoResolutionForReferenceCount,
} from '../src/videoApi.ts'

test('recognizes only the grok imagine 1.5 video model', () => {
  assert.equal(isGrokImagineVideoModel('grok-imagine-1.5-video'), true)
  assert.equal(isGrokImagineVideoModel(' GROK-IMAGINE-1.5-VIDEO '), true)
  assert.equal(isGrokImagineVideoModel('grok-imagine-1.5-video-fast'), false)
  assert.equal(isGrokImagineVideoModel('video-v1'), false)
})

test('routes grok and legacy models to their own endpoints', () => {
  assert.equal(getVideoSubmitPath('grok-imagine-1.5-video'), '/v1/videos')
  assert.equal(getVideoTaskPath('grok-imagine-1.5-video', 'task/a'), '/v1/videos/task%2Fa')
  assert.equal(getVideoContentPath('grok-imagine-1.5-video', 'task/a'), '/v1/videos/task%2Fa/content')

  assert.equal(getVideoSubmitPath('video-v1'), '/v1/video/generations')
  assert.equal(getVideoTaskPath('video-v1', 'task/a'), '/v1/video/generations/task%2Fa')
  assert.equal(getVideoContentPath('video-v1', 'task/a'), '')
})

test('routes MiniMax-H3 through the legacy video generations endpoint', () => {
  assert.equal(getVideoSubmitPath('MiniMax-H3-933-1440P-GF'), '/v1/video/generations')
  assert.equal(getVideoTaskPath('MiniMax-H3-933-1440P-GF', 'task/a'), '/v1/video/generations/task%2Fa')
  assert.equal(getVideoContentPath('MiniMax-H3-933-1440P-GF', 'task/a'), '')
})

test('validates Grok durations, aspect ratios, and resolutions from the current contract', () => {
  for (const seconds of [1, 5, 8, 15]) assert.equal(isValidGrokVideoDuration(seconds), true)
  assert.equal(isValidGrokVideoDuration('10'), true)
  for (const seconds of [0, 16, 5.5, '', 'abc']) assert.equal(isValidGrokVideoDuration(seconds), false)

  for (const ratio of GROK_VIDEO_ASPECT_RATIOS) assert.equal(isValidGrokVideoAspectRatio(ratio), true)
  assert.equal(isValidGrokVideoAspectRatio('21:9'), false)

  for (const resolution of GROK_VIDEO_RESOLUTIONS) assert.equal(isValidGrokVideoResolution(resolution), true)
  assert.equal(isValidGrokVideoResolution('4k'), false)

  assert.equal(isValidGrokVideoResolutionForReferenceCount('1080p', 0), true)
  assert.equal(isValidGrokVideoResolutionForReferenceCount('1080p', 1), true)
  assert.equal(isValidGrokVideoResolutionForReferenceCount('1080p', 2), false)
  assert.equal(isValidGrokVideoResolutionForReferenceCount('480p', 2), true)
  assert.equal(isValidGrokVideoResolutionForReferenceCount('720p', 8), true)
})

test('builds a fresh multipart form with exactly the documented Grok fields', () => {
  const reference = { blob: new Blob(['png-image'], { type: 'image/png' }), fileName: 'reference.png' }
  const first = createGrokVideoFormData({
    model: 'grok-imagine-1.5-video',
    prompt: 'camera moves forward',
    ratio: '3:2',
    seconds: 8,
    resolution: '1080p',
    inputReferences: [reference],
  })
  const second = createGrokVideoFormData({
    model: 'grok-imagine-1.5-video',
    prompt: 'camera moves forward',
    ratio: '3:2',
    seconds: 8,
    resolution: '1080p',
    inputReferences: [reference],
  })

  assert.notEqual(first, second)
  assert.deepEqual([...first.keys()], ['model', 'prompt', 'aspect_ratio', 'seconds', 'resolution', 'input_reference'])
  assert.equal(first.get('model'), 'grok-imagine-1.5-video')
  assert.equal(first.get('prompt'), 'camera moves forward')
  assert.equal(first.get('aspect_ratio'), '3:2')
  assert.equal(first.get('seconds'), '8')
  assert.equal(first.get('resolution'), '1080p')
  assert.deepEqual(first.getAll('input_reference').map((file) => file.name), ['reference.png'])
  for (const unsupportedField of ['duration', 'ratio', 'async', 'image', 'images', 'size', 'quality']) {
    assert.equal(first.has(unsupportedField), false)
  }
})

test('appends every non-empty Grok reference file in upload order', () => {
  const pngReference = { blob: new Blob(['png-image'], { type: 'image/png' }), fileName: 'reference.png' }
  const jpegReference = { blob: new Blob(['jpeg-image'], { type: 'image/jpeg' }), fileName: 'reference.jpg' }
  const webpReference = { blob: new Blob(['webp-image'], { type: 'image/webp' }), fileName: 'reference.webp' }
  const form = createGrokVideoFormData({
    model: 'grok-imagine-1.5-video',
    prompt: 'a person walks forward',
    ratio: '16:9',
    seconds: 10,
    resolution: '720p',
    inputReferences: [pngReference, jpegReference, webpReference],
  })

  assert.deepEqual(form.getAll('input_reference').map((file) => file.name), [
    'reference.png',
    'reference.jpg',
    'reference.webp',
  ])
  assert.throws(() => createGrokVideoFormData({
    model: 'grok-imagine-1.5-video',
    prompt: 'empty reference',
    ratio: '16:9',
    seconds: 10,
    resolution: '720p',
    inputReferences: [{ blob: new Blob([], { type: 'image/png' }), fileName: 'empty.png' }],
  }), /有效参考图文件/)
})

test('rejects 1080p when Grok submits multiple reference files', () => {
  const firstReference = { blob: new Blob(['first'], { type: 'image/png' }), fileName: 'first.png' }
  const secondReference = { blob: new Blob(['second'], { type: 'image/png' }), fileName: 'second.png' }
  assert.throws(() => createGrokVideoFormData({
    model: 'grok-imagine-1.5-video',
    prompt: 'two people walk together',
    ratio: '16:9',
    seconds: 8,
    resolution: '1080p',
    inputReferences: [firstReference, secondReference],
  }), /多参考图时仅支持 480p 或 720p/)
})

test('builds text-to-video multipart data without a reference image', () => {
  const form = createGrokVideoFormData({
    model: 'grok-imagine-1.5-video',
    prompt: 'clouds move slowly over the city',
    ratio: '2:3',
    seconds: 15,
    resolution: '480p',
  })

  assert.deepEqual([...form.keys()], ['model', 'prompt', 'aspect_ratio', 'seconds', 'resolution'])
  assert.equal(form.get('aspect_ratio'), '2:3')
  assert.equal(form.get('seconds'), '15')
  assert.equal(form.get('resolution'), '480p')
  assert.equal(form.has('input_reference'), false)
})

test('rejects unsupported Grok form values', () => {
  const reference = { blob: new Blob(['png-image'], { type: 'image/png' }) }
  assert.throws(() => createGrokVideoFormData({
    model: 'video-v1',
    prompt: 'prompt',
    ratio: '16:9',
    seconds: 6,
    resolution: '720p',
    inputReferences: [reference],
  }), /只能用于/)
  assert.throws(() => createGrokVideoFormData({
    model: 'grok-imagine-1.5-video',
    prompt: 'prompt',
    ratio: '16:9',
    seconds: 16,
    resolution: '720p',
    inputReferences: [reference],
  }), /1 到 15/)
  assert.throws(() => createGrokVideoFormData({
    model: 'grok-imagine-1.5-video',
    prompt: 'prompt',
    ratio: '21:9',
    seconds: 6,
    resolution: '720p',
    inputReferences: [reference],
  }), /不支持该画幅/)
  assert.throws(() => createGrokVideoFormData({
    model: 'grok-imagine-1.5-video',
    prompt: 'prompt',
    ratio: '16:9',
    seconds: 6,
    resolution: '4k',
    inputReferences: [reference],
  }), /480p、720p 或 1080p/)
})
