// check-package.mjs —— 门禁：打包配置关键字段（防 v1.2.6 实测 bug 回归）。
// 1. dsh.bundle.patch 指向的文件必须在 files 白名单（否则 npm pack 缺 bundle patch，装不上）
// 2. dsh.client 必须用 inject 声明消费的 client 包（external DSH 不认，client half 不加载）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const errors = []

const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch
if (patch) {
  const rel = patch.replace(/^\.\//, '')
  if (!(pkg.files || []).includes(rel)) {
    errors.push(`dsh.bundle.patch "${patch}" not in files (bundle missing from npm pack)`)
  }
  if (!fs.existsSync(path.join(root, rel))) {
    errors.push(`dsh.bundle.patch "${patch}" file missing`)
  }
} else {
  errors.push('dsh.bundle.patch missing (bundle install would have no patch)')
}

const client = pkg.dsh && pkg.dsh.client
if (client) {
  if (client.external) errors.push('dsh.client.external is not recognized by DSH; use dsh.client.inject')
  if (!client.inject || client.inject.length === 0) {
    errors.push('dsh.client.inject must list consumed client packages (e.g. @deepseek-ai/dsh-client-ui-primitives)')
  }
} else {
  errors.push('dsh.client missing (no client half declared)')
}

// 3. schemastery 依赖必须声明且可达 >=3.19.0（.volatile() 只在 3.19.0+；3.18.1 无该方法）。
// 未声明 → pnpm hoisted 到旧版 → Config 模块求值抛 "volatile is not a function" → 激活失败（测试机确诊 bug #4）。
const smSpec = (pkg.dependencies && pkg.dependencies['@deepseek-ai/schemastery']) || ''
if (!smSpec) {
  errors.push('dependencies["@deepseek-ai/schemastery"] missing: 3.18.1 lacks .volatile(), version drift kills activation (use ^3.19.0)')
} else {
  const compact = smSpec.replace(/\s+/g, '')
  const m = smSpec.match(/(?:>=|>|\^|~)?\s*(\d+)\.(\d+)(?:\.(\d+))?/)
  const major = m ? Number(m[1]) : 3
  const minor = m ? Number(m[2]) : 19
  const patch = m && m[3] ? Number(m[3]) : 0
  let canReach
  if (compact.startsWith('<=')) {
    canReach = major > 3 || (major === 3 && (minor > 19 || (minor === 19 && patch >= 0)))
  } else if (compact.startsWith('<')) {
    canReach = major > 3 || (major === 3 && (minor > 19 || (minor === 19 && patch > 0)))
  } else {
    canReach = major > 3 || (major === 3 && minor >= 19) || /^[\^>=\*]/.test(compact)
  }
  if (!canReach) {
    errors.push(`dependencies["@deepseek-ai/schemastery"] "${smSpec}" cannot reach >=3.19.0 (needs .volatile())`)
  }
}

// 4. inject 只列真正的 ctx 服务。effect 是 ctx 自带方法，不是可注入服务——
//    写进 inject 会让 DSH 等一个叫 'effect' 的服务，永远 pending 不激活（测试机 bug #5 铁证）。
const indexSrc = fs.readFileSync(path.join(root, 'index.mjs'), 'utf8')
const injMatch = indexSrc.match(/export\s+const\s+inject\s*=\s*\[([^\]]*)\]/)
if (!injMatch) {
  errors.push('index.mjs: export const inject not found')
} else {
  const inj = injMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)
  if (inj.includes('effect')) errors.push('index.mjs inject includes "effect": effect is a ctx method, not a service -> host pending forever')
  if (!inj.includes('tools')) errors.push('index.mjs inject must include "tools" (tools service)')
}

if (errors.length) {
  console.error('[check-package]', errors.join('\n'))
  process.exit(1)
}
console.log('[check-package] OK package.json')
