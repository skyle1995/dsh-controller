// 极简终端 UI:颜色 + 菜单 + 输入
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

export const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
}
export const c = (color, s) => C[color] ? C[color] + s + C.reset : s
export const ok = (s) => c('green', '✓ ' + s)
export const bad = (s) => c('red', '✗ ' + s)
export const warn = (s) => c('yellow', '! ' + s)
export const dim = (s) => c('gray', s)
export const head = (s) => c('bold', s)

let rl = null
let stdinEnded = false
export function stdinEndedQ() { return stdinEnded }
export async function ask(q) {
  if (!rl) rl = readline.createInterface({ input: stdin, output: stdout })
  try { rl.resume() } catch {}
  try { return await rl.question(q) }
  catch (e) {
    if (/closed|EOF/i.test(String(e?.code || '') + String(e?.message || ''))) {
      stdinEnded = true
      return ''
    }
    throw e
  }
}
// 长操作期间暂停读取(不关闭,否则 readline 永久失效)
export function pauseAsk() { try { rl?.pause() } catch {} }
export function resumeAsk() { try { rl?.resume() } catch {} }
export function closeAsk() { try { rl?.close() } catch {} ; rl = null }

export function banner(title) {
  const line = '─'.repeat(Math.max(10, title.length + 2))
  console.log('\n' + c('cyan', '╭' + line + '╮'))
  console.log(c('cyan', '│ ') + head(title) + c('cyan', ' │'))
  console.log(c('cyan', '╰' + line + '╯'))
}
export function section(t) { console.log('\n' + c('magenta', '▌') + ' ' + head(t)) }
export function kv(k, v) { console.log('  ' + dim(k.padEnd(14)) + v) }
export function step(name, result) {
  const okv = result?.ok !== false && !result?.error
  console.log('  ' + (okv ? c('green', '✓') : c('red', '✗')) + ' ' + name + (result?.note ? dim(' — ' + result.note) : ''))
  if (!okv && (result?.error || result?.reason)) console.log('    ' + c('red', String(result.error || result.reason).slice(0, 300)))
}
export function logLine(s) { process.stdout.write(c('gray', s) + '\n') }
export function out(s) { console.log(s) }
