import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getVideoContentPath,
  getVideoSubmitPath,
  getVideoTaskPath,
  isVideoV3Model,
} from '../src/videoApi.ts'
import { buildVideoV3SubmitPayload } from '../src/videoPayload.ts'
import {
  isValidVideoV3Duration,
  isValidVideoV3GridStrength,
  isValidVideoV3Ratio,
  VIDEO_V3_MEDIA_LIMITS,
  VIDEO_V3_RATIOS,
  VIDEO_V3_RESOLUTION,
} from '../src/videoV3.ts'

test('recognizes every documented SD2.5 model alias and routes it through /v1/videos', () => {
  for (const model of ['video-v3', 'Seedance-2.5', 'seedance2.5', 'SD-2.5', ' sd2.5 ']) {
    assert.equal(isVideoV3Model(model), true)
    assert.equal(getVideoSubmitPath(model), '/v1/videos')
    assert.equal(getVideoTaskPath(model, 'task/a'), '/v1/videos/task%2Fa')
    assert.equal(getVideoContentPath(model, 'task/a'), '/v1/videos/task%2Fa/content')
  }
  assert.equal(isVideoV3Model('video-v3-fast'), false)
  assert.equal(isVideoV3Model('video-v2'), false)
})

test('validates the documented SD2.5 durations, ratios, and optional grid strength', () => {
  for (const duration of [4, 10, 30, '12']) assert.equal(isValidVideoV3Duration(duration), true)
  for (const duration of [3, 31, 4.5, '', 'abc']) assert.equal(isValidVideoV3Duration(duration), false)

  for (const ratio of VIDEO_V3_RATIOS) assert.equal(isValidVideoV3Ratio(ratio), true)
  assert.equal(isValidVideoV3Ratio('2:3'), false)

  for (const strength of [0, 0.6, 1]) assert.equal(isValidVideoV3GridStrength(strength), true)
  for (const strength of [-0.01, 1.01, Number.NaN]) assert.equal(isValidVideoV3GridStrength(strength), false)
})

test('uses documented top-level prompt and images for image-only video-v3 requests', () => {
  const payload = buildVideoV3SubmitPayload({
    model: 'video-v3',
    prompt: '让人物保持参考图外观。',
    duration: 10,
    ratio: '16:9',
    images: ['https://cdn.example.com/person.png', 'https://cdn.example.com/person.png'],
    videos: [],
    audios: [],
    generateAudio: true,
    seed: 12345,
    bypassFaceCheck: false,
    gridStrength: 0.6,
  })

  assert.equal(payload.model, 'video-v3')
  assert.equal(payload.duration, 10)
  assert.equal(payload.ratio, '16:9')
  assert.equal(payload.resolution, VIDEO_V3_RESOLUTION)
  assert.equal(payload.prompt, '让人物保持参考图外观。')
  assert.deepEqual(payload.images, ['https://cdn.example.com/person.png'])
  assert.equal(payload.generate_audio, true)
  assert.equal(payload.seed, 12345)
  assert.equal(payload.bypass_face_check, false)
  assert.equal(payload.grid_strength, 0.6)
  for (const unsupportedField of ['seconds', 'aspect_ratio', 'quality', 'size', 'async', 'content', 'input_reference', 'videos', 'audios']) {
    assert.equal(unsupportedField in payload, false)
  }
})

test('uses documented content audio_url and video_url items for multimedia video-v3 requests', () => {
  const payload = buildVideoV3SubmitPayload({
    model: 'seedance2.5',
    prompt: '保持人物形象，并使用参考运镜和环境声音。',
    duration: 12,
    ratio: '9:16',
    images: ['https://cdn.example.com/person.png', 'https://cdn.example.com/person.png'],
    videos: ['https://cdn.example.com/camera.mp4'],
    audios: ['https://cdn.example.com/ambient.mp3', 'https://cdn.example.com/ambient.mp3'],
    generateAudio: false,
  })

  assert.equal(payload.model, 'seedance2.5')
  assert.equal(payload.duration, 12)
  assert.equal(payload.ratio, '9:16')
  assert.equal(payload.resolution, VIDEO_V3_RESOLUTION)
  assert.equal(payload.generate_audio, false)
  assert.deepEqual(payload.content, [
    { type: 'text', text: '保持人物形象，并使用参考运镜和环境声音。' },
    { type: 'image_url', image_url: { url: 'https://cdn.example.com/person.png' } },
    { type: 'video_url', video_url: { url: 'https://cdn.example.com/camera.mp4' } },
    { type: 'audio_url', audio_url: { url: 'https://cdn.example.com/ambient.mp3' } },
  ])
  for (const unsupportedField of ['prompt', 'images', 'videos', 'audios', 'input_reference']) {
    assert.equal(unsupportedField in payload, false)
  }
})

test('omits optional SD2.5 media and passthrough fields when they were not chosen', () => {
  const payload = buildVideoV3SubmitPayload({
    model: 'seedance-2.5',
    prompt: '城市夜景缓慢推进镜头',
    duration: 4,
    ratio: 'auto',
    images: [],
    videos: [],
    audios: [],
    generateAudio: false,
  })

  assert.equal('images' in payload, false)
  assert.equal('videos' in payload, false)
  assert.equal('audios' in payload, false)
  assert.equal('content' in payload, false)
  assert.equal('seed' in payload, false)
  assert.equal('grid_strength' in payload, false)
  assert.equal('bypass_face_check' in payload, false)
})

test('rejects invalid SD2.5 values and media limits before a request is sent', () => {
  const shared = {
    model: 'video-v3',
    prompt: 'prompt',
    duration: 10,
    ratio: '16:9',
    images: [],
    videos: [],
    audios: [],
    generateAudio: true,
  }
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, duration: 31 }), /4 到 30/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, ratio: '2:3' }), /不支持该画幅/)
  assert.throws(() => buildVideoV3SubmitPayload({
    ...shared,
    images: Array.from({ length: VIDEO_V3_MEDIA_LIMITS.images + 1 }, (_, index) => `https://example.com/${index}.jpg`),
  }), /最多支持 30/)
  assert.throws(() => buildVideoV3SubmitPayload({
    ...shared,
    audios: Array.from({ length: VIDEO_V3_MEDIA_LIMITS.audios + 1 }, (_, index) => `https://example.com/${index}.mp3`),
  }), /最多支持 10/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, videos: [''] }), /非空 URL/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, gridStrength: 1.1 }), /0 到 1/)
})
