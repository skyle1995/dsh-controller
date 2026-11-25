// 功能操作:破甲 / 技能包 / 插件 / 设置
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, lstatSync, cpSync, renameSync, mkdtempSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync, spawn } from 'node:child_process'
import * as core from './core.mjs'
import { parseGitPluginSource, prepareGitPlugin } from './plugin-source.mjs'
import { packConfig, scanPackModules, installPackDirectory, refreshPackEntry, removePackEntry, verifyPack } from './skill-packs.mjs'

const { PLUGIN_DIR, DSH_HOME, SKILLS_DIR, HUB, RES } = core

// community.js 返回规范化:无 ok 字段但有实际结果视为成功
function jnorm(r) {
  if (!r) return { ok: false, error: '无输出' }
  if (r.ok === false || r.error) return { ok: false, error: r.error || '命令失败' }
  return { ok: true, ...r }
}

// ── 破甲状态 ─────────────────────────────────────────────
export async function purgeStatus() {
  const out = { installed: existsSync(path.join(PLUGIN_DIR, 'package.json')), version: null, cli: existsSync(path.join(PLUGIN_DIR, 'bin', 'community.js')), layout: null, backups: [], apply: null }
  try { out.version = JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8')).version } catch {}
  out.layout = core.detectBase() ? 'app' : (existsSync(RES + '/app.asar') ? 'asar' : 'unknown')
  if (out.cli) {
    const st = await core.cliJson('community.js', ['status'])
    if (st && !st.error) { out.backups = st.backups || []; out.hostVersion = st.compatibility?.host_version; out.level = st.compatibility?.level }
  }
  return out
}

// ── 一键破甲:去隔离 → 解包 → 应用 → 换包改名 → 重启 ─────────
/** 执行安装后的维护流程。参数 restart 控制是否重启，返回逐步结果，失败后停止后续换包。 */
export async function oneClickPurge({ restart = true } = {}) {
  const steps = []
  const push = (name, r) => { steps.push({ name, ...r }) }
  push('移除隔离属性', { ok: core.stripQuarantine() })
  const up = await core.ensureUnpacked()
  push('宿主解包', up)
  if (up.ok === false) return { ok: false, steps, error: '解包失败' }
  push('权限预设', ensurePermissionPreset())
  const ap = await core.cliText('dsh-purge.js', ['--apply'], { stream: true })
  push('应用补丁', { ok: ap.ok, note: ap.ok ? '退出码 0' : '退出码 ' + ap.code })
  if (!ap.ok) return { ok: false, steps }
  if (core.IS_WIN && core.dshRunning()) {
    core.quitDsh()
    const exited = await core.waitDshExit(20000)
    push('退出 dsh(换包前)', { ok: exited, note: exited ? '' : '请从托盘完全退出后重试' })
    if (!exited) return { ok: false, steps, error: 'dsh 尚未退出，未执行换包。' }
  }
  const rn = core.renameAsarToBak()
  push('换包改名', rn)
  if (!rn.ok) return { ok: false, steps, error: rn.error }
  if (restart) { const rs = await core.restartDsh(); push('重启 dsh', rs) }
  return { ok: steps.every(s => s.ok !== false), steps }
}

export async function purgeApply() {
  const up = await core.ensureUnpacked()
  if (!up.ok) return { ok: false, error: '解包失败:' + (up.error || '') }
  const r = await core.cliText('dsh-purge.js', ['--apply'], { stream: true })
  return { ok: r.ok, error: r.ok ? '' : '退出码 ' + r.code, output: r.output }
}
export async function purgeRevert() { const r = await core.cliText('dsh-purge.js', ['--revert'], { stream: true }); return { ok: r.ok, output: r.output } }
export async function purgeReseal() { const r = await core.cliText('dsh-purge.js', ['--reseal'], { stream: true }); return { ok: r.ok, output: r.output } }
export async function purgeBackup() { return jnorm(await core.cliJson('community.js', ['backup'])) }
export async function purgeRollback(id) { return jnorm(await core.cliJson('community.js', ['rollback', String(id)])) }
export async function purgePrune() { return jnorm(await core.cliJson('community.js', ['prune'])) }
export async function purgeSelfcheck() {
  const r = await core.run(process.execPath, [path.join(PLUGIN_DIR, 'bin', 'community.js'), 'selfcheck', '--json'], { env: core.purgeEnv() })
  const s = r.output, a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)) } catch {} }
  return { ok: false, error: s.slice(-300) }
}

