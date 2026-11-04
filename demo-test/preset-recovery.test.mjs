import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migratePresetDefinition } from '../dsh-purge-self/lib/preset-compat.js'
import { installPreset, bundledPresetDir } from '../dsh-purge-self/lib/presets.js'
import { readPresetDefinition } from '../dsh-purge-self/lib/redteam/preset-composition.js'
import { ALL_PATCHES, applyReplacementsToText, targetFiles } from '../dsh-purge-self/lib/core.js'
import { currentHost, diagnosticHost, hostSurface } from '../dsh-purge-self/lib/instance.js'
import { detectSurface } from '../dsh-purge-self/lib/surface.js'

const parent = path.join(path.dirname(fileURLToPath(import.meta.url)), '.runtime')
fs.mkdirSync(parent, { recursive: true })
const root = fs.mkdtempSync(path.join(parent, 'preset-recovery-'))
const control = '@deepseek-ai/dsh-tool-subagent-control'
after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))

/** 创建宿主发布夹具。参数为目录名、是否合并和是否保留旧入口，返回宿主组件根。 */
function host(name, merged, legacy = false) {
  const base = path.join(root, name)
  const dir = path.join(base, 'dsh-tool-subagent-control')
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    exports: { '.': './lib/index.js', ...(legacy ? { './list-agents': './lib/list-agents.js' } : {}) },
  }))
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), merged ? 'function apply(ctx) { registerListAgents(ctx); }' : 'function apply(ctx) {}')
  return base
}

/** 创建带独立发现工具的嵌套预设。参数 disabled 指定主控制插件是否禁用，返回预设声明。 */
function definition(disabled = false) {
  return {
    id: 'redteam',
    plugins: [{
      name: 'group',
      group: true,
      config: [
        { id: 'control', name: control, disabled },
        { id: 'discovery', name: control + '/list-agents', disabled: false },
      ],
    }],
  }
}

test('新宿主主插件已提供发现工具时只移除失效子入口，不修改原始定义', () => {
  const original = definition()
  const snapshot = structuredClone(original)
  const migrated = migratePresetDefinition(original, { hostBase: host('merged', true) })
  assert.deepEqual(original, snapshot)
  assert.deepEqual(migrated.definitions[0].plugins[0].config.map(row => row.id), ['control'])
  assert.equal(migrated.hostChanges.length, 1)
})

test('旧宿主仍导出独立入口时保留原定义', () => {
  const original = definition()
  const migrated = migratePresetDefinition(original, { hostBase: host('legacy', true, true) })
  assert.deepEqual(migrated.definitions, [original])
  assert.equal(migrated.hostChanges.length, 0)
})

test('没有合并证据或宿主文件不可读时不猜测迁移', () => {
  for (const base of [host('unproven', false), path.join(root, 'missing-host')]) {
    const original = definition()
    assert.deepEqual(migratePresetDefinition(original, { hostBase: base }).definitions, [original])
  }
})

test('主控制插件被禁用时不静默移除发现工具', () => {
  const original = definition(true)
  const migrated = migratePresetDefinition(original, { hostBase: host('disabled', true) })
  assert.deepEqual(migrated.definitions, [original])
})

test('移除旧入口不改变已存子会话预设 ID，也不移动策略绑定到其他工具', () => {
  const original = definition()
  original.plugins[0].config.push({
    id: 'spawn',
    name: '@deepseek-ai/dsh-tool-subagent',
    config: { provider: 'spawn', toolName: 'subagent', maxDepth: 1, toolFilter: { deny: ['subagent'] } },
  })
  const before = migratePresetDefinition(original, { hostBase: '' })
  const after = migratePresetDefinition(original, { hostBase: host('stable-child', true) })
  assert.equal(after.definitions[0].id, before.definitions[0].id)
  const parentRows = after.definitions[1].plugins[0].config
  assert.equal(parentRows.find(row => row.id === 'spawn').config.agentPreset, before.definitions[0].id)
  assert.ok(!parentRows.some(row => row.id === 'discovery'))
})

