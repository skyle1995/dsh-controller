// 核心:环境探测 / 执行 / 自建源认证 / 宿主解包 / 换包改名
import { spawn, execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const HOME = os.homedir()
export const DSH_HOME = path.join(HOME, '.dsh')
export const APP_NAME = 'DeepSeek Harness'
export const APP = '/Applications/' + APP_NAME + '.app'
export const DSHEXE = APP + '/Contents/MacOS/' + APP_NAME
export const RES = APP + '/Contents/Resources'
export const PLUGIN_DIR = path.join(DSH_HOME, 'profiles', 'desktop', 'node_modules', 'dsh-purge-self')
export const SKILLS_DIR = path.join(DSH_HOME, 'skills')
export const HUB = { git: 'https://hub.ifunx.com/skyle1995/dsh-controller.git', api: 'https://hub.ifunx.com/api/v1/repos/skyle1995/dsh-controller' }
export const HUB_AUTH_FILE = path.join(DSH_HOME, 'dsh-controller', 'hub.json')

export function readToken() { try { return JSON.parse(readFileSync(HUB_AUTH_FILE, 'utf8')).token || '' } catch { return '' } }
export function saveToken(token) {
  mkdirSync(path.dirname(HUB_AUTH_FILE), { recursive: true })
  writeFileSync(HUB_AUTH_FILE, JSON.stringify({ token: String(token || '').trim(), updatedAt: Date.now() }, null, 2), { mode: 0o600 })
}
export function gitCred() {
  try {
    const out = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=hub.ifunx.com\n\n', encoding: 'utf8', timeout: 3000 })
    const u = /username=(.+)/.exec(out), p = /password=(.+)/.exec(out)
    return u && p ? { user: u[1].trim(), pass: p[1].trim() } : null
  } catch { return null }
}
export async function hubFetch(url) {
  const t = readToken()
  if (t) { try { const r = await fetch(url, { headers: { Authorization: 'token ' + t } }); if (r.ok) return r } catch {} }
  const anon = await fetch(url)
  if (anon.status !== 401 && anon.status !== 404) return anon
  const c = gitCred()
  if (!c) return anon
  try {
    const r = await fetch(url, { headers: { Authorization: 'Basic ' + Buffer.from(c.user + ':' + c.pass).toString('base64') } })
    return r.ok ? r : anon
  } catch { return anon }
}
export async function hubJson(url) {
  const r = await hubFetch(url)
  if (!r.ok) throw new Error('自建源 HTTP ' + r.status)
  return r.json()
}
export async function hubFileVersion(p) {
  try {
    const meta = await hubJson(HUB.api + '/contents/' + p + '/package.json?ref=main')
    return JSON.parse(Buffer.from(meta.content, 'base64').toString()).version
  } catch { return null }
}

export function spawnEnv(extra = {}) {
  const p = process.env.PATH || ''
  const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].filter(x => !p.split(':').includes(x))
  return { ...process.env, PATH: [...extraPaths, p].filter(Boolean).join(':'), ...extra }
}
export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: spawnEnv(opts.env), stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd })
    let out = ''
    child.stdout.on('data', d => { out += d; if (opts.stream) process.stdout.write(String(d)) })
    child.stderr.on('data', d => { out += d; if (opts.stream) process.stderr.write(String(d)) })
    child.on('error', e => resolve({ ok: false, code: -1, output: out + '\n' + e.message }))
    child.on('close', code => resolve({ ok: code === 0, code, output: out }))
  })
}
// 以 dsh 身份跑 node(改宿主文件时责任进程=dsh,绕开 App 管理)
export async function runAsDsh(scriptPath, args = [], opts = {}) {
  if (!existsSync(DSHEXE)) throw new Error('未找到 dsh 主程序: ' + DSHEXE)
  return run(DSHEXE, [scriptPath, ...args], { ...opts, env: { ELECTRON_RUN_AS_NODE: '1', ...(opts.env || {}) } })
}
// CLI 场景:用户终端 node 直接跑脚本(终端责任进程;涉及改 dsh bundle 的操作走 adminRename)
export function runNode(scriptPath, args = [], opts = {}) { return run(process.execPath, [scriptPath, ...args], opts) }

