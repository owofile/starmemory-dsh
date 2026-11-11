// client half 语法校验门禁：本机无法跑浏览器 client，但至少要保证语法合法（防白屏低级错误）。
// 单文件手写 CJS 无需 esbuild 打包（落地偏差：见 client/index.js 头注）。
// 用法：node scripts/check-client.mjs；失败退出码非 0。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const client = path.join(root, 'client', 'index.js')

const r = spawnSync(process.execPath, ['--check', client], { encoding: 'utf-8' })
if (r.status !== 0) {
  console.error('[check-client] FAIL\n' + (r.stderr || ''))
  process.exit(1)
}
console.log('[check-client] OK', path.relative(root, client))
