import assert from 'node:assert/strict'
import test from 'node:test'

import { compileReferenceMentions } from '../src/referenceMentions.ts'
import { buildMiniMaxH3SubmitPayload, buildVideoSubmitPayload } from '../src/videoPayload.ts'
import {
  getMiniMaxH3VideoSizesForAspectRatio,
  MINIMAX_H3_ASPECT_RATIOS,
  MINIMAX_H3_MAX_AUDIOS,
  MINIMAX_H3_MAX_IMAGES,
  MINIMAX_H3_MAX_VIDEO_AUDIOS,
  MINIMAX_H3_MAX_VIDEOS,
  MINIMAX_H3_VIDEO_SIZES,
  isMiniMaxH3VideoModel,
  isValidMiniMaxH3AspectRatio,
  isValidMiniMaxH3Multiple,
  isValidMiniMaxH3VideoSeconds,
  isValidMiniMaxH3VideoSize,
} from '../src/minimaxH3.ts'

const form = {
  model: 'video-v1',
  duration: 5,
  ratio: '16:9',
  quality: 'hd',
}

test('multiple-image payload preserves reference order and compiled mention mapping', () => {
  const urls = Object.freeze(['https://example.com/one.jpg', 'https://example.com/two.jpg'])
  const compilation = compileReferenceMentions('让 @参考图2 使用 @参考图1 的场景', urls.length)
  const payload = buildVideoSubmitPayload(form, compilation.prompt, 'image', 'multiple', urls)

  assert.deepEqual(payload.images, urls)
  assert.notEqual(payload.images, urls)
  assert.equal(payload.aspect_ratio, '16:9')
  assert.equal('quality' in payload, false)
  assert.equal('async' in payload, false)
  assert.match(payload.prompt, /第2张参考图对应 REFERENCE_1/)
  assert.match(payload.prompt, /第1张参考图对应 REFERENCE_0/)
  assert.match(payload.prompt, /第2张参考图（REFERENCE_1）/)
})

test('single-image payload uses the canonical images array', () => {
  const payload = buildVideoSubmitPayload(
    form,
    '保持参考图主体一致',
    'image',
    'single',
    ['https://example.com/one.jpg'],
  )

  assert.deepEqual(payload.images, ['https://example.com/one.jpg'])
  assert.equal('image' in payload, false)
})

test('text payload never includes reference image fields', () => {
  const payload = buildVideoSubmitPayload(
    form,
    '纯文字生成视频',
    'text',
    'multiple',
    ['https://example.com/unused.jpg'],
  )

  assert.equal('image' in payload, false)
  assert.equal('images' in payload, false)
  assert.equal(payload.aspect_ratio, '16:9')
  assert.equal('quality' in payload, false)
  assert.equal('async' in payload, false)
})

test('recognizes and validates the MiniMax-H3 contract', () => {
  assert.equal(isMiniMaxH3VideoModel('MiniMax-H3-933-1440P-GF'), true)
  assert.equal(isMiniMaxH3VideoModel('minimax_h3'), true)
  assert.equal(isMiniMaxH3VideoModel(' minimax-h3-933-1440p-gf '), true)
  assert.equal(isMiniMaxH3VideoModel('video-v2'), false)
  for (const seconds of [4, 5, 10, 15]) assert.equal(isValidMiniMaxH3VideoSeconds(seconds), true)
  for (const seconds of [3, 16, 5.5, '']) assert.equal(isValidMiniMaxH3VideoSeconds(seconds), false)
  for (const size of MINIMAX_H3_VIDEO_SIZES) assert.equal(isValidMiniMaxH3VideoSize(size), true)
  for (const ratio of MINIMAX_H3_ASPECT_RATIOS) {
    assert.equal(isValidMiniMaxH3AspectRatio(ratio), true)
    assert.ok(getMiniMaxH3VideoSizesForAspectRatio(ratio).length >= 12)
  }
  assert.equal(isValidMiniMaxH3AspectRatio('auto'), false)
  assert.equal(isValidMiniMaxH3VideoSize('1920x1088'), true)
  assert.equal(isValidMiniMaxH3VideoSize('1376x768'), true)
  assert.equal(isValidMiniMaxH3VideoSize('not-a-size'), false)
  for (const multiple of [8, 16, 128]) assert.equal(isValidMiniMaxH3Multiple(multiple), true)
  for (const multiple of [4, 10, 132, 9]) assert.equal(isValidMiniMaxH3Multiple(multiple), false)
})

test('keeps ordinary MiniMax-H3 requests to user-facing fields and backend defaults', () => {
  const payload = buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '清晨的城市天际线，镜头缓慢推进。',
    seconds: 10,
    size: '1920x1088',
    images: ['https://video.kkone.vip/api/uploads/city.jpg'],
    clarity: '',
    resolution: '  ',
    aspect_ratio: ' ',
    megapixels: ' ',
    metadataMultiple: ' ',
  })

  assert.deepEqual(payload, {
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '清晨的城市天际线，镜头缓慢推进。',
    seconds: 10,
    size: '1920x1088',
    images: ['https://video.kkone.vip/api/uploads/city.jpg'],
  })
  for (const advancedField of ['audio', 'prompt_enhance', 'resolution', 'clarity', 'aspect_ratio', 'megapixels', 'metadata']) {
    assert.equal(advancedField in payload, false)
  }
})

