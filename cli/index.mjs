#!/usr/bin/env node
// DSH Controller CLI —— 交互式 TUI(方向键/空格勾选/回车确认)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import * as ui from './lib/ui.mjs'
import * as core from './lib/core.mjs'
import * as ops from './lib/ops.mjs'

const { c, head, dim, ok, bad, warn, kv, ask, banner, menuSelect, waitKey, promptText } = ui
const REDTEAM_STATE = path.join(core.SKILLS_DIR, '.purge-redteam.json')
const REVERSE_STATE = path.join(core.SKILLS_DIR, '.reverse-skill.json')
function readState(p) { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

async function showHeader() {
  const st = await ops.purgeStatus()
  const rt = readState(REDTEAM_STATE), rv = readState(REVERSE_STATE)
  ui.clear()
  banner('DSH Controller CLI')
  const layout = st.layout === 'app' ? c('green', 'app(已应用)') : st.layout === 'asar' ? c('yellow', 'asar(未应用)') : c('red', '未知')
  kv('破甲插件', st.installed ? 'v' + (st.version || '?') + ' · 宿主 ' + layout : c('yellow', '未安装'))
  kv('红队技能', rt ? (rt.skills?.length || 0) + ' 个 · v' + (rt.version || '?') : dim('未安装'))
  kv('逆向技能', rv ? (rv.modules?.length || 0) + ' 模块 · v' + (rv.version || '?') : dim('未安装'))
  kv('宿主版本', st.hostVersion || '?')
  kv('备份', String(st.backups?.length || 0))
}

// ── 一键破甲 ─────────────────────────────────────────────
async function menuPurge() {
  while (true) {
    await showHeader()
    const st = await ops.purgeStatus()
    const tun = ops.readTuning()
    const drill = ops.drillState()
    const items = [
      { label: '一键安装', hint: '安装/更新插件 → 解包 → 应用 → 换包 → 重启' },
      { label: '卸载安装', hint: '退出 dsh,卸载插件与补丁(需管理员)' },
      { label: '还原签名', hint: '修官方更新失败(丢弃解包目录)' },
      { label: '能力自检', hint: '逐层证据 + 待确认标注' },
      { label: '运行开关', hint: 'boost / retry / rewind / inject' },
      { label: '授权管理', hint: '演练台授权 / 撤销' },
      { label: '备份管理', hint: '插件备份:列/备份/回滚/清理' },
      { label: '返回' },
    ]
    const sel = await menuSelect({ title: '一键破甲', items })
    if (sel < 0 || sel === 7) return
    if (sel === 0) {
      console.log(dim('\n—— 一键安装开始 ——'))
      const ins = await ops.installLatest()
      console.log('  ' + (ins.ok ? ok('插件 v' + (ins.version || '?')) : bad(ins.error || '安装失败')))
      if (ins.ok) {
        const r = await ops.oneClickPurge({ restart: true })
        for (const s of r.steps) console.log('  ' + (s.ok !== false ? c('green', '✓') : c('red', '✗')) + ' ' + s.name + (s.error ? dim(' — ' + String(s.error).slice(0, 120)) : ''))
        console.log(r.ok ? '\n  ' + ok('完成。dsh 已重启,补丁已生效。') : '\n  ' + bad('未全部成功,见上。'))
      }
      await waitKey()
    } else if (sel === 1) {
      const yes = await menuSelect({ title: '卸载安装', items: [{ label: '确认卸载(退出 dsh 并移除插件/补丁)', hint: '不可撤销' }, { label: '取消' }] })
      if (yes !== 0) continue
      console.log(dim('\n—— 卸载中 ——'))
      const r = await ops.uninstallPurge()
      console.log('  ' + (r.ok ? ok('已卸载(' + (r.via === 'admin' ? '管理员授权' : '普通权限') + ')') : bad(r.error || '失败')))
      await waitKey()
    } else if (sel === 2) {
      const r = await ops.purgeReseal()
      console.log('\n  ' + (r.ok ? ok('已还原签名') : bad('失败')))
      await waitKey()
    } else if (sel === 3) {
      const r = await ops.purgeSelfcheck()
      if (r.error) { console.log('\n  ' + bad(r.error)) } else {
        const s = r.summary || {}
        console.log('\n  ' + head('自检') + dim(' host ' + (s.host?.passed ?? '?') + '/' + (s.host?.total ?? '?') + ' · runtime ' + (s.runtime?.passed ?? '?') + '/' + (s.runtime?.total ?? '?') + ' · layout ' + (s.layout?.passed ?? '?') + '/' + (s.layout?.total ?? '?')))
        for (const l of r.layers || []) {
          const icon = l.ok ? c('green', '✓') : (l.state === 'unknown' || l.applicable === false ? c('gray', '?') : c('red', '✗'))
          console.log('   ' + icon + ' ' + l.title + dim(' ' + (l.applicable === false ? '不适用' : (l.state === 'unknown' ? '待确认' : (l.applied ?? '?') + '/' + (l.total ?? '?')))))
        }
      }
      await waitKey()
    } else if (sel === 4) {
      // 运行开关:勾选=开启
      const t = ops.readTuning()
      const cur = { boost: t.boost !== false, retry: t.refusalRetry !== false, rewind: t.rewind !== false }
      const on  = [0, 1, 2].filter(i => [cur.boost, cur.retry, cur.rewind][i])
      const items = [
        { label: '强化尾段 boost', hint: '系统提示词尾部加固段' },
        { label: '拒绝自动重试 retry', hint: '模型推脱时自动加固重试' },
        { label: '回退按钮 rewind', hint: '输入框旁的回退一次' },
      ]
      const picked = await menuSelect({ title: '运行开关(勾选=开启,回车保存)', items, multi: true, checked: on })
      if (picked === null) continue
      const want = { boost: picked.includes(0), retry: picked.includes(1), rewind: picked.includes(2) }
      let changed = 0
      for (const [k, v] of Object.entries(want)) {
        if (v === cur[k]) continue
        const r = await ops.setTuning(k, v ? 'on' : 'off')
        console.log('  ' + (r.ok ? ok(k + ' → ' + (v ? 'on' : 'off')) : bad(r.error || '失败')))
        changed++
      }
      const injSel = await menuSelect({ title: '注入位置 inject(当前 ' + (t.injectPosition || 'head') + ')', items: [{ label: 'head' }, { label: 'tail' }, { label: 'both' }, { label: '保持当前' }] })
      if (injSel >= 0 && injSel < 3) {
        const v = ['head', 'tail', 'both'][injSel]
        if (v !== (t.injectPosition || 'head')) { const r = await ops.setTuning('inject', v); console.log('  ' + (r.ok ? ok('inject → ' + v) : bad(r.error || '失败'))); changed++ }
      }
      console.log(changed ? '\n  ' + ok('已修改 ' + changed + ' 项') : '\n  ' + dim('未改动'))
      await waitKey()
    } else if (sel === 5) {
      const d = ops.drillState()
      const items = d?.granted
        ? [{ label: '撤销演练台授权' }, { label: '返回' }]
        : [{ label: '授权演练台' }, { label: '返回' }]
      const s2 = await menuSelect({ title: '授权管理(当前:' + (d?.granted ? '已授权' : '未授权') + ')', items })
      if (s2 === 0) { ops.grantDrill(!d?.granted); console.log('  ' + ok(d?.granted ? '已撤销' : '已授权')) ; await waitKey() }
    } else if (sel === 6) {
      const st2 = await ops.purgeStatus()
      const bks = st2.backups || []
      const items = [
        { label: '立即备份' },
        { label: '回滚到备份', hint: bks.length ? '共 ' + bks.length + ' 个' : '无备份' },
        { label: '清理旧备份' },
        ...bks.slice(0, 6).map((b, i) => ({ label: '回滚: ' + b.id, hint: (b.created_at || '') + ' · ' + (b.reason || '') })),
        { label: '返回' },
      ]
      const s3 = await menuSelect({ title: '备份管理(共 ' + bks.length + ' 个)', items })
      if (s3 < 0 || s3 === items.length - 1) continue
      if (s3 === 0) { const r = await ops.purgeBackup(); console.log('  ' + (r.ok ? ok('备份 ' + (r.id || '')) : bad('失败'))) }
      else if (s3 === 1) { console.log(bks.length ? warn('请从下方列表选择具体备份') : warn('没有备份')); await waitKey(); continue }
      else if (s3 === 2) { const r = await ops.purgePrune(); console.log('  ' + (r.ok ? ok('已清理') : bad('失败'))) }
      else { const b = bks[s3 - 3]; if (b) { const r = await ops.purgeRollback(b.id); console.log('  ' + (r.ok ? ok('已回滚到 ' + b.id) : bad('失败'))) } }
      await waitKey()
    }
  }
}

// ── 技能包 ───────────────────────────────────────────────
async function menuSkill(kind) {
  const isRed = kind === 'red'
  while (true) {
    const st = readState(isRed ? REDTEAM_STATE : REVERSE_STATE)
    const items = [
      { label: st ? '更新' : '安装', hint: isRed ? '仓库分类技能 → 统一入口' : '仓库子目录 → 统一入口' },
      { label: '查看清单' },
      { label: '返回' },
    ]
    const sel = await menuSelect({ title: (isRed ? '红队技能包' : '逆向技能包') + (st ? ' · 已安装 v' + (st.version || '?') : ' · 未安装'), items })
    if (sel < 0 || sel === 2) return
    if (sel === 0) {
      const r = isRed ? await ops.installRedteam() : await ops.installReverse()
      console.log(i18nOk(r, isRed))
      await waitKey()
    } else if (sel === 1) {
      if (!st) { console.log('  ' + warn('未安装')); await waitKey(); continue }
      const list = isRed ? (st.skills || []) : (st.modules || [])
      console.log('\n  ' + list.join('\n  '))
      await waitKey()
    }
  }
}
function i18nOk(r, isRed) {
  if (!r?.ok) return '  ' + bad(r?.error || '失败')
  return '  ' + ok((isRed ? r.count + ' 个技能' : r.modules + ' 个模块') + ' · v' + (r.version || '?'))
}

// ── 插件商店 ─────────────────────────────────────────────
async function menuPlugins() {
  while (true) {
    const inst = await ops.pluginsInstalled()
    const items = [
      { label: '查看已安装', hint: inst.length + ' 个' },
      { label: '安装插件' },
      { label: '卸载插件' },
      { label: '返回' },
    ]
    const sel = await menuSelect({ title: '插件商店', items })
    if (sel < 0 || sel === 3) return
    if (sel === 0) {
      inst.forEach(p => console.log('  · ' + p.name + dim(' v' + p.version)))
      await waitKey()
    } else if (sel === 1) {
      const spec = await promptText('包名 / 本地路径 / tarball')
      if (!spec) continue
      const r = await ops.pluginInstall(spec)
      console.log('  ' + (r.ok ? ok('已安装') : bad('失败')))
      await waitKey()
    } else if (sel === 2) {
      if (!inst.length) { console.log('  ' + warn('没有已安装插件')); await waitKey(); continue }
      const s2 = await menuSelect({ title: '卸载插件', items: [...inst.map(p => ({ label: p.name, hint: 'v' + p.version })), { label: '返回' }] })
      if (s2 < 0 || s2 === inst.length) continue
      const r = await ops.pluginRemove(inst[s2].name)
      console.log('  ' + (r.ok ? ok('已卸载') : bad('失败')))
      await waitKey()
    }
  }
}

// ── 工具设置 ─────────────────────────────────────────────
async function menuSettings() {
  while (true) {
    const tok = core.readToken()
    const items = [
      { label: '设置访问密钥', hint: tok ? '已配置' : '未配置' },
      { label: '测试自建源连接' },
      { label: '查看日志路径' },
      { label: '清理日志' },
      { label: '返回' },
    ]
    const sel = await menuSelect({ title: '工具设置', items })
    if (sel < 0 || sel === 4) return
    if (sel === 0) {
      const t = await promptText('Gitea 令牌(输入 - 清除,回车取消)')
      if (t === '-') { core.saveToken(''); console.log('  ' + ok('已清除')) }
      else if (t) { core.saveToken(t); console.log('  ' + ok('已保存')) }
      await waitKey()
    } else if (sel === 1) {
      const v = await core.hubFileVersion('resources/redteam-skill')
      console.log('  ' + (v ? ok('连接正常 · 红队包 v' + v) : bad('连接失败(检查密钥/网络)')))
      await waitKey()
    } else if (sel === 2) {
      console.log(dim('  控制器:/tmp/dsh-controller-handoff.log'))
      console.log(dim('  插件审计:') + path.join(core.DSH_HOME, 'dsh-purge-community', 'audit.jsonl'))
      await waitKey()
    } else if (sel === 3) {
      const logs = [path.join(core.DSH_HOME, 'dsh-purge-community', 'audit.jsonl'), '/tmp/dsh-controller-handoff.log']
      let n = 0
      for (const f of logs) { try { if (existsSync(f)) { execSync('rm -f "' + f + '"'); n++ } } catch {} }
      console.log('  ' + ok('已清理 ' + n + ' 个日志'))
      await waitKey()
    }
  }
}

// ── 主菜单 ───────────────────────────────────────────────
async function mainMenu() {
  while (true) {
    await showHeader()
    const items = [
      { label: '一键破甲', hint: '安装/应用/还原/自检/开关/授权/备份' },
      { label: '红队技能', hint: '38 个技能 · 分类子目录' },
      { label: '逆向技能', hint: '逆向/CTF 路由包' },
      { label: '插件商店', hint: '安装/卸载 dsh 插件' },
      { label: '工具设置', hint: '密钥/连接/日志' },
      { label: '退出' },
    ]
    const sel = await menuSelect({ title: 'DSH Controller CLI', items })
    if (sel < 0 || sel === 5) { ui.closeAsk(); console.log(dim('\n再见')); process.exit(0) }
    if (sel === 0) await menuPurge()
    else if (sel === 1) await menuSkill('red')
    else if (sel === 2) await menuSkill('reverse')
    else if (sel === 3) await menuPlugins()
    else if (sel === 4) await menuSettings()
  }
}

// ── 非交互命令 ───────────────────────────────────────────
function help() {
  console.log(head('DSH Controller CLI') + '\n\n用法: dshc [命令]   (不带命令 = 交互式 TUI)\n\n命令:\n  status\n  purge oneclick|apply|revert|reseal|backup|prune|selfcheck|rollback <id>\n  skills redteam|reverse\n  plugins list|install <spec>|remove <name>\n  settings token [值]|test\n  help')
}
async function cli(argv) {
  const [cmd, sub, ...rest] = argv
  if (!cmd || cmd === 'menu') return mainMenu()
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') return help()
  if (cmd === 'status') {
    const st = await ops.purgeStatus(); const rt = readState(REDTEAM_STATE), rv = readState(REVERSE_STATE)
    console.log('插件 ' + (st.installed ? 'v' + st.version : '未安装') + ' · 布局 ' + st.layout + ' · 备份 ' + (st.backups?.length || 0))
    console.log('红队 ' + (rt ? (rt.skills?.length || 0) + ' 个 v' + rt.version : '未安装') + ' · 逆向 ' + (rv ? (rv.modules?.length || 0) + ' 模块 v' + rv.version : '未安装'))
    return
  }
  if (cmd === 'purge') {
    if (sub === 'oneclick') { const r = await ops.oneClickPurge(); r.steps.forEach(s => console.log((s.ok !== false ? '✓ ' : '✗ ') + s.name)); process.exit(r.ok ? 0 : 1) }
    if (sub === 'apply') { const r = await ops.purgeApply(); console.log(r.ok ? ok('已应用') : bad(r.error || '失败')); process.exit(r.ok ? 0 : 1) }
    if (sub === 'revert') { const r = await ops.purgeRevert(); console.log(r.ok ? ok('已回滚') : bad('失败')); process.exit(r.ok ? 0 : 1) }
    if (sub === 'reseal') { const r = await ops.purgeReseal(); console.log(r.ok ? ok('已还原签名') : bad('失败')); process.exit(r.ok ? 0 : 1) }
    if (sub === 'backup') { const r = await ops.purgeBackup(); console.log(r.ok ? ok('备份 ' + (r.id || '')) : bad('失败')); return }
    if (sub === 'prune') { const r = await ops.purgePrune(); console.log(r.ok ? ok('已清理') : bad('失败')); return }
    if (sub === 'rollback') { const r = await ops.purgeRollback(rest[0]); console.log(r.ok ? ok('已回滚') : bad('失败')); return }
    if (sub === 'selfcheck') { const r = await ops.purgeSelfcheck(); if (r.error) return console.log(bad(r.error)); for (const l of r.layers || []) console.log((l.ok ? '✓' : (l.state === 'unknown' ? '?' : '✗')) + ' ' + l.title); return }
    return help()
  }
  if (cmd === 'skills') { const r = sub === 'reverse' ? await ops.installReverse() : await ops.installRedteam(); console.log(r.ok ? ok('完成') : bad(r.error || '')); process.exit(r.ok ? 0 : 1) }
  if (cmd === 'plugins') {
    if (sub === 'list') { (await ops.pluginsInstalled()).forEach(p => console.log(p.name + ' v' + p.version)); return }
    if (sub === 'install') { const r = await ops.pluginInstall(rest[0]); console.log(r.ok ? ok('已安装') : bad('失败')); process.exit(r.ok ? 0 : 1) }
    if (sub === 'remove') { const r = await ops.pluginRemove(rest[0]); console.log(r.ok ? ok('已卸载') : bad('失败')); process.exit(r.ok ? 0 : 1) }
    return help()
  }
  if (cmd === 'settings') {
    if (sub === 'token') { if (rest[0] === undefined) { console.log(core.readToken() ? '已配置' : '未配置'); return } core.saveToken(rest[0]); console.log(ok('已保存')); return }
    if (sub === 'test') { const v = await core.hubFileVersion('resources/redteam-skill'); console.log(v ? ok('连接正常 · v' + v) : bad('失败')); return }
    return help()
  }
  help()
}
cli(process.argv.slice(2)).catch(e => { console.error(bad(String(e?.stack || e))); process.exit(1) })
