// archive 层单测（临时 db：建表 / 归档 / 搜索 / 删除 / kv 四操作）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openArchive } from '../lib/archive.js'

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-arch-'))
  return openArchive(path.join(dir, 'archive.db'))
}

test('建表 + 双表结构（fragment_archive + memory kv）', () => {
  const arch = tmpDb()
  const tables = arch.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
  assert.ok(tables.includes('fragment_archive'))
  assert.ok(tables.includes('memory'))
  arch.close()
})

test('archiveFragment + searchArchive：词命中 content / associations', () => {
  const arch = tmpDb()
  arch.archiveFragment({
    id: 'a1', content: '用户偏好简洁直接风格', category: 'preference', layer: 'surface',
    weight: 0.6, source: 'explicit', associations: ['风格', 'concise'],
    created_at: new Date().toISOString(), access_count: 2, recall_frequency: 1,
  })
  // content 命中（分词口径：按空白/标点拆，任一词命中即返回）
  const r1 = arch.searchArchive('简洁 直接', 5)
  assert.equal(r1.length, 1)
  assert.equal(r1[0].id, 'a1')
  assert.ok(r1[0].matchScore > 0)
  assert.equal(r1[0].source, 'archive')
  // associations 命中
  const r2 = arch.searchArchive('concise', 5)
  assert.equal(r2.length, 1)
  // 无关词不命中
  assert.equal(arch.searchArchive('完全不相关词汇', 5).length, 0)
  // 单字过滤（len<2 不参与）
  assert.equal(arch.searchArchive('风', 5).length, 0)
  arch.close()
})

test('rowToFragment: associations 解析回数组 + archived_at 剥离', () => {
  const arch = tmpDb()
  arch.archiveFragment({
    id: 'a2', content: 'hello world', associations: ['alpha', 'beta'],
    created_at: '2026-01-01T00:00:00.000Z', weight: 0.5,
  })
  const f = arch.searchArchive('hello world', 5)[0]
  assert.deepEqual(f.associations, ['alpha', 'beta'])
  assert.equal(f.archived_at, undefined)
  arch.close()
})

test('deleteFromArchive + countArchive', () => {
  const arch = tmpDb()
  arch.archiveFragment({ id: 'a3', content: 'count me', associations: [] })
  assert.equal(arch.countArchive(), 1)
  arch.deleteFromArchive('a3')
  assert.equal(arch.countArchive(), 0)
  // 删除不存在的 id 不报错
  arch.deleteFromArchive('ghost')
  arch.close()
})

test('INSERT OR REPLACE：同 id 重复归档覆盖不冲突', () => {
  const arch = tmpDb()
  arch.archiveFragment({ id: 'dup', content: 'v1', associations: [] })
  arch.archiveFragment({ id: 'dup', content: 'v2', associations: [] })
  assert.equal(arch.countArchive(), 1)
  assert.equal(arch.searchArchive('v2', 5).length, 1)
  arch.close()
})

test('kv 四操作：set / get / delete / list', () => {
  const arch = tmpDb()
  arch.kvSet('k1', 'v1')
  arch.kvSet('k2', 'v2')
  arch.kvSet('k1', 'v1-updated') // 覆盖
  assert.equal(arch.kvGet('k1').value, 'v1-updated')
  assert.equal(arch.kvGet('missing').success, false)
  assert.equal(arch.kvDelete('k2').success, true)
  assert.equal(arch.kvDelete('k2').success, false) // 再删不存在
  const list = arch.kvList()
  assert.equal(list.success, true)
  assert.equal(list.data.length, 1)
  assert.equal(list.data[0].key, 'k1')
  arch.close()
})
