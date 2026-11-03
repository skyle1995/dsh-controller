import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as core from '../cli/lib/core.mjs'
import { verifyPack } from '../cli/lib/skill-packs.mjs'

/** 用本机官方技能提供器验证入口。无参数，返回可见目录及两个包的加载结果，不启动桌面或执行模块脚本。 */
async function main() {
  const moduleFile = path.join(core.RES, 'app', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-skill-filesystem', 'lib', 'index.js')
  const { FileSystemSkillProvider } = await import(pathToFileURL(moduleFile).href)
  const controller = new AbortController()
  const provider = new FileSystemSkillProvider({
    /** 获取可选服务。无参数，返回 undefined，使验证使用官方 Node 文件读取后端。 */
    get() { return undefined },
    logger: {
      /** 输出官方解析警告。参数 message 为说明，无返回值。 */
      warn(message) { console.warn(message) },
    },
  }, {
    signal: controller.signal,
    /** 接收无监听模式的失效通知。无参数，无返回值。 */
    invalidate() {},
  }, { includeDefaultRoots: false, customSkillDirs: [core.SKILLS_DIR], watch: false })
  try {
    const result = await provider.list({})
    const candidates = Array.isArray(result) ? result : result.candidates
    const packs = []
    for (const name of ['redteam-skill', 'reverse-skill']) {
      const candidate = candidates.find(item => item.name === name)
      assert.ok(candidate, '官方提供器没有发现入口: ' + name)
      const loaded = await provider.get(candidate, {})
      assert.ok(loaded.content.includes('使用流程'))
      assert.equal(loaded.resourceBase.path, path.join(core.SKILLS_DIR, name))
      packs.push(verifyPack(loaded.resourceBase.path))
    }
    return { ok: true, backend: 'official-node-filesystem', visibleSkills: candidates.map(item => item.name), packs }
  } finally {
    controller.abort()
    await provider.dispose()
    core.stopRunningCommands()
  }
}

main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1 })
