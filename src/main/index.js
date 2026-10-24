import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { spawn, exec, execSync } from 'child_process'
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import os from 'os'
import net from 'net'
import http from 'http'
import zlib from 'zlib'

const DSH_HOME = path.join(os.homedir(), '.dsh')
const DSH_SKILLS_DIR = path.join(DSH_HOME, 'skills')
const DSH_NPM_PACKAGE = '@deepseek-ai/dsh'
const PLUGIN_HUB = 'https://hub.ifunx.com/skyle1995/dsh-plugins'
const PLUGIN_HUB_API = 'https://hub.ifunx.com/api/v1/repos/skyle1995/dsh-plugins'
// 控制的 profile 自动适配:桌面版(desktop)存在优先,否则 web(npm CLI 版)
function pluginProfile() {
  return existsSync(path.join(DSH_HOME, 'profiles', 'desktop', 'package.json')) ? 'desktop' : 'web'
}
function pluginProfilePkg() {
  return path.join(DSH_HOME, 'profiles', pluginProfile(), 'package.json')
}
// dsh 命令解析:PATH 优先(npm CLI),否则用桌面版自带的 runtime CLI
let dshCmdCache = null
function resolveDshCmd() {
  if (dshCmdCache) return dshCmdCache
  try {
    const found = execSync(IS_WIN ? 'where dsh 2>nul' : 'command -v dsh 2>/dev/null', { env: spawnEnv(), encoding: 'utf8' })
    const first = String(found ?? '').trim().split('\n')[0]
    if (first) { dshCmdCache = first; return dshCmdCache }
  } catch {}
  const candidates = IS_WIN
    ? [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd')]
    : ['/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh']
  for (const c of candidates) {
    if (c && existsSync(c)) { dshCmdCache = c; return dshCmdCache }
  }
  dshCmdCache = 'dsh' // 兜底:保持原行为(报 ENOENT 时给出可读错误)
  return dshCmdCache
}

// 打包成 app 后从 Finder/Explorer 启动时,PATH 可能只有系统默认(无 node/npm),
// 导致 spawn('dsh'/'npx') 找不到命令。这里按平台给启动的子进程补上常见路径。
const IS_WIN = process.platform === 'win32'
const EXTRA_PATHS = IS_WIN
  ? [
      path.join(os.homedir(), '.version-fox', 'shims'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    ]
  : ['/opt/homebrew/bin', '/usr/local/bin', '/opt/homebrew/sbin', '/usr/local/sbin']
function spawnEnv() {
  const existing = process.env.PATH || ''
  const parts = existing.split(path.delimiter)
  const extra = EXTRA_PATHS.filter(p => p && !parts.includes(p)).join(path.delimiter)
  return { ...process.env, PATH: extra ? `${extra}${path.delimiter}${existing}` : existing }
}

// ── dsh 进程管理 ─────────────────────────────────────────────
// ── 桌面版(DeepSeek Harness Desktop)进程管理 ──────────────
let mainWindow = null
let dshVersionPromise = null
let dshVersionFetched = false
let dshVersionCache = null
const DSH_APP_NAME = 'DeepSeek Harness'

// 探测桌面版进程:主进程(无参数)+ Web 服务进程(--expose-internals dsh-desktop-host)
function desktopProcessInfo() {
  return new Promise((resolve) => {
    const done = (mainPids, hostPid) => resolve({ mainPids: mainPids.filter(Boolean), hostPid: hostPid ?? null })
    if (IS_WIN) {
      exec('wmic process where "name like \'DeepSeek%\'" get ProcessId,CommandLine /FORMAT:LIST', { env: spawnEnv(), timeout: 5000 }, (err, out) => {
        if (err) return done([], null)
        const mainPids = []
        let hostPid = null
        for (const block of String(out || '').split(/\n\s*\n/)) {
          const pid = Number((block.match(/ProcessId=(\d+)/) || [])[1])
          const cl = (block.match(/CommandLine=(.*)/) || [])[1] || ''
          if (!pid) continue
          if (/--expose-internals/.test(cl)) hostPid ??= pid
          else if (!/ --/.test(cl)) mainPids.push(pid)
        }
        done(mainPids, hostPid)
      })
      return
    }
    exec('ps ax -o pid=,command=', { env: spawnEnv(), timeout: 5000 }, (err, out) => {
      if (err) return done([], null)
      const mainPids = []
      let hostPid = null
      for (const line of String(out || '').split('\n')) {
        if (!line.includes('DeepSeek Harness.app/Contents/MacOS')) continue
        if (line.includes('Helper')) continue
        const pid = Number(line.trim().split(/\s+/)[0])
        if (!Number.isInteger(pid)) continue
        if (line.includes('--expose-internals')) { hostPid ??= pid; continue }
        if (line.includes(' --')) continue // 主进程之外的工具子进程(ptc-runtime 等)
        mainPids.push(pid)
      }
      done(mainPids, hostPid)
    })
  })
}

// Web UI 端口:桌面版每次启动随机分配,从服务进程的 LISTEN 端口发现
function desktopAppPath() {
  return IS_WIN
    ? path.join(process.env.LOCALAPPDATA || '', 'Programs', DSH_APP_NAME, DSH_APP_NAME + '.exe')
    : '/Applications/' + DSH_APP_NAME + '.app'
}

function launchDesktop() {
  return new Promise((resolve) => {
    if (IS_WIN) {
      const exe = desktopAppPath()
      if (!existsSync(exe)) return resolve({ ok: false, error: '未找到桌面版:' + exe })
      try {
        spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
        return resolve({ ok: true })
      } catch (e) { return resolve({ ok: false, error: e.message }) }
    }
    exec('open -a "' + DSH_APP_NAME + '"', { env: spawnEnv(), timeout: 10000 }, (err) => {
      if (err) return resolve({ ok: false, error: '启动桌面版失败:' + err.message })
      resolve({ ok: true })
    })
  })
}

async function quitDesktop() {
  if (IS_WIN) {
    try { execSync('taskkill /IM "' + DSH_APP_NAME + '.exe"', { stdio: 'ignore' }) } catch {}
  } else {
    try { execSync('osascript -e \'tell application "' + DSH_APP_NAME + '" to quit\'', { stdio: 'ignore', timeout: 8000 }) } catch {}
  }
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 500))
    const { mainPids } = await desktopProcessInfo()
    if (!mainPids.length) return { ok: true }
  }
  const { mainPids } = await desktopProcessInfo()
  for (const pid of mainPids) { try { process.kill(pid, 'SIGTERM') } catch {} }
  return { ok: true }
}



// ── 状态详情采集 ────────────────────────────────────────────

