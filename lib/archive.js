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
  source_type TEXT DEFAULT 'inferred',
  confidence REAL DEFAULT 0.5,
  memory_type TEXT DEFAULT 'semantic',
  ttl_policy TEXT DEFAULT 'none',
  expires_at TEXT,
  consolidation_status TEXT DEFAULT 'transient',
  consolidation_at TEXT,
  base_activation REAL DEFAULT 0.0,
  stability REAL DEFAULT 1.0,
  decay_rate REAL DEFAULT 0.5,
  last_accessed_at TEXT,
  use_history TEXT DEFAULT '[]',
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

const NEW_COLUMNS = [
  ['source_type', "TEXT DEFAULT 'inferred'"],
  ['confidence', 'REAL DEFAULT 0.5'],
  ['memory_type', "TEXT DEFAULT 'semantic'"],
  ['ttl_policy', "TEXT DEFAULT 'none'"],
  ['expires_at', 'TEXT'],
  ['consolidation_status', "TEXT DEFAULT 'transient'"],
  ['consolidation_at', 'TEXT'],
  ['base_activation', 'REAL DEFAULT 0.0'],
  ['stability', 'REAL DEFAULT 1.0'],
  ['decay_rate', 'REAL DEFAULT 0.5'],
  ['last_accessed_at', 'TEXT'],
  ['use_history', "TEXT DEFAULT '[]'"],
]

// 旧库升级：PRAGMA 检查缺失列再 ALTER（幂等）
function ensureClassificationColumns(db) {
  try {
    const info = db.prepare('PRAGMA table_info(fragment_archive)').all()
    const existing = new Set(info.map((r) => r.name))
    for (const [col, def] of NEW_COLUMNS) {
      if (!existing.has(col)) db.exec(`ALTER TABLE fragment_archive ADD COLUMN ${col} ${def}`)
    }
  } catch {}
}

export function openArchive(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec(FRAGMENT_ARCHIVE_DDL)
  db.exec(MEMORY_KV_DDL)
  // 兼容旧库文件（12 列时代）：幂等补齐分类列（与原文 compactor initDb 一致）
  ensureClassificationColumns(db)

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

  // 归档一条碎片（compact 用）：INSERT OR REPLACE（全字段，无损）
  function archiveFragment(fragment) {
    const stmt = db.prepare(`INSERT OR REPLACE INTO fragment_archive
      (id, content, category, layer, weight, source, associations, created_at, access_count, last_recalled, recall_frequency,
       source_type, confidence, memory_type, ttl_policy, expires_at, consolidation_status, consolidation_at,
       base_activation, stability, decay_rate, last_accessed_at, use_history)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    stmt.run(
      String(fragment.id ?? ''),
      String(fragment.content ?? ''),
      String(fragment.category ?? 'general'),
      String(fragment.layer ?? 'surface'),
      Number(fragment.weight ?? 0.5),
      String(fragment.source ?? 'explicit'),
      JSON.stringify(fragment.associations || []),
      String(fragment.created_at ?? ''),
      Number(fragment.access_count ?? 0),
      fragment.last_recalled ?? null,
      Number(fragment.recall_frequency ?? 0),
      String(fragment.source_type ?? 'inferred'),
      Number(fragment.confidence ?? 0.5),
      String(fragment.memory_type ?? 'semantic'),
      String(fragment.ttl_policy ?? 'none'),
      fragment.expires_at ?? null,
      String(fragment.consolidation_status ?? 'transient'),
      fragment.consolidation_at ?? null,
      Number(fragment.base_activation ?? 0.0),
      Number(fragment.stability ?? 1.0),
      Number(fragment.decay_rate ?? 0.5),
      fragment.last_accessed_at ?? null,
      String(fragment.use_history ?? '[]'),
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

  // 按 ID 取归档行（restore 工具用）：找到 → 返回干净碎片对象，未找到 → null
  function getById(id) {
    const row = db.prepare('SELECT * FROM fragment_archive WHERE id = ?').get(String(id))
    return row ? rowToFragment(row) : null
  }

  // 归档列表（restore list 用，只取展示列，按归档时间倒序）
  function listArchived(limit = 20) {
    const rows = db.prepare(
      'SELECT id, content, category, layer, created_at, access_count, archived_at FROM fragment_archive ORDER BY archived_at DESC LIMIT ?',
    ).all(limit)
    return rows.map((r) => ({ ...r }))
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

  return { db, tokenizeQuery, searchArchive, archiveFragment, deleteFromArchive, countArchive, getById, listArchived, kvSet, kvGet, kvDelete, kvList, close }
}
