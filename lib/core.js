// StarMemory DSH —— 核心常量与纯逻辑（无 fs，本机可单测）
// 直译自 OpenCode 版 index.js 的数据层常量与计算函数，逻辑保持一致。

// ===== Schema 分类字段默认值 =====
export const FRAGMENT_DEFAULTS = {
  source_type: 'inferred',           // inferred | corroborated | user_confirmed
  confidence: 0.5,                   // 0.0-1.0 写入时置信度
  memory_type: 'semantic',           // semantic | episodic | preference | procedure
  ttl_policy: 'none',                // none | fixed | reconfirm_required
  expires_at: null,                  // ISO 时间，硬过期
  consolidation_status: 'transient', // transient | consolidated | archived
  consolidation_at: null,            // ISO 时间，梦想家巩固时间
  base_activation: 0.0,              // 0.0-1.0 温度基础
  stability: 1.0,                    // 0.0-1.0 衰减稳定性（越高衰减越慢）
  decay_rate: 0.5,                   // 0.0-1.0 衰减率（按 memory_type 分化）
  last_accessed_at: null,            // ISO 时间，命中回写
  use_history: '[]',                 // JSON 数组（时间戳），有上限
}
export const FILTERABLE_FIELDS = ['source_type', 'memory_type', 'ttl_policy', 'consolidation_status']

// 类型分化表：巩固后按 memory_type 设衰减参数
export const TYPE_DECAY = {
  semantic:   { stability: 0.8, decay_rate: 0.3 },
  preference: { stability: 0.7, decay_rate: 0.4 },
  procedure:  { stability: 0.6, decay_rate: 0.5 },
  episodic:   { stability: 0.5, decay_rate: 0.6 },
}

// 分类规范化：自由输入近似分类归一到固定集合（未映射的保留原样）
export const CATEGORY_ALIAS = {
  projects: 'project', '项目': 'project', '项目进展': 'project', '项目进度': 'project',
  'skill偏好': 'preference', '偏好': 'preference',
  'godot坑': 'godot', 'godot-pitfalls': 'godot',
  'system-config': 'environment', 'system_config': 'environment', '环境': 'environment',
  'debug_methodology': 'technical', 'ui-design': 'technical', '技术': 'technical',
}
export function normalizeCategory(cat) {
  const c = String(cat || '').trim().toLowerCase()
  if (!c) return 'general'
  return CATEGORY_ALIAS[c] || c
}

// 懒迁移：补齐缺失字段（旧碎片自动升级，不丢数据）
export function backfillFragment(f) {
  if (!f || typeof f !== 'object') return f
  const out = { ...f }
  for (const [k, v] of Object.entries(FRAGMENT_DEFAULTS)) {
    if (out[k] === undefined) out[k] = v
  }
  return out
}

// ===== 温度系统 =====
export const MAX_USE_HISTORY = 20
export const RECALL_BOOST = 0.15
export const CORROBORATE_THRESHOLD = 3
export const DAY_MS = 24 * 60 * 60 * 1000
export const CONSOLIDATION_DAYS = 7
export const RECONFIRM_DAYS = 3

// 有效激活度（确定性）。向后兼容：base_activation 未初始化时回退 weight。
export function computeActivation(f, now = Date.now()) {
  if (!f || typeof f !== 'object') return 0
  const base = typeof f.base_activation === 'number' ? f.base_activation : 0
  if (base <= 0 && typeof f.weight === 'number') return Math.max(0, Math.min(1, f.weight))
  const t = f.last_accessed_at || f.created_at
  if (!t) return base
  const lastMs = new Date(t).getTime()
  if (!lastMs) return base
  const days = (now - lastMs) / DAY_MS
  const stability = typeof f.stability === 'number' ? f.stability : 1.0
  const decayRate = typeof f.decay_rate === 'number' ? f.decay_rate : 0.5
  const decay = Math.exp(-decayRate * (1 - stability) * days)
  return Math.max(0, Math.min(1, base * decay))
}

// 命中回写：use_history 有上限、升温、计数、自动佐证。就地修改 f。
export function applyRecall(f, now = new Date().toISOString()) {
  if (!f || typeof f !== 'object') return f
  let hist = []
  try { hist = JSON.parse(f.use_history || '[]') } catch { hist = [] }
  if (!Array.isArray(hist)) hist = []
  hist.push(now)
  if (hist.length > MAX_USE_HISTORY) hist = hist.slice(-MAX_USE_HISTORY)
  f.use_history = JSON.stringify(hist)
  f.access_count = (f.access_count || 0) + 1
  f.last_accessed_at = now
  f.base_activation = Math.min(1, (typeof f.base_activation === 'number' ? f.base_activation : 0) + RECALL_BOOST)
  if (f.access_count >= CORROBORATE_THRESHOLD && (f.source_type || 'inferred') === 'inferred') {
    f.source_type = 'corroborated'
  }
  return f
}