function getDshVersion() {
  if (dshVersionFetched) return Promise.resolve(dshVersionCache)
  if (!dshVersionPromise) {
    dshVersionPromise = new Promise((resolve) => {
      const line = `"${resolveDshCmd()}" --version`
      exec(line, { env: spawnEnv(), timeout: 8000 }, (_err, stdout) => {
        const first = String(stdout || '').trim().split('\n')[0].trim()
        dshVersionCache = first || null
        resolve(dshVersionCache)
      })
    })
      .catch(() => null)
      .then(v => { dshVersionFetched = true; return v })
  }
  return dshVersionPromise
}
function hubFetch(url) {
  return fetch(url, { signal: AbortSignal.timeout(15000) })
}

// ── 操作执行器(带进度流) ────────────────────────────────────
let opRunning = false

function sendOpLog(text) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('op:log', text)
}

// cmd.exe 参数引用:含特殊字符(& | < > ^ 空格 括号)时用双引号包裹
function winQuote(a) {
  const s = String(a)
  return /[\s&|<>^()]/.test(s) ? `"${s}"` : s
}

// CLI 用的 node:GUI 启动的 App PATH 里通常没有 node(Homebrew/nvm 路径都不在),
// 优先桌面版自带 runtime node,再回退 Electron 自身(ELECTRON_RUN_AS_NODE),最后才是 PATH 的 node。
function nodeExec() {
  // 控制器自身就是 Electron 二进制:ELECTRON_RUN_AS_NODE=1 时按 node 运行(实测 v24)。
  // 打包后 execPath 是 App 内的可执行文件,不依赖 GUI 进程的 PATH。
  return { cmd: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } }
}

