import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getVideoContentPath,
  getVideoSubmitPath,
  getVideoTaskPath,
  isVideoV2FastModel,
  isVideoV2Model,
  isVideoV2SpecialPriceModel,
  isValidVideoV2Duration,
} from '../src/videoApi.ts'
import { buildVideoV2SubmitPayload } from '../src/videoPayload.ts'
import {
  getVideoV2MediaLimitsForModel,
  normalizeVideoV2Mentions,
  validateVideoV2Mentions,
} from '../src/v2Media.ts'

test('recognizes supported video-v2 models without case sensitivity', () => {
  for (const model of ['video-v2', ' VIDEO-V2-FAST ', 'video-v2（限时低价渠道）', 'video-v2-fast（限时低价渠道）', 'video-v2-fast（限时低价低价渠道）', 'video-v2-特价版']) {
    assert.equal(isVideoV2Model(model), true)
  }
  assert.equal(isVideoV2Model(' Video-V2-Mini '), false)
  assert.equal(isVideoV2Model(' video-v2-满血兜底版 '), false)
  assert.equal(isVideoV2Model('video-v2-fast-720'), false)
  assert.equal(isVideoV2Model('video-v2-mini-720'), false)
  assert.equal(isVideoV2Model('video-v20'), false)
  assert.equal(isVideoV2Model('video-v1'), false)
})

test('uses the special-price V2 media restrictions', () => {
  assert.equal(isVideoV2SpecialPriceModel(' VIDEO-V2-特价版 '), true)
  assert.deepEqual(getVideoV2MediaLimitsForModel('video-v2-特价版'), { images: 9, videos: 0, audios: 0 })
  assert.deepEqual(getVideoV2MediaLimitsForModel('video-v2'), { images: 9, videos: 3, audios: 3 })
})

test('identifies video-v2-fast as the fast adapter alias without broadening the match', () => {
  assert.equal(isVideoV2FastModel('video-v2-fast'), true)
  assert.equal(isVideoV2FastModel(' VIDEO-V2-FAST '), true)
  assert.equal(isVideoV2FastModel('video-v2-fast（限时低价渠道）'), true)
  assert.equal(isVideoV2FastModel('video-v2-fast（限时低价低价渠道）'), true)
  assert.equal(isVideoV2FastModel('video-v2'), false)
  assert.equal(isVideoV2FastModel('video-v2-fast-720'), false)
})

test('accepts every integer duration from 5 through 15 for both V2 channels', () => {
  for (const duration of [5, 7, 12, 15, '10']) assert.equal(isValidVideoV2Duration(duration), true)
  for (const duration of [4, 16, 7.5, '', 'abc']) assert.equal(isValidVideoV2Duration(duration), false)
})

test('routes video-v2 resources through /v1/videos while legacy routing is unchanged', () => {
  for (const model of ['video-v2', 'VIDEO-V2-FAST']) {
    assert.equal(getVideoSubmitPath(model), '/v1/videos')
    assert.equal(getVideoTaskPath(model, 'task/a'), '/v1/videos/task%2Fa')
    assert.equal(getVideoContentPath(model, 'task/a'), '/v1/videos/task%2Fa/content')
  }

  for (const model of ['video-v1', 'video-v2-mini', 'video-v2-满血兜底版']) {
    assert.equal(getVideoSubmitPath(model), '/v1/video/generations')
    assert.equal(getVideoTaskPath(model, 'task/a'), '/v1/video/generations/task%2Fa')
    assert.equal(getVideoContentPath(model, 'task/a'), '')
  }
})

test('builds only documented video-v2 fields and copies media arrays', () => {
  const images = Object.freeze(['https://example.com/image-1.jpg'])
  const videos = Object.freeze(['https://example.com/video-1.mp4'])
  const audios = Object.freeze(['https://example.com/audio-1.mp3'])
  const payload = buildVideoV2SubmitPayload({
    model: 'video-v2-fast',
    prompt: '@Image1 follows @Video1 with @Audio1',
    images,
    videos,
    audios,
    aspectRatio: '16:9',
    duration: 10,
    resolution: '720p',
    generateAudio: true,
  })

  assert.deepEqual(Object.keys(payload), [
    'model',
    'prompt',
    'images',
    'videos',
    'audios',
    'aspect_ratio',
    'duration',
    'resolution',
    'generate_audio',
  ])
  assert.equal(payload.model, 'video-v2-fast')
  assert.equal(payload.aspect_ratio, '16:9')
  assert.equal(payload.resolution, '720p')
  assert.equal(payload.generate_audio, true)
  assert.deepEqual(payload.images, images)
  assert.deepEqual(payload.videos, videos)
  assert.deepEqual(payload.audios, audios)
  assert.notEqual(payload.images, images)
  assert.notEqual(payload.videos, videos)
  assert.notEqual(payload.audios, audios)
  for (const unsupportedField of ['quality', 'async', 'image', 'seconds', 'size']) {
    assert.equal(unsupportedField in payload, false)
  }
})

