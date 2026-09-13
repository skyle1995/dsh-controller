import { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, nativeTheme } from 'electron'
import { spawn, exec, execSync } from 'child_process'
import { readFile, writeFile, readdir, stat, rm, mkdir, cp } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import os from 'os'
import net from 'net'
import zlib from 'zlib'

const DSH_HOME = path.join(os.homedir(), '.dsh')
const WORKSPACE_JSON = path.join(DSH_HOME, 'storages', 'workspace.json')
const PROJCACHE_JSON = path.join(DSH_HOME, 'storages', 'session_projcache.json')
const PROJCACHE_SESSIONS_DIR = path.join(DSH_HOME, 'storages', 'session_projcache', 'sessions')
const SESSIONS_ROOT = path.join(DSH_HOME, 'sessions')
const DSH_PORT = 3080
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
const SKILLS_DIR = path.join(DSH_HOME, 'skills')
const HOME_PATCH = path.join(DSH_HOME, 'cordis.patch.yml')

// ── dsh 进程管理 ─────────────────────────────────────────────
let dshProcess = null
let dshUrl = null
let mainWindow = null
let tray = null
let isQuitting = false

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.setTimeout(300)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.once('error', () => { socket.destroy(); resolve(false) })
  })
}

function startDsh() {
  return new Promise(async (resolve) => {
    if (dshProcess && dshProcess.exitCode === null) {
      return resolve({ ok: true, alreadyRunning: true, port: DSH_PORT })
    }
    if (await portInUse(DSH_PORT)) {
      return resolve({ ok: true, alreadyRunning: true, external: true, port: DSH_PORT })
    }
    // Windows 上用 npx 启动(兼容未全局安装 dsh 的情况);macOS 直接调用 dsh。
    const cmd = IS_WIN ? 'npx' : 'dsh'
    const args = IS_WIN ? ['--yes', '@deepseek-ai/dsh', 'web', '--no-open'] : ['web', '--no-open']
    const child = spawn(cmd, args, {
      detached: !IS_WIN,
      shell: IS_WIN,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv(),
    })
    let buffer = ''
    child.stdout?.on('data', (chunk) => {
      buffer += String(chunk)
      const m = buffer.match(/http:\/\/\S+/)
      if (m) dshUrl = m[0]
    })
    child.once('error', (err) => resolve({ ok: false, error: err.message }))
    child.once('spawn', () => {
      dshProcess = child
      resolve({ ok: true, pid: child.pid, port: DSH_PORT })
    })
    child.once('exit', () => { dshProcess = null })
  })
}

function killProcessTree(pid) {
  if (!pid) return
  if (IS_WIN) {
    try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }) } catch {}
  } else {
    try { process.kill(-pid, 'SIGTERM') } catch { try { process.kill(pid, 'SIGTERM') } catch {} }
  }
}

function killPort(port) {
  return new Promise((resolve) => {
    if (IS_WIN) {
      // netstat 最后一列是 PID;按端口 + LISTENING 过滤后 taskkill 整棵进程树
      exec('netstat -ano -p tcp', (err, stdout) => {
        const pids = new Set()
        for (const line of String(stdout || '').split('\n')) {
          if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue
          const cols = line.trim().split(/\s+/)
          const pid = cols[cols.length - 1]
          if (/^\d+$/.test(pid)) pids.add(pid)
        }
        for (const pid of pids) killProcessTree(Number(pid))
        resolve()
      })
    } else {
      exec(`lsof -ti tcp:${port}`, { env: spawnEnv() }, (err, stdout) => {
        if (err || !String(stdout).trim()) return resolve()
        for (const pid of String(stdout).trim().split('\n')) {
          if (!pid.trim()) continue
          try { process.kill(Number(pid.trim()), 'SIGTERM') } catch {}
        }
        resolve()
      })
    }
  })
}

async function stopDsh() {
  if (dshProcess && dshProcess.exitCode === null) {
    killProcessTree(dshProcess.pid)
    dshProcess = null
  }
  // 兜底:停掉占着端口的进程(可能是终端里手动起的 dsh)
  await killPort(DSH_PORT)
  return { ok: true }
}

async function restartDsh() {
  await stopDsh()
  await new Promise(r => setTimeout(r, 800)) // 等端口释放
  return startDsh()
}

async function getDshStatus() {
  const running = (dshProcess && dshProcess.exitCode === null) || await portInUse(DSH_PORT)
  return { running, port: DSH_PORT }
}

async function openSessionUi() {
  const url = dshUrl || `http://127.0.0.1:${DSH_PORT}/`
  await shell.openExternal(url)
  return { ok: true, url }
}

// ── 数据层 ─────────────────────────────────────────────────
async function readJson(file) {
  const raw = await readFile(file, 'utf8')
  return JSON.parse(raw)
}

