import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, lstatSync, renameSync, mkdtempSync, rmSync, cpSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readPackIndex, readPackModule } from './skill-pack-loader.mjs'

/** 获取技能包配置。参数 kind 为 red 或 reverse，返回入口名称、状态文件及说明。 */
export function packConfig(kind) {
  switch (kind) {
    case 'red': return { name: 'redteam-skill', state: '.purge-redteam.json', title: '红队技能包', description: '红队技能分类入口：侦察、漏洞验证、内网、隧道和任务管理；按需读取包内模块。' }
    case 'reverse': return { name: 'reverse-skill', state: '.reverse-skill.json', title: '逆向技能包', description: '逆向技能分类入口：Android/iOS、JavaScript、二进制、固件、CTF 和安全研究；按需读取包内模块。' }
    default: throw new Error('无效技能包类型: ' + kind)
  }
}

/** 计算文件签名。参数 bytes 为字节或字符串，返回 SHA-256。 */
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex') }

/** 读取简单 frontmatter。参数 content 为 Markdown，返回名称和单行描述，不解释正文指令。 */
function metadata(content) {
  const lines = content.replaceAll('\r\n', '\n').split('\n')
  const result = {}
  if (lines[0] !== '---') return result
  for (const line of lines.slice(1)) {
    if (line === '---') break
    const split = line.indexOf(':')
    if (split < 1) continue
    const key = line.slice(0, split).trim()
    let value = line.slice(split + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (value) result[key] = value
  }
  return result
}

/** 分类模块。参数 kind 为包类型、file 为包内路径，返回中文分类名称。 */
function category(kind, file) {
  const parts = file.split('/')
  if (kind === 'red') return ({ recon: '侦察', 'vuln-scan': '漏洞验证', exploit: '利用研究', internal: '内网', tunnel: '隧道', plan: '任务管理', SKILLS: '兼容模块' })[parts[0]] || '其他'
  const groups = [
    ['移动端', ['android', 'apk', 'ios', 'frida', 'unidbg', 'mobile']],
    ['Web 与 JavaScript', ['js-', 'web', 'electron', 'wasm', 'browser']],
    ['固件与协议', ['firmware', 'iot', 'protocol']],
    ['二进制与工具', ['ida', 'ghidra', 'radare', 'binary', 'dotnet', 'unpacking', 'reverse-engineering']],
    ['CTF 与编排', ['ctf', 'competition', 'orchestrator']],
    ['流程与参考', ['ops/', 'field-journal', 'routing', 'docs-']],
  ]
  return groups.find(([, keys]) => keys.some(key => file.toLowerCase().includes(key)))?.[0] || '其他研究模块'
}

/** 扫描包内技能。参数 root 为完整包目录、kind 为包类型，返回稳定模块 ID、正文签名和资源路径。 */
export function scanPackModules(root, kind) {
  packConfig(kind)
  const modules = []
  /** 递归扫描目录。参数 directory 为包内目录，无返回值，跳过依赖、缓存和符号链接。 */
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink() || ['.git', 'node_modules', '__pycache__'].includes(entry.name)) continue
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) { walk(file); continue }
      if (!entry.isFile() || !entry.name.endsWith('.md') || file === path.join(root, 'SKILL.md')) continue
      const bytes = readFileSync(file)
      const meta = metadata(bytes.toString('utf8'))
      if (kind === 'reverse' ? entry.name !== 'SKILL.md' : !meta.name) continue
      const relative = path.relative(root, file).split(path.sep).join('/')
      const id = relative.endsWith('/SKILL.md') ? relative.slice(0, -9) : relative.slice(0, -3)
      modules.push({ id, name: meta.name || path.basename(path.dirname(file)), description: meta.description || '', category: category(kind, relative), file: relative, sha256: hash(bytes), normalizedSha256: hash(bytes.toString('utf8').replaceAll('\r\n', '\n')) })
    }
  }
  walk(root)
  // 相同正文的旧平铺副本只保留分类源，修改过的不同正文仍保留。
  return modules.filter(module => !module.file.startsWith('SKILLS/') || !modules.some(other => !other.file.startsWith('SKILLS/') && other.name === module.name && other.sha256 === module.sha256))
}

