// StarMemory DSH 迁移演练：OpenCode 版数据 → DSH 数据根
//
// 用法：
//   node scripts/migrate.mjs                 # dry-run：只校验 + 出报告，不写任何文件
//   node scripts/migrate.mjs --apply         # 真正复制（目标已存在的文件会跳过，绝不覆盖）
//   node scripts/migrate.mjs --apply --force # 目标已存在时也覆盖
//   node scripts/migrate.mjs --source <dir> --target <dir>
//
// 输入（默认 ~/.config/opencode）：
//   memory.json / fragments.json / associations_map.json / recall-runtime.json / fragment_archive.db
// 输出（默认 ~/.starmemory，可用 STARMEMORY_DATA_DIR 或 --target 覆盖）：
//   memory.json / fragments.json / associations_map.json / recall-runtime.json / archive.db
//
// 安全：只读源 + 只复制（copy 不 move），任何情况下不删除源数据。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// ---- CLI ----
const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const force = argv.includes('--force')
function argValue(flag) {
  const i = argv.indexOf(flag)
  return i !== -1 ? argv[i + 1] : null
}
const sourceDir = argValue('--source') || path.join(os.homedir(), '.config', 'opencode')
const targetDir = argValue('--target') || process.env.STARMEMORY_DATA_DIR || path.join(os.homedir(), '.starmemory')

const FILES = [
  { src: 'memory.json', dst: 'memory.json', kind: 'json' },
  { src: 'fragments.json', dst: 'fragments.json', kind: 'json' },
  { src: 'associations_map.json', dst: 'associations_map.json', kind: 'json' },
  { src: 'recall-runtime.json', dst: 'recall-runtime.json', kind: 'json' },
  { src: 'fragment_archive.db', dst: 'archive.db', kind: 'sqlite' },
]

const report = { sourceDir, targetDir, mode: apply ? (force ? 'apply-force' : 'apply') : 'dry-run', items: [], warnings: [], errors: [] }

for (const f of FILES) {
  const srcPath = path.join(sourceDir, f.src)
  const dstPath = path.join(targetDir, f.dst)
  const item = { file: f.src, target: f.dst, exists: fs.existsSync(srcPath), valid: null, stat: null, action: 'skip-missing' }

  if (!item.exists) {
    report.warnings.push(`${f.src}: 源文件不存在，跳过`)
    report.items.push(item)
    continue
  }

  item.stat = fs.statSync(srcPath).size

  // JSON 校验 + 统计
  if (f.kind === 'json') {
    try {
      const data = JSON.parse(fs.readFileSync(srcPath, 'utf-8'))
      item.valid = true
      if (f.src === 'fragments.json') item.count = (data.fragments || []).length
      if (f.src === 'memory.json') {
        item.count = {
          preferences: Object.keys(data.user?.preferences || {}).length,
          rules: (data.strict?.rules || []).length,
          forbidden: (data.strict?.forbiddenCommands || []).length,
          projects: Object.keys(data.projects || {}).length,
        }
      }
      if (f.src === 'associations_map.json') item.count = Object.keys(data).length
      if (f.src === 'recall-runtime.json') item.count = { enabled: data.enabled === true, effort: Number(data.effort) || 0 }
    } catch (e) {
      item.valid = false
      report.errors.push(`${f.src}: JSON 解析失败 - ${e.message}`)
      report.items.push(item)
      continue
    }
  }

  // SQLite 校验 + 统计
  if (f.kind === 'sqlite') {
    try {
      const db = new DatabaseSync(srcPath, { readOnly: true })
      const n = db.prepare('SELECT COUNT(*) AS n FROM fragment_archive').get()
      item.valid = true
      item.count = Number(n.n)
      db.close()
    } catch (e) {
      item.valid = false
      report.errors.push(`${f.src}: SQLite 打开失败 - ${e.message}`)
      report.items.push(item)
      continue
    }
  }

  // 目标冲突检查
  if (fs.existsSync(dstPath) && !force) {
    item.action = 'skip-exists'
    report.warnings.push(`${f.dst}: 目标已存在，跳过（--force 覆盖）`)
    report.items.push(item)
    continue
  }

  item.action = apply ? 'copy' : 'would-copy'
  report.items.push(item)

  if (apply) {
    fs.mkdirSync(targetDir, { recursive: true })
    fs.copyFileSync(srcPath, dstPath)
  }
}

const copied = report.items.filter((i) => i.action === 'copy').length
const wouldCopy = report.items.filter((i) => i.action === 'would-copy').length
const skipped = report.items.filter((i) => i.action.startsWith('skip')).length

console.log('=== StarMemory DSH 迁移演练报告 ===')
console.log(`模式: ${report.mode}`)
console.log(`源:   ${report.sourceDir}`)
console.log(`目标: ${report.targetDir}`)
console.log(`文件: ${apply ? `已复制 ${copied} / 跳过 ${skipped}` : `待复制 ${wouldCopy} / 跳过 ${skipped}（dry-run，未写盘）`}`)
console.log('')
for (const item of report.items) {
  console.log(`- ${item.file} -> ${item.target}: ${item.action}, ${item.stat ?? 0} bytes, valid=${item.valid}, count=${JSON.stringify(item.count ?? null)}`)
}
if (report.warnings.length) {
  console.log('')
  console.log('警告:')
  for (const w of report.warnings) console.log(`  ! ${w}`)
}
if (report.errors.length) {
  console.log('')
  console.log('错误:')
  for (const e of report.errors) console.log(`  x ${e}`)
}
console.log('')
console.log(apply ? '迁移已执行（源数据未删除）。' : 'dry-run 结束，未写任何文件。确认报告后加 --apply 执行。')

process.exit(report.errors.length ? 1 : 0)