async function writeJson(file, data) {
  const tmp = file + '.tmp'
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rm(file, { force: true })
  await import('fs/promises').then(fs => fs.rename(tmp, file))
}

async function readWorkspace() {
  if (!existsSync(WORKSPACE_JSON)) return { global: { archivedSessionIds: [], workspaceIds: [] }, tables: { workspaces: {} } }
  return readJson(WORKSPACE_JSON)
}

async function readTitles() {
  // 新版 dsh:标题存于 storages/session_projcache/sessions/<sid>.json 的 record.rows.title.val
  if (existsSync(PROJCACHE_SESSIONS_DIR)) {
    try {
      const out = {}
      const files = await readdir(PROJCACHE_SESSIONS_DIR)
      for (const f of files) {
        if (!f.endsWith('.json')) continue
        const sid = f.slice(0, -5)
        try {
          const rec = await readJson(path.join(PROJCACHE_SESSIONS_DIR, f))
          const title = rec?.record?.rows?.title?.val
          if (title) out[sid] = title
        } catch {}
      }
      return out
    } catch { /* 读取失败则回退旧结构 */ }
  }
  // 旧版 dsh:storages/session_projcache.json 的 tables.sessions[sid].rows.title.val
  if (!existsSync(PROJCACHE_JSON)) return {}
  try {
    const pc = await readJson(PROJCACHE_JSON)
    const out = {}
    for (const [sid, v] of Object.entries(pc?.tables?.sessions ?? {})) {
      const title = v?.rows?.title?.val
      if (title) out[sid] = title
    }
    return out
  } catch { return {} }
}

async function listSessions() {
  const ws = await readWorkspace()
  const titles = await readTitles()
  const workspaces = ws.tables?.workspaces ?? {}
  const archived = new Set(ws.global?.archivedSessionIds ?? [])
  const sessions = []
  const seen = new Set()
  for (const [wid, w] of Object.entries(workspaces)) {
    for (const sid of w.sessionIds ?? []) {
      if (seen.has(sid)) continue
      seen.add(sid)
      sessions.push({
        id: sid,
        title: titles[sid] ?? '(无标题)',
        workspaceTitle: w.title ?? '',
        workspacePath: w.path ?? '',
        archived: archived.has(sid),
      })
    }
  }
  // 归档但未计入任何工作区的会话(ungrouped)
  for (const sid of archived) {
    if (!seen.has(sid)) {
      sessions.push({ id: sid, title: titles[sid] ?? '(无标题)', workspaceTitle: '', workspacePath: '', archived: true })
    }
  }
  sessions.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  return sessions
}

async function mutateArchived(change) {
  const ws = await readWorkspace()
  const archived = new Set(ws.global?.archivedSessionIds ?? [])
  change(archived)
  ws.global = { ...ws.global, archivedSessionIds: [...archived] }
  await writeJson(WORKSPACE_JSON, ws)
  return [...archived]
}

async function archiveSession(id) {
  const archived = await mutateArchived(set => set.add(id))
  return { ok: true, archivedSessionIds: archived }
}

async function unarchiveSession(id) {
  const archived = await mutateArchived(set => set.delete(id))
  return { ok: true, archivedSessionIds: archived }
}

async function findSessionDir(id) {
  if (!existsSync(SESSIONS_ROOT)) return undefined
  const projects = await readdir(SESSIONS_ROOT)
  for (const proj of projects) {
    const dir = path.join(SESSIONS_ROOT, proj)
    try {
      if (!(await stat(dir)).isDirectory()) continue
      const entries = await readdir(dir)
      if (entries.includes(id)) return path.join(dir, id)
    } catch {}
  }
  return undefined
}

async function deleteSession(id) {
  const ws = await readWorkspace()
  // 1) 从工作区记账移除
  const workspaces = ws.tables?.workspaces ?? {}
  for (const [wid, w] of Object.entries(workspaces)) {
    if ((w.sessionIds ?? []).includes(id)) {
      w.sessionIds = w.sessionIds.filter(s => s !== id)
      w.updatedAt = new Date().toISOString()
    }
  }
  // 2) 从归档集合移除
  ws.global = { ...ws.global, archivedSessionIds: (ws.global?.archivedSessionIds ?? []).filter(s => s !== id) }
  await writeJson(WORKSPACE_JSON, ws)
  // 3) 删除会话目录
  const dir = await findSessionDir(id)
  if (dir) await rm(dir, { recursive: true, force: true })
  // 4) 从 projcache 移除
  if (existsSync(PROJCACHE_JSON)) {
    try {
      const pc = await readJson(PROJCACHE_JSON)
      if (pc?.tables?.sessions?.[id]) {
        delete pc.tables.sessions[id]
        await writeJson(PROJCACHE_JSON, pc)
      }
    } catch {}
  }
  return { ok: true }
}

