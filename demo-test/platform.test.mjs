import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { locateDesktop, desktopCliInvocation, psLiteral, encodePowerShell } from '../cli/lib/platform.mjs'

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), '.runtime')
fs.mkdirSync(directory, { recursive: true })
const root = fs.mkdtempSync(path.join(directory, 'windows-'))
const install = path.join(root, "中文 安装 & quote'")
const resources = path.join(install, 'resources')
const bin = path.join(resources, 'runtime', 'cli', 'bin')
const home = path.join(root, '独立 profile')
const manifest = path.join(home, 'profiles', 'desktop', 'package.json')
fs.mkdirSync(bin, { recursive: true })
fs.mkdirSync(path.dirname(manifest), { recursive: true })
fs.writeFileSync(path.join(install, 'DeepSeek Harness.exe'), '')
fs.writeFileSync(path.join(resources, 'app.asar'), 'archive')
const shim = path.join(bin, 'dsh.cmd')
const executable = path.join(install, 'fixture-node.exe')
fs.copyFileSync(process.execPath, executable)
fs.writeFileSync(shim, `" %~dp0ignored.exe"\r\n"%~dp0${path.relative(bin, executable)}" --expose-internals "%~dp0cli.js" %*\r\n`)
fs.writeFileSync(path.join(bin, 'cli.js'), [
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  "const args = process.argv.slice(2);",
  "const file = path.join(process.env.DSH_HOME, 'profiles', 'desktop', 'package.json');",
  "if (args[0] === 'plugin') {",
  "  const previous = JSON.parse(fs.readFileSync(file, 'utf8'));",
  "  fs.writeFileSync(file, '\\ufeff' + JSON.stringify(previous));",
  "}",
  "console.log(JSON.stringify({args, electron: process.env.ELECTRON_RUN_AS_NODE}));",
  "if (args.includes('fail')) process.exitCode = 7;",
].join('\n'))
process.env.DSH_HOME = home
process.env.DSH_APP_ROOT = install
process.env.PURGE_DSH_CLI = shim
const core = await import('../cli/lib/core.mjs')
const ops = await import('../cli/lib/ops.mjs')
after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))

/** 重置隔离清单。参数 bom 决定是否添加 BOM，无返回值。 */
function resetManifest(bom = false) {
  fs.writeFileSync(manifest, (bom ? '\ufeff' : '') + '{"name":"fixture","dependencies":{}}')
}

test('自定义安装支持中文、空格、单引号和 &', () => {
  const result = locateDesktop({ platform: 'win32', env: { DSH_APP_ROOT: install }, exec: () => '' })
  assert.equal(result.root, install)
  assert.equal(result.cli, shim)
})

test('可从 PATH 上的 dsh.cmd 反推安装目录', () => {
  const result = locateDesktop({ platform: 'win32', env: {}, exec: cmd => cmd === 'where.exe' ? shim + '\r\n' : '' })
  assert.equal(result.root, install)
})

test('无有效安装时不返回 macOS 路径', () => {
  const result = locateDesktop({ platform: 'win32', env: {}, exec: () => '' })
  assert.equal(result.root, '')
  assert.equal(result.cli, '')
})

test('显式目录无效时不操作其他安装', () => {
  const result = locateDesktop({ platform: 'win32', env: { DSH_APP_ROOT: path.join(root, 'missing') }, exec: () => shim })
  assert.equal(result.root, '')
})

test('注册表安装目录能被定位', () => {
  const result = locateDesktop({ platform: 'win32', env: {}, exec: cmd => cmd === 'powershell.exe' ? install + '\r\n' : '' })
  assert.equal(result.root, install)
})

test('保留 macOS 安装布局', () => {
  const app = path.join(root, 'macOS.app')
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true })
  fs.mkdirSync(path.join(app, 'Contents', 'Resources', 'app'), { recursive: true })
  fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'DeepSeek Harness'), '')
  assert.equal(locateDesktop({ platform: 'darwin', env: { DSH_APP_ROOT: app } }).root, app)
})

test('保留 Linux 安装布局', () => {
  const app = path.join(root, 'linux')
  fs.mkdirSync(path.join(app, 'resources', 'app'), { recursive: true })
  fs.writeFileSync(path.join(app, 'deepseek-harness'), '')
  assert.equal(locateDesktop({ platform: 'linux', env: { DSH_APP_ROOT: app } }).root, app)
})

test('Windows shim 解析保留父目录段且不拼接参数', () => {
  const result = desktopCliInvocation(shim)
  assert.equal(result.command, executable)
  assert.deepEqual(result.args, ['--expose-internals', path.join(bin, 'cli.js')])
  assert.equal(result.env.ELECTRON_RUN_AS_NODE, '1')
})

test('无法识别的批处理明确失败', () => {
  const file = path.join(bin, 'unknown.cmd')
  fs.writeFileSync(file, '@echo off\r\n')
  assert.throws(() => desktopCliInvocation(file), /无法识别/)
})

