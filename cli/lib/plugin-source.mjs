import path from 'node:path'
import os from 'node:os'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, lstatSync, realpathSync } from 'node:fs'
import * as core from './core.mjs'

/** 解析 Git 子目录来源。参数 spec 为来源字符串，返回仓库、修订和子目录；非该格式返回 null。 */
export function parseGitPluginSource(spec) {
  if (typeof spec !== 'string' || !spec.includes('&path:')) return null
  const url = new URL(spec.startsWith('git+') ? spec.slice(4) : spec)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Git 插件来源必须使用无内嵌凭据的 HTTPS URL')
  const parts = url.hash.slice(1).split('&path:')
  if (parts.length !== 2) throw new Error('Git 插件来源必须包含唯一的子目录')
  const ref = decodeURIComponent(parts[0] || 'main')
  const directory = decodeURIComponent(parts[1])
  if (ref.startsWith('-') || !directory || directory.includes('\\') || directory.includes(':') || directory.startsWith('/') || directory.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Git 插件修订或子目录无效')
  url.hash = ''
  return { url: url.href, ref, directory }
}

/** 复制已构建的发布文件。参数 source 为源码包目录、stage 为目标目录，返回包元数据；不运行构建脚本。 */
export function stagePublishedPlugin(source, stage) {
  if (lstatSync(path.join(source, 'package.json')).isSymbolicLink()) throw new Error('插件清单不能是符号链接')
  const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'))
  if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string' || !Array.isArray(pkg.files) || !pkg.files.length) throw new Error('插件缺少包名、版本或明确的发布清单')
  if ([pkg.name, pkg.version].some(s => s.includes('\\') || s.includes(':') || s.includes('..')) || pkg.version.includes('/')) throw new Error('插件包名或版本无效')
  mkdirSync(stage, { recursive: true })
  writeFileSync(path.join(stage, 'package.json'), readFileSync(path.join(source, 'package.json')))
  for (const entry of pkg.files) {
    if (typeof entry !== 'string' || entry.includes('*') || entry.includes('!') || path.isAbsolute(entry)) throw new Error('发布清单包含非确定性路径: ' + entry)
    const file = path.resolve(source, entry)
    const relative = path.relative(source, file)
    if (!relative || relative.startsWith('..') || relative.split(path.sep).includes('node_modules')) throw new Error('发布路径超出插件目录: ' + entry)
    const target = path.join(stage, relative)
    mkdirSync(path.dirname(target), { recursive: true })
    try {
      if (path.relative(realpathSync(source), realpathSync(file)).startsWith('..')) throw new Error('发布路径指向插件目录之外: ' + entry)
      cpSync(file, target, { recursive: true, filter: item => {
        const parts = path.relative(source, item).split(path.sep)
        if (parts.includes('node_modules') || parts.includes('.git')) return false
        if (lstatSync(item).isSymbolicLink()) throw new Error('发布文件包含符号链接: ' + entry)
        return true
      } })
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('插件发布文件缺失，请先构建或使用正式发布包: ' + entry)
      throw e
    }
  }
  return pkg
}

/** 在独立目录准备 Git 插件。参数为解析后的来源及可选克隆器/目录，返回持久 tarball 和固定提交信息。 */
export async function prepareGitPlugin(source, { clone = core.cloneRepository, tempRoot = os.tmpdir(), packageDir = path.join(core.DSH_HOME, 'dsh-controller', 'pkgs') } = {}) {
  const temp = mkdtempSync(path.join(tempRoot, 'dshc-git-plugin-'))
  try {
    const repo = path.join(temp, 'repo')
    const cloned = await clone(repo, temp, { url: source.url, ref: source.ref })
    if (!cloned.ok) return { ok: false, error: 'Git 插件检出失败: ' + cloned.output }
    const commit = await core.run('git', ['-C', repo, 'rev-parse', 'HEAD'])
    if (!commit.ok) return { ok: false, error: '无法确认 Git 插件提交: ' + commit.output }
    const directory = path.resolve(repo, ...source.directory.split('/'))
    const relative = path.relative(repo, directory)
    if (!relative || relative.startsWith('..')) throw new Error('插件子目录超出仓库范围')
    if (path.relative(realpathSync(repo), realpathSync(directory)).startsWith('..')) throw new Error('插件子目录指向仓库之外')
    const pkg = stagePublishedPlugin(directory, path.join(temp, 'package'))
    mkdirSync(packageDir, { recursive: true })
    const tarball = path.join(packageDir, pkg.name.replaceAll('/', '-') + '-' + pkg.version + '-' + commit.output.trim().slice(0, 12) + '-' + Date.now() + '.tgz')
    const packed = await core.run('tar', ['-czf', tarball, '-C', temp, 'package'])
    if (!packed.ok) return { ok: false, error: 'Git 插件归档失败: ' + packed.output }
    return { ok: true, tarball, name: pkg.name, version: pkg.version, commit: commit.output.trim(), source: source.url + '#' + source.ref + '&path:' + source.directory }
  } catch (e) { return { ok: false, error: e.message } }
  finally { rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
}
