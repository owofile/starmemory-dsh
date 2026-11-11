// memory_fragment_compact：碎片整理（冷数据归档到 SQLite）
// 直译自 OpenCode 版 external/fragment-compactor.js（去 spawn/sql.js，内联 node:sqlite）
// 冷数据判定（原文三分支）：
//   gentle     — 创建早于 ageThreshold 且召回 < 2 次
//   auto(默认) — 非"高频记忆"(召回 >= 3 次永不自动归档) 且 (last_recalled 早于 coldThreshold 或创建早于 ageThreshold)
//   aggressive — last_recalled 早于 15 天 或 创建早于 45 天 或 召回 < 3 次
// 另外所有模式：梦想家标记(consolidation_status=archived 或已过期)优先物理归档

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

const DAY_MS = 24 * 60 * 60 * 1000

function getColdFragments(fragments, config, mode) {
  const now = Date.now()
  const coldDays = config.cold_data_days || 30
  const ageDays = config.cold_data_age_days || 60
  const coldThreshold = new Date(now - coldDays * DAY_MS)
  const ageThreshold = new Date(now - ageDays * DAY_MS)

  let coldConditions
  switch (mode) {
    case 'gentle':
      coldConditions = (f) => {
        const createdAt = new Date(f.created_at)
        const accessCount = f.access_count || 0
        return createdAt < ageThreshold && accessCount < 2
      }
      break
    case 'aggressive': {
      const aThreshold = new Date(now - 15 * DAY_MS)
      const agThreshold = new Date(now - 45 * DAY_MS)
      coldConditions = (f) => {
        const createdAt = new Date(f.created_at)
        const lastRecalled = f.last_recalled ? new Date(f.last_recalled) : null
        const accessCount = f.access_count || 0
        return (lastRecalled && lastRecalled < aThreshold) || createdAt < agThreshold || accessCount < 3
      }
      break
    }
    case 'auto':
    default:
      coldConditions = (f) => {
        const createdAt = new Date(f.created_at)
        const lastRecalled = f.last_recalled ? new Date(f.last_recalled) : null
        // 高频记忆（被召回>=3次）永不自动归档：多次召回证明有用（与自动佐证逻辑一致）
        if ((f.access_count || 0) >= 3) return false
        return (lastRecalled && lastRecalled < coldThreshold) || createdAt < ageThreshold
      }
      break
  }

  // 梦想家标记的碎片优先物理归档，所有模式都生效
  const markedForArchive = (f) => f.consolidation_status === 'archived' ||
    (f.expires_at && new Date(f.expires_at).getTime() <= now)

  return fragments.filter((f) => markedForArchive(f) || coldConditions(f))
}

export function createFragmentCompactTool({ store, getArchive }) {
  return {
    name: 'memory_fragment_compact',
    description: '整理碎片数据库（冷数据归档到SQLite）',
    parameters: {
      mode: { type: 'string', enum: ['gentle', 'auto', 'aggressive'], description: '整理强度，默认 auto' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const archive = getArchive()
      if (!archive) return err('Archive not available')
      const mode = args.mode || 'auto'
      const config = store.loadFragmentConfig()
      let fragments = store.loadFragments()
      const beforeCount = fragments.length
      const coldFragments = getColdFragments(fragments, config, mode)

      if (coldFragments.length === 0) {
        return ok({ report: { mode, before_count: beforeCount, archived_count: 0, after_count: beforeCount, message: 'No cold fragments to archive' } })
      }

      for (const f of coldFragments) archive.archiveFragment(f)

      const coldIds = new Set(coldFragments.map((f) => f.id))
      fragments = fragments.filter((f) => !coldIds.has(f.id))
      store.saveFragments(fragments)

      config.last_compact = new Date().toISOString()
      store.saveFragmentConfig(config)

      return ok({
        report: {
          mode,
          before_count: beforeCount,
          archived_count: coldFragments.length,
          after_count: fragments.length,
          last_compact: config.last_compact,
          archived_ids: coldFragments.map((f) => f.id),
        },
      })
    },
  }
}
