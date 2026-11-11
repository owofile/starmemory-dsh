// 设置面（Config schema）↔ 召回运行时 同步逻辑单测（纯逻辑，mock store 桩）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RECALL_CONFIG_DEFAULTS,
  unwrapConfigValue,
  readRecallConfig,
  createRecallConfigSync,
} from '../lib/config.js'

/** volatile 叶引用的桩：冻结对象 { get }（宿主 createVolatile 的形态） */
function volatileRef(value) {
  return Object.freeze({ get: () => value })
}

function mockStore() {
  const calls = []
  return {
    calls,
    setRecallEnabled(v) { calls.push(['enabled', v]) },
    setRecallLevel(v) { calls.push(['level', v]) },
  }
}

test('RECALL_CONFIG_DEFAULTS: 面板未配置为权威关闭态', () => {
  assert.deepEqual(RECALL_CONFIG_DEFAULTS, {
    recallEnabled: false,
    recallEffort: 0,
    recallPanelConfigured: false,
  })
})

test('unwrapConfigValue: 普通值透传 / volatile 引用解包 / 嵌套递归', () => {
  assert.equal(unwrapConfigValue(true), true)
  assert.equal(unwrapConfigValue(3), 3)
  assert.equal(unwrapConfigValue(volatileRef(true)), true)
  assert.deepEqual(
    unwrapConfigValue({ recallEnabled: volatileRef(true), recallEffort: volatileRef(4) }),
    { recallEnabled: true, recallEffort: 4 },
  )
  assert.deepEqual(unwrapConfigValue([volatileRef(1), 2]), [1, 2])
})

test('readRecallConfig: 缺省补全（宿主只回传部分字段时）', () => {
  const cfg = readRecallConfig({ recallEnabled: volatileRef(true) })
  assert.deepEqual(cfg, { recallEnabled: true, recallEffort: 0, recallPanelConfigured: false })
})

test('readRecallConfig: config 为 null/undefined 时全缺省', () => {
  assert.deepEqual(readRecallConfig(null), { ...RECALL_CONFIG_DEFAULTS })
  assert.deepEqual(readRecallConfig(undefined), { ...RECALL_CONFIG_DEFAULTS })
})

test('同步器: 面板未配置（recallPanelConfigured=false）→ 不动 recall-runtime', () => {
  const store = mockStore()
  const sync = createRecallConfigSync(store)
  const r = sync.applyConfig({ recallEnabled: volatileRef(true), recallEffort: volatileRef(3) })
  assert.equal(r.synced, false)
  assert.deepEqual(store.calls, [])
})

test('同步器: 面板配置过 → 写开关与档位进 recall-runtime', () => {
  const store = mockStore()
  const sync = createRecallConfigSync(store)
  const r = sync.applyConfig({
    recallEnabled: volatileRef(true),
    recallEffort: volatileRef(4),
    recallPanelConfigured: volatileRef(true),
  })
  assert.equal(r.synced, true)
  assert.deepEqual(store.calls, [['enabled', true], ['level', 4]])
})

test('同步器: 面板配置过但开关为关 → 只写开关（保持档位由 store 内部处理）', () => {
  const store = mockStore()
  const sync = createRecallConfigSync(store)
  const r = sync.applyConfig({
    recallEnabled: volatileRef(false),
    recallEffort: volatileRef(2),
    recallPanelConfigured: volatileRef(true),
  })
  assert.equal(r.synced, true)
  assert.deepEqual(store.calls, [['enabled', false], ['level', 2]])
})
