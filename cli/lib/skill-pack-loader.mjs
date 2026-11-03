import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

/** 读取入口清单。参数 root 为技能包根目录，返回已验证的包级索引。 */
export function readPackIndex(root) {
  const index = JSON.parse(readFileSync(path.join(root, '.dshc-index.json'), 'utf8'))
  if (index.owner !== 'dsh-controller' || index.schema !== 1 || !Array.isArray(index.modules)) throw new Error('技能包索引无效，请重新生成入口')
  return index
}

/** 读取已登记模块。参数 root 为包根目录、id 为索引内模块 ID，返回正文及真实资源基目录，不执行脚本。 */
export function readPackModule(root, id) {
  const index = readPackIndex(root)
  const module = index.modules.find(item => item.id === id)
  if (!module) throw new Error('模块未登记: ' + id)
  const base = realpathSync(root)
  const file = realpathSync(path.resolve(root, module.file))
  const relative = path.relative(base, file)
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('模块路径超出技能包')
  const bytes = readFileSync(file)
  return {
    name: module.name, id: module.id, category: module.category,
    content: bytes.toString('utf8'), path: file, packRoot: base,
    resourceBase: { kind: 'directory', path: path.dirname(file) },
    changed: createHash('sha256').update(bytes).digest('hex') !== module.sha256,
  }
}

/** 执行只读加载命令。参数 args 为 list 或 read 加模块 ID、root 为包目录，无返回值，失败设置退出码。 */
function main(args, root) {
  try {
    let result
    switch (args[0]) {
      case 'list': result = readPackIndex(root); break
      case 'read': result = readPackModule(root, args[1]); break
      default: throw new Error('用法: node .dshc-load.mjs list | read <模块ID>')
    }
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : ''
const self = fileURLToPath(import.meta.url)
if ((process.platform === 'win32' ? invoked.toLowerCase() === self.toLowerCase() : invoked === self)) main(process.argv.slice(2), path.dirname(self))
