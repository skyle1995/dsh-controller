import { fileURLToPath, pathToFileURL } from 'node:url'
// 核心:环境探测 / 执行 / 自建源认证 / 宿主解包 / 换包改名
import { spawn, execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, mkdtempSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { locateDesktop, desktopCliInvocation, psLiteral, encodePowerShell } from './platform.mjs'

export const HOME = os.homedir()
// CLI 所在仓库根(全局符号链接安装时也能定位)
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DSH_HOME = path.resolve(process.env.DSH_HOME || path.join(HOME, '.dsh'))
export const APP_NAME = 'DeepSeek Harness'

const desktop = locateDesktop({ home: HOME })
export const APP = desktop.root
export const IS_WIN = process.platform === 'win32'
export const DSHEXE = desktop.executable
export const RES = desktop.resources
export const DSH_CLI = process.env.PURGE_DSH_CLI || desktop.cli
export const PLUGIN_DIR = path.join(DSH_HOME, 'profiles', 'desktop', 'node_modules', 'dsh-purge-self')
export const SKILLS_DIR = path.join(DSH_HOME, 'skills')
export const HUB = { git: 'https://hub.ifunx.com/skyle1995/dsh-controller.git', api: 'https://hub.ifunx.com/api/v1/repos/skyle1995/dsh-controller' }
export const HUB_AUTH_FILE = path.join(DSH_HOME, 'dsh-controller', 'hub.json')
const runningCommands = new Set()

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
  if (IS_WIN) return { ...process.env, ...extra } // Windows PATH 分隔符是 ;，不做 Unix 路径注入
  const p = process.env.PATH || ''
  const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].filter(x => !p.split(':').includes(x))
  return { ...process.env, PATH: [...extraPaths, p].filter(Boolean).join(':'), ...extra }
}
/** 执行无 shell 的外部命令。参数为程序、参数数组及选项，返回退出码和输出；可设置超时。 */
export function run(cmd, args = [], opts = {}) {
  if (!cmd) return Promise.resolve({ ok: false, code: -1, output: '未找到 DSH 安装，请设置 DSH_APP_ROOT。' })
  if (IS_WIN && ['.cmd', '.bat'].includes(path.extname(cmd).toLowerCase())) {
    return Promise.resolve({ ok: false, code: -1, output: '批处理命令不能直接执行，请使用专用 CLI 入口。' })
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: spawnEnv(opts.env), stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd, shell: false, windowsHide: true, timeout: opts.timeout || 0 })
    runningCommands.add(child)
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', d => { out += d; if (opts.stream) process.stdout.write(String(d)) })
    child.stderr.on('data', d => { out += d; if (opts.stream) process.stderr.write(String(d)) })
    child.on('error', e => { runningCommands.delete(child); resolve({ ok: false, code: -1, output: out + '\n' + e.message }) })
    child.on('close', code => { runningCommands.delete(child); resolve({ ok: code === 0, code, output: out }) })
  })
}
/** 清理控制器仍在执行的命令。无参数或返回值，仅终止本控制器记录的子进程，不关闭桌面应用。 */
export function stopRunningCommands() {
  for (const child of runningCommands) {
    if (!child.pid) continue
    try {
      if (IS_WIN) execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5000, windowsHide: true })
      else child.kill('SIGTERM')
    } catch {}
  }
  runningCommands.clear()
}
/** 克隆仓库。参数为目标目录、工作目录及可选 URL/分支，返回结果；只向自建源发送认证且不写入 URL。 */
export async function cloneRepository(destination, cwd, { url = HUB.git, ref } = {}) {
  const remote = new URL(url)
  if (remote.protocol !== 'https:' || remote.username || remote.password) return { ok: false, output: '仓库必须使用无内嵌凭据的 HTTPS URL' }
  const token = readToken()
  const env = token && remote.origin === new URL(HUB.git).origin ? {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.' + new URL(HUB.git).origin + '/.extraHeader',
    GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + Buffer.from('oauth2:' + token).toString('base64'),
    GIT_TERMINAL_PROMPT: '0',
  } : { GIT_TERMINAL_PROMPT: '0' }
  const commitRef = ref && ref.length === 40 && [...ref.toLowerCase()].every(ch => '0123456789abcdef'.includes(ch))
  const cloned = await run('git', ['clone', '--depth', '1', ...(ref && !commitRef ? ['--branch', ref] : []), url, destination], { cwd, env })
  if (!cloned.ok || !commitRef) return cloned
  const fetched = await run('git', ['-C', destination, 'fetch', '--depth', '1', 'origin', ref], { cwd, env })
  if (!fetched.ok) return fetched
  return run('git', ['-C', destination, 'checkout', '--detach', 'FETCH_HEAD'], { cwd, env })
}
/** 执行 DSH CLI。参数 args 为 CLI 参数，opts 为执行选项，返回命令结果；Windows 不经过 cmd shell。 */
export async function runDsh(args, opts = {}) {
  try {
    if (!DSH_CLI) return { ok: false, code: -1, output: '未找到 DSH 安装，请设置 DSH_APP_ROOT。' }
    if (IS_WIN && path.extname(DSH_CLI).toLowerCase() === '.cmd') {
      const invocation = desktopCliInvocation(DSH_CLI)
      return await run(invocation.command, [...invocation.args, ...args], { ...opts, env: { ...opts.env, ...invocation.env } })
    }
    return await run(DSH_CLI, args, opts)
  } catch (e) { return { ok: false, code: -1, output: e.message } }
}
// 以 dsh 身份跑 node(改宿主文件时责任进程=dsh,绕开 App 管理)
export async function runAsDsh(scriptPath, args = [], opts = {}) {
  if (!existsSync(DSHEXE)) throw new Error('未找到 dsh 主程序: ' + DSHEXE)
  return run(DSHEXE, [scriptPath, ...args], { ...opts, env: { ELECTRON_RUN_AS_NODE: '1', ...(opts.env || {}) } })
}
// CLI 场景:用户终端 node 直接跑脚本(终端责任进程;涉及改 dsh bundle 的操作走 adminRename)
export function runNode(scriptPath, args = [], opts = {}) { return run(process.execPath, [scriptPath, ...args], opts) }

