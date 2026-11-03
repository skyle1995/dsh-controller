import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { installPackDirectory, refreshPackEntry, scanPackModules, verifyPack, removePackEntry } from '../cli/lib/skill-packs.mjs'
import { readPackIndex, readPackModule } from '../cli/lib/skill-pack-loader.mjs'

const parent = path.join(path.dirname(fileURLToPath(import.meta.url)), '.runtime')
fs.mkdirSync(parent, { recursive: true })
const temp = fs.mkdtempSync(path.join(parent, 'skill-packs-'))
after(() => fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))

/** 创建独立夹具目录。参数 name 为夹具名称，返回已创建的绝对路径。 */
function fixture(name) {
  const root = path.join(temp, name + " 中文 & quote'")
  fs.mkdirSync(root, { recursive: true })
  return root
}

/** 写入夹具文件。参数 root 为根目录、relative 为相对路径、text 为内容，无返回值。 */
function write(root, relative, text) {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

/** 创建技能正文。参数 name 为模块名，返回带 frontmatter 和资源引用的 Markdown。 */
function body(name) { return '---\nname: ' + name + '\ndescription: 测试模块\n---\n# 模块\n读取 references/guide.md；本测试不执行工具。\n' }

const home = fixture('home')
const skills = path.join(home, 'skills')
const red = fixture('red-source')
const reverse = fixture('reverse-source')
write(red, 'recon/red-demo.md', body('red-demo'))
write(red, 'recon/references/guide.md', '红队参考资料')
write(reverse, 'skill/android-demo/SKILL.md', body('android-demo'))
write(reverse, 'skill/android-demo/references/guide.md', 'Android 参考资料')
write(reverse, 'skills/js-demo/SKILL.md', body('js-demo'))
write(reverse, 'skills/js-demo/references/guide.md', 'JS 参考资料')
write(reverse, 'scripts/marker.mjs', 'throw new Error("不得自动执行")')

test('两个包仅有两个顶层入口，完整保留嵌套模块及参考资源', () => {
  assert.equal(installPackDirectory({ source: red, home, kind: 'red' }).ok, true)
  assert.equal(installPackDirectory({ source: reverse, home, kind: 'reverse' }).ok, true)
  const entries = fs.readdirSync(skills).filter(name => fs.existsSync(path.join(skills, name, 'SKILL.md'))).sort()
  assert.deepEqual(entries, ['redteam-skill', 'reverse-skill'])
  const root = path.join(skills, 'reverse-skill')
  const loaded = readPackModule(root, 'skill/android-demo')
  assert.equal(loaded.content, body('android-demo'))
  assert.equal(fs.readFileSync(path.join(loaded.resourceBase.path, 'references', 'guide.md'), 'utf8'), 'Android 参考资料')
  assert.equal(verifyPack(root).count, 2)
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'marker.mjs')))
})

test('独立加载器可在中文、空格、单引号和 & 路径中读取完整正文', () => {
  const root = path.join(skills, 'reverse-skill')
  const result = JSON.parse(execFileSync(process.execPath, [path.join(root, '.dshc-load.mjs'), 'read', 'skills/js-demo'], { encoding: 'utf8' }))
  assert.equal(result.content, body('js-demo'))
  assert.equal(result.resourceBase.path, path.join(root, 'skills', 'js-demo'))
  assert.equal(JSON.parse(execFileSync(process.execPath, [path.join(root, '.dshc-load.mjs'), 'list'], { encoding: 'utf8' })).modules.length, 2)
})

test('未登记 ID 和篡改索引的越界路径不能读取包外文件', () => {
  const root = path.join(skills, 'reverse-skill')
  assert.throws(() => readPackModule(root, '../../outside'), /未登记/)
  const file = path.join(root, '.dshc-index.json')
  const original = fs.readFileSync(file)
  const index = JSON.parse(original)
  write(home, 'outside.txt', 'private fixture')
  index.modules[0].file = path.relative(root, path.join(home, 'outside.txt'))
  fs.writeFileSync(file, JSON.stringify(index))
  assert.throws(() => readPackModule(root, index.modules[0].id), /超出/)
  fs.writeFileSync(file, original)
})

