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
  "  if (args.at(-1).includes('recovered-') && previous.dependencies['fixture-local'].includes('node_modules')) throw new Error('old source remains');",
  "  if (args.at(-1).endsWith('.tgz') && previous.dependencies['fixture-local']) previous.dependencies['fixture-local'] = 'file:' + args.at(-1);",
  "  fs.writeFileSync(file, '\\ufeff' + JSON.stringify(previous));",
  "}",
  "console.log(JSON.stringify({args, electron: process.env.ELECTRON_RUN_AS_NODE}));",
  "if (args.includes('missing-source')) { console.log('[ENOENT] missing node_modules/dsh-plugins'); console.log('generic prepare advice: allowBuilds'); process.exitCode = 7; }",
  "if (args.includes('fail')) process.exitCode = 7;",
].join('\n'))
process.env.DSH_HOME = home
process.env.DSH_APP_ROOT = install
process.env.PURGE_DSH_CLI = shim
const core = await import('../cli/lib/core.mjs')
const ops = await import('../cli/lib/ops.mjs')
const pluginSource = await import('../cli/lib/plugin-source.mjs')
after(() => {
  core.stopRunningCommands()
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

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

/** 创建补丁入口夹具。参数 name 为隔离目录名，返回批处理路径和三种布局的入口路径。 */
function patchedShim(name) {
  const folder = path.join(root, name, 'resources', 'runtime', 'cli', 'bin')
  fs.mkdirSync(folder, { recursive: true })
  const tail = 'dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js'
  const entries = ['app.asar', 'app.asar.unpacked', 'app'].map(layout => path.resolve(folder, '../../..', layout, tail))
  const relative = file => '%~dp0' + path.relative(folder, file)
  const file = path.join(folder, 'dsh.cmd')
  fs.writeFileSync(file, [
    '@echo off',
    'setlocal DisableDelayedExpansion',
    'set "ELECTRON_RUN_AS_NODE=1"',
    'REM dsh-purge cli entry begin',
    `set "entry=${relative(entries[0])}"`,
    `if not exist "%entry%" set "entry=${relative(entries[1])}"`,
    `if not exist "%entry%" set "entry=${relative(entries[2])}"`,
    'REM dsh-purge cli entry end',
    `"${relative(executable)}" --expose-internals "%entry%" %*`,
    'exit /b %errorlevel%',
  ].join('\r\n'))
  return { file, entries }
}

test('补丁后的 %entry% 入口回退到 app 目录并逐字传递参数', async () => {
  const { file, entries } = patchedShim("补丁 中文 & quote'")
  fs.mkdirSync(path.dirname(entries[2]), { recursive: true })
  fs.writeFileSync(entries[2], 'console.log(JSON.stringify({args: process.argv.slice(2), electron: process.env.ELECTRON_RUN_AS_NODE}))')
  const invocation = desktopCliInvocation(file)
  assert.equal(invocation.command, executable)
  assert.equal(invocation.args[1], entries[2])
  const args = ['--version', '中文 空格', '#main&path:plugin', '%PATH%', "a'b"]
  const result = await core.run(invocation.command, [...invocation.args, ...args], { env: invocation.env, timeout: 10000 })
  assert.equal(result.ok, true)
  assert.deepEqual(JSON.parse(result.output), { args, electron: '1' })
})

test('补丁入口优先读取实体文件且支持 app.asar.unpacked', () => {
  const { file, entries } = patchedShim('unpacked')
  fs.writeFileSync(path.resolve(path.dirname(file), '../../../app.asar'), 'archive')
  for (const entry of entries.slice(1)) {
    fs.mkdirSync(path.dirname(entry), { recursive: true })
    fs.writeFileSync(entry, '')
  }
  assert.equal(desktopCliInvocation(file).args[1], entries[1])
})

test('只有 app.asar 时保留 Electron 归档入口', () => {
  const { file, entries } = patchedShim('archive')
  fs.writeFileSync(path.resolve(path.dirname(file), '../../../app.asar'), 'archive')
  assert.equal(desktopCliInvocation(file).args[1], entries[0])
})

test('补丁入口缺少文件或引用未声明变量时明确失败', () => {
  const { file } = patchedShim('missing-entry')
  assert.throws(() => desktopCliInvocation(file), /入口文件不存在/)
  fs.writeFileSync(file, `"%~dp0${path.relative(path.dirname(file), executable)}" --expose-internals "%other%" %*\r\n`)
  assert.throws(() => desktopCliInvocation(file), /无法识别/)
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
  const spec = 'https://example.invalid/plugin.tgz?download=1&version=1.0'
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

test('ENOENT 优先于官方追加的 allowBuilds 提示', { skip: process.platform !== 'win32' }, async () => {
  resetManifest()
  const result = await ops.pluginInstall('missing-source')
  assert.equal(result.ok, false)
  assert.ok(result.hint.includes('ENOENT'))
  assert.ok(result.hint.includes('不是构建授权'))
})

test('Git 子目录来源解析拒绝越界目录和 URL 内嵌凭据', () => {
  const source = pluginSource.parseGitPluginSource('https://example.invalid/plugins.git#main&path:packages/demo')
  assert.deepEqual(source, { url: 'https://example.invalid/plugins.git', ref: 'main', directory: 'packages/demo' })
  assert.throws(() => pluginSource.parseGitPluginSource('https://example.invalid/plugins.git#main&path:../outside'))
  assert.throws(() => pluginSource.parseGitPluginSource('https://user:test@example.invalid/plugins.git#main&path:packages/demo'))
})

test('Git 子包在独立目录打包，记录提交且不执行 prepare', async () => {
  const source = pluginSource.parseGitPluginSource('https://example.invalid/plugins.git#main&path:packages/demo')
  const output = path.join(root, 'git-package-output')
  const marker = path.join(root, 'unexpected-prepare')
  const commit = '1234567890123456789012345678901234567890'
  const result = await pluginSource.prepareGitPlugin(source, {
    tempRoot: root,
    packageDir: output,
    clone: async (destination, cwd, options) => {
      assert.equal(options.url, source.url)
      assert.equal(options.ref, 'main')
      execFileSync('git', ['init', destination], { stdio: 'ignore' })
      fs.writeFileSync(path.join(destination, '.git', 'HEAD'), 'ref: refs/heads/main\n')
      fs.writeFileSync(path.join(destination, '.git', 'refs', 'heads', 'main'), commit + '\n')
      const pkg = path.join(destination, 'packages', 'demo')
      fs.mkdirSync(path.join(pkg, 'lib', 'node_modules', 'unrelated'), { recursive: true })
      fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'fixture-git', version: '1.0.0', files: ['lib'], scripts: { prepare: 'node unexpected-prepare.js' } }))
      fs.writeFileSync(path.join(pkg, 'lib', 'client.js'), 'export const value = 1')
      fs.writeFileSync(path.join(pkg, 'lib', 'node_modules', 'unrelated', 'data'), 'excluded')
      fs.writeFileSync(path.join(pkg, 'unexpected-prepare.js'), "require('node:fs').writeFileSync(" + JSON.stringify(marker) + ",'bad')")
      return { ok: true }
    },
  })
  assert.equal(result.ok, true, result.error)
  assert.equal(result.commit, commit)
  const contents = execFileSync('tar', ['-tzf', result.tarball], { encoding: 'utf8' })
  assert.ok(contents.includes('package/lib/client.js'))
  assert.equal(contents.includes('node_modules'), false)
  assert.equal(fs.existsSync(marker), false)
  assert.equal(fs.readdirSync(root).some(n => n.startsWith('dshc-git-plugin-')), false)
})

test('发布文件尚未构建时拒绝制作不完整插件包', () => {
  const source = path.join(root, 'unbuilt-plugin')
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'unbuilt', version: '1.0.0', files: ['lib/client.js'] }))
  assert.throws(() => pluginSource.stagePublishedPlugin(source, path.join(root, 'unbuilt-stage')), /先构建/)
})