test('PowerShell 字面量与中文编码往返', { skip: process.platform !== 'win32' }, () => {
  const value = "中文 空格 & ' $env:PATH"
  const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); [Console]::Write(${psLiteral(value)})`)], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
  assert.equal(result, value)
})

test('普通命令逐字传递特殊字符参数', async () => {
  const values = ['中文 空格', '#main&path:packages/plugin', '"quote"', '%PATH%', 'a|b', "a'b"]
  const result = await core.run(process.execPath, ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...values], { shell: true })
  assert.equal(result.ok, true)
  assert.deepEqual(JSON.parse(result.output), values)
})

test('错误退出码和不存在的程序不误报成功', async () => {
  assert.equal((await core.run(process.execPath, ['-e', 'process.exit(7)'])).code, 7)
  assert.equal((await core.run(path.join(root, 'missing.exe'))).ok, false)
})

test('超时终止直接子进程', async () => {
  const result = await core.run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 150 })
  assert.equal(result.ok, false)
})

test('清理控制器命令会终止记录的进程', async () => {
  const pending = core.run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
  core.stopRunningCommands()
  assert.equal((await pending).ok, false)
})

test('换包拒绝不完整解包目录，并保留已完成换包的备份', { skip: process.platform !== 'win32' }, () => {
  const asar = path.join(resources, 'app.asar')
  assert.equal(core.renameAsarToBak().ok, false)
  assert.equal(fs.readFileSync(asar, 'utf8'), 'archive')
  fs.mkdirSync(path.join(resources, 'app'), { recursive: true })
  fs.writeFileSync(path.join(resources, 'app', 'package.json'), '{}')
  fs.writeFileSync(asar + '.rename-pending', 'fixture')
  const result = core.renameAsarToBak()
  assert.equal(result.ok, true)
  assert.equal(fs.existsSync(asar), false)
  assert.equal(fs.readFileSync(result.backup, 'utf8'), 'archive')
  assert.equal(fs.existsSync(asar + '.rename-pending'), false)
})

test('BOM 修复保留原字节备份且可重复运行', () => {
  resetManifest(true)
  const original = fs.readFileSync(manifest)
  assert.equal(ops.stripProfileBom().repaired, true)
  assert.deepEqual(fs.readFileSync(manifest + '.bom-bak'), original)
  assert.equal(ops.stripProfileBom().repaired, false)
  assert.equal(JSON.parse(fs.readFileSync(manifest, 'utf8')).name, 'fixture')
})

test('非法 JSON 不被重写', () => {
  fs.writeFileSync(manifest, '\ufeff{invalid')
  const original = fs.readFileSync(manifest)
  assert.equal(ops.stripProfileBom().ok, false)
  assert.deepEqual(fs.readFileSync(manifest), original)
})

test('新 profile 无清单时不抛异常', () => {
  assert.deepEqual(ops.stripProfileBom(path.join(root, 'missing.json')), { ok: true, missing: true })
})

test('安装前后修复 BOM 且 & 来源不被分割', { skip: process.platform !== 'win32' }, async () => {
  resetManifest(true)
  const spec = 'https://example.invalid/repo.git#main&path:packages/demo'
  const result = await ops.pluginInstall(spec)
  assert.equal(result.ok, true)
  assert.deepEqual(JSON.parse(result.output).args, ['plugin', '--profile', 'desktop', 'add', spec])
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(manifest, 'utf8')))
})

test('安装失败也修复 CLI 留下的 BOM', { skip: process.platform !== 'win32' }, async () => {
  resetManifest()
  const result = await ops.pluginInstall('fail')
  assert.equal(result.ok, false)
  assert.ok(JSON.parse(result.output).args.includes('fail'))
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(manifest, 'utf8')))
})

test('卸载和 scoped 包豁免使用同一 Windows 入口', { skip: process.platform !== 'win32' }, async () => {
  resetManifest()
  assert.equal((await ops.pluginRemove('@scope/demo')).ok, true)
  const result = await ops.setPluginExemption('@scope/demo@1.0.0', '0.2.1-rc.5', true)
  assert.equal(result.ok, true)
  assert.ok(JSON.parse(result.output).args.includes('@scope/demo@1.0.0'))
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(manifest, 'utf8')))
})

test('空插件来源不会启动命令', async () => {
  assert.equal((await ops.pluginInstall()).ok, false)
  assert.equal((await ops.pluginRemove()).ok, false)
})

test('不存在的技能目录返回空列表', () => {
  assert.deepEqual(ops.skillsInventory(), [])
})

test('技能清单读取 Windows CRLF 描述', () => {
  const skill = path.join(core.SKILLS_DIR, 'fixture')
  fs.mkdirSync(skill, { recursive: true })
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\r\nname: fixture\r\ndescription: 中文说明\r\n---\r\n')
  assert.equal(ops.skillsInventory()[0].desc, '中文说明')
})

test('非 TTY 默认命令显示帮助并退出，无控制字符', async () => {
  const result = await core.run(process.execPath, [path.resolve('cli/index.mjs')], { timeout: 15000 })
  assert.equal(result.ok, true)
  assert.match(result.output, /用法/)
  assert.equal(result.output.includes('\x1b'), false)
})

test('空菜单和非 TTY 按键等待不会挂起', async () => {
  const ui = await import('../cli/lib/ui.mjs')
  assert.equal(await ui.menuSelect({ title: 'fixture', items: [] }), -1)
  assert.equal(await ui.menuSelect({ title: 'fixture', items: [], multi: true }), null)
  await ui.waitKey()
})