test('全零预设元数据会复现解析失败，恢复备份后保留完整 Agent 正文', () => {
  const dir = path.join(root, 'damaged')
  fs.cpSync(bundledPresetDir(), dir, { recursive: true })
  const metadata = path.join(dir, 'preset.yml')
  const saved = fs.readFileSync(metadata)
  const agent = fs.readFileSync(path.join(dir, 'agent.cordis.yml'))
  fs.writeFileSync(metadata, Buffer.alloc(saved.length))
  assert.throws(() => readPresetDefinition('unrestricted', dir), /expected "key: value"/)
  fs.writeFileSync(metadata, saved)
  assert.equal(readPresetDefinition('unrestricted', dir).id, 'unrestricted')
  assert.deepEqual(fs.readFileSync(path.join(dir, 'agent.cordis.yml')), agent)
})

test('预设安装先写临时文件并刷盘，再生成可读取的完整预设', () => {
  const home = path.join(root, 'durable-home')
  const originalCopy = fs.copyFileSync
  const originalSync = fs.fsyncSync
  const destinations = []
  let syncs = 0
  try {
    fs.copyFileSync = (...args) => { destinations.push(args[1]); return originalCopy(...args) }
    fs.fsyncSync = (...args) => { syncs++; return originalSync(...args) }
    installPreset({ home })
  } finally {
    fs.copyFileSync = originalCopy
    fs.fsyncSync = originalSync
  }
  assert.equal(destinations.length, 2)
  assert.ok(destinations.every(file => file.endsWith('.tmp')))
  assert.ok(syncs >= 2)
  const dir = path.join(home, '.agent-presets', 'unrestricted')
  assert.equal(readPresetDefinition('unrestricted', dir).id, 'unrestricted')
  assert.ok(fs.readdirSync(dir).every(file => !file.endsWith('.tmp')))
})

test('临时文件刷盘失败时保留原有预设并清理临时文件', () => {
  const home = path.join(root, 'failed-home')
  installPreset({ home })
  const dir = path.join(home, '.agent-presets', 'unrestricted')
  const metadata = fs.readFileSync(path.join(dir, 'preset.yml'))
  const agent = fs.readFileSync(path.join(dir, 'agent.cordis.yml'))
  const originalSync = fs.fsyncSync
  try {
    fs.fsyncSync = () => { throw new Error('fixture sync failed') }
    assert.throws(() => installPreset({ home, force: true }), /fixture sync failed/)
  } finally { fs.fsyncSync = originalSync }
  assert.deepEqual(fs.readFileSync(path.join(dir, 'preset.yml')), metadata)
  assert.deepEqual(fs.readFileSync(path.join(dir, 'agent.cordis.yml')), agent)
  assert.ok(fs.readdirSync(dir).every(file => !file.endsWith('.tmp')))
})

/** 取得指定编号的补丁。参数 id 为编号，返回唯一补丁定义。 */
function patch(id) {
  return ALL_PATCHES.find(item => item.id === id)
}

test('0.2.2 编辑观察入口可迁移，删除入口不被修改', () => {
  const item = patch(17)
  const source = item.replacements[2].pattern + '\n\tdeleteIntent(target, actor) { return this.requirePresent(target, actor, "delete"); }'
  const changed = applyReplacementsToText(source, item)
  assert.ok(changed.changed)
  assert.ok(changed.text.includes('observation bypass: edits'))
  assert.ok(changed.text.includes('return this.requirePresent(target, actor, "delete")'))
  assert.equal(applyReplacementsToText(changed.text, item).changed, false)
})

test('0.2.2 完整提示词保留本轮工具集合、必需上下文和注入且不重复', async () => {
  const item = patch(40)
  const changed = applyReplacementsToText(item.replacements[0].pattern, item)
  assert.ok(changed.changed)
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const assemble = new AsyncFunction('scopeTarget', 'scope', 'assembly', 'context', 'completeSection', 'runtimeContextSuppressed', 'contextByName', 'tools', changed.text)
  const tools = [{ name: 'selected-tool' }]
  const complete = { name: 'persona', text: '完整人设' }
  const injection = { name: 'dsh-purge-runtime', text: '追加指令' }
  const ctx = { waterfall: async () => ({ sections: [complete, injection], contexts: [{ name: 'required' }, { name: 'optional' }], tools: [] }) }
  const result = await assemble.call({ ctx }, () => ({}), {}, {}, {}, complete, true, new Map([['required', { name: 'required', required: true }]]), tools)
  assert.equal(result.tools, tools)
  assert.deepEqual(result.sections, [complete, injection])
  assert.deepEqual(result.contexts, [{ name: 'required' }])
  assert.equal(applyReplacementsToText(changed.text, item).changed, false)
})

