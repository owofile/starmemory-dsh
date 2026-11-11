// 设置面（Config schema）↔ 召回运行时 的同步逻辑（纯逻辑，本机 node --test 可测）
//
// 权威规则（经测试机验收讨论确定）：
// - 用户在设置面板配置过（recallPanelConfigured=true）→ 面板配置为持久权威，
//   apply 启动时与 loader/volatile-update 时都同步进 recall-runtime.json
// - 面板从未配置过 → recall-runtime.json 为准（迁移脚本与 memory_recall_* 工具的改动跨重启保留）
//
// 契约依据：references/07-settings-panel.md（基线 0.2.0-rc.2 / 0.2.1-rc.1 复核）

export const RECALL_CONFIG_DEFAULTS = Object.freeze({
  recallEnabled: false,
  recallEffort: 0,
  recallPanelConfigured: false,
})

/** volatile 叶引用（冻结对象 { get }）→ 普通值；递归解包（references/07 §2 readConfig 模式） */
export function unwrapConfigValue(v) {
  if (v !== null && typeof v === 'object' && typeof v.get === 'function' && Object.keys(v).length === 1) {
    return unwrapConfigValue(v.get())
  }
  if (Array.isArray(v)) return v.map(unwrapConfigValue)
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrapConfigValue(x)]))
  }
  return v
}

/** 读条目配置：解引用 + DEFAULTS 补缺 */
export function readRecallConfig(config) {
  return { ...RECALL_CONFIG_DEFAULTS, ...unwrapConfigValue(config ?? {}) }
}

/**
 * 创建召回配置同步器。
 * @param {{ setRecallEnabled: Function, setRecallLevel: Function }} store 最小接口（真实 store 或测试桩）
 */
export function createRecallConfigSync({ setRecallEnabled, setRecallLevel }) {
  return {
    /** 同步一次条目配置到召回运行时。返回 { synced, cfg? } */
    applyConfig(rawConfig) {
      const cfg = readRecallConfig(rawConfig)
      if (!cfg.recallPanelConfigured) return { synced: false, cfg }
      setRecallEnabled(cfg.recallEnabled)
      setRecallLevel(cfg.recallEffort)
      return { synced: true, cfg }
    },
  }
}