// ── IPC ─────────────────────────────────────────────────────
ipcMain.handle('sessions:list', () => listSessions())
ipcMain.handle('sessions:archive', (_e, id) => archiveSession(id))
ipcMain.handle('sessions:unarchive', (_e, id) => unarchiveSession(id))
ipcMain.handle('sessions:delete', (_e, id) => deleteSession(id))
ipcMain.handle('dsh:start', () => startDsh())
ipcMain.handle('dsh:stop', () => stopDsh())
ipcMain.handle('dsh:restart', () => restartDsh())
ipcMain.handle('dsh:open', () => openSessionUi())
ipcMain.handle('skills:list', () => listSkills())
ipcMain.handle('skills:save', (_e, name, desc, body) => saveSkill(name, desc, body))
ipcMain.handle('skills:delete', (_e, name) => deleteSkill(name))
ipcMain.handle('skills:import', () => importSkill())
ipcMain.handle('prompt:get', () => getPrompt())
ipcMain.handle('prompt:set', (_e, persona) => setPrompt(persona))
ipcMain.handle('dsh:status', () => getDshStatus())

// ── Skills ─────────────────────────────────────────────────
function parseSkillFrontmatter(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!m) return {}
  const out = {}
  for (const key of ['name', 'description', 'whenToUse']) {
    const km = m[1].match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))
    if (km) out[key] = km[1].trim()
  }
  return out
}

async function listSkills() {
  if (!existsSync(SKILLS_DIR)) return []
  const skills = []
  for (const e of await readdir(SKILLS_DIR, { withFileTypes: true })) {
    try {
      if (e.isFile() && e.name.endsWith('.md')) {
        const content = await readFile(path.join(SKILLS_DIR, e.name), 'utf8')
        const fm = parseSkillFrontmatter(content)
        skills.push({ name: fm.name ?? e.name.replace(/\.md$/, ''), description: fm.description ?? '', file: e.name, body: content })
      } else if (e.isDirectory()) {
        const skillMd = path.join(SKILLS_DIR, e.name, 'SKILL.md')
        if (existsSync(skillMd)) {
          const content = await readFile(skillMd, 'utf8')
          const fm = parseSkillFrontmatter(content)
          skills.push({ name: fm.name ?? e.name, description: fm.description ?? '', file: `${e.name}/SKILL.md`, body: content })
        }
      }
    } catch {}
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

async function saveSkill(name, description, body) {
  await mkdir(SKILLS_DIR, { recursive: true })
  const safe = name.replace(/[^a-zA-Z0-9-_]/g, '-')
  const content = `---\nname: ${safe}\ndescription: ${JSON.stringify(description)}\n---\n\n${body ?? ''}\n`
  await writeFile(path.join(SKILLS_DIR, `${safe}.md`), content, 'utf8')
  return { ok: true, name: safe }
}

async function deleteSkill(name) {
  const flat = path.join(SKILLS_DIR, `${name}.md`)
  const bundle = path.join(SKILLS_DIR, name)
  if (existsSync(flat)) await rm(flat, { force: true })
  else if (existsSync(bundle)) await rm(bundle, { recursive: true, force: true })
  return { ok: true }
}

function isArchive(src) {
  const l = src.toLowerCase()
  return l.endsWith('.zip') || l.endsWith('.tar.gz') || l.endsWith('.tgz')
}

async function extractArchive(src) {
  await mkdir(SKILLS_DIR, { recursive: true })
  const tmp = path.join(SKILLS_DIR, '.tmp-import')
  await rm(tmp, { recursive: true, force: true })
  await mkdir(tmp, { recursive: true })
  const l = src.toLowerCase()
  if (l.endsWith('.zip')) {
    // Windows 无 unzip,但系统自带的 tar(bsdtar)可直接解 zip
    if (IS_WIN) execSync(`tar -xf "${src}" -C "${tmp}"`, { env: spawnEnv() })
    else execSync(`unzip -o -q "${src}" -d "${tmp}"`, { env: spawnEnv() })
  } else if (l.endsWith('.tar.gz') || l.endsWith('.tgz')) execSync(`tar -xzf "${src}" -C "${tmp}"`, { env: spawnEnv() })
  else throw new Error('不支持的压缩格式')

  const entries = await readdir(tmp)
  const dirs = []; const files = []
  for (const e of entries) {
    const st = await stat(path.join(tmp, e))
    if (st.isDirectory()) dirs.push(e)
    else files.push(e)
  }
  let name = 'imported'
  if (dirs.length === 1 && files.length === 0) {
    // 单个目录 bundle:整体搬入
    name = dirs[0]
    const dest = path.join(SKILLS_DIR, name)
    await rm(dest, { recursive: true, force: true })
    await cp(path.join(tmp, name), dest, { recursive: true })
  } else if (files.includes('SKILL.md')) {
    // 顶层 SKILL.md:读 name 包进目录
    const fm = parseSkillFrontmatter(await readFile(path.join(tmp, 'SKILL.md'), 'utf8'))
    name = (fm.name || 'imported-skill').replace(/[^a-zA-Z0-9-_]/g, '-')
    const dest = path.join(SKILLS_DIR, name)
    await rm(dest, { recursive: true, force: true })
    await cp(tmp, dest, { recursive: true })
  } else {
    // 其余情况:逐个搬入(flat .md 或混合)
    for (const e of entries) {
      const dest = path.join(SKILLS_DIR, e)
      await rm(dest, { recursive: true, force: true })
      await cp(path.join(tmp, e), dest, { recursive: true })
    }
  }
  await rm(tmp, { recursive: true, force: true })
  return { ok: true, name }
}

async function importSkill() {
  const result = await dialog.showOpenDialog({
    title: '选择要导入的 Skill(文件 / 目录 / zip / tar.gz)',
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: 'Skill 包 (zip/tar.gz/md)', extensions: ['zip', 'gz', 'tgz', 'md'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  const src = result.filePaths[0]
  await mkdir(SKILLS_DIR, { recursive: true })
  if (isArchive(src)) {
    return extractArchive(src)
  }
  const st = await stat(src)
  if (st.isDirectory()) {
    const name = path.basename(src)
    const dest = path.join(SKILLS_DIR, name)
    await rm(dest, { recursive: true, force: true })
    await cp(src, dest, { recursive: true })
    return { ok: true, name }
  } else {
    const content = await readFile(src, 'utf8')
    const fm = parseSkillFrontmatter(content)
    const name = (fm.name || path.basename(src, '.md')).replace(/[^a-zA-Z0-9-_]/g, '-')
    await writeFile(path.join(SKILLS_DIR, `${name}.md`), content, 'utf8')
    return { ok: true, name }
  }
}

// ── 提示词(system prompt persona)────────────────────────────
async function getPrompt() {
  if (!existsSync(HOME_PATCH)) return { persona: '' }
  const content = await readFile(HOME_PATCH, 'utf8')
  const m = content.match(/- id: system-prompt\s*\n\s*config:\s*\n\s*persona:\s*\|-?\s*\n([\s\S]*?)(?=\n\s*\w+:|\s*$)/)
  if (!m) return { persona: '' }
  return { persona: m[1].replace(/\n    /g, '\n').replace(/^    /, '').replace(/\n$/, '') }
}

async function setPrompt(persona) {
  const block = `- id: system-prompt\n  config:\n    persona: |-\n${persona.split('\n').map(l => '      ' + l).join('\n')}\n`
  await writeFile(HOME_PATCH, block, 'utf8')
  return { ok: true }
}

// ── 窗口 ────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    title: 'DSH Controller',
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })
  mainWindow = win
  // 点 X 不退出,而是隐藏到菜单栏托盘
  win.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); win.hide() }
  })
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

