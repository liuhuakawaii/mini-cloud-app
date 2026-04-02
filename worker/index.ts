interface Env {
  mini_cloud_db: D1Database
  mini_cloud_cache: KVNamespace
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
  const cacheKey = 'files:list:v1'
  const cached = await env.mini_cloud_cache.get(cacheKey, 'json').catch(() => null)
  if (cached) {
    return jsonResponse({ fromCache: true, files: cached })
  }

  const { results } = await env.mini_cloud_db.prepare(
    'SELECT id, name, created_at FROM files ORDER BY created_at DESC',
  ).all()

  await env.mini_cloud_cache.put(cacheKey, JSON.stringify(results), {
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

  try {
    // 直接存入 D1（不再使用 R2）
    await env.mini_cloud_db.prepare(
      'INSERT INTO files (id, name, content, created_at) VALUES (?1, ?2, ?3, datetime(\'now\'))',
    )
      .bind(id, body.name, body.content)
      .run()

    // 让列表缓存失效
    await env.mini_cloud_cache.delete('files:list:v1')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: `上传失败: ${message}` }, { status: 500 })
  }

  return jsonResponse({ id, name: body.name })
}

async function handleGetFile(id: string, env: Env) {
  const row = await env.mini_cloud_db.prepare(
    'SELECT id, name, content, created_at FROM files WHERE id = ?1',
  )
    .bind(id)
    .first<{ id: string; name: string; content: string; created_at: string }>()

  if (!row) {
    return jsonResponse({ error: '文件不存在' }, { status: 404 })
  }

  return jsonResponse({
    id: row.id,
    name: row.name,
    content: row.content,
    created_at: row.created_at,
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