test('识别指向 node_modules 的失效 file 来源，不误报外部持久包', () => {
  const source = path.join(path.dirname(manifest), 'node_modules', 'gone', 'plugin')
  const stable = path.join(root, 'stable.tgz')
  fs.writeFileSync(stable, 'fixture')
  fs.writeFileSync(manifest, JSON.stringify({ dependencies: { 'fixture-local': 'file:' + source, stable: 'file:' + stable, remote: 'https://example.invalid/plugin.git' } }))
  const issues = ops.localPluginSourceIssues()
  assert.equal(issues.length, 1)
  assert.equal(issues[0].name, 'fixture-local')
})

test('恢复本地来源保留版本和配置备份，归档排除嵌套 node_modules', { skip: process.platform !== 'win32' }, async () => {
  const installed = path.join(path.dirname(manifest), 'node_modules', 'fixture-local')
  fs.mkdirSync(path.join(installed, 'lib', 'node_modules', 'unrelated'), { recursive: true })
  fs.writeFileSync(path.join(installed, 'package.json'), JSON.stringify({ name: 'fixture-local', version: '0.3.3', files: ['lib', 'README.md'] }))
  fs.writeFileSync(path.join(installed, 'lib', 'index.js'), 'export const value = 1')
  fs.writeFileSync(path.join(installed, 'lib', 'node_modules', 'unrelated', 'missing.css'), 'ignored')
  fs.writeFileSync(path.join(installed, 'README.md'), 'fixture')
  const original = fs.readFileSync(manifest)
  const result = await ops.repairLocalPlugin('fixture-local')
  assert.equal(result.ok, true, result.error)
  assert.equal(result.version, '0.3.3')
  assert.deepEqual(fs.readFileSync(result.backup), original)
  const contents = execFileSync('tar', ['-tzf', result.tarball], { encoding: 'utf8' })
  assert.ok(contents.includes('package/lib/index.js'))
  assert.equal(contents.includes('node_modules'), false)
  assert.equal(ops.localPluginSourceIssues().length, 0)
})

test('本地来源恢复拒绝越界包名及未损坏插件', async () => {
  assert.equal((await ops.repairLocalPlugin('../other')).ok, false)
  assert.equal((await ops.repairLocalPlugin()).ok, false)
  assert.equal((await ops.repairLocalPlugin('stable')).ok, false)
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

test('Windows 桌面运行时阻止安装且不改写 profile', { skip: process.platform !== 'win32' }, async () => {
  fs.copyFileSync(process.execPath, core.DSHEXE)
  const running = core.run(core.DSHEXE, ['-e', 'setInterval(() => {}, 1000)'])
  try {
    const original = fs.readFileSync(manifest)
    const result = await ops.pluginInstall('fixture')
    assert.equal(result.ok, false)
    assert.ok(result.hint.includes('退出'))
    assert.deepEqual(fs.readFileSync(manifest), original)
  } finally {
    core.stopRunningCommands()
    await running
  }
})
