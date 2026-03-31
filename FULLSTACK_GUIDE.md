# Cloudflare 全栈 MVP 完整指南

> 面向前端开发者的全栈入门教程

---

## 目录

1. [项目概览](#1-项目概览)
2. [核心概念速查](#2-核心概念速查)
3. [项目结构](#3-项目结构)
4. [第一步：准备工作](#4-第一步准备工作)
5. [第二步：创建云资源](#5-第二步创建云资源)
6. [第三步：配置文件详解](#6-第三步配置文件详解)
7. [第四步：后端代码详解](#7-第四步后端代码详解)
8. [第五步：前端代码详解](#8-第五步前端代码详解)
9. [第五步：本地开发](#9-第五步本地开发)
10. [第六步：部署上线](#10-第六步部署上线)
11. [完整流程总结](#11-完整流程总结)
12. [常见问题](#12-常见问题)

---

## 1. 项目概览

这个项目实现了一个「迷你云应用」：一个简单的文件管理器。

**功能：**
- 创建文件（输入名称 + 内容，点击创建）
- 查看文件列表（实时显示所有已创建的文件）
- 查看文件内容（点击链接查看存储的内容）

**用了哪些 Cloudflare 服务：**

| 服务 | 作用 | 类比 |
|------|------|------|
| **Pages** | 托管前端静态文件（HTML/CSS/JS） | 类似 GitHub Pages、Vercel |
| **Workers** | 运行后端 API 代码 | 类似 Node.js 服务器 |
| **D1** | 存储结构化数据（数据库） | 类似 MySQL、PostgreSQL |
| **KV** | 缓存热数据，加速读取 | 类似 Redis |
| **R2** | 存储文件/对象 | 类似 AWS S3、阿里云 OSS |
| **CDN** | 自动全球加速 | Cloudflare 自动提供，无需配置 |

---

## 2. 核心概念速查

### Pages（前端托管）

```
用户访问网页 → CDN边缘节点 → 返回 HTML/CSS/JS
```

- **是什么**：把你的前端代码（React/Vue 构建后的静态文件）放到 Cloudflare 的服务器上
- **好处**：全球 200+ 个节点自动分发，用户就近访问，速度飞快
- **本项目**：Vite 构建 React 代码，产物自动上传为 Pages

### Workers（后端逻辑）

```
用户发 API 请求 → Worker 代码运行 → 返回 JSON 数据
```

- **是什么**：在 Cloudflare 边缘运行的 JavaScript/TypeScript 代码
- **好处**：不需要自己搭服务器，自动扩容，按调用付费
- **本项目**：处理 `/api/*` 路由，读写 D1/KV/R2

### D1（数据库）

```
SQL 语句 → D1 执行 → 返回结果
```

- **是什么**：Cloudflare 提供的 SQLite 兼容数据库
- **好处**：Serverless，无需管理数据库服务器
- **本项目**：存储文件的元数据（id、名称、创建时间）

### KV（键值缓存）

```
key → value（支持设置过期时间）
```

- **是什么**：全球分布式的键值存储
- **好处**：读取极快（边缘缓存），适合缓存热点数据
- **本项目**：缓存文件列表，避免每次都查 D1

### R2（对象存储）

```
上传文件 → R2 存储 → 通过 URL 下载
```

- **是什么**：S3 兼容的对象存储服务
- **好处**：存储大量文件，零出口流量费（从 R2 下载不收费）
- **本项目**：存储文件的实际内容

### CDN（内容分发网络）

- **是什么**：Cloudflare 自动提供的全球加速网络
- **原理**：把你的内容缓存到离用户最近的节点
- **本项目**：自动生效，无需额外配置

---

## 3. 项目结构

```
miniCloudApp/
├── src/                    # 前端代码（React）
│   ├── main.tsx           # React 入口
│   ├── App.tsx            # 主页面组件
│   ├── App.css            # 组件样式
│   └── index.css          # 全局样式
├── worker/                 # 后端代码（Workers）
│   └── index.ts           # Worker 入口，处理 API
├── migrations/             # 数据库迁移文件
│   └── 0001_init.sql      # 建表 SQL
├── wrangler.jsonc          # Cloudflare 配置文件
├── package.json            # 依赖和脚本
├── vite.config.ts          # Vite 构建配置
└── index.html              # HTML 入口
```

---

## 4. 第一步：准备工作

### 4.1 安装 Node.js

确保你的电脑已安装 Node.js（版本 18+）：

```bash
node -v
# 应该显示 v18.x.x 或更高
```

### 4.2 安装依赖

在项目目录下执行：

```bash
npm install
```

这会安装 `package.json` 中列出的所有依赖包。

### 4.3 注册 Cloudflare 账号

前往 [cloudflare.com](https://cloudflare.com) 注册一个免费账号。

### 4.4 登录 Wrangler

Wrangler 是 Cloudflare 的命令行工具，用来管理资源和部署：

```bash
npx wrangler login
```

会弹出浏览器窗口让你授权登录。

---

## 5. 第二步：创建云资源

> 以下命令只需执行一次，创建后资源就存在你的 Cloudflare 账号里了。

### 5.1 创建 D1 数据库

```bash
npx wrangler d1 create mini-cloud-db
```

**输出示例：**

```
✅ Successfully created DB 'mini-cloud-db'

[[d1_databases]]
binding = "DB"
database_name = "mini-cloud-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← 复制这个 ID
```

**重要：复制 `database_id`，后面要用！**

### 5.2 执行数据库迁移

迁移就是把建表的 SQL 语句应用到数据库中：

```bash
npx wrangler d1 migrations apply mini-cloud-db --remote
```

- `--remote` 表示应用到线上的数据库（不是本地）
- 会让你确认，输入 `y` 回车

迁移文件 `migrations/0001_init.sql` 内容：

```sql
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,       -- 文件唯一标识（UUID）
  name TEXT NOT NULL,        -- 文件名称（用户输入）
  object_key TEXT NOT NULL,  -- R2 中的对象路径
  created_at TEXT NOT NULL   -- 创建时间
);
```

### 5.3 创建 KV 命名空间

```bash
pnpm wrangler kv namespace create mini-cloud-cache
```

**输出示例：**

```
{ binding = "CACHE", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

**重要：复制 `id`，后面要用！**

### 5.4 创建 R2 存储桶

```bash
npx wrangler r2 bucket create mini-cloud-bucket
```

R2 桶名已在配置文件中写好，这步只需确认创建成功。

---

## 6. 第三步：配置文件详解

打开 `wrangler.jsonc`，把刚才获取的 ID 填进去：

```jsonc
{
  "name": "mini-cloud-app",
  "main": "worker/index.ts",
  "compatibility_date": "2026-03-17",

  // 前端静态资源配置（CDN 自动加速）
  "assets": {
    "not_found_handling": "single-page-application"
  },

  // 数据库迁移文件目录
  "migrations_dir": "migrations",

  // D1 数据库绑定
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mini-cloud-db",
      "database_id": "填入你的 D1 database_id"
    }
  ],

  // KV 缓存绑定
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "填入你的 KV namespace id"
    }
  ],

  // R2 存储桶绑定
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "mini-cloud-bucket"
    }
  ]
}
```

**配置文件的作用：**

| 字段 | 含义 |
|------|------|
| `name` | Worker 名称，也是部署后的子域名前缀 |
| `main` | 后端代码入口文件 |
| `assets` | 前端静态资源配置 |
| `d1_databases` | 把 D1 数据库绑定到代码中的 `env.DB` |
| `kv_namespaces` | 把 KV 缓存绑定到代码中的 `env.CACHE` |
| `r2_buckets` | 把 R2 存储桶绑定到代码中的 `env.BUCKET` |

---

## 7. 第四步：后端代码详解

文件：`worker/index.ts`

### 7.1 定义环境变量类型

```typescript
interface Env {
  DB: D1Database      // D1 数据库实例
  CACHE: KVNamespace  // KV 缓存实例
  BUCKET: R2Bucket    // R2 存储桶实例
}
```

这三个对象是 Cloudflare 自动注入的，通过 `wrangler.jsonc` 中的绑定配置关联。

### 7.2 API 路由设计

```
GET  /api/health     → 健康检查
GET  /api/files      → 获取文件列表
POST /api/files      → 创建新文件
GET  /api/files/:id  → 获取单个文件内容
```

### 7.3 获取文件列表（KV 缓存优先）

```typescript
async function handleListFiles(env: Env) {
  // 第一步：尝试从 KV 缓存读取
  const cacheKey = 'files:list:v1'
  const cached = await env.CACHE.get(cacheKey, 'json')
  if (cached) {
    // 缓存命中，直接返回
    return jsonResponse({ fromCache: true, files: cached })
  }

  // 第二步：缓存未命中，从 D1 数据库查询
  const { results } = await env.DB.prepare(
    'SELECT id, name, created_at FROM files ORDER BY created_at DESC'
  ).all()

  // 第三步：查询结果写入 KV 缓存（60秒后过期）
  await env.CACHE.put(cacheKey, JSON.stringify(results), {
    expirationTtl: 60
  })

  return jsonResponse({ fromCache: false, files: results })
}
```

**流程图：**

```
请求列表 → 检查KV缓存
              ↓
    命中？→ 返回缓存数据（快！）
              ↓
    未命中 → 查D1数据库 → 写入KV缓存 → 返回数据
```

### 7.4 创建文件（写入 R2 + D1，清 KV 缓存）

```typescript
async function handleUpload(request: Request, env: Env) {
  // 解析请求体
  const body = await request.json()
  const { name, content } = body

  // 生成唯一 ID
  const id = crypto.randomUUID()
  // R2 中的存储路径
  const key = `files/${id}.txt`

  // 1. 写入 R2（存储实际内容）
  await env.BUCKET.put(key, content, {
    httpMetadata: { contentType: 'text/plain' }
  })

  // 2. 写入 D1（存储元数据）
  await env.DB.prepare(
    'INSERT INTO files (id, name, object_key, created_at) VALUES (?1, ?2, ?3, datetime(\'now\'))'
  ).bind(id, name, key).run()

  // 3. 删除列表缓存（让下次查询重新从 D1 读取）
  await env.CACHE.delete('files:list:v1')

  return jsonResponse({ id, name })
}
```

**为什么要清缓存？**

因为创建了新文件，数据库数据变了，如果不删缓存，下次读列表会拿到旧数据。

### 7.5 获取单个文件（从 D1 查 → 从 R2 读）

```typescript
async function handleGetFile(id: string, env: Env) {
  // 1. 从 D1 查元数据
  const row = await env.DB.prepare(
    'SELECT * FROM files WHERE id = ?1'
  ).bind(id).first()

  if (!row) {
    return jsonResponse({ error: '文件不存在' }, { status: 404 })
  }

  // 2. 从 R2 读取实际内容
  const object = await env.BUCKET.get(row.object_key)
  
  // 3. 返回文件内容
  return new Response(object.body, {
    headers: {
      'content-type': 'text/plain',
      'x-file-name': encodeURIComponent(row.name)
    }
  })
}
```

---

## 8. 第五步：前端代码详解

文件：`src/App.tsx`

### 8.1 页面结构

```tsx
function App() {
  return (
    <>
      <h1>Mini Cloud App</h1>
      
      {/* 区域1：创建文件表单 */}
      <section>
        <form>输入名称 + 内容 → 提交</form>
      </section>
      
      {/* 区域2：文件列表 */}
      <section>
        <ul>显示所有文件 → 点击查看内容</ul>
      </section>
    </>
  )
}
```

### 8.2 获取文件列表

```tsx
// 组件加载时自动调用
useEffect(() => {
  refresh()
}, [])

async function refresh() {
  // 调用后端 API
  const res = await fetch('/api/files')
  const data = await res.json()
  // 更新状态，触发页面重新渲染
  setFiles(data.files)
}
```

### 8.3 创建文件

```tsx
async function handleCreate(e: React.FormEvent) {
  // 发送 POST 请求到后端
  const res = await fetch('/api/files', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, content })
  })
  
  // 成功后清空表单、刷新列表
  setName('')
  setContent('')
  refresh()
}
```

### 8.4 前后端数据流

```
用户输入 → React 状态更新 → fetch API 调用
                ↓
        Worker 接收请求
                ↓
        D1/KV/R2 处理
                ↓
        返回 JSON 响应
                ↓
        React 更新页面
```

---

## 9. 第五步：本地开发

### 方式一：使用 Wrangler Dev（推荐）

```bash
npx wrangler dev
```

- 启动本地 Worker 服务
- 自动连接你的 D1/KV/R2（线上资源或本地模拟）
- 访问 `http://localhost:8787` 查看

### 方式二：分离开发

```bash
# 终端1：启动前端
npm run dev

# 终端2：启动 Worker（如果需要独立调试 API）
npx wrangler dev
```

### 本地开发注意事项

1. 首次运行 `wrangler dev` 会提示选择 D1 数据库，选择 `mini-cloud-db`
2. KV 和 R2 在本地开发时使用本地模拟存储
3. 前端的 `fetch('/api/...')` 会自动被 Vite 代理到 Worker

---

## 10. 第六步：部署上线

### 10.1 构建前端

```bash
npm run build
```

这会：
1. 编译 TypeScript → JavaScript
2. 打包 React 代码
3. 输出到 `dist/` 目录

### 10.2 部署到 Cloudflare

```bash
npm run deploy
```

这会执行 `wrangler deploy`，把以下内容上传：

```
├── dist/          → 静态资源（前端页面，CDN 加速）
└── worker/index.ts → Worker 代码（后端 API）
```

### 10.3 访问你的应用

部署成功后会显示：

```
Published mini-cloud-app (x.xx sec)
  https://mini-cloud-app.<你的子域>.workers.dev
```

访问这个 URL 就能看到你的应用了！

---

## 11. 完整流程总结

```
┌─────────────────────────────────────────────────────────────────┐
│                        完整部署流程                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ① 准备工作                                                     │
│     npm install → wrangler login                                │
│                                                                  │
│  ② 创建云资源                                                   │
│     wrangler d1 create        → 获得 database_id                │
│     wrangler d1 migrations apply → 建表                         │
│     wrangler kv:namespace create → 获得 KV id                  │
│     wrangler r2 bucket create  → 建桶                           │
│                                                                  │
│  ③ 配置 wrangler.jsonc                                          │
│     填入 D1 database_id 和 KV id                                │
│                                                                  │
│  ④ 本地开发                                                     │
│     wrangler dev → http://localhost:8787                         │
│                                                                  │
│  ⑤ 部署上线                                                     │
│     npm run build && npm run deploy                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. 常见问题

### Q: 本地开发时 D1/KV/R2 数据是线上的吗？

A: 默认情况下，`wrangler dev` 会：
- D1：连接线上数据库（你也可以创建本地副本）
- KV/R2：使用本地模拟存储（不会影响线上数据）

### Q: 部署后怎么更新？

A: 修改代码后重新执行 `npm run deploy` 即可，Cloudflare 会自动替换旧版本。

### Q: 免费额度够用吗？

A: Cloudflare 免费计划：
- Workers：每天 10 万次请求
- D1：每天 500 万行读取，10 万行写入
- KV：每天 10 万次读取，1000 次写入
- R2：10GB 存储，100 万次 A 类操作

对于个人项目完全够用。

### Q: 怎么查看日志？

A: 

```bash
npx wrangler tail
```

实时查看 Worker 的日志输出。

### Q: 怎么在 Cloudflare Dashboard 管理资源？

A: 登录 [dash.cloudflare.com](https://dash.cloudflare.com)：
- Workers & Pages → 查看 Worker 状态
- D1 → 查看数据库和执行 SQL
- R2 → 查看存储桶和对象
- Workers KV → 查看缓存内容

---

## 附录：关键文件速查表

| 文件 | 作用 |
|------|------|
| `wrangler.jsonc` | Cloudflare 资源绑定配置 |
| `worker/index.ts` | 后端 API 逻辑 |
| `src/App.tsx` | 前端页面组件 |
| `migrations/0001_init.sql` | 数据库建表语句 |
| `vite.config.ts` | 前端构建配置 |
| `package.json` | 项目依赖和脚本命令 |
