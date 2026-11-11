// check-i18n.mjs —— 门禁：字典（DICTS）之外不允许硬编码中文文案字面量。
// 依据 08-i18n §4 门禁 2（官方 verify-client-ui-i18n 不跑第三方，纪律靠自觉）。
// 只扫描 client/index.js：注释不含引号包裹的中文（天然不匹配），
// DICTS 块是唯一允许中文的地方（剔除后检查剩余字符串字面量）。
// 诊断串/调试日志为英文，不在此列；CSS 字面量无 CJK。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const file = path.join(root, 'client', 'index.js')
const src = fs.readFileSync(file, 'utf8')

// 剔除 DICTS 块：从 'var DICTS = {' 到匹配闭合（数大括号深度）
function stripDict(text) {
  const marker = 'var DICTS = {'
  const start = text.indexOf(marker)
  if (start === -1) return text
  let i = text.indexOf('{', start)
  let depth = 0
  for (; i < text.length; i++) {
    const c = text[i]
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return text.slice(0, start) + text.slice(i + 1) }
  }
  return text
}

const body = stripDict(src)
const re = /(['"])((?:\\.|(?!\1).)*)\1/g
const bad = []
let m
while ((m = re.exec(body))) {
  const s = m[2]
  if (/[\u4e00-\u9fff]/.test(s)) bad.push(s)
}
if (bad.length) {
  console.error('[check-i18n] hardcoded CJK outside DICTS:', JSON.stringify(bad, null, 2))
  process.exit(1)
}
console.log('[check-i18n] OK client\\index.js')
