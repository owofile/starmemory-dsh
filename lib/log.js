// 轻量日志（维护/调试用）：JSON Lines 追加写，供维护时 grep 定位问题。
// - 纯 node:fs，无依赖；node --test 可直接测（传临时路径）
// - 级别门限：默认 info；STARMEMORY_LOG=debug 时放开 debug（阈值也可显式传入）
// - 大小上限：超过 MAX_BYTES 轮转为 <file>.old（单代），避免无限增长
// - 任何日志失败静默吞掉：日志绝不能影响业务

import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 512 * 1024
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

export function createLogger({ file, threshold } = {}) {
  const levelName = threshold || process.env.STARMEMORY_LOG || 'info'
  const min = LEVELS[levelName] ?? LEVELS.info

  function write(level, msg, meta) {
    if (LEVELS[level] < min) return
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      try {
        if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
          fs.renameSync(file, file + '.old')
        }
      } catch {}
      const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(meta !== undefined ? { meta } : {}) }) + '\n'
      fs.appendFileSync(file, line)
    } catch {}
  }

  return {
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
  }
}
