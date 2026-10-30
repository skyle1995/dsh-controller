// 极简终端 UI:颜色 + 菜单 + 输入
import readline from 'node:readline/promises'
import * as rlCore from 'node:readline'
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

export function clear() { try { process.stdout.write('\x1b[2J\x1b[3J\x1b[H') } catch {} }

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

// ── 对话式交互 ─────────────────────────────────────────────
// 是/否,回车取默认
export async function cq(question, def = 'N') {
  const hint = def === 'Y' ? '(Y/n)' : '(y/N)'
  const a = (await ask('  ' + c('cyan', '?') + ' ' + question + ' ' + dim(hint) + ' > ')).trim().toLowerCase()
  if (!a) return def === 'Y'
  return a === 'y' || a === 'yes' || a === '是' || a === '1'
}
// 文本输入,回车取默认
export async function input(question, def = '') {
  const hint = def ? dim('[' + def + ']') : ''
  const a = (await ask('  ' + c('cyan', '?') + ' ' + question + ' ' + hint + ' > ')).trim()
  return a || def
}
// 选项选择(输入编号或值关键字,回车取默认)
export async function pick(question, choices, def) {
  console.log('  ' + c('cyan', '?') + ' ' + question)
  choices.forEach((ch, i) => console.log('      ' + (i + 1) + ') ' + ch))
  const a = (await ask('  ' + dim('编号(回车=' + (def || choices[0]) + ')') + ' > ')).trim()
  if (!a) return def || choices[0]
  const n = parseInt(a, 10)
  if (!Number.isNaN(n) && choices[n - 1]) return choices[n - 1]
  if (choices.includes(a)) return a
  return def || choices[0]
}

// ── 交互式选择菜单(方向键 / 空格 / 回车)——分组 + 图标 + 局部重绘 ──
const LABEL_W = 24
const padEnd = (s, w) => {
  const width = [...String(s)].reduce((n, ch) => n + (/[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1), 0)
  return String(s) + ' '.repeat(Math.max(0, w - width))
}
export function menuSelect({ title, subtitle = '', items, multi = false, checked: initial = [], footerTip = '' }) {
  return new Promise((resolve) => {
    closeAsk()
    const stdin = process.stdin
    const wasRaw = !!stdin.isRaw
    rlCore.emitKeypressEvents(stdin)
    const selectable = items.map((it, i) => (it && it.type === 'group' ? -1 : i)).filter(i => i >= 0)
    let cursor = 0 // 在 selectable 中的位置
    const sel = new Set(initial)
    const n = selectable.length

    const lines = () => {
      const out = []
      const bar = '─'.repeat(Math.max(8, subtitle.length + 2))
      if (subtitle) out.push(c('cyan', '  ' + bar))
      out.push('  ' + c('cyan', '│ ') + ' ' + head(title) + (subtitle ? c('cyan', ' │') : ''))
      if (subtitle) out.push('  ' + c('cyan', '  ' + bar))
      out.push('')
      items.forEach((it, i) => {
        if (it && it.type === 'group') {
          out.push('  ' + c('gray', '  ' + it.label))
          out.push('')
          return
        }
        const isCur = selectable[cursor] === i
        const mark = isCur ? c('cyan', '❯') : ' '
        const icon = it.icon ? it.icon + ' ' : ''
        const label = typeof (it.label) === 'function' ? it.label() : String(it.label)
        const hint = it.hint ? dim(it.hint) : ''
        if (multi) {
          const box = sel.has(i) ? c('green', '◼') : c('gray', '◻')
          out.push('  ' + mark + ' ' + box + ' ' + icon + (isCur ? head(padEnd(label, LABEL_W)) : padEnd(label, LABEL_W)) + hint)
        } else {
          out.push('  ' + mark + ' ' + icon + (isCur ? head(padEnd(label, LABEL_W)) : padEnd(label, LABEL_W)) + hint)
        }
      })
      out.push('')
      out.push('  ' + dim('↑↓ 移动' + (multi ? ' · 空格 勾选' : '') + ' · 回车 确认 · q 返回' + (footerTip ? ' · ' + footerTip : '')))
      return out
    }

    let printed = 0
    const render = (first = false) => {
      const L = lines()
      if (!first && printed > 0) process.stdout.write('\x1b[' + printed + 'A')
      for (let i = 0; i < L.length; i++) process.stdout.write('\r\x1b[2K' + L[i] + '\n')
      for (let i = L.length; i < printed; i++) process.stdout.write('\r\x1b[2K\n')
      printed = L.length
    }
    const finish = (v) => {
      stdin.removeListener('keypress', onKey)
      try { stdin.setRawMode(wasRaw) } catch {}
      try { stdin.pause() } catch {}
      process.stdout.write('\x1b[?25h')
      resolve(v)
    }
    function onKey(str, key) {
      const name = key?.name
      if (name === 'up') cursor = (cursor - 1 + n) % n
      else if (name === 'down') cursor = (cursor + 1) % n
      else if (name === 'space') {
        const i = selectable[cursor]
        const it = items[i]
        if (it && typeof it === 'object' && typeof it.onSpace === 'function') it.onSpace()
        else if (multi) { sel.has(i) ? sel.delete(i) : sel.add(i) }
      }
      else if (name === 'return' || name === 'enter') return finish(multi ? [...sel].sort((a, b) => a - b) : selectable[cursor])
      else if (name === 'q' || name === 'escape') return finish(multi ? null : -1)
      else if (name === 'c' && key?.ctrl) { finish(null); process.exit(0) }
      render()
    }
    try { stdin.setRawMode(true) } catch {}
    process.stdout.write('\x1b[?25l')
    stdin.resume()
    stdin.on('keypress', onKey)
    render(true)
  })
}

// 等待任意按键(操作完成后的"回车继续")
export function waitKey(msg = '回车继续') {
  return new Promise((resolve) => {
    closeAsk()
    const stdin = process.stdin
    rlCore.emitKeypressEvents(stdin)
    const wasRaw = !!stdin.isRaw
    const done = () => { stdin.removeListener('keypress', onKey); try { stdin.setRawMode(wasRaw) } catch {}; try { stdin.pause() } catch {}; resolve() }
    function onKey() { done() }
    try { stdin.setRawMode(true) } catch {}
    stdin.resume()
    stdin.on('keypress', onKey)
    process.stdout.write('\n  ' + dim(msg + ' …'))
  })
}
// 文本输入(raw 模式结束后用普通 readline)
export async function promptText(q) {
  return (await ask('  ' + c('cyan', '?') + ' ' + q + ' > ')).trim()
}
