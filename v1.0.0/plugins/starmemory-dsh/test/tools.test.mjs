// Phase 1 单测：memory_ping 契约自检（本机跑，不依赖 dsh SDK）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pingTool, PING_VERSION } from '../lib/tools/memory-ping.js'
import { validateTool } from '../scripts/check-schema.mjs'

test('ping: 静态门禁通过（三禁令 + 形状 + additionalProperties）', () => {
  const errs = validateTool(pingTool)
  assert.deepEqual(errs, [])
})

test('ping: 真调返回 canonical 对象，键集合 ⊆ schema', async () => {
  const ret = await pingTool.execute({}, {})
  assert.equal(typeof ret, 'object')
  assert.deepEqual(Object.keys(ret).sort(), ['status', 'version'])
  assert.equal(ret.status, 'ok')
  assert.equal(ret.version, PING_VERSION)
  for (const k of Object.keys(ret)) assert.ok(k in pingTool.output.schema.properties, `键 ${k} 必须在 schema 里`)
})

test('ping: render 返回文本块数组', () => {
  const blocks = pingTool.output.render({}, { status: 'ok', version: PING_VERSION })
  assert.ok(Array.isArray(blocks))
  assert.ok(blocks.every((b) => typeof b.text === 'string'))
  assert.ok(blocks[0].text.includes('"status"'))
})

test('ping: parameters 是空普通对象（无参工具写 {}）', () => {
  assert.deepEqual(pingTool.parameters, {})
})
