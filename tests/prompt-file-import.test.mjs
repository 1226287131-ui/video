import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decodePromptFile,
  detectPromptFileKind,
  extractPromptText,
  MAX_IMPORTED_PROMPT_CHARS,
  mergeImportedPrompt,
} from '../src/promptFileImport.ts'

test('detectPromptFileKind accepts supported extensions and rejects disguised files', () => {
  assert.equal(detectPromptFileKind('PROMPT.JSON'), 'json')
  assert.equal(detectPromptFileKind('scene.markdown'), 'markdown')
  assert.equal(detectPromptFileKind('scene.md', ''), 'markdown')
  assert.equal(detectPromptFileKind('prompt', 'application/json'), 'json')
  assert.equal(detectPromptFileKind('prompt.json.exe', 'application/json'), null)
  assert.equal(detectPromptFileKind('prompt.txt', 'text/markdown'), null)
})

test('decodePromptFile supports UTF-8 BOM and normalizes newlines', () => {
  const payload = new TextEncoder().encode('第一行\r\n第二行')
  const bytes = new Uint8Array(payload.length + 3)
  bytes.set([0xef, 0xbb, 0xbf])
  bytes.set(payload, 3)
  assert.equal(decodePromptFile(bytes), '第一行\n第二行')
})

test('decodePromptFile supports UTF-16LE BOM and rejects invalid UTF-8', () => {
  const utf16 = new Uint8Array([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59])
  assert.equal(decodePromptFile(utf16), '你好')
  assert.throws(() => decodePromptFile(new Uint8Array([0xc3, 0x28])), /编码无法识别/)
})

test('markdown content remains intact', () => {
  const markdown = '# 镜头\n\n- 缓慢推进\n- 保留 @参考图1\n\n```text\n雨夜\n```'
  assert.equal(extractPromptText(markdown, 'markdown'), markdown)
})

test('JSON extraction prefers explicit prompt fields inside known wrappers', () => {
  const raw = JSON.stringify({ text: '不要选我', request: { body: { prompt: '选择这个镜头描述' } } })
  assert.equal(extractPromptText(raw, 'json'), '选择这个镜头描述')
  assert.equal(extractPromptText('{"Prompt":"大小写兼容"}', 'json'), '大小写兼容')
})

test('JSON extraction supports root strings and the last user message parts', () => {
  assert.equal(extractPromptText(JSON.stringify('根字符串 Prompt'), 'json'), '根字符串 Prompt')
  const messages = JSON.stringify({ messages: [
    { role: 'user', content: '旧描述' },
    { role: 'assistant', content: '回复' },
    { role: 'user', content: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }] },
  ] })
  assert.equal(extractPromptText(messages, 'json'), '第一段\n\n第二段')
})

test('JSON without a prompt field falls back to formatted JSON', () => {
  assert.equal(
    extractPromptText('{"model":"video-v1","duration":5}', 'json'),
    '{\n  "model": "video-v1",\n  "duration": 5\n}',
  )
})

test('invalid and empty JSON prompt values fail without fallback', () => {
  assert.throws(() => extractPromptText('{"prompt":""}', 'json'), /Prompt 为空/)
  assert.throws(() => extractPromptText('{"prompt":}', 'json'), /JSON 文件格式无效/)
  assert.throws(() => extractPromptText('null', 'json'), /没有可导入/)
})

test('imported prompt length is bounded', () => {
  assert.throws(
    () => extractPromptText('x'.repeat(MAX_IMPORTED_PROMPT_CHARS + 1), 'markdown'),
    /超过 20,000 字符/,
  )
})

test('mergeImportedPrompt fills, inserts, and replaces without losing text', () => {
  assert.deepEqual(mergeImportedPrompt('', '新 Prompt'), {
    prompt: '新 Prompt', cursor: 8, mode: 'filled',
  })
  assert.deepEqual(mergeImportedPrompt('开头结尾', '中间', 2, 2), {
    prompt: '开头\n\n中间\n\n结尾', cursor: 6, mode: 'inserted',
  })
  assert.deepEqual(mergeImportedPrompt('保留旧内容', '替换', 2, 4), {
    prompt: '保留替换容', cursor: 4, mode: 'replaced',
  })
})
