import { useEffect, useState } from 'react'
import './App.css'

interface FileItem {
  id: string
  name: string
  created_at: string
}

function App() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/files')
      if (!res.ok) {
        throw new Error(`加载失败: ${res.status}`)
      }
      const data = (await res.json()) as { files: FileItem[] }
      setFiles(data.files ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !content) {
      setError('名称和内容不能为空')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name, content }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error((data as { error?: string } | null)?.error ?? `创建失败: ${res.status}`)
      }
      setName('')
      setContent('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <h1>Mini Cloud App (Pages + Workers + D1 + KV + R2)</h1>

      <section className='card'>
        <h2>新建「文件」(写入 D1 + R2，刷新 KV 缓存)</h2>
        <form onSubmit={handleCreate} className='form'>
          <label>
            名称
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='例如：第一条记录'
            />
          </label>
          <label>
            内容
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder='会被存入 R2 对象存储'
            />
          </label>
          <button type='submit' disabled={creating}>
            {creating ? '创建中…' : '创建'}
          </button>
        </form>
      </section>

      <section className='card'>
       <h2>文件列表 (从 D1 / KV 读取)</h2>
        <button onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中…' : '手动刷新'}
        </button>
        {error && <p className='error'>错误：{error}</p>}
        {files.length === 0 ? (
          <p>暂无文件，先在上面创建一条。</p>
        ) : (
          <ul className='file-list'>
            {files.map((f) => (
              <li key={f.id}>
                <div>
                  <strong>{f.name}</strong>
                  <small>{new Date(f.created_at).toLocaleString()}</small>
                </div>
                <a href={`/api/files/${f.id}`} target='_blank' rel='noreferrer'>
                  打开 R2 内容
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export default App