test('builds MiniMax-H3 JSON with duration and all documented reference fields', () => {
  const images = Object.freeze([
    'https://video.kkone.vip/api/uploads/one.jpg',
    'https://video.kkone.vip/api/uploads/two.png',
  ])
  const videos = Object.freeze(['https://video.kkone.vip/api/uploads/motion.mp4'])
  const videoAudios = Object.freeze(['https://video.kkone.vip/api/uploads/motion.mp3'])
  const audios = Object.freeze(['https://video.kkone.vip/api/uploads/music.mp3'])
  const payload = buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '保持参考图主体一致并缓慢推进镜头',
    duration: 12,
    seconds: 4,
    size: '1920x1080',
    audio: true,
    promptEnhance: true,
    metadataMultiple: 16,
    images,
    referenceVideos: videos,
    referenceVideoAudios: videoAudios,
    referenceAudios: audios,
  })

  assert.deepEqual(Object.keys(payload), [
    'model',
    'prompt',
    'duration',
    'size',
    'audio',
    'prompt_enhance',
    'images',
    'reference_videos',
    'reference_video_audios',
    'reference_audios',
    'metadata',
  ])
  assert.equal(payload.duration, 12)
  assert.equal('seconds' in payload, false)
  assert.deepEqual(payload.images, images)
  assert.notEqual(payload.images, images)
  assert.deepEqual(payload.reference_videos, videos)
  assert.deepEqual(payload.reference_video_audios, videoAudios)
  assert.deepEqual(payload.reference_audios, audios)
  assert.deepEqual(payload.metadata, { multiple: 16 })
  for (const unsupportedField of ['generate_audio', 'videos', 'audios', 'quality', 'async']) {
    assert.equal(unsupportedField in payload, false)
  }
})

test('allows text-only MiniMax-H3 requests and enforces per-media limits', () => {
  const payload = buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '城市夜景中的平稳镜头',
    duration: 5,
    size: '1376x768',
    audio: false,
    images: [],
  })
  assert.equal('images' in payload, false)
  assert.equal(payload.duration, 5)
  assert.throws(() => buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: 'too many',
    duration: 5,
    size: '1376x768',
    audio: true,
    images: Array.from({ length: MINIMAX_H3_MAX_IMAGES + 1 }, (_, index) => `https://example.com/image-${index}.jpg`),
  }), /最多支持 9 个参考图片/)
  assert.throws(() => buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: 'too many videos',
    duration: 5,
    referenceVideos: Array.from({ length: MINIMAX_H3_MAX_VIDEOS + 1 }, (_, index) => `https://example.com/video-${index}.mp4`),
  }), /最多支持 3 个参考视频/)
  assert.throws(() => buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: 'too many video audios',
    duration: 5,
    referenceVideoAudios: Array.from({ length: MINIMAX_H3_MAX_VIDEO_AUDIOS + 1 }, (_, index) => `https://example.com/video-audio-${index}.mp3`),
  }), /最多支持 3 个视频配套音频/)
  assert.throws(() => buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: 'too many audios',
    duration: 5,
    referenceAudios: Array.from({ length: MINIMAX_H3_MAX_AUDIOS + 1 }, (_, index) => `https://example.com/audio-${index}.mp3`),
  }), /最多支持 3 个独立参考音频/)
})

test('deduplicates MiniMax references by URL and file name', () => {
  const payload = buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '去重参考素材',
    duration: 5,
    images: [
      'https://one.example.com/person.png',
      'https://two.example.com/person.png',
      'https://one.example.com/person.png?duplicate=1',
      'https://one.example.com/outfit.png',
    ],
  })
  assert.deepEqual(payload.images, [
    'https://one.example.com/person.png',
    'https://one.example.com/outfit.png',
  ])
})

test('duration takes precedence over seconds and metadata.multiple is validated', () => {
  const payload = buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '优先使用 duration',
    duration: 10,
    seconds: 4,
    metadata: { multiple: 32 },
  })
  assert.equal(payload.duration, 10)
  assert.equal('seconds' in payload, false)
  assert.deepEqual(payload.metadata, { multiple: 32 })
  for (const multiple of [4, 7, 10, 132]) {
    assert.throws(() => buildMiniMaxH3SubmitPayload({
      model: 'MiniMax-H3-933-1440P-GF',
      prompt: 'invalid multiple',
      duration: 5,
      multiple,
    }), /metadata\.multiple/)
  }
})

test('enforces MiniMax-H3 first-last-frame constraints', () => {
  const images = [
    'https://video.kkone.vip/api/uploads/first.jpg',
    'https://video.kkone.vip/api/uploads/last.jpg',
  ]
  const payload = buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '从首帧平滑过渡到尾帧。',
    seconds: 5,
    mode: 'first_last_frame',
    images,
  })
  assert.equal(payload.mode, 'first_last_frame')
  assert.deepEqual(payload.images, images)

  assert.throws(() => buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '缺少尾帧。',
    mode: 'first_last_frame',
    images: images.slice(0, 1),
  }), /恰好提供两张参考图片/)
  assert.throws(() => buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '混用素材。',
    mode: 'first_last_frame',
    images,
    referenceVideos: ['https://video.kkone.vip/api/uploads/reference.mp4'],
  }), /不能同时使用参考视频或参考音频/)
})
