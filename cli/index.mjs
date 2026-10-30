#!/usr/bin/env node
// DSH Controller CLI —— 菜单式管理(一键破甲 / 红队技能 / 逆向技能 / 插件商店 / 工具设置)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as ui from './lib/ui.mjs'
import * as core from './lib/core.mjs'
import * as ops from './lib/ops.mjs'

const { c, head, dim, ok, bad, warn, kv, ask, banner, section, step } = ui

function readState(p) { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const REDTEAM_STATE = path.join(core.SKILLS_DIR, '.purge-redteam.json')
const REVERSE_STATE = path.join(core.SKILLS_DIR, '.reverse-skill.json')

async function header() {
  const st = await ops.purgeStatus()
  const rt = readState(REDTEAM_STATE), rv = readState(REVERSE_STATE)
  ui.clear()
  banner('DSH Controller CLI')
  const layout = st.layout === 'app' ? c('green', 'app(已应用)') : st.layout === 'asar' ? c('yellow', 'asar(未应用)') : c('red', '未知')
  kv('破甲插件', st.installed ? 'v' + (st.version || '?') + ' · 宿主 ' + layout : c('yellow', '未安装'))
  kv('红队技能', rt ? (rt.skills?.length || 0) + ' 个 · v' + (rt.version || '?') : dim('未安装'))
  kv('逆向技能', rv ? (rv.modules?.length || 0) + ' 模块 · v' + (rv.version || '?') : dim('未安装'))
  kv('宿主版本', st.hostVersion || '?')
}

// ── 一键破甲(二级菜单)───────────────────────────────────
async function menuPurge() {
  while (true) {
    if (ui.stdinEndedQ && ui.stdinEndedQ()) return
    const st = await ops.purgeStatus()
    const tun = ops.readTuning()
    const drill = ops.drillState()
    const snaps = ops.listHostOriginals()
    ui.clear()
    banner('一键破甲')
    kv('插件', st.installed ? 'v' + (st.version || '?') : c('yellow', '未安装'))
    kv('宿主布局', st.layout === 'app' ? c('green', 'app(已应用)') : c('yellow', 'asar(未应用)'))
    kv('运行开关', `boost ${tun.boost === false ? 'off' : 'on'} · retry ${tun.refusalRetry === false ? 'off' : 'on'} · rewind ${tun.rewind === false ? 'off' : 'on'} · inject ${tun.injectPosition || 'head'}`)
    kv('演练授权', drill?.granted ? c('green', '已授权') : dim('未授权'))
    kv('快照/备份', snaps.length + ' 快照 · ' + (st.backups?.length || 0) + ' 备份')

    console.log('\n  1) ' + head('一键安装') + dim('  安装/更新插件 → 解包 → 应用 → 换包 → 重启'))
    console.log('  2) ' + head('卸载安装') + dim('  退出 dsh,卸载插件与补丁(需管理员)'))
    console.log('  3) ' + head('还原签名') + dim('  修官方更新失败(丢弃解包目录)'))
    console.log('  4) ' + head('能力自检') + dim('  逐层证据 + 待确认标注'))
    console.log('  5) ' + head('运行开关') + dim('  boost / retry / rewind / inject'))
    console.log('  6) ' + head('授权管理') + dim('  演练台授权 / 撤销'))
    console.log('  7) ' + head('快照管理') + dim('  原始宿主快照(升级保护)'))
    console.log('  8) ' + head('备份管理') + dim('  插件备份:列/备份/回滚/清理'))
    console.log('  0) 返回')
    const a = (await ask(c('cyan', '\n选择> '))).trim()
    if (a === '0' || a === '') return

    if (a === '1') {
      ui.pauseAsk()
      console.log(dim('\n—— 一键安装开始 ——'))
      const ins = await ops.installLatest()
      step('安装/更新插件', ins.ok ? { ok: true, note: 'v' + (ins.version || '?') } : { ok: false, reason: ins.error })
      if (!ins.ok) { await ask(dim('回车继续')); continue }
      const r = await ops.oneClickPurge({ restart: true })
      for (const s of r.steps) step(s.name, s)
      console.log(r.ok ? '\n' + ok('完成。dsh 已重启,补丁已生效。') : '\n' + bad('未全部成功,见上。'))
      await ask(dim('回车继续'))
    } else if (a === '2') {
      const yes = (await ask(warn('确认卸载?将退出 dsh 并移除插件/补丁(y/N)> '))).trim()
      if (yes.toLowerCase() !== 'y') continue
      ui.pauseAsk()
      const r = await ops.uninstallPurge()
      console.log(r.ok ? ok('已卸载(' + (r.via === 'admin' ? '管理员授权' : '普通权限') + ')') : bad(r.error || '失败'))
      await ask(dim('回车继续'))
    } else if (a === '3') {
      ui.pauseAsk(); const r = await ops.purgeReseal(); console.log(r.ok ? ok('已还原签名') : bad('失败')); await ask(dim('回车继续'))
    } else if (a === '4') {
      ui.pauseAsk()
      const r = await ops.purgeSelfcheck()
      if (r.error) { console.log(bad(r.error)); await ask(dim('回车继续')); continue }
      const s = r.summary || {}
      console.log('\n  ' + head('自检') + dim(' host ' + (s.host?.passed ?? '?') + '/' + (s.host?.total ?? '?') + ' · runtime ' + (s.runtime?.passed ?? '?') + '/' + (s.runtime?.total ?? '?') + ' · layout ' + (s.layout?.passed ?? '?') + '/' + (s.layout?.total ?? '?')))
      for (const l of r.layers || []) {
        const icon = l.ok ? c('green', '✓') : (l.state === 'unknown' || l.applicable === false ? c('gray', '?') : c('red', '✗'))
        console.log('   ' + icon + ' ' + l.title + dim(' ' + (l.applicable === false ? '不适用' : (l.state === 'unknown' ? '待确认' : (l.applied ?? '?') + '/' + (l.total ?? '?')))))
      }
      await ask(dim('回车继续'))
    } else if (a === '5') {
      while (true) {
        const t = ops.readTuning()
        console.log('\n  ' + head('运行开关') + dim('(下一轮对话生效)'))
        console.log('  1) boost 强化尾段      ' + (t.boost === false ? c('yellow', 'off') : c('green', 'on')))
        console.log('  2) retry 拒绝重试      ' + (t.refusalRetry === false ? c('yellow', 'off') : c('green', 'on')))
        console.log('  3) rewind 回退按钮     ' + (t.rewind === false ? c('yellow', 'off') : c('green', 'on')))
        console.log('  4) inject 注入位置     ' + (t.injectPosition || 'head'))
        console.log('  0) 返回')
        const b = (await ask(c('cyan', '\n开关> '))).trim()
        if (b === '0' || b === '') break
        if (b === '1') { ui.pauseAsk(); const r = await ops.setTuning('boost', t.boost === false ? 'on' : 'off'); console.log(r.ok ? ok('已切换') : bad(r.error)) }
        else if (b === '2') { ui.pauseAsk(); const r = await ops.setTuning('retry', t.refusalRetry === false ? 'on' : 'off'); console.log(r.ok ? ok('已切换') : bad(r.error)) }
        else if (b === '3') { ui.pauseAsk(); const r = await ops.setTuning('rewind', t.rewind === false ? 'on' : 'off'); console.log(r.ok ? ok('已切换') : bad(r.error)) }
        else if (b === '4') { const v = (await ask('head/tail/both> ')).trim(); ui.pauseAsk(); const r = await ops.setTuning('inject', v); console.log(r.ok ? ok('已设置 ' + v) : bad(r.error)) }
      }
    } else if (a === '6') {
      const d = ops.drillState()
      console.log('\n  当前:' + (d?.granted ? c('green', '已授权') : dim('未授权')) + dim(' ' + (d?.at || '')))
      console.log('  1) 授权   2) 撤销   0) 返回')
      const b = (await ask(c('cyan', '\n选择> '))).trim()
      if (b === '1') { ops.grantDrill(true); console.log(ok('已授权演练台')) }
      if (b === '2') { ops.grantDrill(false); console.log(ok('已撤销')) }
    } else if (a === '7') {
      const list = ops.listHostOriginals()
      console.log('\n  快照 ' + (list.length ? list.length + ' 个' : dim('无')))
      list.slice(0, 8).forEach((s, i) => console.log('  ' + (i + 1) + ') ' + s.id + dim(' · ' + (s.count || 0) + ' 文件 · ' + (s.reason || ''))))
      console.log('  c) 创建快照   r) 恢复   d) 删除   0) 返回')
      const b = (await ask(c('cyan', '\n选择> '))).trim()
      if (b === 'c') { ui.pauseAsk(); const r = await ops.createHostOriginals('manual'); console.log(r.ok ? ok('已创建 ' + r.count + ' 文件') : warn(r.note || r.error || '失败')); await ask(dim('回车继续')) }
      else if (b === 'r') { const n = parseInt((await ask('编号> ')), 10); if (list[n - 1]) { ui.pauseAsk(); const r = await ops.restoreHostOriginals(list[n - 1].id); console.log(r.ok ? ok('已恢复 ' + r.restored + ' 文件,请重启 dsh') : bad(r.error)); await ask(dim('回车继续')) } }
      else if (b === 'd') { const n = parseInt((await ask('编号> ')), 10); if (list[n - 1]) { ops.deleteHostOriginals(list[n - 1].id); console.log(ok('已删除')) } }
    } else if (a === '8') {
      const st2 = await ops.purgeStatus()
      console.log('\n  备份 ' + (st2.backups?.length || 0) + ' 个')
      ;(st2.backups || []).slice(0, 10).forEach((b, i) => console.log('  ' + (i + 1) + ') ' + b.id + dim(' · ' + b.created_at + ' · ' + (b.reason || ''))))
      console.log('  b) 立即备份   r) 回滚到备份   p) 清理旧备份   0) 返回')
      const b = (await ask(c('cyan', '\n选择> '))).trim()
      if (b === 'b') { ui.pauseAsk(); const r = await ops.purgeBackup(); console.log(r.ok ? ok('备份 ' + (r.id || '')) : bad('失败')); await ask(dim('回车继续')) }
      else if (b === 'r') { const n = parseInt((await ask('编号> ')), 10); const bk = (st2.backups || [])[n - 1]; if (bk) { ui.pauseAsk(); const r = await ops.purgeRollback(bk.id); console.log(r.ok ? ok('已回滚') : bad('失败')); await ask(dim('回车继续')) } }
      else if (b === 'p') { ui.pauseAsk(); const r = await ops.purgePrune(); console.log(r.ok ? ok('已清理') : bad('失败')); await ask(dim('回车继续')) }
    }
  }
}

// ── 技能包通用 ───────────────────────────────────────────
async function menuSkill(kind) {
  const isRed = kind === 'red'
  while (true) {
    if (ui.stdinEndedQ && ui.stdinEndedQ()) return
    const st = readState(isRed ? REDTEAM_STATE : REVERSE_STATE)
    ui.clear()
    ui.clear()
    ui.clear()
    ui.clear()
    ui.clear()
    banner(isRed ? '红队技能包' : '逆向技能包')
    kv('状态', st ? c('green', '已安装') : c('yellow', '未安装'))
    if (st) {
      kv('版本', 'v' + (st.version || '?'))
      kv(isRed ? '技能数' : '模块数', String((isRed ? st.skills?.length : st.modules?.length) || 0))
      if (st.installedAt) kv('安装时间', new Date(st.installedAt).toLocaleString())
    }
    console.log('\n  1) ' + (st ? '更新' : '安装'))
    console.log('  2) 查看技能清单')
    console.log('  0) 返回')
    const a = (await ask(c('cyan', '\n选择> '))).trim()
    if (a === '0' || a === '') return
    if (a === '1') {
      ui.pauseAsk()
      const r = isRed ? await ops.installRedteam() : await ops.installReverse()
      if (r.ok) console.log(ok((isRed ? '红队 ' + r.count + ' 个技能' : '逆向 ' + r.modules + ' 个模块') + ' · v' + (r.version || '?')))
      else console.log(bad(r.error || '失败'))
      await ask(dim('回车继续'))
    } else if (a === '2') {
      if (!st) { console.log(warn('未安装')); await ask(dim('回车继续')); continue }
      const list = isRed ? (st.skills || []) : (st.modules || [])
      console.log('\n  ' + list.join(', '))
      await ask(dim('回车继续'))
    }
  }
}

// ── 插件商店 ─────────────────────────────────────────────
async function menuPlugins() {
  while (true) {
    if (ui.stdinEndedQ && ui.stdinEndedQ()) return
    const inst = await ops.pluginsInstalled()
    ui.clear()
    banner('插件商店')
    kv('已安装', String(inst.length))
    console.log('\n  1) 列出已安装')
    console.log('  2) 安装插件(输入包规范)')
    console.log('  3) 卸载插件')
    console.log('  0) 返回')
    const a = (await ask(c('cyan', '\n选择> '))).trim()
    if (a === '0' || a === '') return
    if (a === '1') { inst.forEach(p => console.log('  · ' + p.name + dim(' v' + p.version))); await ask(dim('回车继续')) }
    else if (a === '2') {
      const spec = (await ask('包名/路径/tarball> ')).trim()
      if (!spec) continue
      ui.pauseAsk(); const r = await ops.pluginInstall(spec); console.log(r.ok ? ok('已安装') : bad('失败')); await ask(dim('回车继续'))
    } else if (a === '3') {
      inst.forEach((p, i) => console.log('  ' + (i + 1) + ') ' + p.name))
      const n = parseInt((await ask('编号> ')).trim(), 10)
      if (!inst[n - 1]) continue
      ui.pauseAsk(); const r = await ops.pluginRemove(inst[n - 1].name); console.log(r.ok ? ok('已卸载') : bad('失败')); await ask(dim('回车继续'))
    }
  }
}

// ── 工具设置 ─────────────────────────────────────────────
async function menuSettings() {
  while (true) {
    if (ui.stdinEndedQ && ui.stdinEndedQ()) return
    const tok = core.readToken()
    ui.clear()
    banner('工具设置')
    kv('自建源密钥', tok ? c('green', '已配置') : c('yellow', '未配置'))
    console.log('\n  1) 设置/清除密钥')
    console.log('  2) 测试连接')
    console.log('  3) 原始宿主快照(升级保护)')
    console.log('  4) 操作日志位置')
    console.log('  0) 返回')
    const a = (await ask(c('cyan', '\n选择> '))).trim()
    if (a === '0' || a === '') return
    if (a === '1') {
      const t = (await ask('Gitea 令牌(留空=清除)> ')).trim()
      core.saveToken(t)
      console.log(ok(t ? '已保存' : '已清除'))
    } else if (a === '2') {
      ui.pauseAsk()
      try {
        const v = await core.hubFileVersion('resources/redteam-skill')
        console.log(v ? ok('连接正常 · 红队包 v' + v) : bad('无法读取(检查密钥)'))
      } catch (e) { console.log(bad(e.message)) }
      await ask(dim('回车继续'))
    } else if (a === '3') {
      const list = ops.listHostOriginals()
      console.log('\n  快照 ' + (list.length ? list.length + ' 个' : '无'))
      list.slice(0, 8).forEach((s, i) => console.log('  ' + (i + 1) + ') ' + s.id + dim(' · ' + (s.count || 0) + ' 文件 · ' + (s.reason || ''))))
      console.log('  c) 创建快照   r) 恢复   d) 删除   0) 返回')
      const b = (await ask('选择> ')).trim()
      if (b === 'c') { ui.pauseAsk(); const r = await ops.createHostOriginals('manual'); console.log(r.ok ? ok('已创建 ' + r.count + ' 文件') : warn(r.note || r.error || '失败')); await ask(dim('回车继续')) }
      else if (b === 'r') { const n = parseInt((await ask('编号> ')), 10); if (list[n - 1]) { ui.pauseAsk(); const r = await ops.restoreHostOriginals(list[n - 1].id); console.log(r.ok ? ok('已恢复 ' + r.restored + ' 文件,请重启 dsh') : bad(r.error)); await ask(dim('回车继续')) } }
      else if (b === 'd') { const n = parseInt((await ask('编号> ')), 10); if (list[n - 1]) { ops.deleteHostOriginals(list[n - 1].id); console.log(ok('已删除')) } }
    } else if (a === '4') {
      console.log(dim('  控制器日志:/tmp/dsh-controller-handoff.log'))
      console.log(dim('  插件审计:') + path.join(core.DSH_HOME, 'dsh-purge-community', 'audit.jsonl'))
      await ask(dim('回车继续'))
    }
  }
}

// ── 主菜单 ───────────────────────────────────────────────
async function mainMenu() {
  while (true) {
    if (ui.stdinEndedQ && ui.stdinEndedQ()) { ui.closeAsk(); return }
    await header()
    console.log('\n  1) ' + head('一键破甲'))
    console.log('  2) ' + head('红队技能'))
    console.log('  3) ' + head('逆向技能'))
    console.log('  4) ' + head('插件商店'))
    console.log('  5) ' + head('工具设置'))
    console.log('  q) 退出')
    const a = (await ask(c('cyan', '\n选择> '))).trim()
    if (a === 'q' || a === 'Q') { ui.closeAsk(); console.log(dim('再见')); process.exit(0) }
    if (a === '1') await menuPurge()
    else if (a === '2') await menuSkill('red')
    else if (a === '3') await menuSkill('reverse')
    else if (a === '4') await menuPlugins()
    else if (a === '5') await menuSettings()
  }
}

// ── 非交互子命令 ─────────────────────────────────────────
function help() {
  console.log(`${head('DSH Controller CLI')}

用法: dshc [命令]         (不带命令进入菜单)

命令:
  status                      概览
  purge oneclick              一键破甲(去隔离→解包→应用→换包→重启)
  purge apply|revert|reseal   应用/回滚补丁/还原签名
  purge backup|prune|selfcheck
  purge rollback <id>         回滚到备份
  skills redteam|reverse      安装/更新技能包
  plugins list                已安装插件
  plugins install <spec>      安装插件
  plugins remove <name>       卸载插件
  settings token [value]      查看/设置自建源密钥
  settings test               测试自建源连接
  originals list|create       原始宿主快照
  help                        本帮助`)
}

async function cli(argv) {
  const [cmd, sub, ...rest] = argv
  if (!cmd || cmd === 'menu') return mainMenu()
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') return help()
  if (cmd === 'status') {
    const st = await ops.purgeStatus(); const rt = readState(REDTEAM_STATE), rv = readState(REVERSE_STATE)
    console.log(head('插件') + ' ' + (st.installed ? 'v' + st.version : '未安装') + ' · ' + head('布局') + ' ' + st.layout + ' · ' + head('备份') + ' ' + (st.backups?.length || 0))
    console.log(head('红队') + ' ' + (rt ? (rt.skills?.length || 0) + ' 个 v' + rt.version : '未安装') + ' · ' + head('逆向') + ' ' + (rv ? (rv.modules?.length || 0) + ' 模块 v' + rv.version : '未安装'))
    return
  }
  if (cmd === 'purge') {
    if (sub === 'oneclick') { const r = await ops.oneClickPurge(); r.steps.forEach(s => step(s.name, s)); process.exit(r.ok ? 0 : 1) }
    if (sub === 'apply') { const r = await ops.purgeApply(); console.log(r.ok ? ok('已应用') : bad(r.error || '失败')); process.exit(r.ok ? 0 : 1) }
    if (sub === 'revert') { const r = await ops.purgeRevert(); console.log(r.ok ? ok('已回滚') : bad('失败')); process.exit(r.ok ? 0 : 1) }
    if (sub === 'reseal') { const r = await ops.purgeReseal(); console.log(r.ok ? ok('已还原签名') : bad('失败')); process.exit(r.ok ? 0 : 1) }
    if (sub === 'backup') { const r = await ops.purgeBackup(); console.log(r.ok ? ok('备份 ' + (r.id || '')) : bad('失败')); return }
    if (sub === 'prune') { const r = await ops.purgePrune(); console.log(r.ok ? ok('已清理') : bad('失败')); return }
    if (sub === 'rollback') { const r = await ops.purgeRollback(rest[0] || sub); console.log(r.ok ? ok('已回滚') : bad('失败')); return }
    if (sub === 'selfcheck') {
      const r = await ops.purgeSelfcheck()
      if (r.error) return console.log(bad(r.error))
      for (const l of r.layers || []) console.log((l.ok ? '✓' : (l.state === 'unknown' ? '?' : '✗')) + ' ' + l.title + ' ' + (l.applicable === false ? '(不适用)' : (l.state === 'unknown' ? '(待确认)' : (l.applied ?? '?') + '/' + (l.total ?? '?'))))
      return
    }
    return help()
  }
  if (cmd === 'skills') {
    if (sub === 'redteam') { const r = await ops.installRedteam(); console.log(r.ok ? ok('红队 ' + r.count + ' 个 · v' + (r.version || '?')) : bad(r.error || '失败')); process.exit(r.ok ? 0 : 1) }
    if (sub === 'reverse') { const r = await ops.installReverse(); console.log(r.ok ? ok('逆向 ' + r.modules + ' 模块 · v' + (r.version || '?')) : bad(r.error || '失败')); process.exit(r.ok ? 0 : 1) }
    return help()
  }
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
  if (cmd === 'originals') {
    if (sub === 'list') { ops.listHostOriginals().forEach(s => console.log(s.id + ' · ' + (s.count || 0) + ' 文件 · ' + (s.reason || ''))); return }
    if (sub === 'create') { const r = await ops.createHostOriginals('cli'); console.log(r.ok ? ok('已创建 ' + r.count + ' 文件') : warn(r.note || r.error || '失败')); return }
    if (sub === 'restore') { const r = await ops.restoreHostOriginals(rest[0]); console.log(r.ok ? ok('已恢复 ' + r.restored) : bad(r.error)); return }
    return help()
  }
  help()
}

cli(process.argv.slice(2)).catch(e => { console.error(bad(String(e?.stack || e))); process.exit(1) })
