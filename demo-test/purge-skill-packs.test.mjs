import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { installPackDirectory } from '../cli/lib/skill-packs.mjs'
import { installedPackCatalog, readInstalledPackSkill, skillSelectionMatches } from '../dsh-purge-self/lib/redteam/skill-pack-catalog.js'
import { bundledSkillSummaries, checkSkill, officialSkillSummaries, redteamSummariesForCheck } from '../dsh-purge-self/lib/redteam/skill-availability.js'
import { renderPackSkillsDir } from '../dsh-purge-self/lib/redteam/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const parent = path.join(here, '.runtime')
fs.mkdirSync(parent, { recursive: true })
const temp = fs.mkdtempSync(path.join(parent, 'purge-packs-'))
const home = path.join(temp, "中文 home & '")
const original = process.env.DSH_HOME
process.env.DSH_HOME = home
after(() => {
  if (original === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = original
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

/** 创建技能夹具。参数为根目录、相对路径及正文，无返回值。 */
function write(root, relative, text) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
  fs.writeFileSync(path.join(root, relative), text)
}
/** 生成只读技能正文。参数 name 为名字，返回 Markdown 文本。 */
function body(name) { return '---\nname: ' + name + '\ndescription: 测试技能\n---\n# 模块\n读取 references/guide.md\n' }

const red = path.join(temp, 'red'), reverse = path.join(temp, 'reverse')
write(red, 'recon/demo.md', body('demo'))
write(red, 'recon/references/guide.md', 'red guide')
write(reverse, 'skills/demo/SKILL.md', body('demo'))
write(reverse, 'skills/demo/references/guide.md', 'reverse guide')
write(reverse, 'skill/android/SKILL.md', body('android'))
write(reverse, 'skill/android/references/guide.md', 'android guide')
assert.equal(installPackDirectory({ source: red, home, kind: 'red' }).ok, true)
assert.equal(installPackDirectory({ source: reverse, home, kind: 'reverse' }).ok, true)
write(home, 'skills/custom/SKILL.md', body('custom'))

test('演练目录展开两个索引包，不重复旧随包红队或两个入口', () => {
  const catalog = installedPackCatalog()
  assert.equal(catalog.items.length, 3)
  assert.equal(catalog.errors.length, 0)
  assert.equal(new Set(catalog.items.map(item => item.name)).size, 3)
  assert.equal(bundledSkillSummaries().length, 3)
  assert.deepEqual(officialSkillSummaries().map(item => item.name), ['custom'])
})

test('包命名空间区分重名模块，正文与引用基目录正确', () => {
  assert.equal(readInstalledPackSkill('demo').ok, false)
  const redItem = readInstalledPackSkill('demo', 'redteam')
  const reverseItem = readInstalledPackSkill('reverse-skill/skills/demo', 'reverse')
  assert.equal(redItem.content, body('demo'))
  assert.equal(reverseItem.content, body('demo'))
  assert.equal(fs.readFileSync(path.join(reverseItem.resourceBase.path, 'references/guide.md'), 'utf8'), 'reverse guide')
  assert.equal(reverseItem.loadVia, 'reverse-skill')
})

test('作用域中的旧红队和入口不重复预检，旧别名仍能匹配', () => {
  const old = [
    { name: 'demo', library: 'redteam', content: 'old' },
    { name: 'redteam-skill', path: path.join(home, 'skills/redteam-skill/SKILL.md') },
    { name: 'reverse-skill', path: path.join(home, 'skills/reverse-skill/SKILL.md') },
  ]
  const list = redteamSummariesForCheck(old, bundledSkillSummaries(), true)
  assert.equal(list.length, 3)
  assert.ok(list.every(item => item.pack))
  assert.equal(list.filter(item => skillSelectionMatches(item, 'android')).length, 1)
})

test('预设只去除标准旧平铺根，保留用户自定义目录', () => {
  const text = "customSkillDirs:\n  - !!js dshHomePath('skills')\n  - !!js dshHomePath('redteam/skills')\n  - !!js dshHomePath('my-skills')\n"
  const result = renderPackSkillsDir(text, true)
  assert.equal(result.changed, true)
  assert.ok(!result.text.includes("dshHomePath('redteam/skills')"))
  assert.ok(result.text.includes("dshHomePath('my-skills')"))
  assert.equal(result.text.split("dshHomePath('skills')").length - 1, 1)
  assert.deepEqual(renderPackSkillsDir(text, false), { text, changed: false })
})

test('缺失模块报告不可用，越界索引拒绝读取包外文件', () => {
  const root = path.join(home, 'skills/reverse-skill')
  const file = path.join(root, '.dshc-index.json')
  const originalIndex = fs.readFileSync(file)
  const index = JSON.parse(originalIndex)
  write(home, 'secret.md', '不得读取的夹具')
  index.modules[0].file = path.relative(root, path.join(home, 'secret.md'))
  fs.writeFileSync(file, JSON.stringify(index))
  const broken = installedPackCatalog().items.find(item => item.moduleId === index.modules[0].id)
  assert.equal(broken.content, '')
  assert.equal(checkSkill(broken).status, 'broken')
  assert.equal(readInstalledPackSkill(broken.name).ok, false)
  fs.writeFileSync(file, originalIndex)
  const module = index.modules[0]
  const target = path.join(root, module.file)
  // 索引中的越界路径已恢复；使用原索引定位真实模块做缺失验证。
  const actual = path.join(root, JSON.parse(originalIndex).modules[0].file)
  const bytes = fs.readFileSync(actual)
  fs.rmSync(actual)
  assert.equal(checkSkill(installedPackCatalog().items.find(item => item.moduleId === module.id)).status, 'broken')
  fs.writeFileSync(actual, bytes)
  assert.ok(target !== actual)
})

const nativeSupported = Number(process.versions.node.split('.')[0]) >= 22
test('演练 API 返回红队、逆向、官方分类，并通过包路径读取正文', { skip: !nativeSupported }, async () => {
  const { handleSkillOp } = await import('../dsh-purge-self/lib/redteam/ui.js')
  const ctx = { get() { return undefined } }
  const catalog = await handleSkillOp(ctx, { op: 'skillCatalog', refresh: true })
  assert.deepEqual(catalog.libraries, { redteam: 1, reverse: 2, official: 1 })
  assert.equal(catalog.total, 4)
  assert.equal(catalog.fromPacks, 3)
  assert.ok(catalog.items.every(item => !Object.hasOwn(item, 'content')))
  const result = await handleSkillOp(ctx, { op: 'skillRead', name: 'reverse-skill/skills/demo', library: 'reverse' })
  assert.equal(result.content, body('demo'))
  assert.equal(result.resourceBase.path, path.join(home, 'skills/reverse-skill/skills/demo'))
})

test('原生注册表就绪时也优先安装包，不累加旧红队数量', { skip: !nativeSupported }, async () => {
  const { handleSkillOp } = await import('../dsh-purge-self/lib/redteam/ui.js')
  const services = {
    skills: { async list() { return [{ name: 'demo', library: 'redteam', description: 'old' }] }, async get() { return { content: 'old' } } },
    agentPresets: { standingKeyFor() { return 'fixture' } },
  }
  const catalog = await handleSkillOp({ get(name) { return services[name] } }, { op: 'skillCatalog', refresh: true })
  assert.deepEqual(catalog.libraries, { redteam: 1, reverse: 2, official: 1 })
})

test('客户端实际技能组件渲染三分类和新数量，包过滤不会隐藏索引模块', () => {
  const source = fs.readFileSync(path.join(here, '../dsh-purge-self/lib/redteam/client.js'), 'utf8')
  const start = source.indexOf('function SkillsTab(props)')
  const end = source.indexOf('\n    /*', start)
  assert.ok(start >= 0 && end > start)
  const items = installedPackCatalog().items
  const meta = { libraries: { redteam: 1, reverse: 2, official: 0 }, fromPacks: 3 }
  const states = [items, meta, null, '', true, null, null, false, false]
  let cursor = 0
  const tree = vm.runInNewContext(source.slice(start, end) + '\nSkillsTab({})', {
    React: { useState() { return [states[cursor++], () => {}] }, useEffect() {} },
    h(type, props, ...children) { return { type, props, children } },
    clickable() { return {} }, api() {}, fmt() { return '' },
  })
  const rendered = JSON.stringify(tree)
  assert.ok(rendered.includes('红队技能'))
  assert.ok(rendered.includes('逆向技能'))
  assert.ok(rendered.includes('红队 1 · 逆向 2 · 官方 0'))
  assert.ok(rendered.includes('reverse-skill/skills/demo'))
  assert.ok(rendered.includes('包内模块'))
})

test('实际分发客户端同样显示三分类、新统计和包模块详情', () => {
  const source = fs.readFileSync(path.join(here, '../dsh-purge-self/client.js'), 'utf8')
  const start = source.indexOf('function SkillsTab(props)')
  const end = source.indexOf('\n  const SEV_LABEL =', start)
  assert.ok(start >= 0 && end > start)
  const items = installedPackCatalog().items
  const selected = items.find(item => item.name === 'reverse-skill/skills/demo')
  const detail = { ...selected, ok: true }
  const states = [items, { libraries: { redteam: 1, reverse: 2, official: 0 }, fromPacks: 3 }, null, '', true, selected.library + ':' + selected.name, detail, false, false]
  let cursor = 0
  const tree = vm.runInNewContext(source.slice(start, end) + '\nSkillsTab({})', {
    import_react2: { default: { useState() { return [states[cursor++], () => {}] }, useEffect() {} } },
    h2(type, props, ...children) { return { type, props, children } },
    clickable() { return {} }, api() {}, fmt() { return '' },
  })
  const rendered = JSON.stringify(tree)
  assert.ok(rendered.includes('逆向技能'))
  assert.ok(rendered.includes('红队 1 · 逆向 2 · 官方 0'))
  assert.ok(rendered.includes('资源基目录'))
  assert.ok(rendered.includes('包入口'))
  assert.ok(rendered.includes('reverse-skill → skills/demo'))
})