// ── 红队技能包(仓库分类目录 → 统一入口)───────────────────────
/** 从完整源包安装入口。参数 kind 为包类型，返回安装、版本和迁移结果；离线回退本地完整资源。 */
async function installRepositoryPack(kind) {
  const config = packConfig(kind)
  const temp = mkdtempSync(path.join(os.tmpdir(), 'dshc-skill-pack-'))
  try {
    const repo = path.join(temp, 'repo')
    const cloned = await core.cloneRepository(repo, temp)
    let source = cloned.ok ? path.join(repo, 'resources', config.name) : path.join(core.REPO_ROOT, 'resources', config.name)
    let origin = cloned.ok ? 'repo' : 'local'
    if (!existsSync(source) && kind === 'red') { source = path.join(PLUGIN_DIR, 'skills', 'redteam'); origin = 'plugin' }
    if (!existsSync(source)) return { ok: false, error: '完整技能源不可用: ' + cloned.output }
    const r = installPackDirectory({ source, home: DSH_HOME, skillsDir: SKILLS_DIR, kind })
    if (!r.ok) return r
    let version = null
    try { version = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8')).version } catch {}
    const file = path.join(SKILLS_DIR, config.state)
    const state = JSON.parse(readFileSync(file, 'utf8'))
    const names = scanPackModules(path.join(SKILLS_DIR, config.name), kind).map(module => module.name)
    writeFileSync(file, JSON.stringify({ ...state, version, source: origin, ...(kind === 'red' ? { skills: names } : { modules: names }), installedAt: Date.now() }, null, 2))
    return { ...r, version, source: origin, modules: r.count, registered: 0 }
  } catch (error) { return { ok: false, error: error.message } }
  finally { rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
}

/** 安装完整红队包。无参数，返回版本、模块数及安全迁移结果，只登记包入口。 */
export async function installRedteam() { return installRepositoryPack('red') }

// ── 逆向技能包(仓库子目录 clone → 复制)────────────────────
/** 安装逆向技能包。无参数，返回版本及模块数量，所有退出路径清理临时克隆目录。 */
export async function installReverse() {
  return installRepositoryPack('reverse')
}

// ── 插件商店 ─────────────────────────────────────────────
export async function pluginsInstalled() {
  const f = path.join(DSH_HOME, 'profiles', 'desktop', 'package.json')
  try {
    const text = readFileSync(f, 'utf8')
    const pkg = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    const deps = pkg.dependencies || {}
    return Object.keys(deps).map(name => {
      let version = '?'
      try { version = JSON.parse(readFileSync(path.join(DSH_HOME, 'profiles', 'desktop', 'node_modules', name, 'package.json'), 'utf8')).version } catch {}
      return { name, version, spec: deps[name] }
    })
  } catch { return [] }
}

/** 比较版本号（只比较数字段）。参数 a、b 为版本字符串，返回 a 是否比 b 新。 */
export function versionIsNewer(a, b) {
  const split = (v) => {
    const [core, ...pre] = String(v || '').split('-')
    return { nums: core.split('.').map((x) => Number(x) || 0), pre: pre.join('-') }
  }
  const x = split(a), y = split(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i += 1) {
    if ((x.nums[i] || 0) !== (y.nums[i] || 0)) return (x.nums[i] || 0) > (y.nums[i] || 0)
  }
  // 数字段相同：正式版比同号预发布版新；同为预发布时按字典序兜底。
  if (x.pre === y.pre) return false
  if (!x.pre) return true
  if (!y.pre) return false
  return x.pre > y.pre
}

/** 校验 profile 清单并去掉 UTF-8 BOM。参数 file 为清单路径，返回修复状态或错误，保留配置内容。 */
export function stripProfileBom(file = path.join(DSH_HOME, 'profiles', 'desktop', 'package.json')) {
  try {
    const b = readFileSync(file)
    const hasBom = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf
    const content = hasBom ? b.subarray(3) : b
    const manifest = JSON.parse(content.toString('utf8'))
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('profile 清单必须是 JSON 对象')
    if (hasBom) {
      const backup = file + '.bom-bak'
      if (!existsSync(backup)) writeFileSync(backup, b, { flag: 'wx', mode: 0o600 })
      const temp = mkdtempSync(path.join(path.dirname(file), '.dshc-bom-'))
      try {
        const stage = path.join(temp, 'package.json')
        writeFileSync(stage, content, { mode: statSync(file).mode & 0o777 })
        if (!readFileSync(file).equals(b)) throw new Error('清单被其他进程修改，未覆盖')
        renameSync(stage, file)
      } finally { rmSync(temp, { recursive: true, force: true }) }
    }
    return { ok: true, repaired: hasBom }
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: true, missing: true }
    return { ok: false, error: 'profile 清单校验失败: ' + e.message }
  }
}

/** 执行会修改 profile 的 CLI。参数 args 为命令参数，返回执行和前后清单校验结果。 */
async function runProfileCommand(args) {
  if (core.IS_WIN && core.dshRunning()) {
    const error = '请保存会话并从托盘完全退出 DeepSeek 后再安装或修改插件，避免 Windows 文件占用。'
    return { ok: false, output: error, error }
  }
  const before = stripProfileBom()
  if (!before.ok) return { ok: false, output: before.error, error: before.error }
  const r = await core.runDsh(args, { stream: true })
  const after = stripProfileBom()
  if (!after.ok) return { ...r, ok: false, output: r.output + '\n' + after.error, error: after.error }
  return r
}

/** 检查本地插件来源。参数 file 为 profile 清单路径，返回缺失或位于 node_modules 内的来源问题数组。 */
export function localPluginSourceIssues(file = path.join(DSH_HOME, 'profiles', 'desktop', 'package.json')) {
  try {
    const text = readFileSync(file, 'utf8')
    const pkg = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    const issues = []
    for (const [name, spec] of Object.entries(pkg.dependencies || {})) {
      if (typeof spec !== 'string' || (!spec.startsWith('file:') && !spec.startsWith('link:'))) continue
      const source = path.resolve(path.dirname(file), spec.slice(5))
      const managed = source.split(path.sep).some(part => part.toLowerCase() === 'node_modules')
      if (managed || !existsSync(source)) issues.push({ name, spec, source, reason: managed ? '安装来源位于 node_modules，可能被包管理器清理' : '本地安装来源不存在' })
    }
    return issues
  } catch { return [] }
}

/** 生成插件失败说明。参数 output 为命令输出，返回可操作的错误提示，不自动删改其他插件。 */
function pluginFailureHint(output) {
  if (String(output).includes('ERR_PNPM_IGNORED_BUILDS')) return 'pnpm 跳过了依赖的构建脚本（Windows 常见）。如果目标插件已出现在已安装列表，可忽略这条报错；否则在 profile 目录执行 pnpm approve-builds 后重试。' + '\n' + String(output).slice(-300)
  if (String(output).includes('ERR_PNPM_EPERM')) return 'Windows 拒绝写入插件文件。请保存会话并从托盘完全退出 DeepSeek 后重试；若仍失败，再检查权限或安全软件。' + '\n' + String(output).slice(-300)
  if (String(output).includes('ENOENT')) {
    const issues = localPluginSourceIssues()
    if (issues.length) return issues.map(i => i.name + ': ' + i.reason + '；可运行 dshc plugins repair ' + i.name).join('\n')
    const firstError = String(output).split('\n').find(line => line.includes('ENOENT'))
    return '包管理器找不到文件或安装来源: ' + firstError + '。这不是构建授权错误，不要根据附加提示修改 allowBuilds。'
  }
  return String(output || '').slice(-600) || '插件命令失败'
}

/** 将失效的本地插件重新登记为持久包。参数 name 为已安装包名，返回归档、配置备份及执行结果，版本不变。 */
export async function repairLocalPlugin(name) {
  if (typeof name !== 'string') return { ok: false, error: '无效插件名称' }
  const parts = String(name || '').split('/')
  const valid = parts.every(p => p && p !== '.' && p !== '..' && !p.includes('\\') && !p.includes(':'))
  if (!valid || (name.startsWith('@') ? parts.length !== 2 : parts.length !== 1)) return { ok: false, error: '无效插件名称' }
  if (core.IS_WIN && core.dshRunning()) return { ok: false, error: '请保存会话并从托盘完全退出 DeepSeek 后再修复插件来源。' }
  const issue = localPluginSourceIssues().find(i => i.name === name)
  if (!issue) return { ok: false, error: '该插件没有需要修复的本地来源' }
  const installed = path.join(DSH_HOME, 'profiles', 'desktop', 'node_modules', name)
  const pkgDir = path.join(DSH_HOME, 'dsh-controller', 'pkgs')
  const temp = mkdtempSync(path.join(os.tmpdir(), 'dshc-repair-'))
  try {
    const pkg = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'))
    if (pkg.name !== name || !Array.isArray(pkg.files) || !pkg.files.length || typeof pkg.version !== 'string' || pkg.version.includes('/') || pkg.version.includes('\\')) throw new Error('缺少可靠的包名、版本或发布文件清单，未执行修复')
    const stage = path.join(temp, 'package')
    mkdirSync(stage)
    cpSync(path.join(installed, 'package.json'), path.join(stage, 'package.json'))
    for (const entry of pkg.files) {
      if (typeof entry !== 'string' || entry.includes('*') || entry.includes('!') || path.isAbsolute(entry)) throw new Error('发布清单不是明确文件路径，未执行修复: ' + entry)
      const src = path.resolve(installed, entry)
      const relative = path.relative(installed, src)
      if (!relative || relative.startsWith('..') || relative.split(path.sep).includes('node_modules')) throw new Error('发布清单路径不安全: ' + entry)
      const dest = path.join(stage, relative)
      mkdirSync(path.dirname(dest), { recursive: true })
      cpSync(src, dest, { recursive: true, dereference: false, filter: source => {
        if (path.relative(installed, source).split(path.sep).includes('node_modules')) return false
        if (lstatSync(source).isSymbolicLink()) throw new Error('发布文件包含符号链接，未执行修复: ' + entry)
        return true
      } })
    }
    mkdirSync(pkgDir, { recursive: true })
    const stamp = Date.now()
    const tarball = path.join(pkgDir, name.replaceAll('/', '-') + '-' + pkg.version + '-recovered-' + stamp + '.tgz')
    const packed = await core.run('tar', ['-czf', tarball, '-C', temp, 'package'])
    if (!packed.ok) return { ok: false, error: '归档失败: ' + packed.output }
    const file = path.join(DSH_HOME, 'profiles', 'desktop', 'package.json')
    const backup = path.join(pkgDir, 'profile-before-repair-' + stamp + '.json')
    const original = readFileSync(file)
    writeFileSync(backup, original, { flag: 'wx', mode: 0o600 })
    const text = original.toString('utf8')
    const oldSpec = JSON.stringify(issue.spec)
    const start = text.indexOf(oldSpec)
    if (start < 0 || text.lastIndexOf(oldSpec) !== start) throw new Error('清单中的来源不是唯一值，未执行自动替换')
    const prepared = text.slice(0, start) + JSON.stringify('file:' + tarball.split(path.sep).join('/')) + text.slice(start + oldSpec.length)
    const swap = mkdtempSync(path.join(path.dirname(file), '.dshc-source-'))
    try {
      const staged = path.join(swap, 'package.json')
      writeFileSync(staged, prepared, { mode: statSync(file).mode & 0o777 })
      if (!readFileSync(file).equals(original)) throw new Error('profile 被其他进程修改，未覆盖')
      renameSync(staged, file)
    } finally { rmSync(swap, { recursive: true, force: true }) }
    const r = await runProfileCommand(['plugin', '--profile', 'desktop', 'add', tarball])
    const remaining = localPluginSourceIssues().some(i => i.name === name)
    return { ok: r.ok && !remaining, version: pkg.version, tarball, backup, output: r.output, error: r.ok ? (remaining ? '命令完成但失效来源仍然存在，请保留备份并检查 profile' : '') : pluginFailureHint(r.output) }
  } catch (e) { return { ok: false, error: e.message } }
  finally { rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
}

/** 安装插件。参数 spec 为包名、路径或来源，返回成功状态、输出及失败提示。 */
export async function pluginInstall(spec) {
  if (typeof spec !== 'string' || !spec.trim() || spec.startsWith('-')) return { ok: false, output: '', hint: '请输入有效插件来源。' }
  let prepared = null
  try {
    const source = parseGitPluginSource(spec)
    if (source) {
      if (core.IS_WIN && core.dshRunning()) return { ok: false, output: '', hint: '请保存会话并从托盘完全退出 DeepSeek 后再安装插件。' }
      prepared = await prepareGitPlugin(source)
      if (!prepared.ok) return { ok: false, output: '', hint: prepared.error }
      spec = prepared.tarball
    }
  } catch (e) { return { ok: false, output: '', hint: e.message } }
  const r = await runProfileCommand(['plugin', '--profile', 'desktop', 'add', spec])
  const out = String(r.output || '')
  const after = await pluginsInstalled()
  const installed = prepared
    ? after.find(p => p.name === prepared.name && (!prepared.version || p.version === prepared.version))
    : null
  // pnpm 11 会因为被忽略的构建脚本返回非 0，但依赖其实已经写入 profile；以清单结果为准。
  const ok = r.ok || Boolean(installed)
  let hint = ''
  if (!r.ok && installed) {
    hint = '命令退出码非 0，但 ' + installed.name + ' v' + installed.version + ' 已写入 profile，按安装成功处理：' + (r.error || out.slice(-200))
  } else if (!r.ok) {
    switch (true) {
      case out.includes('ENOENT') || out.includes('ERR_PNPM_EPERM'): hint = pluginFailureHint(out); break
      case out.includes('Repository not found') || out.includes('未找到'): hint = '仓库不可达:确认托管源密钥已配置且仓库名正确'; break
      case out.includes('ERR_PNPM_GIT_RESOLVE_FAILED'): hint = 'git 依赖解析失败:检查 spec 与网络/密钥'; break
      case out.includes('ERR_PNPM_IGNORED_BUILDS'): hint = pluginFailureHint(out); break
      case out.includes('allowBuilds'): hint = '请仅按 pnpm 实际输出的精确包键确认构建授权；未给出包键时，不修改 allowBuilds'; break
      default: hint = r.error || pluginFailureHint(out)
    }
  } else if (prepared && !installed) {
    hint = '命令返回成功，但 profile 清单里没有 ' + prepared.name + '，请检查安装来源。'
    return { ok: false, output: r.output, hint, tarball: prepared.tarball, version: prepared.version, commit: prepared.commit }
  }
  return { ok, output: r.output, hint, ...(prepared ? { tarball: prepared.tarball, version: prepared.version, commit: prepared.commit } : {}) }
}
/** 从 profile 的 bundles 中移除插件名，避免卸载后残留导致下次启动找不到 bundle。 */
function stripProfileBundle(name) {
  const f = path.join(DSH_HOME, 'profiles', 'desktop', 'package.json')
  try {
    const text = readFileSync(f, 'utf8')
    const pkg = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    const bundles = pkg?.dsh?.profile?.bundles
    if (!Array.isArray(bundles) || !bundles.includes(name)) return false
    pkg.dsh.profile.bundles = bundles.filter(x => x !== name)
    writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n')
    return true
  } catch { return false }
}

/** 只执行官方 remove，不处理破甲插件的宿主还原；返回命令结果并核对清单。 */
async function pluginRemoveOnly(name) {
  if (typeof name !== 'string' || !name.trim() || name.startsWith('-')) return { ok: false, output: '请输入有效插件名称。' }
  const r = await runProfileCommand(['plugin', '--profile', 'desktop', 'remove', name])
  const still = (await pluginsInstalled()).some(p => p.name === name)
  if (!still) stripProfileBundle(name)
  const ok = r.ok && !still
  const hint = !r.ok
    ? (r.error || String(r.output || '').slice(-300))
    : (still ? '命令返回成功，但 profile 清单里仍存在 ' + name : '')
  return { ok, output: r.output, hint }
}
/** 卸载指定插件。参数 name 为完整包名，返回执行结果并校验清单；破甲插件走完整宿主还原。 */
export async function pluginRemove(name) {
  if (typeof name !== 'string' || !name.trim() || name.startsWith('-')) return { ok: false, output: '请输入有效插件名称。' }
  if (name === 'dsh-purge-self') {
    const r = await uninstallPurge()
    return { ok: r.ok, output: r.output || '', hint: r.ok ? '' : (r.error || String(r.output || '').slice(-300)) }
  }
  return pluginRemoveOnly(name)
}

// ── 插件安装(仓库 tarball → dsh plugin add)───────────────────
/** 下载并安装当前仓库插件。无参数，返回版本和持久包路径，清理临时目录但保留旧包引用。 */
export async function installLatest() {
  if (core.IS_WIN && core.dshRunning()) return { ok: false, error: '请保存会话并从托盘完全退出 DeepSeek 后再一键安装，避免 Windows 文件占用。' }
  // 注意:安装 spec 必须是**持久路径**。用 /tmp 打包后删除会让 profile 的 package.json
  // 留下 file:/var/folders/… 的死链,之后任何插件安装/更新都会因解析该依赖失败。
  const pkgDir = path.join(core.DSH_HOME, 'dsh-controller', 'pkgs')
  mkdirSync(pkgDir, { recursive: true })
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dshc-purge-'))
  try {
  const repo = path.join(tmp, 'repo')
  let r = await core.cloneRepository(repo, tmp)
  if (!r.ok) return { ok: false, error: 'clone 失败:' + (r.output || '').slice(-200) }
  const src = path.join(repo, 'dsh-purge-self')
  if (!existsSync(path.join(src, 'package.json'))) return { ok: false, error: '仓库缺少 dsh-purge-self/' }
  let ver = null
  try { ver = JSON.parse(readFileSync(path.join(src, 'package.json'), 'utf8')).version } catch {}
  mkdirSync(path.join(tmp, 'package'), { recursive: true })
  cpSync(src, path.join(tmp, 'package'), { recursive: true })
  rmSync(path.join(tmp, 'package', '.git'), { recursive: true, force: true })
  // 每次安装用独立 tarball 名：覆盖同名旧包会让 pnpm 的锁文件完整性校验对不上，
  // 重新安装/回滚时容易报 tarball integrity 错误。旧包保留，profile 或备份可能仍在引用。
  const tgz = path.join(pkgDir, 'dsh-purge-self-' + (ver || 'latest') + '-' + Date.now() + '.tgz')
  r = await core.run('tar', ['-czf', tgz, '-C', tmp, 'package'], { env: { COPYFILE_DISABLE: '1' } })
  if (!r.ok) return { ok: false, error: 'tar 失败' }
  r = await runProfileCommand(['plugin', '--profile', 'desktop', 'add', tgz])
  let installed = null
  try { installed = JSON.parse(readFileSync(path.join(core.PLUGIN_DIR, 'package.json'), 'utf8')).version } catch {}
  const recorded = (await pluginsInstalled()).find(p => p.name === 'dsh-purge-self')
  const ok = r.ok || Boolean(recorded)
  return {
    ok,
    version: installed || ver,
    tarball: tgz,
    output: r.output,
    error: ok ? '' : pluginFailureHint(r.output),
    warning: !r.ok && recorded ? '命令退出码非 0，但插件已写入 profile，按安装成功处理。' : '',
  }
  } finally { rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
}

// ── 卸载(退出 dsh → CLI --uninstall;EPERM 回退管理员授权)────────
/** 卸载插件及其宿主修改。无参数，返回卸载状态；Windows 等待完全退出，不调用 macOS 工具。 */
export async function uninstallPurge() {
  core.quitDsh()
  if (!await core.waitDshExit(15000)) return { ok: false, error: '请从托盘完全退出 dsh 后再卸载。' }
  const script = path.join(core.PLUGIN_DIR, 'bin', 'dsh-purge.js')
  let r = await core.run(process.execPath, [script, '--uninstall'], { env: core.purgeEnv(), stream: true })
  let via = 'user'
  if (!r.ok) {
    if (process.platform !== 'darwin') return { ok: false, error: '卸载失败，请在有安装目录写权限的终端重试。', output: r.output }
    // 改名类操作被 App 管理拒绝 → 管理员授权重跑整条卸载
    try {
      const sh = path.join(os.tmpdir(), 'dshc-admin-uninstall.sh')
      writeFileSync(sh, '#!/bin/sh\nexport DSH_SURFACE=desktop DSH_HOME="' + core.DSH_HOME + '" DSH_PROFILE=desktop\n'
        + 'export PURGE_PROFILE_DIR="' + path.join(core.DSH_HOME, 'profiles', 'desktop') + '"\n'
        + 'export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"\n'
        + '"' + process.execPath + '" "' + script + '" --uninstall\n', 'utf8')
      execSync('osascript -e ' + JSON.stringify('do shell script "/bin/sh ' + sh + '" with administrator privileges'), { stdio: 'ignore', timeout: 180000 })
      r = { ok: true, output: '（管理员授权执行）' }
      via = 'admin'
    } catch (e) { return { ok: false, error: '卸载失败:' + (e.message || e) + '（可尝试 sudo 重跑）' } }
  }
  // --uninstall 已经会从 profile 摘掉依赖并删除包目录；只有残留时才再调用官方 remove。
  const still = (await pluginsInstalled()).some(p => p.name === 'dsh-purge-self')
  const removed = still ? await pluginRemoveOnly('dsh-purge-self') : { ok: true, output: '插件依赖已由 --uninstall 清理' }
  return {
    ok: removed.ok,
    via,
    output: r.output + '\n' + removed.output,
    error: removed.ok ? '' : (removed.hint || '卸载未完成，请检查插件目录权限'),
  }
}

// ── 运行开关(boost / retry / rewind / inject)─────────────────
export function readTuning() {
  try { return JSON.parse(readFileSync(path.join(core.DSH_HOME, 'dsh-purge', 'tuning.json'), 'utf8')) } catch { return {} }
}
export async function setTuning(key, value) {
  const allowed = { boost: ['on', 'off'], retry: ['on', 'off'], rewind: ['on', 'off'], inject: ['head', 'tail', 'both'] }
  if (!allowed[key]) return { ok: false, error: '未知开关 ' + key }
  if (!allowed[key].includes(value)) return { ok: false, error: key + ' 只接受 ' + allowed[key].join('/') }
  const r = await core.cliJson('community.js', [key, value])
  return { ok: r.ok !== false, result: r, tuning: readTuning() }
}

// ── 授权管理(演练台 drill grant)────────────────────────────
const DRILL_FILE = path.join(core.DSH_HOME, 'dsh-purge', 'drill-grant.json')
export function drillState() { try { return JSON.parse(readFileSync(DRILL_FILE, 'utf8')) } catch { return null } }
export function grantDrill(on) {
  mkdirSync(path.dirname(DRILL_FILE), { recursive: true })
  writeFileSync(DRILL_FILE, JSON.stringify({ granted: !!on, at: new Date().toISOString() }, null, 2) + '\n', 'utf8')
  return { ok: true, granted: !!on }
}

// ── 域名拦截 region gate(公网/银行域名拦截)──────────────────
const NET_SCOPE = path.join(core.PLUGIN_DIR, 'lib', 'net-scope.js')
const GATE_TAG = '[dsh-controller] region gate disabled'
const GATE_ANCHOR = 'export function installRegionGate(ctx) {\n  if (!ctx || typeof ctx.on !== "function") return;'
export function regionGateState() {
  try {
    const t = readFileSync(NET_SCOPE, 'utf8')
    const disabled = t.includes('region gate disabled')
    const sourceLevel = t.includes('[self] region gate disabled at source')
    return { available: true, disabled, sourceLevel }
  } catch { return { available: false } }
}
export function setRegionGate(disabled) {
  try {
    const t = readFileSync(NET_SCOPE, 'utf8')
    const bak = NET_SCOPE + '.controller-bak'
    if (disabled) {
      if (t.includes('region gate disabled')) return { ok: true, already: true }
      if (!t.includes(GATE_ANCHOR.replace(/\\n/g, '\n'))) return { ok: false, error: '未找到 region gate 锚点(插件版本可能已变)' }
      if (!existsSync(bak)) writeFileSync(bak, t, 'utf8')
      const anchor = GATE_ANCHOR.replace(/\\n/g, '\n')
      const patched = t.replace(anchor, anchor + '\n  return; // ' + GATE_TAG)
      writeFileSync(NET_SCOPE + '.tmp', patched, 'utf8')
      renameSync(NET_SCOPE + '.tmp', NET_SCOPE)
      return { ok: true, disabled: true }
    }
    // 恢复:移除我们插入的 return 行;源码级禁用无法恢复
    if (!t.includes(GATE_TAG)) {
      if (t.includes('[self] region gate disabled at source')) return { ok: false, error: '插件源码级已禁用该拦截(cli 无法恢复)' }
      return { ok: true, already: true }
    }
    const cleaned = t.replace('\n  return; // ' + GATE_TAG, '')
    writeFileSync(NET_SCOPE + '.tmp', cleaned, 'utf8')
    renameSync(NET_SCOPE + '.tmp', NET_SCOPE)
    try { rmSync(bak, { force: true }) } catch {}
    return { ok: true, disabled: false }
  } catch (e) { return { ok: false, error: e.message } }
}

// ── 在线插件目录(托管源 packages/)──────────────────────────
const PLUGINS_CACHE = path.join(DSH_HOME, 'dsh-controller', 'cache', 'dsh-plugins')
let pluginsCacheAt = 0

/** 用 git 浅克隆读取在线目录。GitHub API 匿名额度只有 60 次/小时，目录接口很容易 403。 */
async function pluginsCatalogFromGit() {
  const dir = PLUGINS_CACHE
  const gitDir = path.join(dir, '.git')
  if (!existsSync(gitDir) || Date.now() - pluginsCacheAt > 60_000) {
    if (!existsSync(gitDir)) {
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(path.dirname(dir), { recursive: true })
      const clone = await core.run('git', ['clone', '--depth', '1', '--branch', 'main', core.PLUGINS_HUB.git, dir], { timeout: 120000 })
      if (!clone.ok && !existsSync(gitDir)) throw new Error(clone.output || 'git clone 失败')
    } else {
      const fetch = await core.run('git', ['-C', dir, 'fetch', '--depth', '1', 'origin', 'main'], { timeout: 120000 })
      if (fetch.ok) await core.run('git', ['-C', dir, 'reset', '--hard', 'FETCH_HEAD'], { timeout: 60000 })
    }
    pluginsCacheAt = Date.now()
  }
  const packages = path.join(dir, 'packages')
  const out = []
  for (const entry of readdirSync(packages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    try {
      const pkg = JSON.parse(readFileSync(path.join(packages, entry.name, 'package.json'), 'utf8'))
      out.push({ name: pkg.name, version: pkg.version || '', description: pkg.description || '', spec: core.PLUGINS_HUB.git + '#main&path:packages/' + entry.name })
    } catch {}
  }
  return out
}

/** 读取在线插件目录，返回条目与失败原因；优先 git（不占 API 额度），失败再退回 API。 */
export async function pluginsCatalogDetailed() {
  const errors = []
  try {
    const items = await pluginsCatalogFromGit()
    if (items.length) return { ok: true, items, source: 'git' }
    errors.push('git 目录里没有 packages')
  } catch (e) { errors.push('git: ' + e.message) }
  try {
    const top = await core.hubJson(core.PLUGINS_HUB.api + '/contents/packages?ref=main')
    const items = []
    for (const d of (Array.isArray(top) ? top : [])) {
      if (d?.type !== 'dir') continue
      try {
        const meta = await core.hubJson(core.PLUGINS_HUB.api + '/contents/' + d.path + '/package.json?ref=main')
        const pkg = JSON.parse(Buffer.from(meta.content, 'base64').toString())
        items.push({ name: pkg.name, version: pkg.version || '', description: pkg.description || '', spec: core.PLUGINS_HUB.git + '#main&path:' + d.path })
      } catch {}
    }
    if (items.length) return { ok: true, items, source: 'api' }
    errors.push('API 返回空目录')
  } catch (e) { errors.push('API: ' + e.message) }
  return { ok: false, items: [], error: errors.join('；') }
}

export async function pluginsCatalog() {
  return (await pluginsCatalogDetailed()).items
}

// ── 备份详情 / 删除 / 占用 ────────────────────────────────
export function backupsDir() { return path.join(core.DSH_HOME, 'dsh-purge-community', 'backups') }
function treeSize(dir) {
  let total = 0
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) total += treeSize(p)
      else { try { total += statSync(p).size } catch {} }
    }
  } catch {}
  return total
}
export function backupDetail(id) {
  const dir = path.join(backupsDir(), String(id))
  if (!existsSync(dir)) return { ok: false, error: '备份不存在' }
  let m = {}
  try { m = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) } catch {}
  return { ok: true, id, dir, bytes: treeSize(dir), manifest: m }
}
export function deleteBackup(id) {
  if (!/^[\w.\-:]+$/.test(String(id))) return { ok: false, error: '非法备份 ID' }
  const dir = path.join(backupsDir(), String(id))
  if (!existsSync(dir)) return { ok: false, error: '备份不存在' }
  try { rmSync(dir, { recursive: true, force: true }); return { ok: true } } catch (e) { return { ok: false, error: e.message } }
}
export function backupUsage() {
  const dir = backupsDir()
  if (!existsSync(dir)) return { ok: true, count: 0, bytes: 0 }
  let count = 0, bytes = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) { count++; bytes += treeSize(path.join(dir, e.name)) } }
  return { ok: true, count, bytes }
}
export function fmtSize(n) { return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(0) + ' KB' : n + ' B' }

