// StarMemory DSH —— 统一输出契约
// 所有工具返回单一 canonical 对象：{ status, id?, count?, payload }
// - status: 'ok' | 'error'（业务性"非理想但成功/失败"；基础设施故障才 throw → isError）
// - payload: JSON.stringify 后的字符串（不定结构数据统一走这，子集校验安全）
// - schema 三禁令合规（PORT.md §4.3）

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', required: true, description: 'ok | error' },
    id: { type: 'string', description: '涉及的碎片/条目 ID（可选）' },
    count: { type: 'integer', description: '结果条数（可选）' },
    payload: { type: 'string', description: 'JSON 序列化的结果数据' },
  },
}

export const DEFAULT_RENDER = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]

export function ok(data, extra = {}) {
  const out = { status: 'ok' }
  if (extra.id !== undefined && extra.id !== null) out.id = String(extra.id)
  if (extra.count !== undefined && extra.count !== null) out.count = extra.count
  out.payload = JSON.stringify(data ?? {})
  return out
}

export function err(message, extra = {}) {
  const out = { status: 'error' }
  if (extra.id !== undefined && extra.id !== null) out.id = String(extra.id)
  out.payload = JSON.stringify({ error: String(message) })
  return out
}