/** 引用命令参数。参数 text 为路径或模块 ID，返回适用于当前 POSIX shell 或 PowerShell 的单引号参数。 */
function quote(text) { return "'" + text.replaceAll("'", process.platform === 'win32' ? "''" : "'\\''") + "'" }

/** 生成入口正文。参数为包配置、模块数组和最终根路径，返回仅负责分类导航的 SKILL.md。 */
function entryText(config, modules, root) {
  const lines = [
    '---', 'name: ' + config.name, 'description: ' + config.description, '---', '',
    '# ' + config.title, '', '这是唯一对外入口。下面的模块保留在包内，不作为顶层技能独立登记。', '',
    '## 使用流程', '',
    '1. 按目标和任务选择下列分类及模块，不凭模块名称猜测正文。',
    '2. 用文件读取工具读取模块路径，或执行只读加载命令。必须先读取完整模块正文，再使用该模块。',
    '3. 加载器返回 content、packRoot 和 resourceBase。模块相对路径以 resourceBase.path 为基准；明确指向包根的路径以 packRoot 为基准。',
    '4. 只按需读取引用文档，保留既有授权边界；本入口不会自动执行脚本、安装工具或修改全局配置。',
    '5. 工具或 MCP 缺失时明确报告，不能把“技能正文已加载”当成“工具已可用”。',
    '6. 子模块 ID 不是宿主 skill 工具的顶层名称，不要用 skill(name=子模块ID) 加载它。',
    '', '包根目录: `' + root + '`',
    '', '只读模块清单:', '', '```text', 'node ' + quote(path.join(root, '.dshc-load.mjs')) + ' list', '```',
    '', '读取模块:', '', '```text', 'node ' + quote(path.join(root, '.dshc-load.mjs')) + ' read ' + quote(modules[0].id), '```',
  ]
  for (const name of [...new Set(modules.map(module => module.category))]) {
    lines.push('', '## ' + name, '', '| 模块 ID | 说明 | 包内正文路径 |', '| --- | --- | --- |')
    for (const module of modules.filter(item => item.category === name)) lines.push('| `' + module.id + '` | ' + (module.description || module.name).replaceAll('|', '/').replaceAll('\n', ' ').slice(0, 140) + ' | `' + module.file + '` |')
  }
  return lines.join('\n') + '\n'
}

/** 原子写入生成文件。参数 file 为路径、content 为内容，无返回值，不覆盖并发修改。 */
function atomicWrite(file, content) {
  const original = existsSync(file) ? readFileSync(file) : null
  const temp = mkdtempSync(path.join(path.dirname(file), '.dshc-write-'))
  try {
    const staged = path.join(temp, 'file')
    writeFileSync(staged, content)
    if (original ? !existsSync(file) || !readFileSync(file).equals(original) : existsSync(file)) throw new Error('文件被其他进程修改: ' + file)
    renameSync(staged, file)
  } finally { rmSync(temp, { recursive: true, force: true }) }
}

/** 读取 JSON 状态。参数 file 为路径，返回对象；缺失时返回空对象，损坏时停止操作。 */
function stateAt(file) {
  if (!existsSync(file)) return {}
  const text = readFileSync(file, 'utf8')
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
}

