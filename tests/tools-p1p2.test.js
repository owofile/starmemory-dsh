// P1/P2 工具冒烟：compact 往返（含分类字段无损）/ restore 三模式 / export-import / synonym / sqlite / dream / stats / status / diagnosis
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStore } from '../lib/store.js'
import { openArchive } from '../lib/archive.js'

async function load(mod) {
  return import(mod)
}

function makeEnv() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-p1-'))
  const store = createStore(dataRoot)
  const archive = openArchive(path.join(dataRoot, 'archive.db'))
  return { store, archive, deps: { store, getArchive: () => archive }, cleanup: () => archive.close() }
}

test('compact: auto 模式归档冷数据 + 全字段无损 + last_compact 写入', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { createFragmentCompactTool } = await load('../lib/tools/fragment-compact.js')
  const tool = createFragmentCompactTool(env.deps)

  // 热数据：最近召回 3 次（永不归档）+ 冷数据：60 天前创建 0 召回
  const now = Date.now()
  env.store.saveFragments([
    { id: 'hot', content: '热', created_at: new Date(now).toISOString(), access_count: 3, last_recalled: new Date(now).toISOString(), weight: 0.8, associations: [], source_type: 'corroborated', memory_type: 'preference', base_activation: 0.9, stability: 0.8, decay_rate: 0.3, last_accessed_at: new Date(now).toISOString(), use_history: '[1,2,3]', confidence: 0.9, source: 'explicit' },
    { id: 'cold', content: '冷', created_at: new Date(now - 90 * 86400000).toISOString(), access_count: 0, weight: 0.3, associations: ['冷数据'], source_type: 'inferred', memory_type: 'episodic', base_activation: 0.4, stability: 0.5, decay_rate: 0.6, use_history: '[]', confidence: 0.5, source: 'inferred' },
  ])

  const r = await tool.execute({ mode: 'auto' })
  assert.equal(r.status, 'ok')
  const report = JSON.parse(r.payload).report
  assert.equal(report.archived_count, 1)
  assert.equal(report.after_count, 1)
  assert.ok(report.last_compact)

  // JSON 只剩热数据
  const frags = env.store.loadFragments()
  assert.deepEqual(frags.map((f) => f.id), ['hot'])
  // 归档库有冷数据且分类字段无损
  assert.equal(env.archive.countArchive(), 1)
  const row = env.archive.getById('cold')
  assert.equal(row.source_type, 'inferred')
  assert.equal(row.memory_type, 'episodic')
  assert.equal(row.base_activation, 0.4)
  assert.equal(row.stability, 0.5)
  assert.equal(row.decay_rate, 0.6)
  assert.deepEqual(row.associations, ['冷数据'])
  assert.equal(row.confidence, 0.5)
})

test('compact: 梦想家标记(archived/已过期)所有模式都归档', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { createFragmentCompactTool } = await load('../lib/tools/fragment-compact.js')
  const tool = createFragmentCompactTool(env.deps)
  const now = Date.now()
  env.store.saveFragments([
    { id: 'marked', content: '梦想家标记', created_at: new Date(now).toISOString(), consolidation_status: 'archived', access_count: 9, associations: [] },
    { id: 'expired', content: '已过期', created_at: new Date(now).toISOString(), expires_at: new Date(now - 1000).toISOString(), access_count: 9, associations: [] },
    { id: 'fresh', content: '新数据', created_at: new Date(now).toISOString(), access_count: 0, associations: [] },
  ])
  const r = await tool.execute({ mode: 'gentle' })
  const report = JSON.parse(r.payload).report
  assert.equal(report.archived_count, 2)
  const left = env.store.loadFragments()
  assert.deepEqual(left.map((f) => f.id), ['fresh'])
})

test('restore: id 模式恢复到 JSON + 删除归档行', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { createFragmentRestoreTool } = await load('../lib/tools/fragment-restore.js')
  const tool = createFragmentRestoreTool(env.deps)
  env.archive.archiveFragment({ id: 'r1', content: '被归档的', associations: ['恢复'], memory_type: 'procedure', base_activation: 0.6 })
  const r = await tool.execute({ action: 'id', param: 'r1' })
  assert.equal(r.status, 'ok')
  assert.equal(env.archive.countArchive(), 0)
  const restored = env.store.loadFragments().find((f) => f.id === 'r1')
  assert.ok(restored)
  assert.equal(restored.memory_type, 'procedure')
  assert.equal(restored.archived_at, undefined)
  // 再恢复不存在 → error
  const r2 = await tool.execute({ action: 'id', param: 'r1' })
  assert.equal(r2.status, 'error')
})

test('restore: query 模式只读预览不恢复 + list 模式', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { createFragmentRestoreTool } = await load('../lib/tools/fragment-restore.js')
  const tool = createFragmentRestoreTool(env.deps)
  env.archive.archiveFragment({ id: 'q1', content: '搜索目标内容', associations: [] })
  const r = await tool.execute({ action: 'query', param: '搜索目标' })
  assert.equal(r.status, 'ok')
  assert.equal(JSON.parse(r.payload).count, 1)
  // query 不恢复：归档仍在、JSON 仍无
  assert.equal(env.archive.countArchive(), 1)
  assert.equal(env.store.loadFragments().length, 0)
  // list
  const r2 = await tool.execute({ action: 'list', limit: 10 })
  const data = JSON.parse(r2.payload)
  assert.equal(data.count, 1)
  assert.equal(data.archived[0].id, 'q1')
})

