import assert from 'node:assert/strict'
import test from 'node:test'

import { compileReferenceMentions } from '../src/referenceMentions.ts'
import { buildMiniMaxH3SubmitPayload, buildVideoSubmitPayload } from '../src/videoPayload.ts'
import {
  MINIMAX_H3_VIDEO_SIZES,
  isMiniMaxH3VideoModel,
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
  assert.equal(isMiniMaxH3VideoModel(' minimax-h3-933-1440p-gf '), true)
  assert.equal(isMiniMaxH3VideoModel('video-v2'), false)
  for (const seconds of [5, 10, 15]) assert.equal(isValidMiniMaxH3VideoSeconds(seconds), true)
  for (const seconds of [4, 16, 5.5, '']) assert.equal(isValidMiniMaxH3VideoSeconds(seconds), false)
  for (const size of MINIMAX_H3_VIDEO_SIZES) assert.equal(isValidMiniMaxH3VideoSize(size), true)
  assert.equal(isValidMiniMaxH3VideoSize('1920x1080'), false)
})

test('builds MiniMax-H3 JSON without legacy or video-v2 fields', () => {
  const images = Object.freeze([
    'https://video.kkone.vip/api/uploads/one.jpg',
    'https://video.kkone.vip/api/uploads/two.png',
  ])
  const payload = buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '保持参考图主体一致并缓慢推进镜头',
    seconds: 12,
    size: '2560x1440',
    audio: true,
    images,
  })

  assert.deepEqual(Object.keys(payload), ['model', 'prompt', 'seconds', 'size', 'audio', 'images'])
  assert.deepEqual(payload.images, images)
  assert.notEqual(payload.images, images)
  for (const unsupportedField of ['duration', 'aspect_ratio', 'resolution', 'generate_audio', 'videos', 'audios', 'quality', 'async']) {
    assert.equal(unsupportedField in payload, false)
  }
})

test('allows text-only MiniMax-H3 requests and rejects more than five images', () => {
  const payload = buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: '城市夜景中的平稳镜头',
    seconds: 5,
    size: '1920x1440',
    audio: false,
    images: [],
  })
  assert.equal('images' in payload, false)
  assert.throws(() => buildMiniMaxH3SubmitPayload({
    model: 'MiniMax-H3-933-1440P-GF',
    prompt: 'too many',
    seconds: 5,
    size: '1440x2560',
    audio: true,
    images: Array.from({ length: 6 }, (_, index) => `https://example.com/${index}.jpg`),
  }), /最多支持 5 张参考图/)
})
