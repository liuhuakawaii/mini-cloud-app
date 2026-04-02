# 踩坑总结：miniCloudApp 调试记录

## 一、迁移（Migration）管理不完整

### 问题
从 R2 改为直接存 D1 时，只新增了 `0002_add_content.sql`（加 `content` 列），  
但没有处理旧的 `object_key TEXT NOT NULL` 列。  
结果：GET 正常（不涉及该列），POST 在生产环境直接 500。

### 教训
> **重构存储方案时，必须同步清理废弃的 Schema。**

- 删掉 R2 的代码 → 也要写 migration 删掉 `object_key` 列
- 每次 migration 只做一件事，名字要清晰（`0003_drop_object_key.sql`）
- 改完后本地/生产都要验证所有 HTTP 方法（GET/POST/DELETE），不只测 GET

---

## 二、Worker 缺少错误处理导致调试困难

### 问题
`handleUpload` 里的 D1 INSERT 没有 try-catch，  
抛出异常后变成 Cloudflare Error 1101，浏览器只看到 "Please enable cookies"，完全看不出根因。

### 教训
> **Worker 中所有外部 I/O（D1、KV、R2）都应包裹 try-catch，返回有意义的 JSON 错误。**

```ts
// 好的做法
try {
  await env.db.prepare('...').run()
} catch (e) {
  const message = e instanceof Error ? e.message : String(e)
  return jsonResponse({ error: `操作失败: ${message}` }, { status: 500 })
}
```

---

## 三、本地开发环境（Windows）的已知问题

### 问题
`wrangler d1 migrations apply --local` 和 `wrangler dev` 在 Windows 上会崩溃：  
`Fatal process out of memory: ExternalEntityTable::InitializeTable`  
这是 Wrangler 4.x + workerd 在 Windows 上的已知 bug。

### 临时解决方案
在 `wrangler.jsonc` 中为 D1 和 KV 绑定加上 `"remote": true`，  
让本地 dev server 直接连远端资源，绕过本地 workerd：

```jsonc
"d1_databases": [{ "binding": "mini_cloud_db", ..., "remote": true }],
"kv_namespaces": [{ "binding": "mini_cloud_cache", ..., "remote": true }],
```

> 注意：`remote: true` 会读写真实的生产数据，适合临时调试，正式项目建议用独立的 preview 环境。

---

## 四、生产日志的获取方式

### 问题
`wrangler tail` 需要直连 Cloudflare 边缘节点，在国内网络下 ETIMEDOUT，无法使用。

### 替代方案
1. **Cloudflare Dashboard** → Workers & Pages → `mini-cloud-app` → **Logs**  
   需要在 `wrangler.jsonc` 中开启 `"observability": { "enabled": true }`（已配置）。
2. 给 Worker 加 try-catch 让错误以 JSON 形式返回（见第二条），  
   直接在浏览器 Network 面板里看，不依赖 tail。

---

## 核心原则

| 场景 | 原则 |
|------|------|
| 修改存储方案 | 旧 Schema 也要清理，migration 要完整 |
| Worker I/O 操作 | 全部 try-catch，返回 JSON 错误 |
| 功能测试 | 每个 HTTP 方法都要测，不只测 GET |
| 本地调试 | Windows 下优先用 remote 模式或 WSL |
| 生产调试 | 开 observability，看 Dashboard Logs |