test('includes fresh empty media arrays for text-only video-v2 requests', () => {
  const empty = Object.freeze([])
  const payload = buildVideoV2SubmitPayload({
    model: 'video-v2',
    prompt: 'city skyline at dusk',
    images: empty,
    videos: empty,
    audios: empty,
    aspectRatio: '9:16',
    duration: 5,
    resolution: '480p',
    generateAudio: true,
  })

  assert.deepEqual(payload.images, [])
  assert.deepEqual(payload.videos, [])
  assert.deepEqual(payload.audios, [])
  assert.notEqual(payload.images, empty)
  assert.notEqual(payload.videos, empty)
  assert.notEqual(payload.audios, empty)
})

test('rejects V2 durations outside the configured 5-15 second range', () => {
  const shared = {
    model: 'video-v2',
    prompt: 'city skyline at dusk',
    images: [],
    videos: [],
    audios: [],
    aspectRatio: '16:9',
    resolution: '720p',
    generateAudio: true,
  }
  assert.throws(() => buildVideoV2SubmitPayload({ ...shared, duration: 4 }), /5 到 15/)
  assert.throws(() => buildVideoV2SubmitPayload({ ...shared, duration: 16 }), /5 到 15/)
  assert.throws(() => buildVideoV2SubmitPayload({ ...shared, duration: 7.5 }), /5 到 15/)
})

test('rejects unsupported special-price V2 reference media', () => {
  const shared = {
    model: 'video-v2-特价版',
    prompt: 'reference subject',
    images: [],
    videos: [],
    audios: [],
    aspectRatio: '16:9',
    duration: 5,
    resolution: '720p',
    generateAudio: true,
  }
  assert.doesNotThrow(() => buildVideoV2SubmitPayload({
    ...shared,
    images: Array.from({ length: 9 }, (_, index) => `https://example.com/${index}.jpg`),
  }))
  assert.throws(() => buildVideoV2SubmitPayload({
    ...shared,
    images: Array.from({ length: 10 }, (_, index) => `https://example.com/${index}.jpg`),
  }), /最多支持 9 张参考图/)
  assert.throws(() => buildVideoV2SubmitPayload({ ...shared, videos: ['https://example.com/reference.mp4'] }), /不支持参考视频/)
  assert.throws(() => buildVideoV2SubmitPayload({ ...shared, audios: ['https://example.com/reference.mp3'] }), /不支持参考音频/)
})

test('rejects models without an internal video-v2 request configuration', () => {
  for (const model of ['video-v2-mini', 'video-v2-满血兜底版']) {
    assert.throws(() => buildVideoV2SubmitPayload({
      model,
      prompt: 'square composition',
      images: [],
      videos: [],
      audios: [],
      aspectRatio: '1:1',
      duration: 15,
      resolution: '720p',
      generateAudio: false,
    }), /只能用于 video-v2 或 video-v2-fast/)
  }
})

test('normalizes valid English, full-width and Chinese media mentions', () => {
  const result = normalizeVideoV2Mentions(
    '让＠image2跟随 @参考视频1，并采用 @音频3；保留 @Image1。',
    { images: 2, videos: 1, audios: 3 },
  )

  assert.equal(result.valid, true)
  assert.deepEqual(result.invalidTokens, [])
  assert.equal(result.prompt, '让@Image2跟随 @Video1，并采用 @Audio3；保留 @Image1。')
})

test('reports zero, leading-zero and out-of-range media mentions without rewriting them', () => {
  const prompt = '@Image0 @参考图10 @Video4 @Audio01 @Audio3 @参考音频1'
  const normalized = normalizeVideoV2Mentions(prompt, { images: 9, videos: 3, audios: 1 })
  const validation = validateVideoV2Mentions(prompt, { images: 9, videos: 3, audios: 1 })

  assert.equal(normalized.valid, false)
  assert.equal(normalized.prompt, '@Image0 @参考图10 @Video4 @Audio01 @Audio3 @Audio1')
  assert.deepEqual(normalized.invalidTokens, ['@Image0', '@参考图10', '@Video4', '@Audio01', '@Audio3'])
  assert.deepEqual(validation, {
    valid: false,
    invalidTokens: ['@Image0', '@参考图10', '@Video4', '@Audio01', '@Audio3'],
  })
})
