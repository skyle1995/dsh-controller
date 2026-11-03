import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const PACKS = [{ name: 'redteam-skill', library: 'redteam' }, { name: 'reverse-skill', library: 'reverse' }]

/** 读取已安装包的模块目录。参数 home 为数据目录，返回模块、包状态及错误；只读 JSON/Markdown，不执行包内代码。 */
export function installedPackCatalog(home = process.env.DSH_HOME || path.join(homedir(), '.dsh')) {
  const items = [], packs = [], errors = []
  for (const pack of PACKS) {
    const root = path.join(home, 'skills', pack.name)
    const indexFile = path.join(root, '.dshc-index.json')
    if (!existsSync(indexFile)) continue
    packs.push(pack.name)
    try {
      const raw = readFileSync(indexFile, 'utf8')
      const index = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
      if (index.owner !== 'dsh-controller' || index.schema !== 1 || !Array.isArray(index.modules)) throw new Error('技能包索引无效')
      const base = realpathSync(root)
      const seen = new Set()
      for (const module of index.modules) {
        if (typeof module.id !== 'string' || !module.id || seen.has(module.id)) throw new Error('模块 ID 无效或重复')
        seen.add(module.id)
        const item = {
          name: pack.name + '/' + module.id, displayName: typeof module.name === 'string' ? module.name : module.id,
          aliases: [...new Set([module.name, path.posix.basename(module.id)].filter(value => typeof value === 'string' && value))],
          description: typeof module.description === 'string' ? module.description : '', category: typeof module.category === 'string' ? module.category : '',
          pack: pack.name, moduleId: module.id, library: pack.library,
          provider: 'dsh-controller', source: 'pack-index', loadVia: pack.name,
          packRoot: base, content: '', path: null, root: base, resourceBase: { kind: 'directory', path: base },
        }
        try {
          if (typeof module.file !== 'string' || !module.file.toLowerCase().endsWith('.md')) throw new Error('模块文件路径无效')
          const file = path.resolve(base, module.file)
          const relative = path.relative(base, file)
          if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('模块路径超出技能包')
          const real = realpathSync(file)
          const realRelative = path.relative(base, real)
          if (!realRelative || realRelative === '..' || realRelative.startsWith('..' + path.sep) || path.isAbsolute(realRelative)) throw new Error('模块链接超出技能包')
          item.path = real
          item.resourceBase = { kind: 'directory', path: path.dirname(real) }
          item.root = item.resourceBase.path
          item.content = readFileSync(real, 'utf8')
        } catch (error) {
          item.error = error.message
          errors.push({ pack: pack.name, moduleId: module.id, error: error.message })
        }
        items.push(item)
      }
    } catch (error) { errors.push({ pack: pack.name, error: error.message }) }
  }
  return { items, packs, errors }
}

/** 判断宿主条目是否为已索引包入口。参数 summary 为技能摘要，返回布尔值；入口不再重复计为演练模块。 */
export function isPackEntry(summary) {
  if (!summary || !PACKS.some(pack => pack.name === summary.name)) return false
  const root = summary.path ? path.dirname(summary.path) : (summary.resourceBase?.path || summary.dir)
  if (!root) return false
  try {
    const raw = readFileSync(path.join(root, '.dshc-index.json'), 'utf8')
    const index = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
    return index.owner === 'dsh-controller' && index.schema === 1
  } catch { return false }
}

/** 读取指定包模块。参数 name 为稳定名称或唯一别名、library 为可选分类，返回读取结果；非包条目返回 undefined。 */
export function readInstalledPackSkill(name, library) {
  if (typeof name !== 'string' || !name) return undefined
  const catalog = installedPackCatalog()
  const candidates = catalog.items.filter(item => !library || item.library === library)
  let matches = candidates.filter(item => item.name === name)
  if (!matches.length) matches = candidates.filter(item => item.aliases.includes(name))
  if (!matches.length) return PACKS.some(pack => name.startsWith(pack.name + '/')) ? { ok: false, error: '包模块未登记: ' + name } : undefined
  if (matches.length > 1) return { ok: false, error: '模块名称不唯一，请使用完整包模块 ID: ' + name }
  const item = matches[0]
  if (item.error || !item.content.trim()) return { ok: false, error: item.error || '模块正文为空' }
  return { ok: true, ...item }
}

/** 匹配预检选择项。参数 summary 为模块摘要、name 为用户指定名称，返回名称或兼容别名是否匹配。 */
export function skillSelectionMatches(summary, name) {
  return summary.name === name || (Array.isArray(summary.aliases) && summary.aliases.includes(name))
}
