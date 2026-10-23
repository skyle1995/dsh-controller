#!/usr/bin/env node
// 批量把 Gitea 仓库中插件包对 dsh 的精确版本要求放宽为 semver 范围。
// 只改"精确版本"(如 0.2.0-rc.2),已有的范围(>=、^、~、<、workspace: 等)一律保持不动。
// 用法(默认 dry-run,加 --apply 才会提交):
//   GITEA_TOKEN=xxx node scripts/relax-plugin-ranges.mjs \
//     --api https://hub.ifunx.com --owner skyle1995 --repo dsh-plugins \
//     --branch main --bump-patch --apply
// 说明见 docs/plugin-version-range-guide.md

const DSH = '@deepseek-ai/dsh'
// 只匹配「精确版本」:x.y.z 或 x.y.z-<prerelease>
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function parseArgs(argv) {
  const out = { paths: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '--api': out.api = next(); break
      case '--owner': out.owner = next(); break
      case '--repo': out.repo = next(); break
      case '--branch': out.branch = next(); break
      case '--range': out.range = next(); break
      case '--message': out.message = next(); break
      case '--paths':
      case '--path': out.paths.push(next()); break
      case '--bump-patch': out.bumpPatch = true; break
      case '--apply': out.apply = true; break
      case '--help':
      case '-h': out.help = true; break
      default: throw new Error(`未知参数: ${a}`)
    }
  }
  return out
}

function usage() {
  console.log(`用法: node scripts/relax-plugin-ranges.mjs [选项]

  --api <url>        Gitea 地址,默认 https://hub.ifunx.com
  --owner <name>     仓库 owner(必填)
  --repo <name>      仓库名(必填)
  --branch <name>    分支,默认 main
  --range <range>    把精确版本统一改成的范围;不填则按 >=<原版本> 放宽
  --paths <file>     只处理指定 package.json(可重复,或逗号分隔)
  --bump-patch       改动后 patch +1(推荐)
  --apply            真正提交;不加则 dry-run
  --message <text>   提交信息

凭据:GITEA_TOKEN,或 GITEA_USER + GITEA_PASSWORD
注意:只放宽精确版本,已有范围(如 >=0.1.7-rc.1 <0.3.0-0)不会被覆盖。
`)
}

function authHeader() {
  if (process.env.GITEA_TOKEN) return `token ${process.env.GITEA_TOKEN}`
  const user = process.env.GITEA_USER
  const pass = process.env.GITEA_PASSWORD
  if (user && pass) return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
  throw new Error('缺少凭据:请设置 GITEA_TOKEN,或 GITEA_USER + GITEA_PASSWORD')
}

function expandPaths(opts) {
  return opts.paths.flatMap(p => p.split(',')).map(p => p.trim()).filter(Boolean)
}

// 精确版本 -> 范围:显式 --range 优先,否则 >=原版本
function relaxExact(value, forcedRange) {
  const v = String(value).trim()
  if (!EXACT_VERSION.test(v)) return null
  return forcedRange && forcedRange.trim() ? forcedRange.trim() : `>=${v}`
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) return usage()
  const api = (opts.api ?? 'https://hub.ifunx.com').replace(/\/$/, '')
  const owner = opts.owner
  const repo = opts.repo
  const branch = opts.branch ?? 'main'
  const forcedRange = opts.range ?? ''
  const bumpPatch = !!opts.bumpPatch
  const apply = !!opts.apply
  if (!owner || !repo) throw new Error('缺少 --owner / --repo')
  if (forcedRange && EXACT_VERSION.test(forcedRange.trim())) {
    throw new Error('--range 需要是范围(如 >=0.2.0-rc.2),不能是精确版本')
  }

  const auth = authHeader()

  async function apiCall(pathname, init = {}) {
    const res = await fetch(`${api}/api/v1${pathname}`, {
      ...init,
      headers: { Authorization: auth, ...(init.headers ?? {}) },
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${pathname} -> ${res.status} ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : null
  }

  async function resolvePaths() {
    const explicit = expandPaths(opts)
    if (explicit.length) return explicit
    const list = await apiCall(`/repos/${owner}/${repo}/contents/packages?ref=${encodeURIComponent(branch)}`)
    return (Array.isArray(list) ? list : [])
      .filter(e => e?.type === 'dir' && e?.path)
      .map(e => `${e.path}/package.json`)
  }

  console.log(`仓库: ${owner}/${repo}@${branch}`)
  console.log(`模式: ${apply ? 'APPLY(提交)' : 'DRY-RUN(仅预览)'}`)
  console.log('策略: 只放宽精确版本,已有范围保持不动\n')

  const files = await resolvePaths()
  let changedFiles = 0
  let skipped = 0
  let failed = 0

  for (const file of files) {
    try {
      const meta = await apiCall(`/repos/${owner}/${repo}/contents/${file}?ref=${encodeURIComponent(branch)}`)
      const text = Buffer.from(meta?.content ?? '', meta?.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8')
      const pkg = JSON.parse(text)
      const notes = []

      // 1) engines.dsh(优先级最高)若是精确版本则放宽
      if (pkg.engines && typeof pkg.engines.dsh === 'string') {
        const relaxed = relaxExact(pkg.engines.dsh, forcedRange)
        if (relaxed && relaxed !== pkg.engines.dsh) {
          notes.push(`engines.dsh: ${pkg.engines.dsh} -> ${relaxed}`)
          pkg.engines.dsh = relaxed
        }
      }

      // 2) 所有 @deepseek-ai/dsh 与 @deepseek-ai/dsh-* peer:仅精确版本才改
      const peers = pkg.peerDependencies ?? {}
      for (const [name, value] of Object.entries(peers)) {
        if (name !== DSH && !name.startsWith(`${DSH}-`)) continue
        if (typeof value !== 'string') continue
        const relaxed = relaxExact(value, forcedRange)
        if (relaxed && relaxed !== value.trim()) {
          notes.push(`${name}: ${value} -> ${relaxed}`)
          peers[name] = relaxed
        }
      }

      // 3) 有改动且指定 --bump-patch 时 patch +1
      if (notes.length && bumpPatch) {
        const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(pkg.version ?? ''))
        if (m) {
          const next = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
          notes.push(`version: ${pkg.version} -> ${next}`)
          pkg.version = next
        } else {
          notes.push(`version: ${pkg.version ?? '(缺失)'} 非 x.y.z,跳过 bump`)
        }
      }

      if (!notes.length) {
        skipped++
        console.log(`- ${file}  无需修改,跳过`)
        continue
      }

      changedFiles++
      console.log(`* ${file}`)
      for (const n of notes) console.log(`    ${n}`)

      if (apply) {
        const body = {
          message: opts.message ?? 'chore: 放宽 @deepseek-ai/dsh 精确版本为 semver 范围',
          content: Buffer.from(JSON.stringify(pkg, null, 2) + '\n').toString('base64'),
          sha: meta.sha,
          branch,
        }
        const res = await apiCall(`/repos/${owner}/${repo}/contents/${file}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const commit = (res?.commit?.sha ?? '').slice(0, 10) || '?'
        console.log(`    ✔ 已提交 ${commit}`)
      }
    } catch (e) {
      failed++
      console.error(`! ${file} 失败: ${e.message}`)
    }
  }

  console.log(`\n完成:${changedFiles} 个待改/已改,${skipped} 个跳过,${failed} 个失败`)
  if (!apply && changedFiles) console.log('以上为 dry-run,确认无误后加 --apply 提交。')
  if (failed) process.exitCode = 1
}

main().catch((e) => {
  console.error(`错误: ${e.message}`)
  process.exitCode = 1
})