// ── 插件:更新全部 / 版本豁免 / 重启 ───────────────────────
/** 更新单个插件。参数为已安装插件及在线目录命中的来源，返回结果；破甲插件跟随控制器仓库重新打包。 */
export async function pluginUpdate(p, catalogSpec = '') {
  // 破甲插件不在 dsh-plugins 目录里，安装来源是持久 tarball；原样重装不会前进版本。
  // 它随 dsh-controller 单仓发布，这里直接走 installLatest：检出 main → 整目录打包 → dsh plugin add。
  if (p?.name === 'dsh-purge-self') {
    const r = await installLatest()
    return { ok: r.ok, hint: r.ok ? '' : (r.error || ''), version: r.version, tarball: r.tarball }
  }
  const spec = catalogSpec || p?.spec
  if (!spec) return { ok: false, error: '无安装来源' }
  const r = await pluginInstall(spec)
  return { ok: r.ok, hint: r.hint || '', version: r.version, tarball: r.tarball }
}

export async function pluginsUpdateAll() {
  const inst = await pluginsInstalled()
  let cat = []
  try { cat = await pluginsCatalog() } catch {}
  const byName = new Map(cat.map(p => [p.name, p]))
  const results = []
  for (const p of inst) {
    const r = await pluginUpdate(p, byName.get(p.name)?.spec || '')
    results.push({ name: p.name, ...r })
  }
  return { ok: results.every(x => x.ok), results }
}
export function pluginExemptions() {
  try { return JSON.parse(readFileSync(path.join(core.DSH_HOME, 'profiles', 'desktop', 'compatibility.json'), 'utf8')) } catch { return {} }
}
/** 设置插件版本豁免。参数为完整包版本、宿主版本及启用标志，返回执行结果与现有规则。 */
export async function setPluginExemption(nameWithVersion, dshVersion, enable) {
  if (!nameWithVersion || !dshVersion || nameWithVersion.startsWith('-') || dshVersion.startsWith('-')) return { ok: false, output: '请提供插件及 dsh 版本。' }
  const args = ['plugin', '--profile', 'desktop', enable ? 'allow-version' : 'revoke-version', nameWithVersion, '--dsh-version', dshVersion]
  if (enable) args.push('--accept-risk')
  const r = await runProfileCommand(args)
  return { ok: r.ok, output: r.output, exemptions: pluginExemptions() }
}
export async function restartDsh() { return core.restartDsh() }

