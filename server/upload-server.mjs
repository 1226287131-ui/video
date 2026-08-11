import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import Busboy from 'busboy'

const PORT = Number(process.env.UPLOAD_PORT || 8787)
const HOST = process.env.UPLOAD_HOST || '127.0.0.1'
const MEGABYTE = 1024 * 1024
const MAX_IMAGE_FILE_BYTES = Number(process.env.UPLOAD_MAX_IMAGE_FILE_BYTES || 20 * MEGABYTE)
const MAX_AUDIO_FILE_BYTES = Number(process.env.UPLOAD_MAX_AUDIO_FILE_BYTES || 50 * MEGABYTE)
const MAX_VIDEO_FILE_BYTES = Number(process.env.UPLOAD_MAX_VIDEO_FILE_BYTES || 200 * MEGABYTE)
const MAX_FILE_BYTES = Math.max(MAX_IMAGE_FILE_BYTES, MAX_AUDIO_FILE_BYTES, MAX_VIDEO_FILE_BYTES)
const MAX_FILES = Number(process.env.UPLOAD_MAX_FILES || 15)
const TTL_MS = Number(process.env.UPLOAD_TTL_MS || 12 * 60 * 60 * 1000)
const CLEANUP_INTERVAL_MS = Number(process.env.UPLOAD_CLEANUP_INTERVAL_MS || 12 * 60 * 60 * 1000)
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-uploads'))

const uploadPolicies = {
  image: {
    label: '图片',
    maxBytes: MAX_IMAGE_FILE_BYTES,
    mimeTypes: {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    },
  },
  audio: {
    label: '音频',
    maxBytes: MAX_AUDIO_FILE_BYTES,
    mimeTypes: {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/wave': 'wav',
      'audio/vnd.wave': 'wav',
      'audio/mp4': 'm4a',
      'audio/m4a': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/aac': 'aac',
      'audio/x-aac': 'aac',
      'audio/ogg': 'ogg',
      'application/ogg': 'ogg',
    },
  },
  video: {
    label: '视频',
    maxBytes: MAX_VIDEO_FILE_BYTES,
    mimeTypes: {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
    },
  },
}

const mimeToPolicy = new Map()
for (const [kind, policy] of Object.entries(uploadPolicies)) {
  for (const [mimeType, extension] of Object.entries(policy.mimeTypes)) {
    mimeToPolicy.set(mimeType, { kind, label: policy.label, maxBytes: policy.maxBytes, extension, mimeType })
  }
}

const extensionToMime = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

const safeExtensions = Object.keys(extensionToMime)
const safeIdPattern = new RegExp(`^[a-f0-9]{48}\\.(?:${safeExtensions.join('|')})$`)
const acceptedFileFields = new Set(['file', 'files', 'image', 'images', 'audio', 'audios', 'video', 'videos', 'reference', 'references'])

const videoHostSuffixes = ['.douyin.com', '.douyinvod.com', '.byteimg.com', '.ibytedtos.com']

await fs.promises.mkdir(uploadDir, { recursive: true })

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function publicUrl(req, id) {
  const configuredBase = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  if (configuredBase) return `${configuredBase}/api/uploads/${id}`
  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0]
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`).split(',')[0]
  return `${forwardedProto}://${forwardedHost}/api/uploads/${id}`
}

function isSafeId(id) {
  return typeof id === 'string' && safeIdPattern.test(id)
}