export function detectBase() {
  if (!RES) return null
  const cand = [RES + '/app/dsh/node_modules/@deepseek-ai']
  for (const b of cand) if (existsSync(path.join(b, 'dsh-agent-instructions', 'lib'))) return b
  return null
}
export function purgeEnv() {
  const cli = DSH_CLI
  const base = detectBase()
  return {
    DSH_SURFACE: 'desktop', DSH_HOME, DSH_PROFILE: 'desktop',
    PURGE_PROFILE_DIR: path.join(DSH_HOME, 'profiles', 'desktop'),
    ...(existsSync(cli) ? { PURGE_DSH_CLI: cli } : {}),
    ...(base ? { DSH_BASE: base } : {}),
  }
}
export function stripQuarantine() {
  if (process.platform !== 'darwin') return true
  try { execFileSync('xattr', ['-dr', 'com.apple.quarantine', APP], { stdio: 'ignore', timeout: 8000 }); return true } catch { return false }
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
/** 解包当前桌面宿主。无参数，返回解包结果，执行结束删除临时脚本。 */
export async function ensureUnpacked() {
  if (detectBase()) return { ok: true, skipped: true, base: detectBase() }
  if (!RES) return { ok: false, error: '未找到桌面安装，请设置 DSH_APP_ROOT。' }
  const temp = mkdtempSync(path.join(os.tmpdir(), 'dshc-unpack-'))
  const script = path.join(temp, 'unpack.mjs')
  writeFileSync(script, [
    "const core = await import('" + pathToFileURL(path.join(PLUGIN_DIR, 'lib', 'core.js')).href + "')",
    "try { const r = await core.openSealedDesktopHost({ forApply: true })",
    "  console.log('UNPACK ' + JSON.stringify({ aiBase: r?.aiBase ?? null, extracted: r?.extracted ?? false }))",
    "} catch (e) { console.log('UNPACK_ERR ' + (e.message || e)); process.exit(1) }",
  ].join('\n'), 'utf8')
  let r
  try { r = await runAsDsh(script) }
  finally { rmSync(temp, { recursive: true, force: true }) }
  const m = /UNPACK (\{.*\})/.exec(r.output)
  if (m) { try { const j = JSON.parse(m[1]); return { ok: !!j.aiBase, ...j } } catch {} }
  const e = /UNPACK_ERR (.+)/.exec(r.output)
  return { ok: false, error: e ? e[1] : (r.output || '').slice(-300) }
}
/** 保存原始宿主归档。无参数，返回改名及备份状态；权限不足时请求平台管理员授权。 */
export function renameAsarToBak() {
  if (!RES) return { ok: false, error: '未找到桌面安装' }
  if (!existsSync(path.join(RES, 'app', 'package.json'))) return { ok: false, error: '解包目录不完整，保留原始 app.asar' }
  const asar = RES + '/app.asar'
  if (!existsSync(asar)) return { ok: true, skipped: true, note: 'asar 已不在(已完成换包)' }
  let backup = asar + '.purge-' + Date.now() + '.bak'
  try { const st = JSON.parse(readFileSync(asar + '.purge-handoff.json', 'utf8')); if (st.backup) backup = st.backup } catch {}
  if (existsSync(backup)) return { ok: false, error: '备份目标已存在，未覆盖原始归档: ' + backup }
  try {
    renameSync(asar, backup)
    cleanupHandoff(); return { ok: true, renamed: true, backup }
  } catch (e) {
    if (['EPERM', 'EACCES'].includes(e.code)) {
      try {
        if (IS_WIN) {
          const body = `$ErrorActionPreference='Stop'; Move-Item -LiteralPath ${psLiteral(asar)} -Destination ${psLiteral(backup)}; exit 0`
          const broker = `$p=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -Wait -PassThru -ArgumentList ${psLiteral('-NoProfile -NonInteractive -EncodedCommand ' + encodePowerShell(body))}; exit $p.ExitCode`
          execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(broker)], { stdio: 'ignore', windowsHide: true, timeout: 120000 })
        } else {
          if (process.platform !== 'darwin') return { ok: false, error: '没有安装目录写权限，请使用有权限的账户重试。' }
          const sh = path.join(os.tmpdir(), 'dshc-admin-rename.sh')
          writeFileSync(sh, '#!/bin/sh\nset -e\nmv "' + asar + '" "' + backup + '"\n', 'utf8')
          execSync('osascript -e ' + JSON.stringify('do shell script "/bin/sh ' + sh + '" with administrator privileges'), { stdio: 'ignore', timeout: 120000 })
        }
        if (existsSync(asar) || !existsSync(backup)) return { ok: false, error: '管理员改名未完成，原始归档保留。' }
        cleanupHandoff(); return { ok: true, renamed: true, backup, via: 'admin' }
      } catch (e2) { return { ok: false, error: '管理员授权改名失败: ' + (e2.message || e2) } }
    }
    return { ok: false, error: e.message }
  }
}
/** 完成换包状态并删除等待标记。无参数或返回值，状态文件错误不会覆盖改名结果。 */
function cleanupHandoff() {
  try { const st = RES + '/app.asar.purge-handoff.json'; if (existsSync(st)) { const j = JSON.parse(readFileSync(st, 'utf8')); j.phase = 'complete'; writeFileSync(st, JSON.stringify(j, null, 2)) } } catch {}
  try { rmSync(path.join(RES, 'app.asar.rename-pending'), { force: true }) } catch {}
}
/** 重启定位到的桌面安装。参数控制是否先退出及等待时长，返回启动状态或错误。 */
export async function restartDsh({ quitFirst = true, waitMs = 20000 } = {}) {
  try {
    if (!DSHEXE) return { ok: false, error: '未找到桌面程序，请设置 DSH_APP_ROOT。' }
    const wasRunning = dshRunning()
    if (quitFirst && wasRunning) {
      quitDsh()
      const t0 = Date.now()
      while (Date.now() - t0 < waitMs) {
        if (!dshRunning()) break
        await new Promise(r => setTimeout(r, 400))
      }
      if (dshRunning()) return { ok: false, error: 'dsh 未在 ' + Math.round(waitMs / 1000) + 's 内退出，请从托盘或应用菜单完全退出后重试。' }
    }
    const env = spawnEnv()
    delete env.ELECTRON_RUN_AS_NODE
    await new Promise((resolve, reject) => {
      const child = process.platform === 'darwin'
        ? spawn('open', ['-a', APP], { env, stdio: 'ignore', windowsHide: true })
        : spawn(DSHEXE, [], { env, stdio: 'ignore', detached: true, windowsHide: true })
      child.once('error', reject)
      if (process.platform === 'darwin') child.once('exit', code => code === 0 ? resolve() : reject(new Error('启动失败: ' + code)))
      else child.once('spawn', () => { child.unref(); resolve() })
    })
    return { ok: true, wasRunning, restarted: wasRunning }
  } catch (e) { return { ok: false, error: e.message } }
}
/** 请求当前安装退出。无参数，返回请求状态；Windows 不强制结束托盘程序。 */
export function quitDsh() {
  if (!DSHEXE) return { ok: true }
  try {
    switch (process.platform) {
      case 'win32': {
        const script = `$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; Get-Process | Where-Object { try { $_.Path -and [string]::Equals($_.Path, ${psLiteral(DSHEXE)}, [StringComparison]::OrdinalIgnoreCase) } catch { $false } } | ForEach-Object { [void]$_.CloseMainWindow() }`
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)], { stdio: 'ignore', timeout: 15000, windowsHide: true })
        break
      }
      case 'darwin':
        execFileSync('osascript', ['-e', 'tell application ' + JSON.stringify(APP) + ' to quit'], { timeout: 8000 })
        break
      default: {
        const ids = execFileSync('pgrep', ['-f', DSHEXE], { encoding: 'utf8', timeout: 5000 }).trim().split('\n')
        for (const id of ids) if (Number(id) > 0) process.kill(Number(id), 'SIGTERM')
      }
    }
  } catch (e) { return { ok: false, error: e.message } }
  return { ok: true }
}
/** 检查当前安装是否运行。无参数，返回布尔值，Windows 按完整程序路径匹配。 */
export function dshRunning() {
  if (!DSHEXE) return false
  try {
    if (IS_WIN) {
      const script = `$ProgressPreference='SilentlyContinue'; Get-Process | Where-Object { try { $_.Path -and [string]::Equals($_.Path, ${psLiteral(DSHEXE)}, [StringComparison]::OrdinalIgnoreCase) } catch { $false } } | ForEach-Object { $_.Id }`
      return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim().length > 0
    }
    return execFileSync('pgrep', ['-f', DSHEXE], { encoding: 'utf8', timeout: 5000 }).trim().length > 0
  } catch { return false }
}
export async function waitDshExit(ms = 30000) {
  const t = Date.now()
  while (Date.now() - t < ms) { if (!dshRunning()) return true; await new Promise(r => setTimeout(r, 500)) }
  return !dshRunning()
}
export { renameSync }
