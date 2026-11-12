// P3 召回四工具测试：四道闸门过滤 / 排序 / Token 预算 / 去重 / 档位联动
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStore } from '../lib/store.js'
import { openArchive } from '../lib/archive.js'
import { autoRecallCandidates, formatRecallBlock } from '../lib/core.js'

function makeEnv() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-p3-'))
  const store = createStore(dataRoot)
  const archive = openArchive(path.join(dataRoot, 'archive.db'))
  return { store, archive, deps: { store, getArchive: () => archive }, cleanup: () => archive.close() }
}

// 构造已巩固碎片（巩固闸门要求 consolidated）
function frag(id, content, opts = {}) {
  const now = Date.now()
  return {
    id, content, associations: [], weight: 0.5, source_type: 'inferred', confidence: 0.5,
    consolidation_status: 'consolidated', created_at: new Date(now - 10 * 86400000).toISOString(),
    access_count: 1, last_accessed_at: new Date(now - 86400000).toISOString(),
    base_activation: 0.8, stability: 1.0, decay_rate: 0.5,
    ...opts,
  }
}

test('autoRecallCandidates: 四道闸门逐条生效', () => {
  const now = Date.now()
  const params = { effort: 4, budget: 0.04, topK: 5, tempMin: 0.4, relMin: 0.65, cold: true }
  const frags = [
    frag('ok1', '编译失败排查步骤'),                                        // 应入选
    frag('not-consolidated', '编译失败排查步骤', { consolidation_status: 'transient' }), // 巩固闸门拦截
    frag('expired', '编译失败排查步骤', { expires_at: new Date(now - 1000).toISOString() }), // 时效闸门拦截
    frag('cold-temp', '编译失败排查步骤', { base_activation: 0.2 }),         // 温度闸门拦截
    frag('low-rel', '完全无关的内容'),                                       // 相关性闸门拦截
  ]
  const out = autoRecallCandidates(frags, '编译失败', params)
  assert.deepEqual(out.map((c) => c.id), ['ok1'])
})

test('autoRecallCandidates: 冷记忆特判（temp<0.3 需 cold=true + 佐证身份；档位6 tempMin=0.2 才可达）', () => {
  // 原文预设：只有 effort 6 的 tempMin=0.2 允许 temp<0.3 通过温度闸门 → 冷分支只在强档位生效
  const paramsCold = { effort: 6, budget: 0.05, topK: 5, tempMin: 0.2, relMin: 0.6, cold: true }
  const paramsNoCold = { ...paramsCold, cold: false }
  const frags = [frag('cold1', '编译失败排查步骤', { base_activation: 0.25, source_type: 'corroborated' })]
  // cold=false → 拦截
  assert.equal(autoRecallCandidates(frags, '编译失败', paramsNoCold).length, 0)
  // cold=true + corroborated → 放行
  assert.equal(autoRecallCandidates(frags, '编译失败', paramsCold).length, 1)
  // cold=true 但 inferred → 拦截
  frags[0].source_type = 'inferred'
  assert.equal(autoRecallCandidates(frags, '编译失败', paramsCold).length, 0)
})

test('autoRecallCandidates: 佐证加权排序（confirmed > corroborated > inferred）', () => {
  const params = { effort: 4, budget: 0.04, topK: 5, tempMin: 0.4, relMin: 0.65, cold: true }
  // 注意内容必须彼此不同（近重复 Jaccard>0.6 会被去重）
  const frags = [
    frag('inferred', '编译失败原因分析总结'),
    frag('confirmed', '如何解决编译失败问题', { source_type: 'user_confirmed' }),
    frag('corroborated', '编译失败重试机制说明', { source_type: 'corroborated' }),
  ]
  const out = autoRecallCandidates(frags, '编译失败', params)
  assert.equal(out[0].id, 'confirmed')
  assert.equal(out[1].id, 'corroborated')
  assert.equal(out[2].id, 'inferred')
})

test('autoRecallCandidates: 近重复去重（Jaccard > 0.6 只留更优）', () => {
  const params = { effort: 4, budget: 0.04, topK: 5, tempMin: 0.4, relMin: 0.65, cold: true }
  const frags = [frag('a', '编译失败排查步骤完整流程指南'), frag('b', '编译失败排查步骤完整流程指南')]
  assert.equal(autoRecallCandidates(frags, '编译失败', params).length, 1)
})

test('autoRecallCandidates: Token 预算截断（不超发）', () => {
  // 预算 0.01*8000=80 tokens；每条 ~30 tokens → 最多 2 条
  const params = { effort: 1, budget: 0.01, topK: 5, tempMin: 0.4, relMin: 0.65, cold: false }
  const long = 'x'.repeat(90) // tokens = ceil(90/3) = 30
  const frags = [frag('l1', long + 'A'), frag('l2', long + 'B'), frag('l3', long + 'C')]
  const out = autoRecallCandidates(frags, 'xxx', params)
  assert.ok(out.length <= 2)
  let acc = 0
  for (const c of out) acc += c.tokens
  assert.ok(acc <= 80)
})

test('formatRecallBlock: 佐证/确认标记 + 注入头', () => {
  const block = formatRecallBlock([
    { content: '记忆A', source_type: 'corroborated' },
    { content: '记忆B', source_type: 'user_confirmed' },
    { content: '记忆C', source_type: 'inferred' },
  ])
  assert.ok(block.includes('[佐证] 记忆A'))
  assert.ok(block.includes('[确认] 记忆B'))
  assert.ok(!block.includes('[佐证] 记忆C'))
  assert.ok(block.startsWith('[自动召回'))
  assert.equal(formatRecallBlock([]), '')
})

test('recall 四工具：set/enable/status/preview 联动', async (t) => {
  const env = makeEnv()
  t.after(env.cleanup)
  const m = await import('../lib/tools/recall.js')
  const set = m.createRecallSetTool(env.deps)
  const en = m.createRecallEnableTool(env.deps)
  const st = m.createRecallStatusTool(env.deps)
  const pv = m.createRecallPreviewTool(env.deps)

  // 默认关闭 → preview 报错
  const r0 = await pv.execute({ query: '编译' })
  assert.equal(r0.status, 'error')

  // 开启 + 设档位 4
  await en.execute({ enabled: true })
  const r1 = await set.execute({ effort: 4 })
  assert.equal(r1.status, 'ok')
  assert.equal(JSON.parse(r1.payload).effort, 4)
  assert.equal(JSON.parse(r1.payload).topK, 3)

  // status 读取（跨实例持久化）
  const r2 = await st.execute({})
  const s = JSON.parse(r2.payload)
  assert.equal(s.enabled, true)
  assert.equal(s.effort, 4)
  assert.ok(s.runtime_file)

  // 碎片不满足巩固闸门 → 0 候选但工具成功
  env.store.saveFragments([frag('x1', '编译失败排查', { consolidation_status: 'transient' })])
  const r3 = await pv.execute({ query: '编译失败' })
  assert.equal(r3.status, 'ok')
  assert.equal(JSON.parse(r3.payload).candidates_total, 0)

  // 满足全部闸门 → 命中
  env.store.saveFragments([frag('x1', '编译失败排查', { consolidation_status: 'transient' }), frag('x2', '编译失败排查')])
  const r4 = await pv.execute({ query: '编译失败' })
  const data = JSON.parse(r4.payload)
  assert.ok(data.candidates_total >= 1)
  assert.ok(data.selected.some((c) => c.id === 'x2'))
  assert.ok(data.budget_tokens > 0)
})
