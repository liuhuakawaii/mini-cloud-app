import { useEffect, useState } from 'react'
import './App.css'

interface FileItem {
  id: string
  name: string
  created_at: string
}

interface FileDetail {
  id: string
  name: string
  content: string
  created_at: string
}

function App() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)

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

  async function handleView(id: string) {
    setViewingId(id)
    try {
      const res = await fetch(`/api/files/${id}`)
      if (!res.ok) throw new Error('读取失败')
      const data = (await res.json()) as FileDetail
      setSelectedFile(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setViewingId(null)
    }
  }

  return (
    <>
      <h1>Mini Cloud App</h1>
      <p className='subtitle'>Pages + Workers + D1 + KV</p>

      <section className='card'>
        <h2>新建文件</h2>
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
              placeholder='输入文本内容，将存入 D1 数据库'
            />
          </label>
          <button type='submit' disabled={creating}>
            {creating ? '创建中...' : '创建'}
          </button>
        </form>
      </section>

      <section className='card'>
        <h2>文件列表</h2>
        <button onClick={() => void refresh()} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
        {error && <p className='error'>错误：{error}</p>}
        {files.length === 0 ? (
          <p>暂无文件，先在上面创建一条</p>
        ) : (
          <ul className='file-list'>
            {files.map((f) => (
              <li key={f.id}>
                <div>
                  <strong>{f.name}</strong>
                  <small>{new Date(f.created_at).toLocaleString()}</small>
                </div>
                <button
                  onClick={() => void handleView(f.id)}
                  disabled={viewingId === f.id}
                  className='btn-view'
                >
                  {viewingId === f.id ? '加载中...' : '查看内容'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedFile && (
        <section className='card'>
          <h2>
            {selectedFile.name}
            <button onClick={() => setSelectedFile(null)} className='btn-close'>
              关闭
            </button>
          </h2>
          <pre className='file-content'>{selectedFile.content}</pre>
        </section>
      )}
    </>
  )
}

export default App
