// StarMemory DSH —— SQLite 归档层（node:sqlite，零外部依赖）
// 替代 OpenCode 版 sql.js + 外部脚本方案。表结构与旧 fragment_archive.db 完全兼容
// （迁移脚本可直接把旧库文件复制/打开读取）。
// 生命周期：句柄由 index.mjs 在 apply 期创建，ctx.effect 返回 close disposer。

import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const FRAGMENT_ARCHIVE_DDL = `
CREATE TABLE IF NOT EXISTS fragment_archive (
  id TEXT PRIMARY KEY,
  content TEXT,
  category TEXT,
  layer TEXT,
  weight REAL,
  source TEXT,
  associations TEXT,
  created_at TEXT,
  access_count INTEGER,
  last_recalled TEXT,
  recall_frequency INTEGER,
  archived_at TEXT DEFAULT CURRENT_TIMESTAMP
)`

// memory 表：key-value 测试存储（memory_sqlite 工具，与旧 sqlite-manager.js 兼容）
const MEMORY_KV_DDL = `
CREATE TABLE IF NOT EXISTS memory (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`

export function openArchive(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec(FRAGMENT_ARCHIVE_DDL)
  db.exec(MEMORY_KV_DDL)

  // 分词：按空白/中英文标点拆分，过滤单字（避免单字 LIKE 命中大量无关）
  function tokenizeQuery(q) {
    return String(q || '').toLowerCase().split(/[\s,，。；;、:：]+/).filter((t) => t.length >= 2)
  }

  // 归档搜索：任一词命中 content/associations 即返回（整句 LIKE 会因停顿词漏匹配）
  function searchArchive(query, limit = 5) {
    const terms = tokenizeQuery(query)
    if (terms.length === 0) return []
    const conds = []
    const params = []
    for (const term of terms) {
      conds.push('(content LIKE ? OR associations LIKE ?)')
      params.push(`%${term}%`, `%${term}%`)
    }
    params.push(limit)
    const stmt = db.prepare(`SELECT * FROM fragment_archive WHERE ${conds.join(' OR ')} LIMIT ?`)
    const rows = stmt.all(...params)
    return rows.map(rowToFragment).map((f) => {
      // 补 matchScore（与 JSON 搜索口径一致：词命中 content +1 / associations +0.8）
      let matchScore = 0
      const content = (f.content || '').toLowerCase()
      const assocs = (f.associations || []).map((a) => String(a).toLowerCase())
      for (const term of terms) {
        if (content.includes(term)) matchScore += 1
        if (assocs.some((a) => a.includes(term))) matchScore += 0.8
      }
      return { ...f, matchScore, source: 'archive' }
    })
  }

  function rowToFragment(row) {
    const fragment = {}
    for (const [k, v] of Object.entries(row)) {
      if (k === 'associations') {
        try { fragment[k] = JSON.parse(v || '[]') } catch { fragment[k] = [] }
      } else {
        fragment[k] = v
      }
    }
    delete fragment.archived_at
    return fragment
  }

  // 归档一条碎片（compact 用）：INSERT OR REPLACE
  function archiveFragment(fragment) {
    const stmt = db.prepare(`INSERT OR REPLACE INTO fragment_archive
      (id, content, category, layer, weight, source, associations, created_at, access_count, last_recalled, recall_frequency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    stmt.run(
      String(fragment.id ?? ''),
      String(fragment.content ?? ''),
      String(fragment.category ?? ''),
      String(fragment.layer ?? ''),
      Number(fragment.weight ?? 0.5),
      String(fragment.source ?? ''),
      JSON.stringify(fragment.associations || []),
      String(fragment.created_at ?? ''),
      Number(fragment.access_count ?? 0),
      fragment.last_recalled ?? null,
      Number(fragment.recall_frequency ?? 0),
    )
    return true
  }

  // 从归档恢复的 JSON 侧 upsert 由调用方组合（deep_search / restore 工具持有 store + archive）；
  // 归档侧只负责删除：
  function deleteFromArchive(id) {
    db.prepare('DELETE FROM fragment_archive WHERE id = ?').run(String(id))
    return true
  }

  function countArchive() {
    const row = db.prepare('SELECT COUNT(*) AS n FROM fragment_archive').get()
    return row ? Number(row.n) : 0
  }

  // ===== memory 键值（测试工具用）=====
  function kvSet(key, value) {
    db.prepare("INSERT OR REPLACE INTO memory (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(String(key), String(value))
    return { success: true, key, value }
  }
  function kvGet(key) {
    const row = db.prepare('SELECT value FROM memory WHERE key = ?').get(String(key))
    return row ? { success: true, key, value: row.value } : { success: false, error: 'Key not found' }
  }
  function kvDelete(key) {
    const r = db.prepare('DELETE FROM memory WHERE key = ?').run(String(key))
    return Number(r.changes) > 0 ? { success: true, key } : { success: false, error: 'Key not found' }
  }
  function kvList() {
    const rows = db.prepare('SELECT key, value FROM memory ORDER BY updated_at DESC').all()
    return { success: true, data: rows.map((r) => ({ key: r.key, value: r.value })) }
  }

  function close() {
    try { db.close() } catch {}
  }

  return { db, tokenizeQuery, searchArchive, archiveFragment, deleteFromArchive, countArchive, kvSet, kvGet, kvDelete, kvList, close }
}
