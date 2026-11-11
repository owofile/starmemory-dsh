// memory_fragment_diagnosis：诊断记忆状态（配置表、碎片统计、饼图、AI 建议）
// 逻辑直译自 OpenCode 版 index.js（含原文的表情状态图标与文本饼图）

import { ok, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createFragmentDiagnosisTool({ store }) {
  return {
    name: 'memory_fragment_diagnosis',
    description: '诊断记忆状态，输出配置文件、碎片统计、饼图和AI建议',
    parameters: {},
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute() {
      const fragments = store.loadFragments()
      const config = store.loadFragmentConfig()

      const now = new Date()
      let daysSinceCompact = null
      let lastCompactFormatted = '从未清理'
      if (config.last_compact) {
        const lastCompact = new Date(config.last_compact)
        daysSinceCompact = Math.floor((now - lastCompact) / (1000 * 60 * 60 * 24))
        const dateStr = config.last_compact.split('T')[0]
        const daysStr = daysSinceCompact === 0 ? '今天' : `${daysSinceCompact}天前`
        lastCompactFormatted = `${dateStr} (${daysStr})`
      }

      const totalFragments = fragments.length
      const categoryStats = {}
      fragments.forEach((f) => {
        const cat = f.category || 'general'
        categoryStats[cat] = (categoryStats[cat] || 0) + 1
      })

      const sortedCategories = Object.entries(categoryStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)

      const maxWidth = 20
      let pieChart = '\n'
      sortedCategories.forEach(([cat, count]) => {
        const percentage = totalFragments > 0 ? Math.round((count / totalFragments) * 100) : 0
        const barLength = totalFragments > 0 ? Math.round((count / totalFragments) * maxWidth) : 0
        const bar = '█'.repeat(barLength) + '░'.repeat(maxWidth - barLength)
        pieChart += `${bar} ${percentage}% ${cat} (${count}条)\n`
      })

      let statusIcon = '✅'
      let statusText = '无需清理'
      let suggestion = '当前状态很不错，保持即可。'

      if (!config.last_compact) {
        suggestion = '这是首次使用记忆系统，非常好！建议定期（如30天）运行一次 memory_fragment_compact 保持记忆高效。'
      } else if (totalFragments > config.json_max_count) {
        statusIcon = '🔴'
        statusText = '碎片已满'
        suggestion = `碎片数量(${totalFragments})已超过上限(${config.json_max_count})，建议立即运行 memory_fragment_compact mode="auto" 进行清理。`
      } else if (totalFragments > 500) {
        statusIcon = '🟡'
        statusText = '碎片较多'
        suggestion = `碎片数量(${totalFragments})较多，建议运行 memory_fragment_compact mode="auto" 进行清理。`
      } else if (totalFragments >= 200) {
        statusIcon = '🟢'
        statusText = '数量正常'
        suggestion = `碎片数量(${totalFragments})处于正常范围，可选择运行 memory_fragment_compact mode="auto" 提前整理。`
      } else if (daysSinceCompact !== null && daysSinceCompact >= config.cold_data_days) {
        statusIcon = '🟡'
        statusText = '建议清理'
        suggestion = `距离上次清理已超过 ${config.cold_data_days} 天阈值，建议运行 memory_fragment_compact mode="auto" 进行整理。`
      } else {
        suggestion = '当前状态很不错，保持即可。如需手动整理，可调用: memory_fragment_compact mode="auto"'
      }

      const daysUntilTrigger = daysSinceCompact !== null ? Math.max(0, config.cold_data_days - daysSinceCompact) : config.cold_data_days
      const triggerText = daysSinceCompact !== null ? `${daysUntilTrigger}天后` : `${config.cold_data_days}天后`

      let output = '## 记忆状态诊断\n\n'
      output += '### 配置文件\n'
      output += '| 配置项 | 值 |\n|--------|-----|\n'
      output += `| 上次清理 | ${lastCompactFormatted} |\n`
      output += `| 冷数据阈值 | ${config.cold_data_days} 天 |\n`
      output += `| 年龄阈值 | ${config.cold_data_age_days} 天 |\n`
      output += `| JSON最大容量 | ${config.json_max_count} 条 |\n`
      output += '\n### 当前状态\n'
      output += '| 指标 | 值 | 状态 |\n|------|-----|------|\n'
      output += `| 碎片总数 | ${totalFragments} 条 | ${statusIcon} ${statusText} |\n`
      output += `| 距离上次清理 | ${daysSinceCompact !== null ? daysSinceCompact + ' 天' : '未知'} | |\n`
      output += `| 预计触发时间 | ${triggerText} | |\n`
      output += '\n### 碎片分布 (饼图)'
      output += pieChart
      output += '\n### AI 建议\n'
      output += suggestion + '\n'

      return ok({ report: output })
    },
  }
}
