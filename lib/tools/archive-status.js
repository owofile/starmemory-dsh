// memory_fragment_archive_status：查看归档状态（当前数量、配置、上次整理时间、建议）
// 逻辑直译自 OpenCode 版 index.js

import { ok, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createArchiveStatusTool({ store, getArchive }) {
  return {
    name: 'memory_fragment_archive_status',
    description: '查看碎片归档状态（当前数量、配置、上次整理时间等）',
    parameters: {},
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute() {
      const fragments = store.loadFragments()
      const config = store.loadFragmentConfig()
      const archive = getArchive()
      const now = new Date()
      let daysSinceCompact = null
      let suggestion = null
      if (config.last_compact) {
        const lastCompact = new Date(config.last_compact)
        daysSinceCompact = Math.floor((now - lastCompact) / (1000 * 60 * 60 * 24))
        if (daysSinceCompact > 30) suggestion = '建议执行碎片整理'
      } else {
        suggestion = '从未整理过，建议执行碎片整理'
      }
      if (fragments.length >= config.json_max_count) {
        suggestion = '碎片数量已达上限，建议执行碎片整理'
      }
      return ok({
        status: {
          current_count: fragments.length,
          archive_count: archive ? archive.countArchive() : null,
          json_max_count: config.json_max_count,
          cold_data_days: config.cold_data_days,
          cold_data_age_days: config.cold_data_age_days,
          last_compact: config.last_compact,
          days_since_compact: daysSinceCompact,
          suggestion,
        },
      })
    },
  }
}
