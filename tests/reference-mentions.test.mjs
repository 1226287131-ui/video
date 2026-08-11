import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compileReferenceMentions,
  findActiveReferenceMention,
  getReferenceMentionNumbers,
  reindexReferenceMentionsAfterRemoval,
} from '../src/referenceMentions.ts'

test('compileReferenceMentions leaves a prompt without mentions unchanged', () => {
  const prompt = '让人物缓慢走向镜头'

  assert.deepEqual(compileReferenceMentions(prompt, 3), {
    prompt,
    referencedNumbers: [],
    invalidTokens: [],
    incomplete: false,
  })
})

test('compileReferenceMentions treats @参考图10 as one reference', () => {
  const result = compileReferenceMentions('以 @参考图10 作为场景', 10)

  assert.deepEqual(result.referencedNumbers, [10])
  assert.deepEqual(result.invalidTokens, [])
  assert.equal(result.incomplete, false)
  assert.match(result.prompt, /第10张参考图对应 REFERENCE_9/)
  assert.match(result.prompt, /第10张参考图（REFERENCE_9）/)
  assert.doesNotMatch(result.prompt, /REFERENCE_0\D*0/)
})

test('compileReferenceMentions compiles every repeated mention but records its number once', () => {
  const result = compileReferenceMentions('@参考图2 中的人物保持 @参考图2 的服饰', 3)
  const [, compiledBody] = result.prompt.split('\n\n')

  assert.deepEqual(result.referencedNumbers, [2])
  assert.equal(compiledBody.match(/第2张参考图（REFERENCE_1）/g)?.length, 2)
})

test('compileReferenceMentions rejects zero, out-of-range, and leading-zero numbers', () => {
  const prompt = '@参考图0、@参考图11、@参考图01 都不合法'
  const result = compileReferenceMentions(prompt, 10)

  assert.equal(result.prompt, prompt)
  assert.deepEqual(result.referencedNumbers, [])
  assert.deepEqual(result.invalidTokens, ['@参考图0', '@参考图11', '@参考图01'])
  assert.equal(result.incomplete, false)
})

test('compileReferenceMentions ignores email-like, decimal, and ASCII-suffixed text', () => {
  const prompt = 'user@参考图1.com @参考图1.5 @参考图2abc @参考图3_name'

  assert.deepEqual(compileReferenceMentions(prompt, 10), {
    prompt,
    referencedNumbers: [],
    invalidTokens: [],
    incomplete: false,
  })
})

test('compileReferenceMentions reports each supported unfinished mention', () => {
  for (const mention of ['@参', '@参考', '@参考图']) {
    const prompt = `正在输入 ${mention}`
    const result = compileReferenceMentions(prompt, 3)

    assert.equal(result.prompt, prompt)
    assert.deepEqual(result.referencedNumbers, [])
    assert.deepEqual(result.invalidTokens, [])
    assert.equal(result.incomplete, true, mention)
  }
})

test('ordinary mentions and longer words are neither incomplete nor active', () => {
  for (const mention of ['@朋友', '@参考图片库']) {
    const result = compileReferenceMentions(mention, 3)

    assert.equal(result.incomplete, false, mention)
    assert.deepEqual(result.referencedNumbers, [])
    assert.equal(findActiveReferenceMention(mention, mention.length), null, mention)
  }
})

test('getReferenceMentionNumbers deduplicates in encounter order and honors referenceCount', () => {
  const prompt = '@参考图3 @参考图1 @参考图3 @参考图2 @参考图4'

  assert.deepEqual(getReferenceMentionNumbers(prompt), [3, 1, 2, 4])
  assert.deepEqual(getReferenceMentionNumbers(prompt, 2), [1, 2])
})

test('reindexReferenceMentionsAfterRemoval preserves at-sign style after removing the first image', () => {
  assert.equal(
    reindexReferenceMentionsAfterRemoval('@参考图2 和 ＠参考图10', 1),
    '@参考图1 和 ＠参考图9',
  )
})

test('reindexReferenceMentionsAfterRemoval decrements only later references after a middle image', () => {
  assert.equal(
    reindexReferenceMentionsAfterRemoval('@参考图4 和 ＠参考图10', 3),
    '@参考图3 和 ＠参考图9',
  )
})

test('findActiveReferenceMention returns the mention touching the cursor', () => {
  const value = '让 @参考图2 中的人物走动'
  const cursor = value.indexOf(' ' , 2)

  assert.deepEqual(findActiveReferenceMention(value, cursor), {
    start: 2,
    end: cursor,
    query: '参考图2',
  })
})

test('findActiveReferenceMention supports a full-width at sign and a cursor in the middle', () => {
  const value = '让 ＠参考图10 作为背景'
  const cursor = value.indexOf('10') + 1

  assert.deepEqual(findActiveReferenceMention(value, cursor), {
    start: 2,
    end: cursor,
    query: '参考图1',
  })
})

test('findActiveReferenceMention recognizes supported unfinished queries', () => {
  for (const mention of ['@参', '@参考', '@参考图']) {
    assert.deepEqual(findActiveReferenceMention(mention, mention.length), {
      start: 0,
      end: mention.length,
      query: mention.slice(1),
    })
  }
})

test('findActiveReferenceMention ignores email-like and suffixed reference text', () => {
  for (const value of ['user@参考图1', '@参考图1.5', '@参考图2abc']) {
    assert.equal(findActiveReferenceMention(value, value.length), null, value)
  }
})

test('findActiveReferenceMention stops at whitespace or punctuation', () => {
  assert.equal(findActiveReferenceMention('让 @参考图1 中的人物', 9), null)
  assert.equal(findActiveReferenceMention('让 @参考图1，', 8), null)
  assert.equal(findActiveReferenceMention('没有引用', 4), null)
})
