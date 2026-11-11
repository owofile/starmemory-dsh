// core 纯逻辑单测（直译自 OpenCode 版行为的等价断言）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCategory, backfillFragment, computeActivation, applyRecall, applyFragmentFilters,
  extractKeywords, expandQuery, computeRelevance, jaccardShingle, genId, analyzeAndAddMappings,
  FRAGMENT_DEFAULTS,
} from '../lib/core.js'

test('normalizeCategory: 别名归一 + 未映射保留', () => {
  assert.equal(normalizeCategory('Projects'), 'project')
  assert.equal(normalizeCategory('偏好'), 'preference')
  assert.equal(normalizeCategory(''), 'general')
  assert.equal(normalizeCategory('my-custom'), 'my-custom')
})

test('backfillFragment: 补齐缺失分类字段，不丢已有值', () => {
  const f = backfillFragment({ id: 'x', content: 'hi', confidence: 0.9 })
  assert.equal(f.confidence, 0.9)
  assert.equal(f.source_type, FRAGMENT_DEFAULTS.source_type)
  assert.equal(f.consolidation_status, 'transient')
})

test('computeActivation: 衰减随天数下降，高稳定性衰减慢', () => {
  const mk = (stability, days) => ({
    base_activation: 1.0, stability, decay_rate: 0.5,
    last_accessed_at: new Date(Date.now() - days * 86400000).toISOString(),
  })
  const a0 = computeActivation(mk(1.0, 30))
  const a5 = computeActivation(mk(0.5, 30))
  assert.equal(a0, 1.0)           // stability=1 不衰减
  assert.ok(a5 < 1 && a5 > 0)     // 有衰减但不归零
})

test('computeActivation: 兼容回退 weight（base_activation=0 时）', () => {
  assert.equal(computeActivation({ weight: 0.7 }), 0.7)
})

test('applyRecall: 升温 + 计数 + use_history 上限 + 3 次自动佐证', () => {
  const f = { base_activation: 0.2, access_count: 0, use_history: '[]' }
  applyRecall(f); applyRecall(f)
  assert.equal(f.access_count, 2)
  assert.equal(f.source_type, undefined) // 不足 3 次，不升级（默认 inferred 由 add 时补）
  assert.equal(f.source_type || 'inferred', 'inferred')
  applyRecall(f)
  assert.equal(f.access_count, 3)
  assert.equal(f.source_type, 'corroborated')
  assert.ok(f.base_activation > 0.5)
})

test('applyFragmentFilters: 各维度过滤', () => {
  const now = Date.now()
  const frags = [
    { source_type: 'inferred', memory_type: 'semantic', consolidation_status: 'transient', expires_at: null, weight: 0.5, base_activation: 0.9, last_accessed_at: new Date(now).toISOString() },
    { source_type: 'user_confirmed', memory_type: 'episodic', consolidation_status: 'archived', expires_at: new Date(now - 1000).toISOString(), weight: 0.1, base_activation: 0.1 },
  ]
  assert.equal(applyFragmentFilters(frags, { source_type: 'user_confirmed' }).length, 1)
  assert.equal(applyFragmentFilters(frags, { exclude_expired: true }).length, 1)
  assert.equal(applyFragmentFilters(frags, { min_activation: 0.5 }).length, 1)
  assert.equal(applyFragmentFilters(frags, {}).length, 2)
})

test('extractKeywords: 中文词 + 英文词 + 同义词扩展', () => {
  const kws = extractKeywords('用户偏好 concise style，记住 preference', { preference: ['偏好'] })
  assert.ok(kws.includes('用户偏好'))
  assert.ok(kws.includes('preference'))
  assert.ok(kws.includes('偏好')) // 同义词扩展
})

test('expandQuery: 整句保留 + bigram + 停用词过滤', () => {
  const terms = expandQuery('编译失败怎么排查', {})
  assert.ok(terms.includes('编译失败怎么排查')) // 整句保留（原文行为：expanded.add(query)）
  assert.ok(terms.includes('编译'))   // 中文 bigram
  assert.ok(terms.includes('失败'))   // 中文 bigram
  assert.ok(!terms.includes('怎么'))  // 停用词 bigram 被过滤
})

test('computeRelevance: 饱和上限 4 词', () => {
  const f = { content: 'alpha beta gamma delta', associations: [] }
  const terms = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']
  assert.equal(computeRelevance(f, terms), 1) // 前 4 词全中即满
})

test('jaccardShingle: 近似内容高相似', () => {
  const a = jaccardShingle('hello world foo', 'hello world foo!')
  assert.ok(a > 0.6)
  assert.equal(jaccardShingle('abc', ''), 0)
})

test('genId: 前缀 + 唯一性', () => {
  const a = genId(); const b = genId()
  assert.ok(a.startsWith('frag_'))
  assert.notEqual(a, b)
})

test('analyzeAndAddMappings: 英文↔中文自动映射，已有键不覆盖', () => {
  const map = { existing: ['x'] }
  const { addedCount } = analyzeAndAddMappings(['preference', '偏好', 'existing'], map)
  assert.ok(addedCount >= 1)
  assert.deepEqual(map['preference'], ['偏好'])
  assert.deepEqual(map['existing'], ['x']) // 不覆盖
})