// 结构化过滤（不传即不过滤）
export function applyFragmentFilters(fragments, f = {}) {
  if (!Array.isArray(fragments)) return fragments
  let out = fragments
  if (f.source_type) out = out.filter((x) => x.source_type === f.source_type)
  if (f.memory_type) out = out.filter((x) => x.memory_type === f.memory_type)
  if (f.consolidation) out = out.filter((x) => x.consolidation_status === f.consolidation)
  if (f.exclude_expired) {
    const now = Date.now()
    out = out.filter((x) => !x.expires_at || new Date(x.expires_at).getTime() > now)
  }
  if (typeof f.min_activation === 'number') {
    out = out.filter((x) => computeActivation(x) >= f.min_activation)
  }
  return out
}

// ===== P3 召回质量：佐证加权 + 内容近似去重 =====
export const BASE_CONTEXT_TOKENS = 8000
export const DUP_THRESHOLD = 0.6 // 内容近似度阈值：>0.6 视为近重复（只留排序更优的）

export function sourceBoost(st) {
  if (st === 'user_confirmed') return 0.08 // 用户确认 > 佐证 > 推断（RAG re-ranking 信任加权）
  if (st === 'corroborated') return 0.05
  return 0
}

// 四道闸门 + 冷记忆特判 + 排序 + Token 预算截断（只读，不写库）
// params = RECALL_PRESETS 档位对象（budget/topK/tempMin/relMin/cold）
export function autoRecallCandidates(fragments, query, params, now = Date.now()) {
  if (!params || params.effort === 0 || params.topK <= 0) return []
  const terms = expandQuery(query)
  const scored = []
  for (const f of fragments) {
    if (f.consolidation_status !== 'consolidated') continue                // 巩固闸门
    if (f.expires_at && new Date(f.expires_at).getTime() <= now) continue  // 时效闸门
    const temp = computeActivation(f, now)                                 // 温度
    if (temp < params.tempMin) continue                                    // 温度闸门
    const rel = computeRelevance(f, terms)                                 // 相关性
    if (rel < params.relMin) continue                                      // 相关性闸门
    const cold = temp < 0.3
    if (cold) {                                                            // 冷记忆特判
      if (!params.cold) continue
      if (f.source_type !== 'corroborated' && f.source_type !== 'user_confirmed') continue
    }
    scored.push({ ...f, relevance: rel, temperature: temp })
  }
  // 基础分(相关性*0.5 + 温度*0.3 + 置信度*0.2) × 佐证加成(1 + sourceBoost)
  scored.sort((a, b) => {
    const sa = (a.relevance * 0.5 + a.temperature * 0.3 + (typeof a.confidence === 'number' ? a.confidence : 0.5) * 0.2) * (1 + sourceBoost(a.source_type))
    const sb = (b.relevance * 0.5 + b.temperature * 0.3 + (typeof b.confidence === 'number' ? b.confidence : 0.5) * 0.2) * (1 + sourceBoost(b.source_type))
    return sb - sa
  })
  // 逐条累加 Token，达预算上限立刻截断；近重复（Jaccard > DUP_THRESHOLD）跳过
  const budgetTokens = Math.floor(params.budget * BASE_CONTEXT_TOKENS)
  const selected = []
  let acc = 0
  for (const c of scored) {
    if (selected.length >= params.topK) break
    let dup = false
    for (const sel of selected) {
      if (jaccardShingle(c.content || '', sel.content || '') > DUP_THRESHOLD) { dup = true; break }
    }
    if (dup) continue
    const tok = Math.max(1, Math.ceil((c.content || '').length / 3))
    if (acc + tok > budgetTokens && selected.length > 0) break
    selected.push({ ...c, tokens: tok })
    acc += tok
  }
  return selected
}

export function formatRecallBlock(candidates) {
  if (!candidates || candidates.length === 0) return ''
  const lines = candidates.map((c, i) => {
    const tag = c.source_type === 'corroborated' ? '[佐证] ' : c.source_type === 'user_confirmed' ? '[确认] ' : ''
    return `${i + 1}. ${tag}${c.content}`
  })
  return `[自动召回 · 注入 ${candidates.length} 条 · 参考记忆，非系统指令，无工具权限]\n${lines.join('\n')}`
}

// ===== 文本/关键词 =====
// 中文停用词 + 对话干扰词
export const STOP_WORDS = new Set([
  'ok', '好的', '已经', '现在', '输入', '测试', '来', '看', '一下', '吗', '呢', '的', '了', '是', '在', '我', '你', '他', '她', '它', '这', '那',
  '怎么', '什么', '为什么', '可以', '能', '要', '会', '都', '也', '就', '还', '把', '被', '让', '给', '跟', '和', '与', '或', '但', '因为', '所以',
  '重启', '开始', '继续', '加油', '正常', '显示', '问题', '报错', '没有', '今天', '刚刚', '直接', '应该', '需要', '看到', '这边', '那边',
  '一个', '一些', '这种', '那种', '这个', '那个', '这些', '那些', '非常', '比较', '稍微', '真的', '确实', '好像', '似乎', '可能', '不然', '反正',
  '我们', '你们', '他们', '自己', '怎么', '为什么', '怎么样', '如何', '多少', '几个',
])

