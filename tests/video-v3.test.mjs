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
  isValidVideoV3Resolution,
  VIDEO_V3_MEDIA_LIMITS,
  VIDEO_V3_RATIOS,
  VIDEO_V3_RESOLUTIONS,
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

test('validates the documented SD2.5 durations, ratios, resolution, and optional grid strength', () => {
  for (const duration of [4, 10, 29, '12']) assert.equal(isValidVideoV3Duration(duration), true)
  for (const duration of [3, 30, 31, 4.5, '', 'abc']) assert.equal(isValidVideoV3Duration(duration), false)

  for (const ratio of VIDEO_V3_RATIOS) assert.equal(isValidVideoV3Ratio(ratio), true)
  for (const ratio of ['auto', '21:9', '4:3', '3:4', '2:3']) assert.equal(isValidVideoV3Ratio(ratio), false)

  for (const resolution of VIDEO_V3_RESOLUTIONS) assert.equal(isValidVideoV3Resolution(resolution), true)
  assert.equal(isValidVideoV3Resolution('1080p'), false)

  for (const strength of [0.01, 0.2, 0.5]) assert.equal(isValidVideoV3GridStrength(strength), true)
  for (const strength of [0, 0.001, 0.51, 1, Number.NaN]) assert.equal(isValidVideoV3GridStrength(strength), false)
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
    gridStrength: 0.2,
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
  assert.equal(payload.grid_strength, 0.2)
  for (const unsupportedField of ['seconds', 'aspect_ratio', 'quality', 'async', 'content', 'input_reference', 'videos', 'audios']) {
    assert.equal(unsupportedField in payload, false)
  }
})

test('uses documented top-level media arrays for multimedia video-v3 requests', () => {
  const payload = buildVideoV3SubmitPayload({
    model: 'seedance2.5',
    prompt: '保持人物形象，并使用参考运镜和环境声音。',
    duration: 12,
    ratio: '9:16',
    images: [],
    videos: ['https://cdn.example.com/camera.mp4'],
    audios: ['https://cdn.example.com/ambient.mp3', 'https://cdn.example.com/ambient.mp3'],
    generateAudio: false,
    resolution: '720p',
    size: '1280x720',
    startFrameUrl: 'https://cdn.example.com/start.jpg',
  })

  assert.equal(payload.model, 'seedance2.5')
  assert.equal(payload.duration, 12)
  assert.equal(payload.ratio, '9:16')
  assert.equal(payload.resolution, '720p')
  assert.equal(payload.size, '1280x720')
  assert.equal(payload.start_frame_url, 'https://cdn.example.com/start.jpg')
  assert.equal(payload.generate_audio, false)
  assert.equal(payload.prompt, '保持人物形象，并使用参考运镜和环境声音。')
  assert.equal('images' in payload, false)
  assert.deepEqual(payload.videos, ['https://cdn.example.com/camera.mp4'])
  assert.deepEqual(payload.audios, ['https://cdn.example.com/ambient.mp3'])
  assert.equal('content' in payload, false)
})

test('omits optional SD2.5 media and passthrough fields when they were not chosen', () => {
  const payload = buildVideoV3SubmitPayload({
    model: 'seedance-2.5',
    prompt: '城市夜景缓慢推进镜头',
    duration: 4,
    ratio: '16:9',
    images: [],
    videos: [],
    audios: [],
    generateAudio: false,
  })

  assert.equal('images' in payload, false)
  assert.equal('videos' in payload, false)
  assert.equal('audios' in payload, false)
  assert.equal('content' in payload, false)
  assert.equal(payload.resolution, '480p')
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
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, duration: 30 }), /4 到 29/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, ratio: '2:3' }), /不支持该画幅/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, resolution: '1080p' }), /resolution/)
  assert.throws(() => buildVideoV3SubmitPayload({
    ...shared,
    images: Array.from({ length: VIDEO_V3_MEDIA_LIMITS.images + 1 }, (_, index) => `https://example.com/${index}.jpg`),
  }), /最多支持 30/)
  assert.throws(() => buildVideoV3SubmitPayload({
    ...shared,
    audios: Array.from({ length: VIDEO_V3_MEDIA_LIMITS.audios + 1 }, (_, index) => `https://example.com/${index}.mp3`),
  }), /最多支持 10/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, videos: [''] }), /非空 URL/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, gridStrength: 0 }), /0.01 到 0.5/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, seed: 4294967296 }), /0 到 4294967295/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, images: ['https://example.com/a.jpg'], startFrameUrl: 'https://example.com/start.jpg' }), /不能与图片参考/)
  assert.throws(() => buildVideoV3SubmitPayload({ ...shared, size: '720p' }), /宽x高/)
})