// ── 日志查看 / 清空 ───────────────────────────────────────
export const auditFile = () => path.join(core.DSH_HOME, 'dsh-purge-community', 'audit.jsonl')
export const handoffFile = () => path.join(os.tmpdir(), 'dsh-controller-handoff.log')
export function tailFile(file, n = 40) {
  try {
    const t = readFileSync(file, 'utf8').trimEnd().split('\n')
    return { ok: true, total: t.length, lines: t.slice(-n) }
  } catch { return { ok: false, total: 0, lines: [] } }
}
export function clearAudit() {
  try { rmSync(auditFile(), { force: true }); return { ok: true } } catch (e) { return { ok: false, error: e.message } }
}
export function clearAllLogs() {
  let n = 0
  for (const f of [auditFile(), handoffFile(), path.join(os.tmpdir(), 'dsh-handoff-worker.log'), path.join(os.tmpdir(), 'dsh-rename-worker.log')] ) {
    try { if (existsSync(f)) { rmSync(f, { force: true }); n++ } } catch {}
  }
  return { ok: true, removed: n }
}

export async function ensureUnpackedPre() { return core.ensureUnpacked() }

// ── 权限预设(danger-never 默认,免审批 + 完全访问)───────────
export function ensurePermissionPreset() {
  const file = path.join(core.DSH_HOME, 'profiles', 'desktop', 'cordis.patch.yml')
  let text = ''
  try { text = readFileSync(file, 'utf8') } catch { text = '' }
  if (text.includes('dsh-permission-presets') && text.includes('danger-full-access')) return { written: false, reason: '已配置' }
  const entry = [
    '',
    '# [dsh-controller] 默认权限预设:完全访问 + 免审批(一键安装写入)',
    "- name: '@deepseek-ai/dsh-permission-presets'",
    '  config:',
    '    defaultPreset: danger-never',
    '    presets:',
    '      danger-never:',
    '        sandbox: danger-full-access',
    '        approval: never',
    '',
  ].join('\n')
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, (text.endsWith('\n') ? text : text + '\n') + entry, 'utf8')
    return { written: true }
  } catch (e) { return { written: false, reason: String(e?.message ?? e) } }
}
export function permissionPresetState() {
  const file = path.join(core.DSH_HOME, 'profiles', 'desktop', 'cordis.patch.yml')
  try {
    const t = readFileSync(file, 'utf8')
    return { configured: t.includes('dsh-permission-presets') && t.includes('danger-full-access') }
  } catch { return { configured: false } }
}

