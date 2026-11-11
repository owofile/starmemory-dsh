// lib/log.js 单测（临时文件，真实 fs）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLogger } from '../lib/log.js'

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sm-log-')), 'plugin.log')
}

test('info 级写入 JSON Lines（ts/level/msg/meta）', () => {
  const file = tmpFile()
  const log = createLogger({ file, threshold: 'info' })
  log.info('apply start', { version: '1.2.0' })
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n')
  assert.equal(lines.length, 1)
  const rec = JSON.parse(lines[0])
  assert.equal(rec.level, 'info')
  assert.equal(rec.msg, 'apply start')
  assert.deepEqual(rec.meta, { version: '1.2.0' })
  assert.ok(rec.ts)
})

test('级别门限：默认不写 debug，threshold=debug 放开', () => {
  const file = tmpFile()
  createLogger({ file, threshold: 'info' }).debug('hidden')
  assert.equal(fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '', '')
  createLogger({ file, threshold: 'debug' }).debug('shown')
  assert.match(fs.readFileSync(file, 'utf-8'), /"msg":"shown"/)
})

test('超过 MAX_BYTES 轮转为 .old', () => {
  const file = tmpFile()
  const log = createLogger({ file, threshold: 'info' })
  log.info('x'.repeat(600 * 1024))
  log.info('after rotate')
  assert.ok(fs.existsSync(file + '.old'))
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n')
  assert.equal(lines.length, 1)
  assert.equal(JSON.parse(lines[0]).msg, 'after rotate')
})

test('日志失败静默（不可写目录不抛错）', () => {
  const log = createLogger({ file: process.platform === 'win32' ? 'Z:\\no\\such\\dir\\x.log' : '/proc/no/such/x.log' })
  assert.doesNotThrow(() => log.error('should not throw'))
})
