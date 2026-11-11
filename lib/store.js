// StarMemory DSH —— JSON 数据层（store）
// 直译自 OpenCode 版 index.js 的文件读写与状态逻辑，改动点：
// - 数据根可注入（createStore(dataRoot)，默认 ~/.starmemory），不进插件安装目录
// - 写盘原子化（tmp + rename，防半写损坏）
// - 同义词映射、召回运行时按 store 实例缓存（原版为模块级缓存）

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  TYPE_DECAY, backfillFragment, applyRecall, genId, extractKeywords, expandQuery,
  analyzeAndAddMappings, CONSOLIDATION_DAYS, RECONFIRM_DAYS, DAY_MS, CORROBORATE_THRESHOLD,
} from './core.js'

// 数据根：环境变量优先，缺省家目录 ~/.starmemory（跨 profile 持久，不进插件包目录）
export function resolveDataRoot() {
  return process.env.STARMEMORY_DATA_DIR || path.join(os.homedir(), '.starmemory')
}

// ===== 召回档位预设（0-6）=====
export const RECALL_PRESETS = [
  { effort: 0, budget: 0.000, topK: 0, tempMin: 1.01, relMin: 1.01, cold: false, label: 'OFF', labelZh: '关闭', pct: 0 },
  { effort: 1, budget: 0.010, topK: 1, tempMin: 0.70, relMin: 0.80, cold: false, label: 'Light', labelZh: '极轻', pct: 1 },
  { effort: 2, budget: 0.020, topK: 2, tempMin: 0.60, relMin: 0.75, cold: false, label: 'Light+', labelZh: '轻', pct: 2 },
  { effort: 3, budget: 0.030, topK: 2, tempMin: 0.50, relMin: 0.70, cold: false, label: 'Medium', labelZh: '中', pct: 3 },
  { effort: 4, budget: 0.040, topK: 3, tempMin: 0.40, relMin: 0.65, cold: true, label: 'Strong', labelZh: '较强', pct: 4 },
  { effort: 5, budget: 0.045, topK: 4, tempMin: 0.30, relMin: 0.60, cold: true, label: 'Strong+', labelZh: '强', pct: 4.5 },
  { effort: 6, budget: 0.050, topK: 5, tempMin: 0.20, relMin: 0.60, cold: true, label: 'Max', labelZh: '最强', pct: 5 },
]
// BASE_CONTEXT_TOKENS 在 core.js（autoRecallCandidates 预算用），store 自身不再使用
const FRAGMENT_CONFIG_DEFAULT = { json_max_count: 200, cold_data_days: 30, cold_data_age_days: 60, last_compact: null }