export function detectBase() {
  const cand = [RES + '/app/dsh/node_modules/@deepseek-ai']
  for (const b of cand) if (existsSync(path.join(b, 'dsh-agent-instructions', 'lib'))) return b
  return null
}
export function purgeEnv() {
  const cli = RES + '/runtime/cli/bin/dsh'
  const base = detectBase()
  return {
    DSH_SURFACE: 'desktop', DSH_HOME, DSH_PROFILE: 'desktop',
    PURGE_PROFILE_DIR: path.join(DSH_HOME, 'profiles', 'desktop'),
    ...(existsSync(cli) ? { PURGE_DSH_CLI: cli } : {}),
    ...(base ? { DSH_BASE: base } : {}),
  }
}
export function stripQuarantine() {
  try { execSync('xattr -dr com.apple.quarantine "' + APP + '"', { stdio: 'ignore', timeout: 8000 }); return true } catch { return false }
}
export async function cliJson(bin, args, opts = {}) {
  const r = await run(process.execPath, [path.join(PLUGIN_DIR, 'bin', bin), ...args], { env: purgeEnv(), ...opts })
  const s = r.output, a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)) } catch {} }
  return { ok: false, error: (r.output || '').slice(-400), code: r.code }
}
export async function cliText(bin, args, opts = {}) {
  const r = await run(process.execPath, [path.join(PLUGIN_DIR, 'bin', bin), ...args], { env: purgeEnv(), ...opts })
  return r
}
// 宿主解包:asar 态先解到 resources/app
export async function ensureUnpacked() {
  if (detectBase()) return { ok: true, skipped: true, base: detectBase() }
  const script = path.join(os.tmpdir(), 'dshc-unpack.mjs')
  writeFileSync(script, [
    "const core = await import('file://" + PLUGIN_DIR + "/lib/core.js')",
    "try { const r = await core.openSealedDesktopHost({ forApply: true })",
    "  console.log('UNPACK ' + JSON.stringify({ aiBase: r?.aiBase ?? null, extracted: r?.extracted ?? false }))",
    "} catch (e) { console.log('UNPACK_ERR ' + (e.message || e)); process.exit(1) }",
  ].join('\n'), 'utf8')
  const r = await runAsDsh(script)
  const m = /UNPACK (\{.*\})/.exec(r.output)
  if (m) { try { const j = JSON.parse(m[1]); return { ok: !!j.aiBase, ...j } } catch {} }
  const e = /UNPACK_ERR (.+)/.exec(r.output)
  return { ok: false, error: e ? e[1] : (r.output || '').slice(-300) }
}
// 换包改名:普通 rename;EPERM 时 osascript 管理员授权(root 绕过 App 管理)
export function renameAsarToBak() {
  const asar = RES + '/app.asar'
  if (!existsSync(asar)) return { ok: true, skipped: true, note: 'asar 已不在(已完成换包)' }
  let backup = asar + '.purge-' + Date.now() + '.bak'
  try { const st = JSON.parse(readFileSync(asar + '.purge-handoff.json', 'utf8')); if (st.backup) backup = st.backup } catch {}
  try {
    renameSync(asar, backup)
    cleanupHandoff(); return { ok: true, renamed: true, backup }
  } catch (e) {
    if (String(e.code || '').includes('EPERM') || String(e.message).includes('EPERM')) {
      try {
        const sh = path.join(os.tmpdir(), 'dshc-admin-rename.sh')
        writeFileSync(sh, '#!/bin/sh\nset -e\nmv "' + asar + '" "' + backup + '"\n', 'utf8')
        execSync('osascript -e ' + JSON.stringify('do shell script "/bin/sh ' + sh + '" with administrator privileges'), { stdio: 'ignore', timeout: 120000 })
        cleanupHandoff(); return { ok: true, renamed: true, backup, via: 'admin' }
      } catch (e2) { return { ok: false, error: '管理员授权改名失败: ' + (e2.message || e2) } }
    }
    return { ok: false, error: e.message }
  }
}
function cleanupHandoff() {
  try { const st = RES + '/app.asar.purge-handoff.json'; if (existsSync(st)) { const j = JSON.parse(readFileSync(st, 'utf8')); j.phase = 'complete'; writeFileSync(st, JSON.stringify(j, null, 2)) } } catch {}
  try { execSync('rm -f "' + RES + '/app.asar.rename-pending"') } catch {}
}
export function restartDsh() {
  try { execSync('open -a "' + APP_NAME + '"', { timeout: 10000 }); return { ok: true } } catch (e) { return { ok: false, error: e.message } }
}
export function quitDsh() {
  try { execSync('osascript -e \'tell application "' + APP_NAME + '" to quit\'', { timeout: 8000 }) } catch {}
  return { ok: true }
}
export function dshRunning() {
  try { return execSync('pgrep -f "Contents/MacOS/DeepSeek Harness$" | head -1', { stdio: 'pipe' }).toString().trim().length > 0 } catch { return false }
}
export async function waitDshExit(ms = 30000) {
  const t = Date.now()
  while (Date.now() - t < ms) { if (!dshRunning()) return true; await new Promise(r => setTimeout(r, 500)) }
  return !dshRunning()
}
export { renameSync }