// ── 包级入口与旧版本迁移 ─────────────────────────────────
/** 兼容旧调用：现在只刷新包入口。参数 kind 为包类型，返回模块数及迁移结果，不生成独立目录。 */
export function registerSubSkills(kind) {
  try { return refreshPackEntry({ home: DSH_HOME, skillsDir: SKILLS_DIR, kind }) }
  catch (error) { return { ok: false, error: error.message } }
}
/** 兼容旧清理调用。参数 kind 为包类型，返回归档数；只处理可确认的旧副本，不直接删除。 */
export function unregisterSubSkills(kind) {
  const r = registerSubSkills(kind)
  return { ...r, removed: r.archived?.length || 0 }
}

/** 迁移已安装的两个包。无参数，返回逐包结果；旧红队平铺包仅在版本和全部正文匹配时恢复完整分类资源。 */
export function migrateSkillPacks() {
  const results = []
  for (const kind of ['red', 'reverse']) {
    const config = packConfig(kind)
    const root = path.join(SKILLS_DIR, config.name)
    if (!existsSync(root)) continue
    try {
      let r
      const source = path.join(core.REPO_ROOT, 'resources', config.name)
      const state = JSON.parse(readFileSync(path.join(SKILLS_DIR, config.state), 'utf8'))
      const legacy = kind === 'red' && readdirSync(root).every(name => ['SKILL.md', 'SKILLS'].includes(name))
      if (legacy && existsSync(path.join(source, 'package.json'))) {
        const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'))
        const old = scanPackModules(root, kind), full = scanPackModules(source, kind)
        const matches = old.length && old.every(module => full.some(item => item.name === module.name && item.normalizedSha256 === module.normalizedSha256))
        if (pkg.version === state.version && matches) r = installPackDirectory({ source, home: DSH_HOME, skillsDir: SKILLS_DIR, kind })
      }
      r ||= refreshPackEntry({ home: DSH_HOME, skillsDir: SKILLS_DIR, kind })
      results.push({ kind, ...r })
    } catch (error) { results.push({ kind, ok: false, error: error.message }) }
  }
  return { ok: results.every(r => r.ok), packs: results }
}

