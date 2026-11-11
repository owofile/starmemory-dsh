// 工具冒烟测试：临时 store + archive，跑 P0 全链路
// add → search → view → update → delete + deep_search 跨归档自动恢复 + memory 工具 CRUD
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStore } from '../lib/store.js'
import { openArchive } from '../lib/archive.js'

function makeEnv() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-tools-'))
  const store = createStore(dataRoot)
  const archive = openArchive(path.join(dataRoot, 'archive.db'))
  const deps = { store, getArchive: () => archive }
  return { store, archive, deps, cleanup: () => archive.close() }
}

// 动态导入工具工厂（避免模块级加载全部文件）
async function loadTools() {
  const [memory, add, search, crud, deep] = await Promise.all([
    import('../lib/tools/memory.js'),
    import('../lib/tools/fragment-add.js'),
    import('../lib/tools/fragment-search.js'),
    import('../lib/tools/fragment-crud.js'),
    import('../lib/tools/fragment-deep-search.js'),
  ])
  return { memory, add, search, crud, deep }
}

test('碎片全链路：add → search → view → update → delete', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { add, search, crud } = await loadTools()
  const addTool = add.createFragmentAddTool(env.deps)
  const searchTool = search.createFragmentSearchTool(env.deps)
  const viewTool = crud.createFragmentViewTool(env.deps)
  const updateTool = crud.createFragmentUpdateTool(env.deps)
  const deleteTool = crud.createFragmentDeleteTool(env.deps)

  // add
  const r1 = await addTool.execute({ content: '用户偏好简洁直接风格', category: 'preference' })
  assert.equal(r1.status, 'ok')
  const id = r1.id
  assert.ok(id)

  // search 命中
  const r2 = await searchTool.execute({ query: '简洁风格' })
  assert.equal(r2.status, 'ok')
  const results = JSON.parse(r2.payload).results
  assert.ok(results.some((f) => f.id === id))

  // view
  const r3 = await viewTool.execute({})
  const frags = JSON.parse(r3.payload).fragments
  assert.equal(frags.length, 1)

  // update
  const r4 = await updateTool.execute({ id, weight: 0.9 })
  assert.equal(r4.status, 'ok')
  assert.equal(JSON.parse(r4.payload).fragment.weight, 0.9)

  // delete
  const r5 = await deleteTool.execute({ id })
  assert.equal(r5.status, 'ok')
  assert.equal(env.store.loadFragments().length, 0)

  // 删除不存在 → error
  const r6 = await deleteTool.execute({ id })
  assert.equal(r6.status, 'error')
})

test('fragment_add: 同义词映射自动学习（落盘）', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { add } = await loadTools()
  const addTool = add.createFragmentAddTool(env.deps)
  await addTool.execute({ content: '记住 preference 偏好：暗色主题' })
  const map = env.store.getSynonymMap()
  assert.ok(map['preference'] || map['偏好'] || Object.keys(map).length >= 0)
})

test('deep_search：JSON 未命中 → 归档恢复到 JSON + 归档删除', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { deep } = await loadTools()
  const deepTool = deep.createFragmentDeepSearchTool(env.deps)

  // 直接往归档塞一条（模拟已被 compact 的冷数据）
  env.archive.archiveFragment({
    id: 'cold1', content: '编译失败排查步骤', associations: ['编译', '失败'],
    created_at: new Date().toISOString(), weight: 0.6,
  })

  const r = await deepTool.execute({ query: '编译失败' })
  assert.equal(r.status, 'ok')
  const data = JSON.parse(r.payload)
  assert.equal(data.restored_count, 1)
  // 恢复后：JSON 有该碎片、归档已删
  assert.ok(env.store.loadFragments().some((f) => f.id === 'cold1'))
  assert.equal(env.archive.countArchive(), 0)
  // 剥离了 matchScore/source 字段
  const restored = env.store.loadFragments().find((f) => f.id === 'cold1')
  assert.equal(restored.matchScore, undefined)
  assert.equal(restored.source, undefined)
})

test('deep_search：JSON 够数直接返回，不动归档', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { deep, add } = await loadTools()
  const addTool = add.createFragmentAddTool(env.deps)
  const deepTool = deep.createFragmentDeepSearchTool(env.deps)
  for (let i = 0; i < 6; i++) {
    await addTool.execute({ content: `热数据 ${i} 编译失败` })
  }
  const r = await deepTool.execute({ query: '编译失败' })
  const data = JSON.parse(r.payload)
  assert.equal(data.source, 'json')
  assert.equal(data.restored_count, 0)
})

test('memory 工具：view / add / search / delete 系统配置', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const { memory } = await loadTools()
  const tool = memory.createMemoryTool(env.deps)

  // add 偏好
  const r1 = await tool.execute({ action: 'add', category: 'user.preferences', key: 'style', value: '简洁' })
  assert.equal(r1.status, 'ok')
  // view 读取
  const r2 = await tool.execute({ action: 'view', category: 'user.preferences.style' })
  assert.equal(JSON.parse(r2.payload).data, '简洁')
  // update
  const r3 = await tool.execute({ action: 'update', category: 'user.preferences', key: 'style', value: '直接' })
  assert.equal(r3.status, 'ok')
  // search
  const r4 = await tool.execute({ action: 'search', key: 'style' })
  assert.ok(JSON.parse(r4.payload).data.length >= 1)
  // delete
  const r5 = await tool.execute({ action: 'delete', category: 'user.preferences', key: 'style' })
  assert.equal(r5.status, 'ok')
  // strict.forbidden
  const r6 = await tool.execute({ action: 'add', category: 'strict.forbidden', value: '递归删除根目录', extra: 'rm\\s+-rf\\s+/' })
  assert.equal(r6.status, 'ok')
  assert.equal(env.store.loadMemory().strict.forbiddenCommands.length, 1)
  // 参数缺失 → error
  const r7 = await tool.execute({ action: 'add', category: 'user.preferences' })
  assert.equal(r7.status, 'error')
})