/** 归档旧独立技能。参数为根目录、状态、模块和备份目录，返回迁移及保留项；仅移动状态与正文均匹配的单文件目录。 */
function archiveLegacy(skillsDir, config, state, modules, backup) {
  const candidates = [...new Set([...(state.registered || []), ...(state.skills || []), ...(state.modules || [])])]
  const archived = [], preserved = []
  for (const name of candidates) {
    if (typeof name !== 'string' || !name || name === config.name || name.includes('/') || name.includes('\\') || name.includes(':') || name === '.' || name === '..') continue
    const dir = path.join(skillsDir, name)
    if (!existsSync(dir)) continue
    const entries = lstatSync(dir).isDirectory() && !lstatSync(dir).isSymbolicLink() ? readdirSync(dir) : []
    const file = path.join(dir, 'SKILL.md')
    if (entries.length !== 1 || entries[0] !== 'SKILL.md' || lstatSync(file).isSymbolicLink()) { preserved.push(name); continue }
    const bytes = readFileSync(file)
    if (!modules.some(module => (module.name === name || path.basename(module.id) === name) && (module.sha256 === hash(bytes) || module.normalizedSha256 === hash(bytes.toString('utf8').replaceAll('\r\n', '\n'))))) { preserved.push(name); continue }
    const target = path.join(backup, 'legacy', name)
    mkdirSync(path.dirname(target), { recursive: true })
    try { renameSync(dir, target); archived.push(name) }
    catch { preserved.push(name) }
  }
  return { archived, preserved }
}

/** 刷新入口并迁移旧副本。参数为 home、skillsDir、kind；allowNew 仅供新安装建立所有权。返回模块数及备份，不运行正文。 */
export function refreshPackEntry({ home, skillsDir = path.join(home, 'skills'), kind, allowNew = false }) {
  const config = packConfig(kind)
  const root = path.join(skillsDir, config.name)
  if (!existsSync(root)) return { ok: false, error: '技能包未安装: ' + config.name }
  const modules = scanPackModules(root, kind)
  if (!modules.length) return { ok: false, error: '技能包没有可读取的模块' }
  const stateFile = path.join(skillsDir, config.state)
  const state = stateAt(stateFile)
  const marker = stateAt(path.join(root, '.dshc-index.json'))
  if (!allowNew && !existsSync(stateFile) && !marker.owner) throw new Error('缺少本项目所有权记录，未覆盖入口')
  if (marker.owner && marker.owner !== 'dsh-controller') throw new Error('入口索引不属于本项目')
  if (marker.generated) for (const [name, expected] of Object.entries(marker.generated)) {
    if (!['SKILL.md', '.dshc-load.mjs'].includes(name)) throw new Error('入口所有权记录无效')
    if (!existsSync(path.join(root, name)) || hash(readFileSync(path.join(root, name))) !== expected) throw new Error('生成入口已被修改，未覆盖: ' + name)
  }
  if (!marker.owner && (existsSync(path.join(root, '.dshc-load.mjs')) || existsSync(path.join(root, '.dshc-index.json')))) throw new Error('存在未登记的同名入口文件，未覆盖')
  const backupParent = path.join(home, 'dsh-controller', 'skill-backups')
  mkdirSync(backupParent, { recursive: true })
  const backup = mkdtempSync(path.join(backupParent, config.name + '-'))
  for (const file of [path.join(root, 'SKILL.md'), path.join(root, '.dshc-index.json'), path.join(root, '.dshc-load.mjs'), stateFile]) if (existsSync(file)) cpSync(file, path.join(backup, path.basename(file)))
  const entry = entryText(config, modules, root)
  const loader = readFileSync(fileURLToPath(new URL('./skill-pack-loader.mjs', import.meta.url)))
  atomicWrite(path.join(root, 'SKILL.md'), entry)
  atomicWrite(path.join(root, '.dshc-load.mjs'), loader)
  const index = { owner: 'dsh-controller', schema: 1, name: config.name, kind, modules, generated: { 'SKILL.md': hash(entry), '.dshc-load.mjs': hash(loader) } }
  atomicWrite(path.join(root, '.dshc-index.json'), JSON.stringify(index, null, 2))
  // 完整加载所有正文后再移动旧副本，防止入口指向缺失文件。
  for (const module of modules) readPackModule(root, module.id)
  const migrated = archiveLegacy(skillsDir, config, state, modules, backup)
  atomicWrite(stateFile, JSON.stringify({ ...state, mode: 'entry-only', registered: [], moduleIds: modules.map(module => module.id), migration: { ...migrated, backup }, installedAt: state.installedAt || Date.now() }, null, 2))
  return { ok: true, entry: config.name, count: modules.length, ...migrated, backup }
}

