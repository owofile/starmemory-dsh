// store 数据层单测（临时 dataRoot，真实 fs + 真实 JSON 原子写）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStore } from '../lib/store.js'

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sm-store-'))
}

test('memory.json 默认结构 + 增改删', () => {
  const store = createStore(tmpRoot())
  const mem = store.loadMemory()
  assert.equal(mem.version, 2)
  assert.deepEqual(mem.user.preferences, {})
  mem.user.preferences.style = '简洁直接'
  store.saveMemory(mem)
  const again = store.loadMemory()
  assert.equal(again.user.preferences.style, '简洁直接')
})

test('fragments: 保存 + 懒迁移 backfill', () => {
  const store = createStore(tmpRoot())
  store.saveFragments([{ id: 'f1', content: 'hello', created_at: new Date().toISOString() }])
  const frags = store.loadFragments()
  assert.equal(frags.length, 1)
  assert.equal(frags[0].consolidation_status, 'transient') // backfill 补齐
})

test('updateRecall: 命中回写（计数/升温/last_recalled）', () => {
  const store = createStore(tmpRoot())
  store.saveFragments([{ id: 'f1', content: 'x', weight: 0.5, access_count: 0, base_activation: 0.2, use_history: '[]', created_at: new Date().toISOString() }])
  store.updateRecall('f1')
  const f = store.loadFragments()[0]
  assert.equal(f.access_count, 1)
  assert.ok(f.base_activation > 0.2)
  assert.ok(f.last_recalled)
})

test('learnMappings: 落盘 + 缓存刷新 + 持久化', () => {
  const root = tmpRoot()
  const store = createStore(root)
  const added = store.learnMappings(['node', '节点'])
  assert.ok(added >= 1)
  // 新实例读同一数据根 → 映射已持久化
  const store2 = createStore(root)
  const map = store2.getSynonymMap()
  assert.deepEqual(map['node'], ['节点'])
})

test('migrateCorroborated: inferred + >=3 次召回 → corroborated', () => {
  const store = createStore(tmpRoot())
  store.saveFragments([
    { id: 'a', content: 'x', source_type: 'inferred', access_count: 3 },
    { id: 'b', content: 'y', source_type: 'inferred', access_count: 2 },
  ])
  assert.equal(store.migrateCorroborated(), 1)
  const frags = store.loadFragments()
  assert.equal(frags[0].source_type, 'corroborated')
  assert.equal(frags[1].source_type, 'inferred')
})

test('migrateDecayParams: 伪造默认值按 memory_type 修正', () => {
  const store = createStore(tmpRoot())
  store.saveFragments([{ id: 'a', content: 'x', memory_type: 'episodic', stability: 1.0, decay_rate: 0.5 }])
  assert.equal(store.migrateDecayParams(), 1)
  const f = store.loadFragments()[0]
  assert.equal(f.stability, 0.5)  // episodic
  assert.equal(f.decay_rate, 0.6)
})

test('dreamerRun: transient+已使用+超 7 天 → consolidated', () => {
  const store = createStore(tmpRoot())
  store.saveFragments([{
    id: 'old', content: 'x', consolidation_status: 'transient', access_count: 1,
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
  }])
  const r = store.dreamerRun()
  assert.equal(r.report.consolidated, 1)
  const f = store.loadFragments()[0]
  assert.equal(f.consolidation_status, 'consolidated')
  assert.ok(f.consolidation_at)
})

test('dreamerRun: 已过期 → archived 标记（不删除）', () => {
  const store = createStore(tmpRoot())
  store.saveFragments([{ id: 'e', content: 'x', expires_at: new Date(Date.now() - 1000).toISOString() }])
  const r = store.dreamerRun()
  assert.equal(r.report.archived_marked, 1)
  assert.equal(store.loadFragments().length, 1) // 不物理删除
})

test('召回运行时: setRecallLevel/setRecallEnabled 持久化 + 跨实例读取', () => {
  const root = tmpRoot()
  const store = createStore(root)
  const rec = store.setRecallLevel(4)
  assert.equal(rec.effort, 4)
  assert.equal(rec.label, 'Strong')
  store.setRecallEnabled(true)
  const store2 = createStore(root)
  const p = store2.loadRecallParams()
  assert.equal(p.enabled, true)
  assert.equal(p.effort, 4)
  assert.equal(p.topK, 3)
})

test('原子写: fragments.json 不留 tmp 文件', () => {
  const store = createStore(tmpRoot())
  store.saveFragments([{ id: 'a', content: 'x' }])
  const leftovers = fs.readdirSync(store.dataRoot).filter((n) => n.endsWith('.tmp'))
  assert.deepEqual(leftovers, [])
})