test('export → import 往返：merge 去重 + replace 整体替换', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { createExportTool, createImportTool } = await load('../lib/tools/export-import.js')
  const exp = createExportTool(env.deps)
  const imp = createImportTool(env.deps)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-bak-'))
  const bakPath = path.join(dir, 'backup.json')

  env.store.saveFragments([{ id: 'e1', content: 'A', associations: [] }])
  const r1 = await exp.execute({ path: bakPath })
  assert.equal(r1.status, 'ok')
  assert.ok(fs.existsSync(bakPath))

  // 另一份数据：e1 重复 + e2 新增 → merge 只加 e2
  env.store.saveFragments([{ id: 'e1', content: 'A-dup', associations: [] }, { id: 'e2', content: 'B', associations: [] }])
  const r2 = await imp.execute({ path: bakPath, mode: 'merge' })
  const data = JSON.parse(r2.payload)
  assert.equal(data.imported, 0) // 备份只有 e1，现有已有 e1 → 全部去重跳过
  const r3 = await imp.execute({ path: bakPath, mode: 'replace' })
  const data3 = JSON.parse(r3.payload)
  assert.equal(data3.total, 1) // replace 后只剩备份里的 e1
  // 缺参数 → error
  const r4 = await imp.execute({ path: path.join(dir, 'missing.json') })
  assert.equal(r4.status, 'error')
})

test('synonym_map: add 合并去重 / update 整替 / delete / view', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const m = await load('../lib/tools/synonym-map.js')
  const add = m.createSynonymAddTool(env.deps)
  const upd = m.createSynonymUpdateTool(env.deps)
  const del = m.createSynonymDeleteTool(env.deps)
  const view = m.createSynonymViewTool(env.deps)

  await add.execute({ key: 'node', synonyms: ['节点'] })
  await add.execute({ key: 'node', synonyms: ['节点', 'N'] }) // 合并去重
  let map = JSON.parse((await view.execute({})).payload).map
  assert.deepEqual(map['node'], ['节点', 'N'])
  await upd.execute({ key: 'node', synonyms: ['完全替换'] })
  map = JSON.parse((await view.execute({})).payload).map
  assert.deepEqual(map['node'], ['完全替换'])
  await del.execute({ key: 'node' })
  map = JSON.parse((await view.execute({})).payload).map
  assert.equal(map['node'], undefined)
  // 删除不存在 → error
  const r = await del.execute({ key: 'nope' })
  assert.equal(r.status, 'error')
})

test('memory_sqlite: set/get/delete/list', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { createSqliteTool } = await load('../lib/tools/sqlite.js')
  const tool = createSqliteTool(env.deps)
  await tool.execute({ action: 'set', key: 'k', value: 'v' })
  const r = await tool.execute({ action: 'get', key: 'k' })
  assert.equal(JSON.parse(r.payload).value, 'v')
  const r2 = await tool.execute({ action: 'list' })
  assert.equal(JSON.parse(r2.payload).data.length, 1)
  await tool.execute({ action: 'delete', key: 'k' })
  const r3 = await tool.execute({ action: 'get', key: 'k' })
  assert.equal(r3.status, 'error')
})

test('dream / stats / archive_status / diagnosis / manual', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const [dreamM, statsM, statusM, diagM, manualM] = await Promise.all([
    load('../lib/tools/fragment-dream.js'),
    load('../lib/tools/fragment-stats.js'),
    load('../lib/tools/archive-status.js'),
    load('../lib/tools/fragment-diagnosis.js'),
    load('../lib/tools/manual.js'),
  ])
  const now = Date.now()
  env.store.saveFragments([
    { id: 'd1', content: 'x', consolidation_status: 'transient', access_count: 1, created_at: new Date(now - 9 * 86400000).toISOString() },
    { id: 'd2', content: 'y', layer: 'deep', category: 'preference', recall_frequency: 2, weight: 0.7, created_at: new Date(now).toISOString() },
  ])

  const dream = dreamM.createFragmentDreamTool(env.deps)
  const r1 = await dream.execute({})
  assert.equal(r1.status, 'ok')
  assert.equal(JSON.parse(r1.payload).report.consolidated, 1)

  const stats = statsM.createFragmentStatsTool(env.deps)
  const r2 = await stats.execute({})
  const st = JSON.parse(r2.payload).stats
  assert.equal(st.total, 2)
  assert.equal(st.by_layer.deep, 1)
  assert.equal(st.by_category.preference, 1)
  assert.equal(st.unused_over_30days, 2)

  const status = statusM.createArchiveStatusTool(env.deps)
  const r3 = await status.execute({})
  const s = JSON.parse(r3.payload).status
  assert.equal(s.current_count, 2)
  assert.equal(s.archive_count, 0)
  assert.ok(s.suggestion)

  const diag = diagM.createFragmentDiagnosisTool(env.deps)
  const r4 = await diag.execute({})
  const report = JSON.parse(r4.payload).report
  assert.ok(report.includes('## 记忆状态诊断'))
  assert.ok(report.includes('碎片分布'))
  assert.ok(report.includes('AI 建议'))

  const manual = manualM.createManualTool()
  const r5 = await manual.execute({})
  assert.equal(r5.status, 'ok')
  assert.ok(JSON.parse(r5.payload).manual)
  const r6 = await manual.execute({ keyword: 'fragment_add' })
  assert.equal(r6.status, 'ok')
  const r7 = await manual.execute({ keyword: 'zzz-no-such-keyword-zzz' })
  assert.equal(r7.status, 'error')
})