test('0.2.2 首步组装保留模型选择与工具集合，准备钩子异常不损坏对话', async () => {
  const item = patch(74)
  const changed = applyReplacementsToText(item.replacements[0].pattern, item)
  assert.ok(changed.changed)
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const preStep = new AsyncFunction('assembleContextFor', 'signal', 'selection', 'toolSet', 'globalThis',
    changed.text + '\nreturn assembly;\n} catch (error) { toolSet.dispose(); throw error; }')
  const selection = { model: 'fixture' }
  const toolSet = { dispose() { throw new Error('unexpected disposal') } }
  let prepared = 0
  const result = await preStep.call({ loopCtx: { systemPrompt: { assemble: async input => input } } }, () => ({ agent: 'fixture' }), {}, selection, toolSet, {
    __dshPurgePrepareAssemble() { prepared++; throw new Error('fixture prepare failure') },
  })
  assert.equal(prepared, 1)
  assert.equal(result.modelSelection, selection)
  assert.equal(result.toolSet, toolSet)
  assert.equal(applyReplacementsToText(changed.text, item).changed, false)
})

test('0.2.2 审批流水线迁移只处理无通道，不覆盖用户明确拒绝', () => {
  const item = patch(62)
  const unavailable = item.replacements.find(row => typeof row.pattern === 'string' && row.pattern.startsWith('\t\tcase "unavailable"'))
  const source = item.replacements[0].pattern + '\nswitch(outcome){case "rejected": return {decision:{kind:"deny"},approvalCancelled:false};\n' + unavailable.pattern + '\n}'
  const changed = applyReplacementsToText(source, item)
  const decide = new Function('approval', 'ask', 'exec', 'outcome', changed.text)
  assert.equal(decide(undefined, {}, { name: 'fixture' }, 'rejected').decision.kind, 'allow')
  assert.equal(decide({}, {}, { name: 'fixture' }, 'unavailable').decision.kind, 'allow')
  assert.equal(decide({}, {}, { name: 'fixture' }, 'rejected').decision.kind, 'deny')
  assert.equal(applyReplacementsToText(changed.text, item).changed, false)
})

test('0.2.2 新 PTC 执行器和拆分审批文件都被加入目标映射', () => {
  const base = path.join(root, 'target-host')
  const expected = [
    ['dsh-tool-executor-ptc', 'lib', 'index.js'],
    ['dsh-tool-executor-ptc', 'lib', 'types', 'ptc.js'],
    ['dsh-tools', 'lib', 'pipeline.js'],
    ['dsh-tools', 'lib', 'types', 'pipeline.js'],
  ]
  for (const parts of expected) {
    const file = path.join(base, ...parts)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '')
  }
  const files = targetFiles(base, path.join(root, 'fixture-home'))
  assert.deepEqual(files['dsh-tools-ptc'], expected.slice(0, 2).map(parts => path.join(base, ...parts)))
  assert.ok(files['dsh-tools'].includes(path.join(base, ...expected[2])))
  assert.ok(files['dsh-tools-types'].includes(path.join(base, ...expected[3])))
  const item = patch(60)
  const source = item.replacements.map(row => row.pattern).join('\n')
  const changed = applyReplacementsToText(source, item)
  assert.ok(changed.changed)
  assert.equal(applyReplacementsToText(changed.text, item).changed, false)
})

