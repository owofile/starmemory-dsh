// memory 工具：管理 memory.json 系统配置（用户偏好、安全规则、项目）
// 逻辑直译自 OpenCode 版，返回值改统一 canonical 结构（respond.js）

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'
import { genId } from '../core.js'

export function createMemoryTool({ store }) {
  return {
    name: 'memory',
    description: '管理 memory.json 系统配置（用户偏好、安全规则、项目）',
    parameters: {
      action: { type: 'string', enum: ['view', 'add', 'update', 'delete', 'search'], required: true, description: '操作：view/add/update/delete/search' },
      category: { type: 'string', description: '分类路径，如 user / user.preferences / user.preferences.<key> / strict / strict.rules / strict.forbidden / projects / projects.<key> / all' },
      key: { type: 'string', description: '键名（view/delete/search 时为查询词）' },
      value: { type: 'string', description: '值' },
      extra: { type: 'string', description: '附加（strict.forbidden 的正则 pattern）' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const mem = store.loadMemory()
      const { action, category, key, value, extra } = args

      if (action === 'view') {
        if (!category || category === 'all') return ok({ data: mem })
        if (category === 'user') return ok({ data: mem.user ?? null })
        if (category === 'user.preferences') return ok({ data: mem.user?.preferences ?? {} })
        if (category === 'strict') return ok({ data: mem.strict ?? null })
        if (category === 'projects') return ok({ data: mem.projects ?? {} })
        if (category.startsWith('user.preferences.')) {
          const prefKey = category.replace('user.preferences.', '')
          return ok({ data: mem.user?.preferences?.[prefKey] ?? null })
        }
        if (category.startsWith('projects.')) {
          const projKey = category.replace('projects.', '')
          return ok({ data: mem.projects?.[projKey] ?? null })
        }
        return err(`Unknown category: ${category}`)
      }

      if (action === 'add') {
        // strict.rules / strict.forbidden 用 value 承载内容，不需要 key；
        // user.preferences 与 projects.* 需要 key 作为键名
        const needsKey = category === 'user.preferences' || category === 'projects' || (typeof category === 'string' && category.startsWith('projects.'))
        if (!category || !value) return err('Missing required params: category, value')
        if (needsKey && !key) return err(`Missing required param for ${category}: key`)
        if (category === 'user.preferences') {
          if (!mem.user.preferences) mem.user.preferences = {}
          mem.user.preferences[key] = value
        } else if (category === 'strict.rules') {
          if (!mem.strict.rules) mem.strict.rules = []
          mem.strict.rules.push(value)
        } else if (category === 'strict.forbidden') {
          if (!mem.strict.forbiddenCommands) mem.strict.forbiddenCommands = []
          mem.strict.forbiddenCommands.push({ id: genId('forbid'), pattern: extra || '', description: value, severity: 'critical' })
        } else if (category === 'projects') {
          if (!mem.projects) mem.projects = {}
          mem.projects[key] = value
        } else if (category.startsWith('projects.')) {
          const projKey = category.replace('projects.', '')
          if (!mem.projects) mem.projects = {}
          mem.projects[projKey] = value
        } else {
          return err(`Unknown category: ${category}`)
        }
        store.saveMemory(mem)
        return ok({ message: `Added ${key ?? value} to ${category}` }, { id: key })
      }

      if (action === 'update') {
        if (!category || !key || !value) return err('Missing required params: category, key, value')
        if (category === 'user.preferences' && mem.user.preferences && key in mem.user.preferences) {
          mem.user.preferences[key] = value
          store.saveMemory(mem)
          return ok({ message: `Updated ${key}` }, { id: key })
        }
        if (category === 'projects' && mem.projects && key in mem.projects) {
          mem.projects[key] = value
          store.saveMemory(mem)
          return ok({ message: `Updated project ${key}` }, { id: key })
        }
        return err(`Key not found: ${key}`)
      }

      if (action === 'delete') {
        if (!category || !key) return err('Missing required params: category, key')
        if (category === 'strict.rules' && mem.strict.rules) {
          const idx = mem.strict.rules.indexOf(key)
          if (idx !== -1) {
            mem.strict.rules.splice(idx, 1)
            store.saveMemory(mem)
            return ok({ message: `Deleted rule: ${key}` })
          }
          return err(`Rule not found: ${key}`)
        }
        if (category === 'strict.forbidden' && mem.strict.forbiddenCommands) {
          const idx = mem.strict.forbiddenCommands.findIndex((c) => c.id === key)
          if (idx !== -1) {
            const deleted = mem.strict.forbiddenCommands.splice(idx, 1)[0]
            store.saveMemory(mem)
            return ok({ message: `Deleted forbidden: ${deleted.description}` })
          }
          return err(`Forbidden command not found: ${key}`)
        }
        if (category === 'user.preferences' && mem.user?.preferences && key in mem.user.preferences) {
          delete mem.user.preferences[key]
          store.saveMemory(mem)
          return ok({ message: `Deleted user.preferences.${key}` })
        }
        if (category.startsWith('user.preferences.')) {
          const prefKey = category.replace('user.preferences.', '')
          if (mem.user?.preferences && prefKey in mem.user.preferences) {
            delete mem.user.preferences[prefKey]
            store.saveMemory(mem)
            return ok({ message: `Deleted user.preferences.${prefKey}` })
          }
          return err(`Preference key not found: ${prefKey}`)
        }
        if (category === 'projects' && mem.projects && key in mem.projects) {
          delete mem.projects[key]
          store.saveMemory(mem)
          return ok({ message: `Deleted projects.${key}` })
        }
        return err(`Unknown category or key not found: ${category}/${key}`)
      }

      if (action === 'search') {
        if (!key) return err('Missing required param: key (query)')
        const queryLower = key.toLowerCase()
        const matches = []
        if (mem.user?.preferences) {
          for (const [k, v] of Object.entries(mem.user.preferences)) {
            if (k.toLowerCase().includes(queryLower) || String(v).toLowerCase().includes(queryLower)) {
              matches.push(`user.preferences.${k}: ${v}`)
            }
          }
        }
        if (mem.strict?.rules) {
          for (const rule of mem.strict.rules) {
            if (rule.toLowerCase().includes(queryLower)) matches.push(`strict.rules: ${rule}`)
          }
        }
        if (mem.strict?.forbiddenCommands) {
          for (const cmd of mem.strict.forbiddenCommands) {
            if (cmd.description.toLowerCase().includes(queryLower) || cmd.pattern.toLowerCase().includes(queryLower)) {
              matches.push(`strict.forbidden.${cmd.id}: ${cmd.description} (${cmd.pattern})`)
            }
          }
        }
        if (mem.projects) {
          for (const [k, v] of Object.entries(mem.projects)) {
            if (k.toLowerCase().includes(queryLower) || String(v).toLowerCase().includes(queryLower)) {
              matches.push(`projects.${k}: ${v}`)
            }
          }
        }
        return ok({ data: matches }, { count: matches.length })
      }

      return err('Unknown action')
    },
  }
}