export function createStore(dataRoot) {
  fs.mkdirSync(dataRoot, { recursive: true })
  const P = {
    memory: path.join(dataRoot, 'memory.json'),
    fragments: path.join(dataRoot, 'fragments.json'),
    synonyms: path.join(dataRoot, 'associations_map.json'),
    recallRuntime: path.join(dataRoot, 'recall-runtime.json'),
    fragmentConfig: path.join(dataRoot, 'fragment-config.json'),
  }

  function readJson(p, fallback) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
    } catch {}
    return fallback
  }
  // 原子写：先写临时文件再 rename（防半写损坏）
  function writeJsonAtomic(p, data) {
    const tmp = `${p}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmp, p)
  }

  // ===== memory.json（长期记忆）=====
  function loadMemory() {
    return readJson(P.memory, { version: 2, user: { preferences: {} }, strict: { forbiddenCommands: [], rules: [] }, projects: {} })
  }
  function saveMemory(memory) {
    writeJsonAtomic(P.memory, memory)
    return true
  }

  // ===== fragments.json（碎片记忆）=====
  function loadFragments() {
    const data = readJson(P.fragments, { fragments: [] })
    return (data.fragments || []).map(backfillFragment)
  }
  function saveFragments(fragments) {
    writeJsonAtomic(P.fragments, { fragments })
  }

  // ===== 同义词映射（缓存 + 落盘）=====
  let synonymMap = normalizeSynonymMap(readJson(P.synonyms, {}))
  function normalizeSynonymMap(raw) {
    const out = {}
    for (const [key, value] of Object.entries(raw || {})) out[key.toLowerCase()] = value
    return out
  }
  function getSynonymMap() { return synonymMap }
  function saveSynonymMap(map) {
    writeJsonAtomic(P.synonyms, map)
    synonymMap = normalizeSynonymMap(map)
  }
  // associations 分析 → 英文↔中文自动映射（落盘 + 刷新缓存）
  function learnMappings(associations) {
    const map = { ...synonymMap }
    const { addedCount } = analyzeAndAddMappings(associations, map)
    if (addedCount > 0) saveSynonymMap(map)
    return addedCount
  }

  // ===== 命中回写（核心系统自己的写入）=====
  function updateRecall(id, now = new Date().toISOString()) {
    const fragments = loadFragments()
    const idx = fragments.findIndex((f) => f.id === id)
    if (idx !== -1) {
      const f = fragments[idx]
      applyRecall(f, now)
      f.last_recalled = f.last_accessed_at // 兼容 compact/search 字段
      f.recall_frequency = (f.recall_frequency || 0) + 1
      saveFragments(fragments)
    }
  }

  // ===== P5 迁移（启动时执行）=====
  function migrateCorroborated() {
    const fragments = loadFragments()
    let upgraded = 0
    for (const f of fragments) {
      if ((f.source_type || 'inferred') === 'inferred' && (f.access_count || 0) >= CORROBORATE_THRESHOLD) {
        f.source_type = 'corroborated'
        upgraded++
      }
    }
    if (upgraded > 0) saveFragments(fragments)
    return upgraded
  }
  function migrateDecayParams() {
    const fragments = loadFragments()
    let upgraded = 0
    for (const f of fragments) {
      const td = TYPE_DECAY[f.memory_type || 'semantic'] || TYPE_DECAY.semantic
      let dirty = false
      if ((f.stability === undefined || f.stability === 1.0) && td.stability !== 1.0) { f.stability = td.stability; dirty = true }
      if ((f.decay_rate === undefined || f.decay_rate === 0.5) && td.decay_rate !== 0.5) { f.decay_rate = td.decay_rate; dirty = true }
      if (dirty) upgraded++
    }
    if (upgraded > 0) saveFragments(fragments)
    return upgraded
  }

  // ===== 梦想家（只标记，物理归档交给 compact）=====
  function dreamerRun() {
    const fragments = loadFragments()
    const now = new Date()
    const nowMs = now.getTime()
    const report = { total: fragments.length, consolidated: 0, expired_marked: 0, archived_marked: 0, recomputed: 0, changed_ids: [] }
    for (const f of fragments) {
      let dirty = false
      // 1. 温度重算：衰减后的有效激活度提交为新 base_activation（高稳定性≈不衰减，幂等）
      const act = computeActivationSafe(f, nowMs)
      if (Math.abs((typeof f.base_activation === 'number' ? f.base_activation : 0) - act) > 0.001) {
        f.base_activation = act
        dirty = true
        report.recomputed++
      }
      // 2. 巩固流转：transient + 被使用 + 达延迟窗口 → consolidated
      if (f.consolidation_status === 'transient') {
        const ageDays = (nowMs - new Date(f.created_at || now.toISOString()).getTime()) / DAY_MS
        const used = (f.access_count || 0) >= 1
        if (used && ageDays >= CONSOLIDATION_DAYS) {
          f.consolidation_status = 'consolidated'
          f.consolidation_at = now.toISOString()
          const td = TYPE_DECAY[f.memory_type || 'semantic'] || TYPE_DECAY.semantic
          if (f.stability === undefined || f.stability === 1.0) f.stability = td.stability
          if (f.decay_rate === undefined || f.decay_rate === 0.5) f.decay_rate = td.decay_rate
          if (!f.base_activation || f.base_activation < 0.2) f.base_activation = 0.3
          dirty = true
          report.consolidated++
        }
      }
      // 3. 过期策略：已过期标记归档；临近过期要求确认
      if (f.expires_at) {
        const expMs = new Date(f.expires_at).getTime()
        if (!isNaN(expMs)) {
          const expDays = (expMs - nowMs) / DAY_MS
          if (expDays <= 0) {
            if (f.consolidation_status !== 'archived') {
              f.consolidation_status = 'archived'
              dirty = true
              report.archived_marked++
            }
          } else if (expDays <= RECONFIRM_DAYS && f.ttl_policy === 'fixed') {
            f.ttl_policy = 'reconfirm_required'
            dirty = true
            report.expired_marked++
          }
        }
      }
      if (dirty) report.changed_ids.push(f.id)
    }
    if (report.changed_ids.length > 0) saveFragments(fragments)
    report.changed = report.changed_ids.length
    return { success: true, report }
  }
  function computeActivationSafe(f, nowMs) {
    // 与 core.computeActivation 一致（这里为了 dreamer 内联，避免循环依赖语义差异）
    const base = typeof f.base_activation === 'number' ? f.base_activation : 0
    if (base <= 0 && typeof f.weight === 'number') return Math.max(0, Math.min(1, f.weight))
    const t = f.last_accessed_at || f.created_at
    if (!t) return base
    const lastMs = new Date(t).getTime()
    if (!lastMs) return base
    const days = (nowMs - lastMs) / DAY_MS
    const stability = typeof f.stability === 'number' ? f.stability : 1.0
    const decayRate = typeof f.decay_rate === 'number' ? f.decay_rate : 0.5
    return Math.max(0, Math.min(1, base * Math.exp(-decayRate * (1 - stability) * days)))
  }

  // ===== 召回运行时（mtime 缓存跨进程读取）=====
  let _recallParams = { enabled: false, ...RECALL_PRESETS[0], updated_at: null, _mtime: 0 }
  function loadRecallParams() {
    try {
      if (fs.existsSync(P.recallRuntime)) {
        const mt = fs.statSync(P.recallRuntime).mtimeMs
        if (mt !== _recallParams._mtime) {
          const data = JSON.parse(fs.readFileSync(P.recallRuntime, 'utf-8'))
          const effort = Math.max(0, Math.min(6, Number(data.effort) || 0))
          _recallParams = { enabled: data.enabled === true, ...RECALL_PRESETS[effort], updated_at: data.updated_at || null, _mtime: mt }
        }
      }
    } catch {}
    return _recallParams
  }
  function writeRecallRuntime(rec) {
    writeJsonAtomic(P.recallRuntime, { enabled: rec.enabled, effort: rec.effort, updated_at: rec.updated_at })
  }
  function setRecallLevel(effort) {
    const lv = Math.max(0, Math.min(6, Number(effort) || 0))
    const cur = loadRecallParams()
    const updated_at = new Date().toISOString()
    _recallParams = { enabled: cur.enabled, ...RECALL_PRESETS[lv], updated_at, _mtime: Date.now() }
    writeRecallRuntime({ enabled: cur.enabled, effort: lv, updated_at })
    return { ..._recallParams }
  }
  function setRecallEnabled(enabled) {
    const cur = loadRecallParams()
    const updated_at = new Date().toISOString()
    _recallParams = { enabled: !!enabled, ...RECALL_PRESETS[cur.effort], updated_at, _mtime: Date.now() }
    writeRecallRuntime({ enabled: !!enabled, effort: cur.effort, updated_at })
    return { ..._recallParams }
  }

  // ===== 碎片整理配置 =====
  function loadFragmentConfig() {
    return readJson(P.fragmentConfig, { ...FRAGMENT_CONFIG_DEFAULT })
  }
  function saveFragmentConfig(cfg) {
    writeJsonAtomic(P.fragmentConfig, cfg)
  }

  // 给工具用的绑定版文本函数
  function extractKeywordsBound(text) { return extractKeywords(text, synonymMap) }
  function expandQueryBound(query) { return expandQuery(query, synonymMap) }

  return {
    dataRoot, paths: P,
    loadMemory, saveMemory,
    loadFragments, saveFragments,
    getSynonymMap, saveSynonymMap, learnMappings,
    extractKeywordsBound, expandQueryBound,
    updateRecall,
    migrateCorroborated, migrateDecayParams,
    dreamerRun,
    loadRecallParams, setRecallLevel, setRecallEnabled,
    loadFragmentConfig, saveFragmentConfig,
    genId,
  }
}