// 生成实心圆托盘图标(PNG)。macOS 用模板图自动适配,Windows/Linux 按主题深浅切换颜色。
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function makeCirclePng(size, r, g, b) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const radius = size / 2 - 1
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - cx, y - cy)
      const alpha = Math.max(0, Math.min(1, radius - dist + 0.5))
      const i = y * (stride + 1) + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = Math.round(alpha * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function isWindowsTaskbarDark() {
  try {
    const out = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v SystemUsesLightTheme',
      { encoding: 'utf8' }
    )
    const m = out.match(/0x([0-9a-fA-F]+)/)
    if (m) return parseInt(m[1], 16) === 0
  } catch {}
  return nativeTheme.shouldUseDarkColors
}

function makeTrayIcon() {
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromBuffer(makeCirclePng(18, 0, 0, 0))
    icon.setTemplateImage(true)
    return icon
  }
  const dark = process.platform === 'win32' ? isWindowsTaskbarDark() : nativeTheme.shouldUseDarkColors
  const [r, g, b] = dark ? [255, 255, 255] : [26, 26, 28]
  return nativeImage.createFromBuffer(makeCirclePng(18, r, g, b))
}

function createTray() {
  tray = new Tray(makeTrayIcon())
  tray.setToolTip('DSH Controller')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 DSH Controller', click: () => showWindow() },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } },
  ]))
  tray.on('click', () => showWindow())
  // Windows/Linux 任务栏主题切换时更新图标颜色
  if (process.platform !== 'darwin') {
    nativeTheme.on('updated', () => { tray?.setImage(makeTrayIcon()) })
  }
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  app.on('activate', () => showWindow())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (dshProcess) killProcessTree(dshProcess.pid)
})
