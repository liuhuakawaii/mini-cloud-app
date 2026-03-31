interface Env {
  DB: D1Database
  CACHE: KVNamespace
  BUCKET: R2Bucket
}

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

function jsonResponse(data: JsonValue, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
    status: init?.status ?? 200,
  })
}

async function handleHealth() {
  return jsonResponse({ ok: true })
}

async function handleListFiles(env: Env) {
  // 优先从 KV 缓存读取
  const cacheKey = 'files:list:v1'
  const cached = await env.CACHE.get(cacheKey, 'json').catch(() => null)
  if (cached) {
    return jsonResponse({ fromCache: true, files: cached })
  }

  const { results } = await env.DB.prepare(
    'SELECT id, name, created_at FROM files ORDER BY created_at DESC',
  ).all()

  // 写入 KV 缓存（简单设置一个较短过期时间）
  await env.CACHE.put(cacheKey, JSON.stringify(results), {
    expirationTtl: 60,
  })

  return jsonResponse({ fromCache: false, files: results })
}

async function handleUpload(request: Request, env: Env) {
  const body = (await request.json().catch(() => null)) as
    | { name?: string; content?: string }
    | null

  if (!body?.name || !body?.content) {
    return jsonResponse({ error: 'name 和 content 为必填字段' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const key = `files/${id}.txt`

  // 写入 R2
  await env.BUCKET.put(key, body.content, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
  })

  // 写入 D1
  await env.DB.prepare(
    'INSERT INTO files (id, name, object_key, created_at) VALUES (?1, ?2, ?3, datetime(\'now\'))',
  )
    .bind(id, body.name, key)
    .run()

  // 让列表缓存失效
  await env.CACHE.delete('files:list:v1')

  return jsonResponse({ id, name: body.name })
}

async function handleGetFile(id: string, env: Env) {
  const row = await env.DB.prepare(
    'SELECT id, name, object_key, created_at FROM files WHERE id = ?1',
  )
    .bind(id)
    .first<{ id: string; name: string; object_key: string; created_at: string }>()

  if (!row) {
    return jsonResponse({ error: '文件不存在' }, { status: 404 })
  }

  const object = await env.BUCKET.get(row.object_key)
  if (!object) {
    return jsonResponse({ error: 'R2 对象不存在' }, { status: 404 })
  }

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'x-file-name': encodeURIComponent(row.name),
    },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const { pathname } = url

    if (pathname === '/api/health') {
      return handleHealth()
    }

    if (pathname === '/api/files' && request.method === 'GET') {
      return handleListFiles(env)
    }

    if (pathname === '/api/files' && request.method === 'POST') {
      return handleUpload(request, env)
    }

    if (pathname.startsWith('/api/files/')) {
      const id = pathname.replace('/api/files/', '')
      if (id) {
        return handleGetFile(id, env)
      }
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
