// memory_fragment_dream：梦想家（巩固流转 + 温度重算 + 类型分化策略；只标记，物理归档交给 compact）
// 核心逻辑在 store.dreamerRun（Phase 2 已移植），此工具是入口包装

import { ok, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createFragmentDreamTool({ store }) {
  return {
    name: 'memory_fragment_dream',
    description: '梦想家：巩固流转 + 温度重算 + 类型分化策略（只标记，物理归档交给 compact）',
    parameters: {},
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute() {
      return ok(store.dreamerRun())
    },
  }
}