test('0.2.2 桌面入口仅在未指定 profile 时补充 desktop，重复应用不再插入', () => {
  const item = patch(82)
  const changed = applyReplacementsToText(item.replacements[0].pattern, item)
  const source = changed.text.split('\n').slice(1).join('\n')
  const initialize = new Function('process', source)
  const empty = { env: {} }
  initialize(empty)
  assert.equal(empty.env.DSH_PROFILE, 'desktop')
  const explicit = { env: { DSH_PROFILE: 'custom' } }
  initialize(explicit)
  assert.equal(explicit.env.DSH_PROFILE, 'custom')
  assert.equal(applyReplacementsToText(changed.text, item).changed, false)
})

/** 创建 macOS 解包布局夹具。无参数，返回桌面入口、CLI 和宿主组件根；不运行 macOS 程序。 */
function macLayout() {
  const app = path.join(root, 'mac-host', 'DeepSeek Harness.app')
  const resources = path.join(app, 'Contents', 'Resources')
  const hostBase = path.join(resources, 'app', 'dsh', 'node_modules', '@deepseek-ai')
  const entry = path.join(hostBase, 'dsh-desktop-host', 'lib', 'host-process-entry.js')
  const cli = path.join(resources, 'runtime', 'cli', 'bin', 'dsh')
  for (const file of [entry, cli]) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '')
  }
  fs.writeFileSync(path.join(hostBase, 'dsh-desktop-host', 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-desktop-host' }))
  const controlDir = path.join(hostBase, 'dsh-tool-subagent-control')
  fs.mkdirSync(path.join(controlDir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(controlDir, 'package.json'), JSON.stringify({ exports: { '.': './lib/index.js' } }))
  fs.writeFileSync(path.join(controlDir, 'lib', 'index.js'), 'function apply(ctx) { registerListAgents(ctx); }')
  return { resources, hostBase, entry, cli, executable: path.join(app, 'Contents', 'MacOS', 'DeepSeek Harness') }
}

test('macOS 桌面进程布局能定位宿主并识别 desktop，不依赖 Windows cmd', () => {
  const layout = macLayout()
  assert.equal(currentHost({ env: {}, argv: [layout.executable, layout.entry] }), layout.hostBase)
  assert.equal(hostSurface(layout.hostBase), 'desktop')
  assert.equal(detectSurface({ env: {}, argv: [layout.executable, layout.entry], execPath: layout.executable, resourcesPath: layout.resources }), 'desktop')
})

test('macOS 无扩展名的官方 CLI 能定位同一安装的解包组件', () => {
  const layout = macLayout()
  assert.equal(currentHost({ env: { PURGE_DSH_CLI: layout.cli }, argv: [] }), layout.hostBase)
})

test('macOS 归档入口的磁盘诊断只选择同一 Contents/Resources 下的实体目录', () => {
  const layout = macLayout()
  const archiveBase = path.join(layout.resources, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai')
  assert.equal(diagnosticHost({ env: { DSH_BASE: archiveBase }, argv: [] }), layout.hostBase)
})

test('macOS 布局中两个随包预设都迁移旧控制入口且保留子会话 ID', () => {
  const { hostBase } = macLayout()
  for (const id of ['unrestricted', 'redteam']) {
    const original = readPresetDefinition(id, bundledPresetDir(id))
    const snapshot = structuredClone(original)
    const before = migratePresetDefinition(original, { hostBase: '' })
    const after = migratePresetDefinition(original, { hostBase })
    assert.deepEqual(original, snapshot)
    assert.deepEqual(after.definitions.map(def => def.id), before.definitions.map(def => def.id))
    assert.ok(after.hostChanges.length > 0)
    assert.ok(!JSON.stringify(after.definitions).includes(control + '/list-agents'))
  }
})

test('macOS 未检测 Kali 属于环境检查，不会被识别成已有 Kali', () => {
  const source = fs.readFileSync(new URL('../dsh-purge-self/lib/redteam/platform-config.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const start = source.indexOf('export function detectKali() {')
  const end = source.indexOf('\n}\n', start) + 2
  assert.ok(start >= 0 && end > start)
  const body = source.slice(start, end).replace('export function detectKali()', 'function detectKali()')
  const detect = new Function('osPlatform', 'readFileSync', body + '\nreturn detectKali();')
  const result = detect(() => 'darwin', () => { throw new Error('unexpected Linux probe') })
  assert.equal(result.kali, false)
  assert.equal(result.source, null)
})