function runOp(cmd, args, { log = true, capture = false, extraEnv } = {}) {
  return new Promise((resolve, reject) => {
    if (opRunning) return reject(new Error('已有操作正在进行,请稍候'))
    opRunning = true
    let nodeExtra = {}
    if (cmd === 'node') {
      const n = nodeExec()
      cmd = n.cmd
      nodeExtra = n.env
    }
    if (log) sendOpLog(`$ ${cmd} ${args.join(' ')}\n`)
    let output = ''
    const childEnv = extraEnv ? { ...spawnEnv(), ...nodeExtra, ...extraEnv } : { ...spawnEnv(), ...nodeExtra }
    // Windows 上必须逐参数引号包裹后交给 cmd /c:插件 spec 里的 & 会被 cmd 当成命令分隔符
    const child = IS_WIN
      ? spawn('cmd', ['/d', '/s', '/c', [cmd, ...args.map(winQuote)].join(' ')], {
          env: childEnv,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(cmd, args, {
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
    const onData = (d) => {
      const text = String(d)
      if (capture) output += text
      if (log) sendOpLog(text)
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('error', (err) => {
      opRunning = false
      sendOpLog(`\n[错误] ${err.message}\n`)
      err.output = output
      reject(err)
    })
    child.once('exit', (code) => {
      opRunning = false
      if (log) sendOpLog(`\n[完成] 退出码 ${code}\n`)
      if (code === 0) resolve({ code, output })
      else {
        const tail = String(output ?? '').trim().split('\n').filter(Boolean).slice(-4).join(' | ').slice(0, 400)
        const err = new Error(`命令退出码 ${code}${tail ? `:${tail}` : ''}`)
        err.output = output
        reject(err)
      }
    })
  })
}

// ── 插件仓库 ────────────────────────────────────────────────
function dshRequirementsOf(manifest) {
  const engineRange = manifest?.engines?.dsh
  if (typeof engineRange === 'string' && engineRange.trim()) {
    return { display: engineRange.trim(), ranges: [{ name: 'engines.dsh', range: engineRange.trim() }] }
  }
  const ranges = []
  for (const [name, range] of Object.entries(manifest?.peerDependencies ?? {})) {
    if (name !== DSH_NPM_PACKAGE && !name.startsWith(`${DSH_NPM_PACKAGE}-`)) continue
    if (typeof range === 'string' && range.trim()) ranges.push({ name, range: range.trim() })
  }
  return {
    display: ranges.find(r => r.name === DSH_NPM_PACKAGE)?.range ?? ranges[0]?.range ?? '',
    ranges,
  }
}

async function fetchPluginCatalog() {
  const res = await hubFetch(`${PLUGIN_HUB_API}/contents/packages?ref=main`)
  if (!res.ok) throw new Error(`仓库接口返回 ${res.status}`)
  const entries = await res.json()
  const out = await Promise.all((Array.isArray(entries) ? entries : []).map(async (d) => {
    if (d?.type !== 'dir') return null
    try {
      const pr = await hubFetch(`${PLUGIN_HUB_API}/contents/${d.path}/package.json?ref=main`)
      if (!pr.ok) return null
      const meta = await pr.json()
      const buf = Buffer.from(meta?.content ?? '', meta?.encoding === 'base64' ? 'base64' : 'utf8')
      const pkg = JSON.parse(buf.toString('utf8'))
      const reqs = dshRequirementsOf(pkg)
      return {
        name: pkg.name,
        version: pkg.version ?? '',
        description: pkg.description ?? '',
        dshRequired: reqs.display,
        dshRanges: reqs.ranges,
        spec: `${PLUGIN_HUB}.git#main&path:${d.path}`,
      }
    } catch { return null }
  }))
  return out.filter(Boolean)
}

async function listInstalledPlugins() {
  try {
    const pkg = JSON.parse(await readFile(pluginProfilePkg(), 'utf8'))
    const plugins = []
    for (const [name, spec] of Object.entries(pkg?.dependencies ?? {})) {
      let version = null
      let dshRequired = null
      let dshRanges = []
      try {
        const p = JSON.parse(await readFile(
          path.join(path.dirname(pluginProfilePkg()), 'node_modules', name, 'package.json'),
          'utf8',
        ))
        version = p?.version ?? null
        const reqs = dshRequirementsOf(p)
        dshRequired = reqs.display
        dshRanges = reqs.ranges
      } catch { /* 未安装完成或读不到 manifest */ }
      plugins.push({ name, spec, version, dshRequired, dshRanges })
    }
    return plugins
  } catch { return [] }
}

function profileExemptionsFile() {
  return path.join(DSH_HOME, 'profiles', pluginProfile(), 'compatibility.json')
}

async function readPluginExemptions() {
  try { return JSON.parse(await readFile(profileExemptionsFile(), 'utf8')) } catch { return {} }
}

async function setPluginVersionExemption(name, version, dshVersion, enable) {
  const args = ['plugin', '--profile', pluginProfile(), enable ? 'allow-version' : 'revoke-version',
    `${name}@${version}`, '--dsh-version', dshVersion]
  if (enable) args.push('--accept-risk')
  await runOp(resolveDshCmd(), args)
  return { ok: true, exemptions: await readPluginExemptions() }
}

const ALLOW_HINT_RE = /allow-version\s+(\S+)\s+--dsh-version\s+(\S+)\s+--accept-risk/g

function parseAllowHints(text) {
  return [...String(text ?? '').matchAll(ALLOW_HINT_RE)].map(m => ({ pkg: m[1], dshVersion: m[2] }))
}

const COMMIT_REF_RE = /#([0-9a-f]{40})(?=&|$)/i

function normalizePluginSpec(spec) {
  return String(spec ?? '').replace(COMMIT_REF_RE, '#main')
}

async function updateAllPlugins() {
  const plugins = await listInstalledPlugins()
  let catalog = []
  try { catalog = await fetchPluginCatalog() } catch { }
  const catalogByName = new Map(catalog.map(p => [p.name, p]))
  const results = []
  for (const p of plugins) {
    const installedSpec = String(p.spec ?? '')
    const fromOfficialHub = installedSpec.startsWith(PLUGIN_HUB)
    const target = fromOfficialHub
      ? (catalogByName.get(p.name)?.spec ?? normalizePluginSpec(installedSpec))
      : installedSpec
    try {
      const { output } = await runOp(resolveDshCmd(), ['plugin', '--profile', pluginProfile(), 'add', target], { capture: true })
      results.push({ name: p.name, ok: true, spec: target, hints: parseAllowHints(output) })
    } catch (e) {
      results.push({ name: p.name, ok: false, spec: target, error: String(e?.message ?? e), hints: parseAllowHints(e?.output) })
    }
  }
  if (existsSync(PURGE_UNRESTRICT_MARK)) {
    try { await purgeUnrestricted() } catch {}
  }
  try { await applyClientNoticePatch() } catch {}
  return results
}


// ── 破甲(dsh-purge)集成 ──────────────────────────────────────
// 主线:自研 fork dsh-purge-self(自建 git,更新源禁用、region gate 源码级禁用)
// 兼容检测:旧社区版 dsh-purge-community / 原版 dsh-purge / dsh-purge-panel
const PURGE_PACKAGES = ['dsh-purge-self', 'dsh-purge-community', 'dsh-purge', 'dsh-purge-panel']
// 单仓策略:破甲 fork 与逆向技能包都存放在本项目仓库(dsh-controller)的子目录
const SELF_REPO_GIT = 'https://hub.ifunx.com/skyle1995/dsh-controller.git'
const SELF_REPO_API = 'https://hub.ifunx.com/api/v1/repos/skyle1995/dsh-controller'
const PURGE_SELF_GIT = SELF_REPO_GIT + '#main&path:dsh-purge-self'
const PURGE_SELF_API = SELF_REPO_API

function purgeProfileModules() {
  return path.join(DSH_HOME, 'profiles', pluginProfile(), 'node_modules')
}

let purgeMarketCache = null
let purgeMarketAt = 0
let purgeCliCache = null
let dshBaseCache = null
let dshBaseAt = 0

function purgeInstallDir() {
  for (const name of PURGE_PACKAGES) {
    const dir = path.join(purgeProfileModules(), name)
    if (existsSync(path.join(dir, 'package.json'))) return dir
  }
  return null
}

async function purgeMarketInfo() {
  if (purgeMarketCache && Date.now() - purgeMarketAt < 5 * 60_000) return purgeMarketCache
  const res = await hubFetch(`${PURGE_SELF_API}/contents/dsh-purge-self/package.json?ref=main`)
  if (!res.ok) throw new Error(res.status === 404 ? '自建源未发布(先提交推送 dsh-purge-self/ 到本项目仓库)' : `自建源接口返回 ${res.status}`)
  const meta = await res.json()
  const pkg = JSON.parse(Buffer.from(meta?.content ?? '', meta?.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8'))
  if (pkg?.name !== 'dsh-purge-self' || !pkg?.version) throw new Error('自建源 package.json 异常')
  purgeMarketCache = { version: pkg.version, engines: pkg.engines ?? null, url: `${PURGE_SELF_GIT}#main` }
  purgeMarketAt = Date.now()
  return purgeMarketCache
}

// 运行时开关(~/.dsh/dsh-purge/tuning.json)——只读展示,修改走 CLI(带校验和审计)
function purgeTuning() {
  try {
    return JSON.parse(readFileSync(path.join(DSH_HOME, 'dsh-purge', 'tuning.json'), 'utf8'))
  } catch { return null }
}

// 审计日志尾部(~/.dsh/dash-purge-community/audit.jsonl,JSONL)
function purgeAuditTail(limit = 8) {
  try {
    const raw = readFileSync(path.join(DSH_HOME, 'dsh-purge-community', 'audit.jsonl'), 'utf8').trim()
    if (!raw) return []
    return raw.split('\n')
      .slice(-limit)
      .map(l => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
      .reverse()
  } catch { return [] }
}

// 插件 CLI:community.js 输出 JSON;原版动作(apply/revert/uninstall)在 dsh-purge.js,输出文本
function purgeBin(which = 'community.js') {
  const dir = purgeInstallDir()
  if (!dir) throw new Error('破甲插件未安装')
  const bin = path.join(dir, 'bin', which)
  if (!existsSync(bin)) throw new Error(`找不到插件 CLI(${which}),安装可能不完整`)
  return bin
}

async function purgeCli(args, { log = true } = {}) {
  const { output } = await runOp('node', [purgeBin(), ...args], { log, capture: true, extraEnv: await purgeExtraEnv() })
  return output
}

async function purgeCliJson(args, opts) {
  const output = await purgeCli(args, opts)
  const from = output.indexOf('{')
  const to = output.lastIndexOf('}')
  if (from < 0 || to <= from) throw new Error('CLI 输出不是 JSON')
  return JSON.parse(output.slice(from, to + 1))
}

// CLI 版宿主定位:桌面版优先(app/ 解包目录、app.asar),退回 npm 全局(扁平/嵌套)
function validDshBase(dir) {
  return !!(dir && existsSync(path.join(dir, 'dsh-agent-instructions', 'lib')))
}

async function detectDshBase() {
  if (dshBaseCache !== null && Date.now() - dshBaseAt < 5 * 60_000) return dshBaseCache
  let base = null
  const resources = IS_WIN
    ? path.join(process.env.LOCALAPPDATA || '', 'Programs', DSH_APP_NAME, 'resources')
    : '/Applications/' + DSH_APP_NAME + '.app/Contents/Resources'
  for (const layout of ['app', 'app.asar']) {
    const candidate = path.join(resources, layout, 'dsh', 'node_modules', '@deepseek-ai')
    if (validDshBase(candidate)) { base = candidate; break }
  }
  if (!base) {
    const root = await execText('npm root -g')
    if (root) {
      const flat = path.join(root.trim(), '@deepseek-ai')
      if (validDshBase(flat)) base = flat
      else {
        const nested = path.join(root.trim(), '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai')
        if (validDshBase(nested)) base = nested
      }
    }
  }
  dshBaseCache = base
  // 命中才长缓存;未命中短缓存,避免一次探测失败后 5 分钟内 CLI 全部丢掉 DSH_BASE
  dshBaseAt = base ? Date.now() : Date.now() - 5 * 60_000 + 20_000
  return base
}

async function purgeExtraEnv() {
  // 桌面版场景:强制 surface=desktop,插件 CLI 才会走桌面宿主解析(自动定位解包目录);
  // DSH_BASE 作显式补充(原版 CLI 在 web surface 下会拒绝桌面安装内的路径,故 surface 必须先对)
  const base = await detectDshBase()
  // PURGE_PROFILE_DIR / DSH_HOME 显式传给插件 CLI:GUI 进程环境里 CLI 自行探测 profile
  // 依赖 PATH 工具,受限 PATH 下会失败,导致 status 返回空 backups。
  return {
    DSH_SURFACE: 'desktop',
    DSH_HOME,
    DSH_PROFILE: 'desktop',
    PURGE_PROFILE_DIR: path.join(DSH_HOME, 'profiles', 'desktop'),
    ...(base ? { DSH_BASE: base } : {}),
  }
}

async function getPurgeState() {
  const dir = purgeInstallDir()
  const state = {
    installed: !!dir,
    package: dir ? path.basename(dir) : null,
    version: null,
    cliAvailable: false,
    latest: null,
    latestUrl: null,
    engines: null,
    tuning: purgeTuning(),
    auditTail: purgeAuditTail(),
    backups: null,
    compatibility: null,
    unrestricted: await regionGatePatched(),
    unrestrictMarked: existsSync(PURGE_UNRESTRICT_MARK),
    drillGranted: drillGranted(),
    noticeCleaned: await clientNoticeCleaned(),
    dshBase: await detectDshBase(),
  }
  if (dir) {
    try {
      const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))
      state.version = pkg?.version ?? null
      state.cliAvailable = existsSync(path.join(dir, 'bin', 'community.js'))
    } catch {}
  }
  try {
    const market = await purgeMarketInfo()
    state.latest = market.version
    state.latestUrl = market.url
    state.engines = market.engines
  } catch {}
  if (state.cliAvailable) {
    // status CLI 可能被其它操作占用(runOp 互斥)或较慢;成功结果缓存 60s
    if (purgeCliCache && Date.now() - purgeCliCache.at < 60_000) {
      state.backups = purgeCliCache.backups
      state.compatibility = purgeCliCache.compatibility
    } else {
      try {
        const s = await purgeCliJson(['status'], { log: false })
        state.backups = Array.isArray(s?.backups) ? s.backups : []
        state.compatibility = s?.compatibility ?? null
        purgeCliCache = { at: Date.now(), backups: state.backups, compatibility: state.compatibility }
      } catch {}
    }
  }
  return state
}

// ── IPC ─────────────────────────────────────────────────────
// 服务管理已移除(桌面版自带);保留重启供破甲「应用并重启」使用
ipcMain.handle('dsh:restart', async () => {
  await quitDesktop()
  await new Promise(r => setTimeout(r, 1200))
  return launchDesktop()
})
ipcMain.handle('dsh:version', () => getDshVersion())
ipcMain.handle('plugins:installed', () => listInstalledPlugins())
ipcMain.handle('plugins:catalog', () => fetchPluginCatalog())
ipcMain.handle('plugins:install', (_e, spec) => runOp(resolveDshCmd(), ['plugin', '--profile', pluginProfile(), 'add', spec]))
ipcMain.handle('plugins:uninstall', (_e, name) => runOp(resolveDshCmd(), ['plugin', '--profile', pluginProfile(), 'remove', name]))
ipcMain.handle('plugins:updateAll', () => updateAllPlugins())
ipcMain.handle('plugins:exemptions', () => readPluginExemptions())
ipcMain.handle('plugins:setVersionExemption', (_e, name, version, dshVersion, enable) =>
  setPluginVersionExemption(name, version, dshVersion, enable))

// ── 破甲 IPC ────────────────────────────────────────────────
ipcMain.handle('purge:state', () => getPurgeState())

// 安装/更新:git 下发——浅克隆本项目仓库,取 dsh-purge-self/ 子目录重打标准 tarball 后本地安装。
// 不用 dsh 的 git path-spec:CLI 会对 spec 二次追加 #main 导致 pnpm 解析失败。
ipcMain.handle('purge:install', async () => {
  const market = await purgeMarketInfo()
  const tmpDir = path.join(os.tmpdir(), `dshc-purge-self-${Date.now()}`)
  try {
    await mkdir(tmpDir, { recursive: true })
    const repoDir = path.join(tmpDir, 'repo')
    await gitClone(SELF_REPO_GIT, repoDir)
    const srcDir = path.join(repoDir, 'dsh-purge-self')
    if (!existsSync(path.join(srcDir, 'package.json'))) {
      throw new Error('仓库里没有 dsh-purge-self/(先提交推送本项目仓库)')
    }
    // 复制子目录 → 重打 package/ 结构的 tarball(去掉 .git 等杂质)
    await cp(srcDir, path.join(tmpDir, 'package'), { recursive: true })
    await rm(path.join(tmpDir, 'package', '.git'), { recursive: true, force: true })
    const tarball = path.join(tmpDir, 'dsh-purge-self.tgz')
    await new Promise((resolve, reject) => {
      const child = spawn('tar', ['-czf', tarball, '-C', tmpDir, 'package'], { env: spawnEnv(), stdio: 'ignore' })
      child.once('error', reject)
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar 打包失败(退出码 ${code})`)))
    })
    const { output } = await runOp(resolveDshCmd(), ['plugin', '--profile', pluginProfile(), 'add', tarball], { capture: true })
    purgeCliCache = null
    let reapplied = false
    if (existsSync(PURGE_UNRESTRICT_MARK)) {
      try { await purgeUnrestricted(); reapplied = true } catch {}
    }
    try { await applyClientNoticePatch() } catch {}
    return { ok: true, version: market.version, output, reapplied }
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
})

// 应用/回滚/卸载补丁:原版 CLI,输出为文本进度(操作日志区实时可见)
ipcMain.handle('purge:apply', async () => {
  const { output } = await runOp('node', [purgeBin('dsh-purge.js'), '--apply'], { capture: true, extraEnv: await purgeExtraEnv() })
  return { ok: true, output }
})
ipcMain.handle('purge:revert', async () => {
  const { output } = await runOp('node', [purgeBin('dsh-purge.js'), '--revert'], { capture: true, extraEnv: await purgeExtraEnv() })
  return { ok: true, output }
})
ipcMain.handle('purge:uninstall', async () => {
  const { output } = await runOp('node', [purgeBin('dsh-purge.js'), '--uninstall'], { capture: true, extraEnv: await purgeExtraEnv() })
  purgeCliCache = null
  return { ok: true, output }
})

// 自检(25 层,JSON)/ 备份 / 回滚到备份 / 清理
ipcMain.handle('purge:selfcheck', () => purgeCliJson(['selfcheck', '--json'], { log: false }))
// 备份相关操作后清 status 缓存,保证列表立即反映最新状态
ipcMain.handle('purge:backup', async () => { purgeCliCache = null; return purgeCliJson(['backup']) })
ipcMain.handle('purge:rollback', async (_e, id) => { purgeCliCache = null; return purgeCliJson(['rollback', String(id)]) })
ipcMain.handle('purge:prune', async () => { purgeCliCache = null; return purgeCliJson(['prune']) })

// 单独删除一个备份(插件无此命令,直接删备份目录;id 校验与插件 list 过滤一致)
ipcMain.handle('purge:deleteBackup', async (_e, id) => {
  const name = String(id ?? '')
  if (!/^[0-9TZa-f-]{15,80}$/.test(name)) throw new Error('备份 ID 格式非法')
  const dir = path.join(DSH_HOME, 'dsh-purge-community', 'backups', name)
  if (!existsSync(dir)) throw new Error('备份不存在(可能已被清理)')
  await rm(dir, { recursive: true, force: true })
  purgeCliCache = null
  return { ok: true, id: name }
})

// 运行时开关:boost / retry / rewind / inject 位置(写 tuning.json,下一轮对话生效,无需重启)
ipcMain.handle('purge:tune', async (_e, key, value) => {
  const map = { boost: ['boost', 'on|off'], retry: ['retry', 'on|off'], rewind: ['rewind', 'on|off'], inject: ['inject', 'head|tail|both'] }
  const spec = map[key]
  if (!spec) throw new Error(`未知开关 ${key}`)
  const result = await purgeCliJson([spec[0], String(value)])
  return { ok: true, result, tuning: purgeTuning() }
})

// ── 破甲技能包(红队技能,提取自 purge 插件)──────────────────
// 插件内 skills/redteam/*.md 是标准 skill frontmatter 的平铺文件;
// 逐个转为 ~/.dsh/skills/<name>/SKILL.md,所有会话可用,不依赖红队预设。
// 版本跟随插件(插件本身经官方市场固定版本 tarball 安装)。
const PURGE_SKILL_STATE = path.join(DSH_HOME, 'skills', '.purge-redteam.json')
// 「解除限制」持久标记:放 DSH_HOME 下,插件更新(重装 node_modules)后据此自动重打
const PURGE_UNRESTRICT_MARK = path.join(DSH_HOME, 'dsh-purge-community', 'controller-unrestrict.json')
const REGION_GATE_ANCHOR = 'export function installRegionGate(ctx) {\n  if (!ctx || typeof ctx.on !== "function") return;'
const REGION_GATE_DISABLED_TAG = '// [dsh-controller] region gate disabled'

// 红队技能包仓库源:列文件 + 逐文件拉取(比 clone 全仓轻)
async function redteamRepoList() {
  if (redteamRepoCache && Date.now() - redteamRepoAt < 5 * 60_000) return redteamRepoCache
  const res = await hubFetch(`${SELF_REPO_API}/contents/${REDTEAM_SKILL_REPO_PATH}?ref=main`)
  if (!res.ok) throw new Error(res.status === 404 ? '自建源未发布 redteam-skill(先提交推送 resources/redteam-skill/)' : `自建源接口返回 ${res.status}`)
  const items = await res.json()
  if (!Array.isArray(items)) throw new Error('自建源目录响应异常')
  const files = items.filter(i => i.type === 'file' && i.name.endsWith('.md') && !/^(README|INDEX|CONTRIBUTING)\.md$/i.test(i.name))
  redteamRepoCache = files.map(f => ({ name: f.name, url: f.download_url || f.url }))
  redteamRepoAt = Date.now()
  return redteamRepoCache
}

async function redteamRepoVersion() {
  try {
    const res = await hubFetch(`${SELF_REPO_API}/contents/${REDTEAM_SKILL_REPO_PATH}/package.json?ref=main`)
    if (!res.ok) return null
    const meta = await res.json()
    const pkg = JSON.parse(Buffer.from(meta?.content ?? '', meta?.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8'))
    return pkg?.version ?? null
  } catch { return null }
}

function purgeSkillsSrcDir() {
  const dir = purgeInstallDir()
  if (!dir) return null
  const src = path.join(dir, 'skills', 'redteam')
  return existsSync(src) ? src : null
}

function parseSkillName(md) {
  const fm = String(md).match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return null
  const m = fm[1].match(/^name:\s*(\S+)\s*$/m)
  return m ? m[1] : null
}

async function listPurgeSkills() {
  const src = purgeSkillsSrcDir()
  if (!src) return []
  const out = []
  for (const e of await readdir(src, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith('.md') || e.name.startsWith('._')) continue // 过滤 macOS 资源叉残留
    const md = await readFile(path.join(src, e.name), 'utf8')
    const name = parseSkillName(md)
    if (name) out.push({ file: e.name, name })
  }
  return out
}

async function purgePluginVersion() {
  const dir = purgeInstallDir()
  if (!dir) return null
  try { return JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))?.version ?? null } catch { return null }
}

// 红队技能统一入口包:~/.dsh/skills/redteam-skill/
// 入口 SKILL.md 汇总全部子技能的路由索引,子技能正文放 SKILLS/<name>.md;
// 旧版分散安装的 23 个独立技能目录在安装时自动迁移清理。
const REDTEAM_SKILL_DIR = path.join(DSH_SKILLS_DIR, 'redteam-skill')
const REDTEAM_SKILL_REPO_PATH = 'resources/redteam-skill' // 仓库内规范源(与 reverse-skill 同级)
let redteamRepoCache = null
let redteamRepoAt = 0

function parseSkillFrontmatter(md) {
  const fm = String(md).match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return {}
  const get = (key) => {
    const m = fm[1].match(new RegExp('^' + key + ':\\s*(.+)$', 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  }
  return { name: get('name'), description: get('description'), whenToUse: get('whenToUse') }
}

function redteamEntryMd(entries, version) {
  const rows = entries.map((e) =>
    '| ' + e.name + ' | ' + (e.whenToUse || e.description || '') + ' |'
  ).join('\n')
  return [
    '---',
    'name: redteam-skill',
    'description: 红队技能包统一入口(测汇/隧道/横向/WebShell/凭据攻击等 ' + entries.length + ' 个子技能)。处理渗透测试、内网横向、隧道搭建、漏洞扫描、WebShell 管理等任务时使用;按下方索引进入对应子技能。',
    '---',
    '',
    '# 红队技能包(统一入口 v' + version + ')',
    '',
    '本技能是红队技能集的路由入口。开始任务前:',
    '',
    '1. 按下方索引找到匹配的子技能(按任务类型选择)',
    '2. 阅读本目录 SKILLS/<技能名>.md 的完整说明后执行',
    '3. 涉及目标系统的操作,仅在已获明确授权的环境中进行',
    '',
    '## 子技能索引',
    '',
    '| 技能 | 适用场景 |',
    '|---|---|',
    rows,
    '',
    '> 子技能正文:本目录 SKILLS/ 下同名 .md 文件。',
  ].join('\n')
}

async function cleanupLegacyRedteamSkills() {
  // 旧版把每个技能装成独立目录;统一入口版安装时迁移清理
  const state = await (async () => {
    try { return JSON.parse(await readFile(PURGE_SKILL_STATE, 'utf8')) } catch { return null }
  })()
  const names = new Set(state?.skills ?? [])
  // 兜底:目录里带 SKILL.md 且在插件技能清单内的也清
  try {
    for (const e of await readdir(DSH_SKILLS_DIR, { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(path.join(DSH_SKILLS_DIR, e.name, 'SKILL.md'))) names.add(e.name)
    }
  } catch {}
  const removed = []
  for (const name of names) {
    if (name === 'redteam-skill' || name === 'reverse-skill') continue
    const dir = path.join(DSH_SKILLS_DIR, name)
    // 只清理确实源于红队技能集的(有 SKILL.md 且能在插件源里找到同名文件)
    const src = purgeSkillsSrcDir()
    if (src && !existsSync(path.join(src, name + '.md'))) continue
    if (existsSync(dir)) { await rm(dir, { recursive: true, force: true }); removed.push(name) }
  }
  return removed
}

async function installPurgeSkills() {
  await mkdir(DSH_SKILLS_DIR, { recursive: true })
  // 优先仓库规范源 resources/redteam-skill(git 下发,带独立版本);失败回退插件内 skills/redteam
  let entries = []
  let version = null
  let source = 'repo'
  try {
    const files = await redteamRepoList()
    if (!files.length) throw new Error('仓库里没有红队子技能')
    version = await redteamRepoVersion()
    for (const f of files) {
      const res = await hubFetch(f.url)
      if (!res.ok) throw new Error(`拉取 ${f.name} 失败:HTTP ${res.status}`)
      const md = await res.text()
      const name = parseSkillName(md) || f.name.replace(/.md$/, '')
      entries.push({ name, md, meta: parseSkillFrontmatter(md) })
    }
  } catch (repoErr) {
    const src = purgeSkillsSrcDir()
    if (!src) throw new Error(`仓库源不可用(${repoErr.message}),且破甲插件未安装`)
    const skills = await listPurgeSkills()
    if (!skills.length) throw new Error('插件内没有可安装的红队技能')
    version = await purgePluginVersion()
    source = 'plugin'
    entries = []
    for (const sk of skills) {
      const md = await readFile(path.join(src, sk.file), 'utf8')
      entries.push({ name: sk.name, md, meta: parseSkillFrontmatter(md) })
    }
  }
  // 统一入口布局
  await rm(REDTEAM_SKILL_DIR, { recursive: true, force: true })
  await mkdir(path.join(REDTEAM_SKILL_DIR, 'SKILLS'), { recursive: true })
  for (const e of entries) {
    await writeFile(path.join(REDTEAM_SKILL_DIR, 'SKILLS', e.name + '.md'), e.md, 'utf8')
  }
  await writeFile(path.join(REDTEAM_SKILL_DIR, 'SKILL.md'), redteamEntryMd(
    entries.map(e => ({ name: e.name, ...e.meta })), version ?? '?'), 'utf8')
  // 迁移清理旧分散技能
  const migrated = await cleanupLegacyRedteamSkills()
  await writeFile(PURGE_SKILL_STATE, JSON.stringify({
    source: source === 'repo' ? 'resources/redteam-skill' : 'dsh-purge-self/skills/redteam', version, layout: 'unified',
    skills: entries.map(e => e.name), installedAt: Date.now(),
  }, null, 2), 'utf8')
  return { ok: true, version, installed: entries.map(e => e.name), migrated }
}

async function uninstallPurgeSkills() {
  const removed = []
  if (existsSync(REDTEAM_SKILL_DIR)) {
    await rm(REDTEAM_SKILL_DIR, { recursive: true, force: true })
    removed.push('redteam-skill')
  }
  const migrated = await cleanupLegacyRedteamSkills()
  removed.push(...migrated)
  if (existsSync(PURGE_SKILL_STATE)) await rm(PURGE_SKILL_STATE, { force: true })
  return { ok: true, removed }
}

async function purgeSkillsState() {
  const pluginVersion = await purgePluginVersion()
  let state = null
  try { state = JSON.parse(await readFile(PURGE_SKILL_STATE, 'utf8')) } catch {}
  let available = 0
  try { available = (await listPurgeSkills()).length } catch {}
  // 旧分散布局残留检测:与清理同口径——只统计确实源自红队技能集的目录
  // (插件源里存在同名 .md),避免把 skill-creator 等正常技能误报为残留
  let legacyCount = 0
  try {
    const src = purgeSkillsSrcDir()
    if (src) {
      for (const e of await readdir(DSH_SKILLS_DIR, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name === 'redteam-skill' || e.name === 'reverse-skill') continue
        if (existsSync(path.join(DSH_SKILLS_DIR, e.name, 'SKILL.md')) && existsSync(path.join(src, e.name + '.md'))) legacyCount++
      }
    }
  } catch {}
  return {
    redteam: {
      pluginInstalled: !!purgeInstallDir(),
      pluginVersion,
      available,
      installed: existsSync(path.join(REDTEAM_SKILL_DIR, 'SKILL.md')),
      installedVersion: state?.version ?? null,
      installedAt: state?.installedAt ?? null,
      skillCount: state?.skills?.length ?? 0,
      skills: state?.skills ?? [],
      source: state?.source ?? null,
      latestVersion: await redteamRepoVersion(),
      upToDate: !!(state?.version && (await redteamRepoVersion()) && state.version === (await redteamRepoVersion())),
      legacyScattered: legacyCount,
    },
    reverse: await reverseSkillsState(),
  }
}

// ── 逆向技能包(reverse-skill)── 纳入破甲技能包统一管理 ──────
// 安装方式与破甲插件对齐:GitHub 固定地址拉取 tarball,commit 作版本;
// 开发环境优先用本地 resources/reverse-skill 兜底(打包后不存在,走网络)。
const REVERSE_SKILL_GIT = SELF_REPO_GIT
const REVERSE_SKILL_API = SELF_REPO_API
const REVERSE_SKILL_DIR = path.join(DSH_HOME, 'skills', 'reverse-skill')
const REVERSE_SKILL_STATE = path.join(DSH_HOME, 'skills', '.reverse-skill.json')
const REVERSE_SKILL_MAX_BYTES = 80 * 1024 * 1024

const REVERSE_SKILL_ENTRY_MD = `---
name: reverse-skill
description: 逆向工程 / 授权渗透测试 / 安全研究 / CTF 技能路由包。处理 APK、二进制、JS 加密、协议逆向、恶意样本分析、漏洞复现等任务时使用。
---

# reverse-skill 路由入口

本技能是一个完整的技能路由包。开始任务前:

1. 阅读本目录下的 \`RULES.md\`(总规则与路由矩阵)与 \`README_AI.md\`(AI 引导)
2. 按 RULES.md 的 MASTER-ROUTING 进入对应子技能
3. **先确认任务目标已获得明确授权**,未授权的目标一律拒绝执行
`

let reverseSkillLatestCache = null
let reverseSkillLatestAt = 0

// 独立语义版本:读本项目仓库 reverse-skill/package.json 的 version 字段,
// 与仓库 commit 解耦——只有技能内容升版本才提示更新
async function reverseSkillLatest() {
  if (reverseSkillLatestCache && Date.now() - reverseSkillLatestAt < 5 * 60_000) return reverseSkillLatestCache
  const res = await hubFetch(`${REVERSE_SKILL_API}/contents/resources/reverse-skill/package.json?ref=main`)
  if (!res.ok) throw new Error(res.status === 404 ? '自建源未发布(先提交推送 reverse-skill/ 到本项目仓库)' : `自建源接口返回 ${res.status}`)
  const meta = await res.json()
  const pkg = JSON.parse(Buffer.from(meta?.content ?? '', meta?.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8'))
  const version = pkg?.version ?? null
  if (version) {
    reverseSkillLatestCache = version
    reverseSkillLatestAt = Date.now()
  }
  return version
}

function reverseSkillLocalResource() {
  // 开发环境 resources/reverse-skill(有 RULES.md 才算有效);打包后不存在
  const dir = app.isPackaged
    ? null
    : path.join(app.getAppPath(), 'resources', 'reverse-skill')
  return dir && existsSync(path.join(dir, 'RULES.md')) ? dir : null
}

async function reverseSkillsState() {
  let state = null
  try { state = JSON.parse(await readFile(REVERSE_SKILL_STATE, 'utf8')) } catch {}
  let latest = null
  try { latest = await reverseSkillLatest() } catch {}
  // 子技能数:skills/ 下含 SKILL.md 的目录
  let skillCount = 0
  try {
    for (const sub of ['skills', 'skill']) {
      const dir = path.join(REVERSE_SKILL_DIR, sub)
      if (!existsSync(dir)) continue
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.isDirectory() && existsSync(path.join(dir, e.name, 'SKILL.md'))) skillCount++
      }
      if (skillCount) break
    }
  } catch {}
  // 兼容旧状态(commit 版)→ 升级为 version;已装版本也可从安装目录 package.json 兜底读取
  let installedVersion = state?.version ?? null
  if (!installedVersion) {
    try {
      installedVersion = JSON.parse(await readFile(path.join(REVERSE_SKILL_DIR, 'package.json'), 'utf8'))?.version ?? null
    } catch {}
  }
  return {
    installed: existsSync(path.join(REVERSE_SKILL_DIR, 'SKILL.md')),
    installedVersion,
    installedAt: state?.installedAt ?? null,
    latest,
    upToDate: !!(installedVersion && latest && installedVersion === latest),
    skillCount,
    localFallback: !!reverseSkillLocalResource(),
  }
}

function extractTar(tarball, destDir) {
  return new Promise((resolve, reject) => {
    mkdir(destDir, { recursive: true }).then(() => {
      const child = spawn('tar', ['-xzf', tarball, '-C', destDir, '--strip-components', '1'], {
        env: spawnEnv(),
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      let err = ''
      child.stderr?.on('data', (d) => { err += String(d) })
      child.once('error', reject)
      child.once('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`tar 解压失败(退出码 ${code})${err ? ':' + err.trim() : ''}`))
      })
    }, reject)
  })
}

function gitClone(url, destDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '--depth', '1', url, destDir], {
      env: spawnEnv(),
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let err = ''
    child.stderr?.on('data', (d) => { err += String(d) })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`git clone 失败(退出码 ${code})${err ? ':' + err.trim().slice(0, 300) : ''}`))
    })
  })
}

async function installReverseSkill() {
  let version = null
  try { version = await reverseSkillLatest() } catch { /* 版本拿不到不阻塞安装 */ }
  const tmpDir = path.join(os.tmpdir(), `dshc-reverse-skill-${Date.now()}`)
  try {
    await mkdir(tmpDir, { recursive: true })
    const repoDir = path.join(tmpDir, 'repo')
    // git 下发:浅克隆本项目仓库,取 reverse-skill/ 子目录;整仓 commit 即版本
    await gitClone(REVERSE_SKILL_GIT, repoDir)
    const pkgDir = path.join(repoDir, 'resources', 'reverse-skill')
    if (!existsSync(path.join(pkgDir, 'RULES.md'))) throw new Error('仓库内容异常:resources/reverse-skill/ 缺少 RULES.md(先提交推送到本项目仓库)')
    await rm(REVERSE_SKILL_DIR, { recursive: true, force: true })
    await mkdir(path.dirname(REVERSE_SKILL_DIR), { recursive: true })
    await cp(pkgDir, REVERSE_SKILL_DIR, { recursive: true })
    await writeFile(path.join(REVERSE_SKILL_DIR, 'SKILL.md'), REVERSE_SKILL_ENTRY_MD, 'utf8')
    await rm(path.join(REVERSE_SKILL_DIR, '.git'), { recursive: true, force: true })
    await rm(path.join(DSH_SKILLS_DIR, '__MACOSX'), { recursive: true, force: true })
    // 以安装包内的 package.json 版本为准(仓库侧漏改时兜底)
    try {
      const pkg = JSON.parse(await readFile(path.join(REVERSE_SKILL_DIR, 'package.json'), 'utf8'))
      if (pkg?.version) version = pkg.version
    } catch {}
    await writeFile(REVERSE_SKILL_STATE, JSON.stringify({
      source: 'git',
      version,
      installedAt: Date.now(),
    }, null, 2), 'utf8')
    return { ok: true, source: 'git', version }
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function uninstallReverseSkill() {
  await rm(REVERSE_SKILL_DIR, { recursive: true, force: true })
  if (existsSync(REVERSE_SKILL_STATE)) await rm(REVERSE_SKILL_STATE, { force: true })
  return { ok: true }
}

// 面板「用户须知」弹窗清理:去掉弹窗内的仓库链接(body 尾巴 + 链接节点);
// 幂等;插件安装/更新后自动重放,失败不影响主流程。
const WELCOME_REPO_TAIL = '\\uFF0C\\u6E90\\u7801\\u4ED3\\u5E93\\uFF1A' // ",源码仓库:"
const WELCOME_REPO_NODE_RE = /\n\s*h\(\s*"p",\s*null,\s*h\(\s*"a",\s*\{\s*href: repo,\s*target: "_blank",\s*rel: "noopener noreferrer"\s*\},\s*repo\s*\)\s*,?\s*\)\s*,/

async function applyClientNoticePatch() {
  const dir = purgeInstallDir()
  if (!dir) return { ok: false, skipped: 'not-installed' }
  const file = path.join(dir, 'client.js')
  if (!existsSync(file)) return { ok: false, skipped: 'no-client' }
  const text = await readFile(file, 'utf8')
  const hasTail = text.includes(WELCOME_REPO_TAIL)
  const hasNode = WELCOME_REPO_NODE_RE.test(text)
  if (!hasTail && !hasNode) return { ok: true, already: true }
  const bak = file + '.controller-bak'
  if (!existsSync(bak)) await writeFile(bak, text, 'utf8')
  const patched = text.replace(WELCOME_REPO_TAIL, '\\u3002').replace(WELCOME_REPO_NODE_RE, '')
  await writeFile(file + '.tmp', patched, 'utf8')
  await rename(file + '.tmp', file)
  return { ok: true }
}

async function clientNoticeCleaned() {
  const dir = purgeInstallDir()
  if (!dir) return false
  try {
    const text = await readFile(path.join(dir, 'client.js'), 'utf8')
    return !text.includes(WELCOME_REPO_TAIL) && !WELCOME_REPO_NODE_RE.test(text)
  } catch { return false }
}

// ── 破甲限制管理 ─────────────────────────────────────────────
// region gate:插件手动加的拦截(agent/pre-step 钩子,攻击任务里的
// CN/HK/MO 域名与银行域名直接落拒绝消息)。解除 = 给插件 lib/net-scope.js
// 打补丁让 installRegionGate 直接返回;写入前备份,可一键恢复。
function regionGateFile() {
  const dir = purgeInstallDir()
  return dir ? path.join(dir, 'lib', 'net-scope.js') : null
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function purgeUnrestricted() {
  const file = regionGateFile()
  if (!file) throw new Error('破甲插件未安装')
  const text = await readFile(file, 'utf8')
  if (text.includes(REGION_GATE_DISABLED_TAG)) return { ok: true, already: true }
  if (!text.includes(REGION_GATE_ANCHOR)) throw new Error('未找到 region gate 锚点,插件版本可能已变化')
  const bak = file + '.controller-bak'
  if (!existsSync(bak)) await writeFile(bak, text, 'utf8')
  const patched = text.replace(REGION_GATE_ANCHOR, REGION_GATE_ANCHOR + '\n  return; ' + REGION_GATE_DISABLED_TAG)
  await writeFile(file + '.tmp', patched, 'utf8')
  await rename(file + '.tmp', file)
  await mkdir(path.dirname(PURGE_UNRESTRICT_MARK), { recursive: true })
  await writeFile(PURGE_UNRESTRICT_MARK, JSON.stringify({ at: new Date().toISOString() }, null, 2), 'utf8')
  return { ok: true }
}

async function purgeRestoreRestricted() {
  const file = regionGateFile()
  if (!file) throw new Error('破甲插件未安装')
  const bak = file + '.controller-bak'
  if (existsSync(bak)) {
    await writeFile(file + '.tmp', await readFile(bak, 'utf8'), 'utf8')
    await rename(file + '.tmp', file)
    await rm(bak, { force: true })
  } else {
    // 无备份(如插件已更新):移除补丁标记行
    const text = await readFile(file, 'utf8')
    const cleaned = text.replace(new RegExp('\\n  return; ' + escapeRegExp(REGION_GATE_DISABLED_TAG), 'g'), '')
    if (cleaned !== text) {
      await writeFile(file + '.tmp', cleaned, 'utf8')
      await rename(file + '.tmp', file)
    }
  }
  if (existsSync(PURGE_UNRESTRICT_MARK)) await rm(PURGE_UNRESTRICT_MARK, { force: true })
  return { ok: true }
}

async function regionGatePatched() {
  const file = regionGateFile()
  if (!file) return false
  try { return (await readFile(file, 'utf8')).includes(REGION_GATE_DISABLED_TAG) } catch { return false }
}

// 演练台授权:~/.dsh/dsh-purge/drill-grant.json 写 granted,免去每次弹窗确认
function drillGrantFile() {
  return path.join(DSH_HOME, 'dsh-purge', 'drill-grant.json')
}
function drillGranted() {
  try { return JSON.parse(readFileSync(drillGrantFile(), 'utf8'))?.granted === true } catch { return false }
}
async function grantDrill() {
  const file = drillGrantFile()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ granted: true, at: new Date().toISOString() }, null, 2) + '\n', 'utf8')
  return { ok: true }
}

ipcMain.handle('purge:skillsState', () => purgeSkillsState())
ipcMain.handle('purge:skillsInstall', () => installPurgeSkills())
ipcMain.handle('purge:skillsUninstall', () => uninstallPurgeSkills())
ipcMain.handle('reverseSkill:install', () => installReverseSkill())
ipcMain.handle('reverseSkill:uninstall', () => uninstallReverseSkill())
ipcMain.handle('purge:unrestrict', () => purgeUnrestricted())
ipcMain.handle('purge:restoreRestrict', () => purgeRestoreRestricted())
ipcMain.handle('purge:grantDrill', () => grantDrill())


// ── 窗口 ────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    title: 'DSH Controller',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1013' : '#eef1f6',
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })
  mainWindow = win
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
  }
}

function showWindow() {
  if (!mainWindow) { createWindow(); return }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}


app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => showWindow())
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
})
