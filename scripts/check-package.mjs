// check-package.mjs —— 门禁：打包配置关键字段（防 v1.2.6 实测 bug 回归）。
// 1. dsh.bundle.patch 指向的文件必须在 files 白名单（否则 npm pack 缺 bundle patch，装不上）
// 2. dsh.client 必须用 inject 声明消费的 client 包（external DSH 不认，client half 不加载）
// 6. dsh.client.inject 必须含 @deepseek-ai/dsh-client-ui-settings（settings.section 槽声明者）
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

// 5. client inject 只声明 slots（bug #6：client 侧 DSH 对 inject 整批成功/整批失败，
//    多声明 locale/configForms 会把整批带崩，ctx 只挂 fiber，一个都不挂上）。
const clientSrc = fs.readFileSync(path.join(root, 'client', 'index.js'), 'utf8')
const cinjMatch = clientSrc.match(/module\.exports\.inject\s*=\s*\[([^\]]*)\]/)
if (!cinjMatch) {
  errors.push('client/index.js: module.exports.inject not found')
} else {
  const cinj = cinjMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)
  if (!cinj.includes('slots')) errors.push('client inject must include "slots" (slot service)')
  const bad = cinj.filter((n) => n !== 'slots')
  if (bad.length) errors.push(`client inject includes non-slots services [${bad.join(',')}]: client-side inject fails wholesale -> ctx only has fiber`)
}

// 6. dsh.client.inject 必须注入 settings.section 槽的声明者 @deepseek-ai/dsh-client-ui-settings
//    （v1.2.13：设置面板主槽；该包不在种子表，不注入则槽无消费者——注册成功但永不渲染；
//     对照 dsh-bili-scroll 实测能显示即因注入了它消费的槽声明者包）。
const dci = (client && client.inject) || []
if (!dci.includes('@deepseek-ai/dsh-client-ui-settings')) {
  errors.push('dsh.client.inject must include "@deepseek-ai/dsh-client-ui-settings" (declares settings.section; missing -> slot has no consumer -> panel never renders)')
}

// 7. dsh.client.inject 必须注入 @deepseek-ai/dsh-client-ui-renderer + @deepseek-ai/dsh-client-ui-layout
//    （UI 基础设施包：渲染器与布局所在；缺失则设置面板不渲染）。
if (!dci.includes('@deepseek-ai/dsh-client-ui-renderer')) {
  errors.push('dsh.client.inject must include "@deepseek-ai/dsh-client-ui-renderer" (settings UI renderer; missing -> card never renders)')
}
if (!dci.includes('@deepseek-ai/dsh-client-ui-layout')) {
  errors.push('dsh.client.inject must include "@deepseek-ai/dsh-client-ui-layout" (settings UI layout; missing -> card never renders)')
}

// 8. client 源码必须注册 settings.section（v1.2.13：主设置页独立分区，主人要的位置；注册 plugins.bundle.config
//    详情页卡片已移除——那是设计错位）。
if (!clientSrc.includes('settings.section')) {
  errors.push('client/index.js must register "settings.section" (main settings panel; plugins.bundle.config detail card removed)')
}

if (errors.length) {
  console.error('[check-package]', errors.join('\n'))
  process.exit(1)
}
console.log('[check-package] OK package.json')
