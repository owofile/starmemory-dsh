// synonym_map_view / add / delete / update：同义词映射表管理
// 逻辑直译自 OpenCode 版；store.saveSynonymMap 已内置缓存刷新

import { ok, err, OUTPUT_SCHEMA, DEFAULT_RENDER } from '../respond.js'

export function createSynonymViewTool({ store }) {
  return {
    name: 'synonym_map_view',
    description: '查看同义词映射表',
    parameters: {},
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute() {
      return ok({ map: store.getSynonymMap() })
    },
  }
}

export function createSynonymAddTool({ store }) {
  return {
    name: 'synonym_map_add',
    description: '添加同义词映射',
    parameters: {
      key: { type: 'string', required: true, description: '关键词' },
      synonyms: { type: 'array', items: { type: 'string' }, required: true, description: '同义词数组' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const map = { ...store.getSynonymMap() }
      map[args.key] = map[args.key]
        ? [...new Set([...map[args.key], ...args.synonyms])]
        : args.synonyms
      store.saveSynonymMap(map)
      return ok({ message: `Added synonyms for "${args.key}"`, key: args.key, synonyms: map[args.key] }, { id: args.key })
    },
  }
}

export function createSynonymDeleteTool({ store }) {
  return {
    name: 'synonym_map_delete',
    description: '删除同义词映射',
    parameters: {
      key: { type: 'string', required: true, description: '要删除的关键词' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const map = { ...store.getSynonymMap() }
      if (!map[args.key]) return err(`Key "${args.key}" not found`)
      delete map[args.key]
      store.saveSynonymMap(map)
      return ok({ message: `Deleted key "${args.key}"` })
    },
  }
}

export function createSynonymUpdateTool({ store }) {
  return {
    name: 'synonym_map_update',
    description: '更新同义词映射（完全替换）',
    parameters: {
      key: { type: 'string', required: true, description: '关键词' },
      synonyms: { type: 'array', items: { type: 'string' }, required: true, description: '新的同义词数组' },
    },
    output: { schema: OUTPUT_SCHEMA, render: DEFAULT_RENDER },
    async execute(args) {
      const map = { ...store.getSynonymMap() }
      map[args.key] = args.synonyms
      store.saveSynonymMap(map)
      return ok({ message: `Updated "${args.key}"`, key: args.key, synonyms: map[args.key] }, { id: args.key })
    },
  }
}