function formatLimit(maxBytes) {
  const megabytes = maxBytes / MEGABYTE
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)}MB`
}

function fileLimitMessage(policy) {
  return `${policy.label}单文件不能超过 ${formatLimit(policy.maxBytes)}`
}

function createByteLimitTransform(maxBytes, message) {
  let total = 0
  return new Transform({
    transform(chunk, encoding, callback) {
      total += chunk.length
      if (total > maxBytes) {
        callback(new Error(message))
        return
      }
      callback(null, chunk)
    },
  })
}

async function removeFile(id) {
  if (!isSafeId(id)) return false
  try {
    await fs.promises.unlink(path.join(uploadDir, id))
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function cleanupExpired() {
  const now = Date.now()
  const names = await fs.promises.readdir(uploadDir).catch(() => [])
  await Promise.all(names.filter(isSafeId).map(async (name) => {
    const stat = await fs.promises.stat(path.join(uploadDir, name)).catch(() => null)
    if (stat && now - stat.mtimeMs > TTL_MS) await removeFile(name)
  }))
}

async function readBody(req, maxBytes = 128 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function handleUpload(req, res) {
  const contentType = String(req.headers['content-type'] || '')
  if (!contentType.startsWith('multipart/form-data')) {
    return json(res, 415, { error: 'multipart/form-data is required' })
  }

  const busboy = Busboy({
    headers: req.headers,
    // Busboy emits `limit` when the boundary is reached, so allow one extra
    // byte to make the configured business limit inclusive.
    limits: { fileSize: MAX_FILE_BYTES + 1, files: MAX_FILES },
  })
  const created = []
  const writes = []
  let rejected = ''

  busboy.on('file', (fieldName, file, info) => {
    if (!acceptedFileFields.has(fieldName)) {
      file.resume()
      return
    }
    const policy = mimeToPolicy.get(String(info.mimeType || '').toLowerCase())
    if (!policy) {
      rejected ||= '不支持的参考文件类型；图片支持 JPG/PNG/WebP，音频支持 MP3/WAV/M4A/AAC/OGG，视频支持 MP4/WebM/MOV'
      file.resume()
      return
    }

    const id = `${crypto.randomBytes(24).toString('hex')}.${policy.extension}`
    const destination = path.join(uploadDir, id)
    const limitMessage = fileLimitMessage(policy)
    const originalName = String(info.filename || '').slice(0, 255)
    created.push({ id, policy, originalName })
    file.on('limit', () => { rejected ||= limitMessage })
    writes.push(
      pipeline(
        file,
        createByteLimitTransform(policy.maxBytes, limitMessage),
        fs.createWriteStream(destination),
      ).catch((error) => {
        rejected ||= error?.message || `${policy.label}上传失败`
        throw error
      }),
    )
  })

  busboy.on('filesLimit', () => { rejected ||= `每次最多上传 ${MAX_FILES} 个参考文件` })
  busboy.on('error', (error) => { rejected ||= error.message || '参考文件上传失败' })
  req.pipe(busboy)
  await new Promise((resolve) => busboy.on('finish', resolve))
  const writeResults = await Promise.allSettled(writes)
  if (writeResults.some((result) => result.status === 'rejected')) rejected ||= '参考文件上传失败'

  if (rejected || created.length === 0) {
    await Promise.all(created.map((item) => removeFile(item.id)))
    return json(res, 400, { error: rejected || '至少上传一个参考文件' })
  }

  return json(res, 201, {
    files: created.map(({ id, policy, originalName }) => ({
      id,
      url: publicUrl(req, id),
      name: originalName,
      kind: policy.kind,
      mime_type: extensionToMime[policy.extension],
    })),
  })
}

async function handleCleanup(req, res) {
  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    return json(res, 400, { error: 'invalid JSON body' })
  }
  const ids = Array.isArray(body?.files)
    ? body.files.map((item) => typeof item === 'string' ? item : item?.id).filter(isSafeId)
    : []
  const removed = (await Promise.all(ids.map(removeFile))).filter(Boolean).length
  return json(res, 200, { removed })
}

async function handleAsset(req, res, id) {
  if (!isSafeId(id)) return json(res, 404, { error: 'not found' })
  const filePath = path.join(uploadDir, id)
  const extension = id.split('.').pop()
  const contentType = extensionToMime[extension]
  try {
    const stat = await fs.promises.stat(filePath)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store, max-age=0',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    })
    await pipeline(fs.createReadStream(filePath), res)
  } catch (error) {
    if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : 500, { error: 'not found' })
  }
}

function isAllowedVideoUrl(value) {
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      videoHostSuffixes.some((suffix) => parsed.hostname.endsWith(suffix))
  } catch {
    return false
  }
}

function videoSourceHost(value) {
  try {
    return new URL(value).hostname
  } catch {
    return 'invalid-source'
  }
}

async function fetchVideoSource(source, req) {
  const requestHeaders = {
    Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    Referer: 'https://www.douyin.com/',
  }
  if (req.headers.range) requestHeaders.Range = req.headers.range
  const first = await fetch(source, {
    headers: requestHeaders,
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (first.ok || first.status === 206) return first
  await first.body?.cancel()
  delete requestHeaders.Referer
  return fetch(source, {
    headers: requestHeaders,
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
}

async function handleVideoProxy(req, res, source) {
  const sourceHost = videoSourceHost(source)
  if (!isAllowedVideoUrl(source)) {
    console.warn(`[video-proxy] blocked source: ${sourceHost}`)
    return json(res, 400, { error: 'unsupported video source' })
  }
  try {
    const upstream = await fetchVideoSource(source, req)
    if (!upstream.ok && upstream.status !== 206) {
      console.warn(`[video-proxy] ${sourceHost} returned HTTP ${upstream.status}`)
      await upstream.body?.cancel()
      return json(res, 502, { error: `video source returned ${upstream.status}` })
    }

    const responseHeaders = {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    }
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name)
      if (value) responseHeaders[name] = value
    }
    res.writeHead(upstream.status, responseHeaders)
    if (req.method === 'HEAD' || !upstream.body) {
      await upstream.body?.cancel()
      return res.end()
    }
    await pipeline(Readable.fromWeb(upstream.body), res)
  } catch (error) {
    console.warn(`[video-proxy] ${sourceHost} failed: ${error.message || 'upstream unavailable'}`)
    if (!res.headersSent) return json(res, 502, { error: `video proxy failed: ${error.message || 'upstream unavailable'}` })
    res.destroy()
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (req.method === 'POST' && url.pathname === '/api/uploads') return await handleUpload(req, res)
    if (req.method === 'POST' && url.pathname === '/api/uploads/cleanup') return await handleCleanup(req, res)
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/api/video-proxy') {
      return await handleVideoProxy(req, res, url.searchParams.get('url') || '')
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/uploads/')) {
      return await handleAsset(req, res, decodeURIComponent(url.pathname.slice('/api/uploads/'.length)))
    }
    return json(res, 404, { error: 'not found' })
  } catch (error) {
    return json(res, 500, { error: error.message || 'internal server error' })
  }
})

setInterval(() => cleanupExpired().catch(() => {}), CLEANUP_INTERVAL_MS).unref()
await cleanupExpired()
server.listen(PORT, HOST, () => console.log(`Temporary upload server listening on http://${HOST}:${PORT}`))
