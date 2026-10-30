// 功能操作:破甲 / 技能包 / 插件 / 设置
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync, spawn } from 'node:child_process'
import * as core from './core.mjs'

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
  const rn = core.renameAsarToBak()
  push('换包改名', rn)
  if (restart) { const rs = core.restartDsh(); push('重启 dsh', rs) }
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
const REDTEAM_DIR = path.join(SKILLS_DIR, 'redteam-skill')
const REDTEAM_STATE = path.join(SKILLS_DIR, '.purge-redteam.json')
async function redteamFiles() {
  const top = await core.hubJson(HUB.api + '/contents/resources/redteam-skill?ref=main')
  const isSkill = i => i.type === 'file' && i.name.endsWith('.md') && !/^(README|INDEX|CONTRIBUTING)\.md$/i.test(i.name)
  const out = top.filter(isSkill).map(f => ({ name: f.name, url: f.download_url || f.url }))
  for (const d of top.filter(i => i.type === 'dir')) {
    try {
      const sub = await core.hubJson(HUB.api + '/contents/resources/redteam-skill/' + d.name + '?ref=main')
      for (const f of (Array.isArray(sub) ? sub : []).filter(isSkill)) out.push({ name: f.name, url: f.download_url || f.url, category: d.name })
    } catch {}
  }
  return out
}
function fm(md) {
  const m = /^---\n([\s\S]*?)\n---/.exec(md)
  const o = {}
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) o[line.slice(0, i).trim()] = line.slice(i + 1).trim() }
  return o
}
export async function installRedteam({ version = 'repo' } = {}) {
  let files = []
  let src = 'repo'
  try { files = await redteamFiles() } catch { files = [] }
  const entries = []
  for (const f of files) {
    const r = await core.hubFetch(f.url)
    if (!r.ok) continue
    const md = await r.text()
    entries.push({ name: fm(md).name || f.name.replace(/\.md$/, ''), md, meta: fm(md), category: f.category || '' })
  }
  if (!entries.length) {
    // 回退:插件内 skills/redteam(平铺)
    const srcDir = path.join(PLUGIN_DIR, 'skills', 'redteam')
    src = 'plugin'
    if (!existsSync(srcDir)) return { ok: false, error: '仓库与插件内均无红队技能' }
    for (const n of readdirSync(srcDir)) {
      if (!n.endsWith('.md') || n.startsWith('._') || n === 'README.md') continue
      const md = readFileSync(path.join(srcDir, n), 'utf8')
      entries.push({ name: fm(md).name || n.replace(/\.md$/, ''), md, meta: fm(md) })
    }
  }
  const ver = await core.hubFileVersion('resources/redteam-skill')
  rmSync(REDTEAM_DIR, { recursive: true, force: true })
  mkdirSync(path.join(REDTEAM_DIR, 'SKILLS'), { recursive: true })
  for (const e of entries) writeFileSync(path.join(REDTEAM_DIR, 'SKILLS', e.name + '.md'), e.md)
  const idx = entries.map(e => '| ' + e.name + ' | ' + (e.meta.description || '').replace(/\|/g, '/').slice(0, 100) + ' |').join('\n')
  writeFileSync(path.join(REDTEAM_DIR, 'SKILL.md'), [
    '---', 'name: redteam-skill', 'description: 红队技能包统一入口(' + entries.length + ' 个子技能:侦察/漏洞/利用/内网/隧道/管理)', '---', '',
    '# 红队技能包', '', '按需进入对应子技能(SKILLS/ 目录)。', '', '| 技能 | 说明 |', '| --- | --- |', idx, '',
  ].join('\n'))
  writeFileSync(REDTEAM_STATE, JSON.stringify({ version: ver, source: src, skills: entries.map(e => e.name), installedAt: Date.now() }, null, 2))
  return { ok: true, count: entries.length, version: ver, source: src }
}