/** 安装完整技能包。参数包含源目录、home、skillsDir 和 kind，返回入口生成结果；旧包整目录保留备份。 */
export function installPackDirectory({ source, home, skillsDir = path.join(home, 'skills'), kind }) {
  const config = packConfig(kind)
  if (!scanPackModules(source, kind).length) return { ok: false, error: '源包没有可读取的模块' }
  const target = path.join(skillsDir, config.name)
  if (existsSync(target) && !existsSync(path.join(skillsDir, config.state)) && !existsSync(path.join(target, '.dshc-index.json'))) return { ok: false, error: '同名目录缺少本项目所有权记录，未覆盖' }
  mkdirSync(skillsDir, { recursive: true })
  const temp = mkdtempSync(path.join(skillsDir, '.dshc-install-'))
  const staged = path.join(temp, 'package')
  let old = null
  let promoted = false
  try {
    cpSync(source, staged, { recursive: true, filter: file => !path.relative(source, file).split(path.sep).some(part => ['.git', 'node_modules', '__pycache__'].includes(part)) && !lstatSync(file).isSymbolicLink() })
    if (existsSync(target)) {
      const parent = path.join(home, 'dsh-controller', 'skill-backups')
      mkdirSync(parent, { recursive: true })
      old = path.join(mkdtempSync(path.join(parent, config.name + '-previous-')), 'package')
      renameSync(target, old)
    }
    renameSync(staged, target)
    promoted = true
    const result = refreshPackEntry({ home, skillsDir, kind, allowNew: true })
    if (!result.ok) throw new Error(result.error)
    return { ...result, previous: old }
  } catch (error) {
    if (old && existsSync(old)) {
      if (existsSync(target)) rmSync(target, { recursive: true, force: true })
      renameSync(old, target)
    } else if (promoted && existsSync(target)) rmSync(target, { recursive: true, force: true })
    return { ok: false, error: error.message }
  } finally { rmSync(temp, { recursive: true, force: true }) }
}

/** 验证包入口与全部模块。参数为包根目录，返回可加载模块数及分类数，失败抛出原因。 */
export function verifyPack(root) {
  const index = readPackIndex(root)
  for (const module of index.modules) readPackModule(root, module.id)
  return { ok: true, entry: index.name, count: index.modules.length, categories: new Set(index.modules.map(module => module.category)).size }
}

/** 归档卸载本项目技能包。参数为 home、skillsDir、kind，返回备份及保留项，不删除未知的顶层技能。 */
export function removePackEntry({ home, skillsDir = path.join(home, 'skills'), kind }) {
  const config = packConfig(kind)
  const root = path.join(skillsDir, config.name)
  const stateFile = path.join(skillsDir, config.state)
  if (!existsSync(root)) return { ok: true, removed: 0 }
  if (!existsSync(stateFile) && !existsSync(path.join(root, '.dshc-index.json'))) return { ok: false, error: '缺少本项目所有权记录，未卸载' }
  const migrated = refreshPackEntry({ home, skillsDir, kind })
  if (!migrated.ok) return migrated
  const target = path.join(migrated.backup, 'package')
  renameSync(root, target)
  if (existsSync(stateFile)) { cpSync(stateFile, path.join(migrated.backup, config.state)); rmSync(stateFile) }
  return { ok: true, removed: 1, backup: migrated.backup, preserved: migrated.preserved, dir: root }
}
