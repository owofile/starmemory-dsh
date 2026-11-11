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

if (errors.length) {
  console.error('[check-package]', errors.join('\n'))
  process.exit(1)
}
console.log('[check-package] OK package.json')