test('迁移仅归档状态与字节匹配的单文件目录，保留修改和额外资源', () => {
  const stateFile = path.join(skills, '.purge-redteam.json')
  const state = JSON.parse(fs.readFileSync(stateFile))
  state.registered = ['red-demo', 'changed', 'extended', '../outside']
  fs.writeFileSync(stateFile, JSON.stringify(state))
  write(skills, 'red-demo/SKILL.md', body('red-demo'))
  write(skills, 'changed/SKILL.md', '用户修改')
  write(skills, 'extended/SKILL.md', body('red-demo'))
  write(skills, 'extended/notes.md', '用户资源')
  write(skills, 'unrelated/SKILL.md', body('unrelated'))
  const result = refreshPackEntry({ home, kind: 'red' })
  assert.deepEqual(result.archived, ['red-demo'])
  assert.deepEqual(result.preserved, ['changed', 'extended'])
  assert.equal(fs.existsSync(path.join(skills, 'red-demo')), false)
  assert.equal(fs.readFileSync(path.join(result.backup, 'legacy', 'red-demo', 'SKILL.md'), 'utf8'), body('red-demo'))
  assert.equal(fs.readFileSync(path.join(skills, 'changed', 'SKILL.md'), 'utf8'), '用户修改')
  assert.ok(fs.existsSync(path.join(skills, 'unrelated', 'SKILL.md')))
})

test('逆向旧状态遗失 registered 时仍用 modules 加正文签名安全迁移', () => {
  const stateFile = path.join(skills, '.reverse-skill.json')
  fs.writeFileSync(stateFile, JSON.stringify({ version: '1.0.0', modules: ['android-demo'] }))
  write(skills, 'android-demo/SKILL.md', body('android-demo'))
  const result = refreshPackEntry({ home, kind: 'reverse' })
  assert.deepEqual(result.archived, ['android-demo'])
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).mode, 'entry-only')
})

test('已被修改的生成入口不会被刷新覆盖', () => {
  const root = path.join(skills, 'reverse-skill')
  const file = path.join(root, 'SKILL.md')
  const original = fs.readFileSync(file)
  fs.appendFileSync(file, '\n用户自定义指令\n')
  assert.throws(() => refreshPackEntry({ home, kind: 'reverse' }), /已被修改/)
  assert.ok(fs.readFileSync(file, 'utf8').includes('用户自定义指令'))
  fs.writeFileSync(file, original)
})

test('失败的新安装不会删除原包，同名未知目录也不覆盖', () => {
  const invalid = fixture('invalid-source')
  const original = fs.readFileSync(path.join(skills, 'reverse-skill', 'SKILL.md'))
  assert.equal(installPackDirectory({ source: invalid, home, kind: 'reverse' }).ok, false)
  assert.deepEqual(fs.readFileSync(path.join(skills, 'reverse-skill', 'SKILL.md')), original)
  const other = fixture('other-home')
  write(other, 'skills/redteam-skill/SKILL.md', '自定义同名包')
  write(other, 'skills/redteam-skill/recon/red-demo.md', body('red-demo'))
  assert.equal(installPackDirectory({ source: red, home: other, kind: 'red' }).ok, false)
  assert.throws(() => refreshPackEntry({ home: other, kind: 'red' }), /所有权/)
  assert.equal(fs.readFileSync(path.join(other, 'skills/redteam-skill/SKILL.md'), 'utf8'), '自定义同名包')
})

test('重复刷新不再生成散装副本，模块正文修改有明确 changed 标记', () => {
  const root = path.join(skills, 'reverse-skill')
  const result = refreshPackEntry({ home, kind: 'reverse' })
  assert.equal(result.archived.length, 0)
  const index = readPackIndex(root)
  assert.equal(index.modules.length, scanPackModules(root, 'reverse').length)
  const module = index.modules[0]
  fs.appendFileSync(path.join(root, module.file), '\n新增说明')
  assert.equal(readPackModule(root, module.id).changed, true)
  assert.equal(fs.existsSync(path.join(skills, 'android-demo')), false)
})

test('卸载为可恢复归档，不删除其他用户技能', () => {
  const result = removePackEntry({ home, kind: 'red' })
  assert.equal(result.ok, true)
  assert.equal(fs.existsSync(path.join(skills, 'redteam-skill')), false)
  assert.ok(fs.existsSync(path.join(result.backup, 'package', 'recon', 'red-demo.md')))
  assert.ok(fs.existsSync(path.join(skills, 'unrelated', 'SKILL.md')))
})

test('仅有 CRLF 差异的旧副本可归档，备份保留原始字节', () => {
  const other = fixture('crlf-home')
  assert.equal(installPackDirectory({ source: red, home: other, kind: 'red' }).ok, true)
  const stateFile = path.join(other, 'skills', '.purge-redteam.json')
  fs.writeFileSync(stateFile, JSON.stringify({ registered: ['red-demo'] }))
  const bytes = body('red-demo').replaceAll('\n', '\r\n')
  write(other, 'skills/red-demo/SKILL.md', bytes)
  const result = refreshPackEntry({ home: other, kind: 'red' })
  assert.deepEqual(result.archived, ['red-demo'])
  assert.equal(fs.readFileSync(path.join(result.backup, 'legacy', 'red-demo', 'SKILL.md'), 'utf8'), bytes)
})