// ── 逆向技能包(仓库子目录 clone → 复制)────────────────────
const REVERSE_DIR = path.join(SKILLS_DIR, 'reverse-skill')
const REVERSE_STATE = path.join(SKILLS_DIR, '.reverse-skill.json')
export async function installReverse() {
  const tmp = path.join(os.tmpdir(), 'dshc-reverse-' + Date.now())
  mkdirSync(tmp, { recursive: true })
  const repo = path.join(tmp, 'repo')
  const tok = core.readToken()
  const url = tok ? HUB.git.replace('https://hub.ifunx.com/', 'https://oauth2:' + tok + '@hub.ifunx.com/') : HUB.git
  const r = await core.run('git', ['clone', '--depth', '1', url, repo], { cwd: tmp })
  if (!r.ok) return { ok: false, error: 'clone 失败:' + (r.output || '').slice(-200) }
  const src = path.join(repo, 'resources', 'reverse-skill')
  if (!existsSync(path.join(src, 'RULES.md'))) return { ok: false, error: '仓库中无 resources/reverse-skill' }
  rmSync(REVERSE_DIR, { recursive: true, force: true })
  mkdirSync(REVERSE_DIR, { recursive: true })
  execSync('cp -R "' + src + '/." "' + REVERSE_DIR + '/"')
  rmSync(path.join(REVERSE_DIR, '.git'), { recursive: true, force: true })
  const ver = (() => { try { return JSON.parse(readFileSync(path.join(REVERSE_DIR, 'package.json'), 'utf8')).version } catch { return null } })()
  const skills = []
  const sk = path.join(REVERSE_DIR, 'skill')
  if (existsSync(sk)) for (const d of readdirSync(sk)) if (existsSync(path.join(sk, d, 'SKILL.md'))) skills.push(d)
  writeFileSync(path.join(REVERSE_DIR, 'SKILL.md'), [
    '---', 'name: reverse-skill', 'description: 逆向工程 / CTF / 安全研究路由包(' + skills.length + ' 个模块)', '---', '',
    '# 逆向技能包', '', '模块:' + skills.join(', '), '',
  ].join('\n'))
  writeFileSync(REVERSE_STATE, JSON.stringify({ version: ver, modules: skills, installedAt: Date.now() }, null, 2))
  rmSync(tmp, { recursive: true, force: true })
  return { ok: true, version: ver, modules: skills.length }
}

// ── 插件商店 ─────────────────────────────────────────────
export async function pluginsInstalled() {
  const f = path.join(DSH_HOME, 'profiles', 'desktop', 'package.json')
  try {
    const pkg = JSON.parse(readFileSync(f, 'utf8'))
    const deps = pkg.dependencies || {}
    return Object.keys(deps).map(name => {
      let version = '?'
      try { version = JSON.parse(readFileSync(path.join(DSH_HOME, 'profiles', 'desktop', 'node_modules', name, 'package.json'), 'utf8')).version } catch {}
      return { name, version, spec: deps[name] }
    })
  } catch { return [] }
}

export async function pluginInstall(spec) {
  const dshCli = RES + '/runtime/cli/bin/dsh'
  const r = await core.run(dshCli, ['plugin', '--profile', 'desktop', 'add', spec], { stream: true })
  let hint = ''
  const out = String(r.output || '')
  if (!r.ok) {
    if (out.includes('allowBuilds')) hint = '需在 ' + path.join(core.DSH_HOME, 'profiles', 'desktop', 'pnpm-workspace.yaml') + ' 的 allowBuilds 中加入 pnpm 提示的键后重试'
    else if (out.includes('Repository not found') || out.includes('未找到')) hint = '仓库不可达:确认自建源密钥已配置(设置 → 测试连接)且仓库名正确'
    else if (out.includes('ERR_PNPM_GIT_RESOLVE_FAILED')) hint = 'git 依赖解析失败:检查 spec 与网络/密钥'
  }
  return { ok: r.ok, output: r.output, hint }
}
export async function pluginRemove(name) {
  const dshCli = RES + '/runtime/cli/bin/dsh'
  const r = await core.run(dshCli, ['plugin', '--profile', 'desktop', 'remove', name], { stream: true })
  return { ok: r.ok, output: r.output }
}

