import assert from 'node:assert/strict'
import test from 'node:test'

import { getMissingVideoV2ModelIds, getMissingVideoV3LowPriceModelIds, getReplacementModelId } from '../src/modelSelection.ts'

test('uses the first available model when the stored model has been taken offline', () => {
  const replacement = getReplacementModelId('video-v1', [
    { id: 'grok-imagine-1.5-video' },
    { id: 'video-v2' },
  ])

  assert.equal(replacement, 'grok-imagine-1.5-video')
})

test('keeps a user-selected model that remains available', () => {
  const replacement = getReplacementModelId('video-v2', [
    { id: 'grok-imagine-1.5-video' },
    { id: 'video-v2' },
  ])

  assert.equal(replacement, '')
})

test('uses the API canonical id when only its letter casing changes', () => {
  const replacement = getReplacementModelId('GROK-IMAGINE-1.5-VIDEO', [
    { id: 'grok-imagine-1.5-video' },
  ])

  assert.equal(replacement, 'grok-imagine-1.5-video')
})

test('keeps both Video V2 aliases selectable when the gateway omits them', () => {
  assert.deepEqual(getMissingVideoV2ModelIds([{ id: 'video-v2' }]), [
    'video-v2-fast',
    'video-v2（限时低价渠道）',
    'video-v2-fast（限时低价渠道）',
  ])
  assert.deepEqual(getMissingVideoV2ModelIds([
    { id: 'VIDEO-V2' },
    { id: 'VIDEO-V2-FAST' },
    { id: 'video-v2（限时低价渠道）' },
    { id: 'video-v2-fast（限时低价渠道）' },
  ]), [])
})

test('keeps low-price V3 channel aliases selectable when the gateway omits them', () => {
  assert.deepEqual(getMissingVideoV3LowPriceModelIds([{ id: 'video-v3（限时低价渠道）' }]), [])
  assert.deepEqual(getMissingVideoV3LowPriceModelIds([{ id: 'video-v3' }]), [
    'video-v3（限时低价渠道）',
  ])
})
