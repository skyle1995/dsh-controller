// 准备技能包:把 reverse-skill 复制到 resources/reverse-skill(不提交 git)
// 来源优先级:WUJIN_PACK_SRC 环境变量 > 本地已安装的「无限破甲」数据目录 > GitHub 克隆
import { cp, mkdir, rm, stat } from 'fs/promises'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'

const DEST = path.resolve(import.meta.dirname, '../resources/reverse-skill')
const APP_SUPPORT_SRC = path.join(os.homedir(), 'Library/Application Support/无限破甲/reverse-skill')
const GIT_URL = 'https://github.com/zhaoxuya520/reverse-skill'

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function main() {
  const envSrc = process.env.WUJIN_PACK_SRC
  let src = envSrc && (await exists(envSrc)) ? envSrc : null
  if (!src && (await exists(APP_SUPPORT_SRC))) src = APP_SUPPORT_SRC

  await rm(DEST, { recursive: true, force: true })
  await mkdir(path.dirname(DEST), { recursive: true })

  if (src) {
    console.log(`[prepare-pack] 从本地复制: ${src}`)
    await cp(src, DEST, { recursive: true })
  } else {
    console.log(`[prepare-pack] 本地未找到技能包,从 GitHub 克隆: ${GIT_URL}`)
    if (existsSync(path.join(DEST, '.git'))) await rm(DEST, { recursive: true, force: true })
    execSync(`git clone --depth 1 ${GIT_URL} "${DEST}"`, { stdio: 'inherit' })
    await rm(path.join(DEST, '.git'), { recursive: true, force: true })
  }
  console.log(`[prepare-pack] 完成: ${DEST}`)
}

main().catch((e) => { console.error('[prepare-pack] 失败:', e.message); process.exit(1) })