// ── 插件安装(仓库 tarball → dsh plugin add)───────────────────
export async function installLatest() {
  const tmp = path.join(os.tmpdir(), 'dshc-purge-' + Date.now())
  mkdirSync(tmp, { recursive: true })   // spawn 的 cwd 必须已存在,否则 ENOENT
  const repo = path.join(tmp, 'repo')
  const tok = core.readToken()
  const url = tok ? core.HUB.git.replace('https://hub.ifunx.com/', 'https://oauth2:' + tok + '@hub.ifunx.com/') : core.HUB.git
  let r = await core.run('git', ['clone', '--depth', '1', url, repo], { cwd: tmp })
  if (!r.ok) return { ok: false, error: 'clone 失败:' + (r.output || '').slice(-200) }
  const src = path.join(repo, 'dsh-purge-self')
  if (!existsSync(path.join(src, 'package.json'))) return { ok: false, error: '仓库缺少 dsh-purge-self/' }
  mkdirSync(path.join(tmp, 'package'), { recursive: true })
  execSync('cp -R "' + src + '/." "' + tmp + '/package/"')
  rmSync(path.join(tmp, 'package', '.git'), { recursive: true, force: true })
  const tgz = path.join(tmp, 'dsh-purge-self.tgz')
  r = await core.run('tar', ['-czf', tgz, '-C', tmp, 'package'], { env: { COPYFILE_DISABLE: '1' } })
  if (!r.ok) return { ok: false, error: 'tar 失败' }
  const dshCli = core.RES + '/runtime/cli/bin/dsh'
  r = await core.run(dshCli, ['plugin', '--profile', 'desktop', 'add', tgz], { stream: true })
  rmSync(tmp, { recursive: true, force: true })
  let ver = null
  try { ver = JSON.parse(readFileSync(path.join(core.PLUGIN_DIR, 'package.json'), 'utf8')).version } catch {}
  return { ok: r.ok, version: ver, output: r.output }
}

// ── 卸载(退出 dsh → CLI --uninstall;EPERM 回退管理员授权)────────
export async function uninstallPurge() {
  core.quitDsh()
  await core.waitDshExit(15000)
  const script = path.join(core.PLUGIN_DIR, 'bin', 'dsh-purge.js')
  let r = await core.run(process.execPath, [script, '--uninstall'], { env: core.purgeEnv(), stream: true })
  let via = 'user'
  if (!r.ok) {
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
  const dshCli = core.RES + '/runtime/cli/bin/dsh'
  await core.run(dshCli, ['plugin', '--profile', 'desktop', 'remove', 'dsh-purge-self'])
  return { ok: true, via, output: r.output }
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

// ── 在线插件目录(自建源 packages/)──────────────────────────
export async function pluginsCatalog() {
  try {
    const top = await core.hubJson(core.HUB.api.replace('dsh-controller', 'dsh-plugins') + '/contents/packages?ref=main')
    const out = []
    for (const d of (Array.isArray(top) ? top : [])) {
      if (d?.type !== 'dir') continue
      try {
        const meta = await core.hubJson(core.HUB.api.replace('dsh-controller', 'dsh-plugins') + '/contents/' + d.path + '/package.json?ref=main')
        const pkg = JSON.parse(Buffer.from(meta.content, 'base64').toString())
        out.push({ name: pkg.name, version: pkg.version || '', description: pkg.description || '', spec: core.HUB.git.replace('dsh-controller', 'dsh-plugins') + '#main&path:' + d.path })
      } catch {}
    }
    return out
  } catch { return [] }
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
export async function pluginsUpdateAll() {
  const inst = await pluginsInstalled()
  let cat = []
  try { cat = await pluginsCatalog() } catch {}
  const byName = new Map(cat.map(p => [p.name, p]))
  const results = []
  for (const p of inst) {
    const spec = byName.get(p.name)?.spec || p.spec
    if (!spec) { results.push({ name: p.name, ok: false, error: '无安装来源' }); continue }
    const r = await pluginInstall(spec)
    results.push({ name: p.name, ok: r.ok, hint: r.hint || '' })
  }
  return { ok: results.every(x => x.ok), results }
}
export function pluginExemptions() {
  try { return JSON.parse(readFileSync(path.join(core.DSH_HOME, 'profiles', 'desktop', 'compatibility.json'), 'utf8')) } catch { return {} }
}
export async function setPluginExemption(nameWithVersion, dshVersion, enable) {
  const dshCli = core.RES + '/runtime/cli/bin/dsh'
  const args = ['plugin', '--profile', 'desktop', enable ? 'allow-version' : 'revoke-version', nameWithVersion, '--dsh-version', dshVersion]
  if (enable) args.push('--accept-risk')
  const r = await core.run(dshCli, args, { stream: true })
  return { ok: r.ok, output: r.output, exemptions: pluginExemptions() }
}
export function restartDsh() { return core.restartDsh() }

// ── 日志查看 / 清空 ───────────────────────────────────────
export const auditFile = () => path.join(core.DSH_HOME, 'dsh-purge-community', 'audit.jsonl')
export const handoffFile = () => '/tmp/dsh-controller-handoff.log'
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
  for (const f of [auditFile(), handoffFile(), '/tmp/dsh-handoff-worker.log', '/tmp/dsh-rename-worker.log']) {
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
