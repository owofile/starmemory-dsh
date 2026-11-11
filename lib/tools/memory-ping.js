// memory_ping：最小可注册工具（Phase 1 门禁验证用）。
// 纯数据 + 逻辑模块，不 import dsh SDK —— 本机 node --test / check-schema 可直接跑。
// 契约自检（PORT.md §4.3/§4.5）：
// - output.schema 无 {type:'json'} / 无数组 required / 无 required+oneOf 并列
// - 返回值键集合 ⊆ schema 声明的键集合（status / version）

export const PING_VERSION = '1.2.5'

export const pingTool = {
  name: 'memory_ping',
  description:
    'StarMemory 记忆插件连通性自检：返回插件版本与运行状态。用于验证记忆工具链是否可用，不读写任何记忆内容。',
  parameters: {},
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', required: true, description: 'ok = 工具链可用' },
        version: { type: 'string', description: 'StarMemory DSH 插件版本' },
      },
    },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(_args, _exec) {
    return { status: 'ok', version: PING_VERSION }
  },
}