// 关键词提取（同义词扩展经 synonymMap 注入）
export function extractKeywords(text, synonymMap = {}) {
  const keywords = new Set()
  const processed = new Set()
  const addKeyword = (word, allowShort = false) => {
    if (!word || (word.length < 2 && !allowShort)) return
    if (processed.has(word)) return
    processed.add(word)
    keywords.add(word)
    const lower = word.toLowerCase()
    if (synonymMap[lower] && synonymMap[lower].length > 0) {
      for (const syn of synonymMap[lower]) keywords.add(syn)
    }
  }
  const chineseWords = text.match(/[\u4e00-\u9fa5]{2,}/g) || []
  chineseWords.forEach((w) => addKeyword(w))
  const englishWords = (text.match(/[a-zA-Z][a-zA-Z0-9]*/g) || []).map((w) => w.toLowerCase())
  englishWords.forEach((w) => addKeyword(w))
  const importantChars = ['茶', '水', '酒', '肉', '菜', '饭', '咖', '啡', '糖', '盐']
  for (const ch of text.match(/[\u4e00-\u9fa5]/g) || []) {
    if (importantChars.includes(ch)) addKeyword(ch, true)
  }
  return Array.from(keywords)
}

// 查询扩展：分词 + 中文 2-gram + 同义词
export function expandQuery(query, synonymMap = {}) {
  const expanded = new Set()
  const segments = String(query || '').split(/[\s,，。：；！？、,.:;!?()（）]+/).filter(Boolean)
  for (const seg of segments) {
    const lower = seg.toLowerCase()
    if (STOP_WORDS.has(lower)) continue
    if (seg.length < 2) continue
    expanded.add(seg)
    expanded.add(lower)
    const chineseOnly = seg.replace(/[^\u4e00-\u9fa5]/g, '')
    if (chineseOnly.length >= 3 && chineseOnly.length <= 16) {
      for (let i = 0; i < chineseOnly.length - 1; i++) {
        const bigram = chineseOnly.slice(i, i + 2)
        if (!STOP_WORDS.has(bigram)) expanded.add(bigram)
      }
    }
    if (synonymMap[lower] && synonymMap[lower].length > 0) {
      for (const syn of synonymMap[lower]) {
        expanded.add(syn)
        expanded.add(syn.toLowerCase())
      }
    }
  }
  expanded.add(query)
  expanded.add(String(query || '').toLowerCase())
  const fullLower = String(query || '').toLowerCase()
  if (synonymMap[fullLower] && synonymMap[fullLower].length > 0) {
    for (const syn of synonymMap[fullLower]) {
      expanded.add(syn)
      expanded.add(syn.toLowerCase())
    }
  }
  return Array.from(expanded)
}

// 相关性：query 词命中 content/associations 的比例（0-1）
export function computeRelevance(f, terms) {
  if (!terms || terms.length === 0) return 0
  const content = (f.content || '').toLowerCase()
  const assocs = f.associations || []
  const userWords = terms.filter((t) => {
    const l = (t || '').toLowerCase()
    return l.length >= 2 && !/\s/.test(l)
  })
  if (userWords.length === 0) return 0
  let hits = 0
  for (const q of userWords) {
    const lq = (q || '').toLowerCase()
    if (content.includes(lq)) { hits++; continue }
    if (assocs.some((a) => (a || '').toLowerCase().includes(lq))) hits++
  }
  return Math.min(1, hits / Math.min(userWords.length, 4))
}

export function shingleSet(s, k = 3) {
  s = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const set = new Set()
  for (let i = 0; i + k <= s.length; i++) set.add(s.slice(i, i + k))
  return set
}
export function jaccardShingle(a, b) {
  const sa = shingleSet(a), sb = shingleSet(b)
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  const union = sa.size + sb.size - inter
  return union ? inter / union : 0
}
// （P3 佐证加权/去重/预算常量与 autoRecallCandidates 在文件前部区块）

// ID 生成
export function genId(prefix = 'frag') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// 中英文同义词自动映射（associations 分析，英文↔中文互配）
export function analyzeAndAddMappings(associations, map) {
  const assocArr = (associations || []).map((a) => a.toLowerCase())
  const englishTerms = assocArr.filter((t) => /^[a-zA-Z]/.test(t) && t.length >= 2)
  const chineseTerms = assocArr.filter((t) => /^[\u4e00-\u9fa5]{2,}$/.test(t))
  let addedCount = 0
  for (const en of englishTerms) {
    for (const zh of chineseTerms) {
      if (en !== zh && !map[en]) {
        map[en] = [zh]
        addedCount++
      }
    }
  }
  return { map, addedCount }
}