/** 验证所有已安装入口。无参数，返回逐包模块加载结果；不执行模块脚本或连接 MCP。 */
export function verifySkillPacks() {
  const packs = []
  for (const kind of ['red', 'reverse']) {
    const root = path.join(SKILLS_DIR, packConfig(kind).name)
    if (existsSync(root)) packs.push(verifyPack(root))
  }
  return { ok: true, packs }
}
/** 获取已安装技能清单。无参数，返回技能数组；目录尚未创建时返回空数组。 */
export function skillsInventory() {
  const out = []
  if (!existsSync(core.SKILLS_DIR)) return out
  for (const e of readdirSync(core.SKILLS_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory()) continue
    const f = path.join(core.SKILLS_DIR, e.name, 'SKILL.md')
    let desc = ''
    try {
      const md = readFileSync(f, 'utf8').replaceAll('\r\n', '\n')
      const m = /^---\n([\s\S]*?)\n---/.exec(md)
      if (m) { const d = /^description:\s*(.+)$/m.exec(m[1]); if (d) desc = d[1].slice(0, 60) }
    } catch {}
    out.push({ name: e.name, hasSkill: existsSync(f), desc })
  }
  return out
}

// ── 卸载技能包(可恢复归档)─────────────────────────────────
/** 卸载指定入口及包内资源。参数 kind 为包类型，返回备份与保留项，不删用户自定义技能。 */
export function uninstallPack(kind) {
  return removePackEntry({ home: DSH_HOME, skillsDir: SKILLS_DIR, kind })
}
