#!/usr/bin/env node
// DSH Controller CLI —— 分组式交互 TUI(方向键 / 空格 / 回车)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import * as ui from './lib/ui.mjs'
import * as core from './lib/core.mjs'
import * as ops from './lib/ops.mjs'

const { c, head, dim, ok, bad, warn, kv, ask, banner, menuSelect, waitKey, promptText } = ui
const REDTEAM_STATE = path.join(core.SKILLS_DIR, '.purge-redteam.json')
const REVERSE_STATE = path.join(core.SKILLS_DIR, '.reverse-skill.json')
const readState = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

async function statusLine() {
  const st = await ops.purgeStatus()
  const layout = st.layout === 'app' ? c('green', 'app ✓') : st.layout === 'asar' ? c('yellow', 'asar') : c('red', '?')
  return [
    (st.installed ? c('green', '插件 v' + (st.version || '?')) : c('yellow', '插件未装')),
    '宿主 ' + layout,
    '备份 ' + (st.backups?.length || 0),
    'dsh ' + (st.hostVersion || '?'),
  ].join(c('gray', '  ·  '))
}

// ═══ 破甲:安装 ═══════════════════════════════════════════
async function menuPurge() {
  while (true) {
    ui.clear()
    console.log('  ' + await statusLine())
    const items = [
      { type: 'group', label: '安装与维护' },
      { label: '一键安装', hint: '安装/更新插件 → 解包 → 应用 → 换包 → 重启' },
      { label: '仅应用补丁', hint: '不重启(去隔离 → 解包 → 应用)' },
      { label: '回滚补丁', hint: '把 dsh 文件还原为补丁前(重启生效)' },
      { label: '卸载安装', hint: '退出 dsh,卸载插件与补丁(需管理员)' },
      { label: '还原签名', hint: '修官方更新失败(丢弃解包目录)' },
      { label: '重启 dsh', hint: 'open -a DeepSeek Harness' },
      { type: 'group', label: '返回' },
      { label: '返回主菜单' },
    ]
    const sel = await menuSelect({ title: '一键破甲', subtitle: '安装 · 卸载 · 还原', items })
    if (sel < 0 || sel === items.length - 1) return
    const chosen = items[sel]
    if (chosen.label === '一键安装') {
      console.log(dim('\n  —— 一键安装 ——'))
      const ins = await ops.installLatest()
      console.log('  ' + (ins.ok ? ok('插件 v' + (ins.version || '?')) : bad(ins.error || '安装失败')))
      if (ins.ok) {
        const r = await ops.oneClickPurge({ restart: true })
        for (const s of r.steps) console.log('  ' + (s.ok !== false ? c('green', '✓') : c('red', '✗')) + ' ' + s.name + (s.error ? dim(' — ' + String(s.error).slice(0, 120)) : ''))
        console.log(r.ok ? '\n  ' + ok('完成。dsh 已重启,补丁已生效。') : '\n  ' + bad('未全部成功,见上。'))
      }
      await waitKey()
    } else if (chosen.label === '卸载安装') {
      const yes = await menuSelect({ title: '卸载安装', items: [{ label: '确认卸载', hint: '退出 dsh 并移除插件/补丁(不可撤销)' }, { label: '取消' }] })
      if (yes !== 0) continue
      console.log(dim('\n  —— 卸载中 ——'))
      const r = await ops.uninstallPurge()
      console.log('  ' + (r.ok ? ok('已卸载(' + (r.via === 'admin' ? '管理员授权' : '普通权限') + ')') : bad(r.error || '失败')))
      await waitKey()
    } else if (chosen.label === '还原签名') {
      const r = await ops.purgeReseal()
      console.log('\n  ' + (r.ok ? ok('已还原签名') : bad('失败')))
      await waitKey()
    } else if (chosen.label === '仅应用补丁') {
      console.log(dim('\n  —— 应用补丁 ——'))
      const up = await ops.ensureUnpackedPre()
      const preset = ops.ensurePermissionPreset()
      const r = await ops.purgeApply()
      console.log('  ' + ok('权限预设 ' + (preset.written ? '已写入' : (preset.reason || '已配置'))))
      console.log('  ' + (r.ok ? ok('补丁已应用(重启 dsh 生效)') : bad(r.error || '失败')))
      await waitKey()
    } else if (chosen.label === '回滚补丁') {
      const r = await ops.purgeRevert()
      console.log('\n  ' + (r.ok ? ok('补丁已回滚(重启 dsh 生效)') : bad('失败')))
      await waitKey()
    } else if (chosen.label === '重启 dsh') {
      const r = await ops.restartDsh()
      console.log('\n  ' + (r.ok ? ok('已拉起 dsh') : bad('失败:' + (r.error || ''))))
      await waitKey()
    }
  }
}

// ═══ 破甲:运行配置 ═══════════════════════════════════════
async function menuRuntime() {
  while (true) {
    ui.clear()
    const gate = ops.regionGateState()
    const tun = ops.readTuning()
    const drill = ops.drillState()
    console.log('  ' + [
      '域名拦截 ' + (gate.disabled ? c('green', '已解除') : c('yellow', '已启用')),
      'boost ' + (tun.boost === false ? 'off' : 'on'),
      'retry ' + (tun.refusalRetry === false ? 'off' : 'on'),
      'rewind ' + (tun.rewind === false ? 'off' : 'on'),
      '演练 ' + (drill?.granted ? c('green', '已授权') : dim('未授权')),
    ].join(c('gray', '  ·  ')))
    const items = [
      { type: 'group', label: '安全' },
      { label: '域名拦截', hint: gate.disabled ? '公网/银行域名拦截已解除' : '拦截已启用' },
      { type: 'group', label: '诊断' },
      { label: '能力自检', hint: '逐层证据 + 待确认标注' },
      { label: '运行开关', hint: 'boost / retry / rewind / inject' },
      { type: 'group', label: '权限' },
      { label: '授权管理', hint: '演练台授权 / 撤销' },
      { type: 'group', label: '返回' },
      { label: '返回主菜单' },
    ]
    const sel = await menuSelect({ title: '运行配置', subtitle: '安全 · 诊断 · 权限', items })
    if (sel < 0 || sel === items.length - 1) return
    const chosen = items[sel]
    if (chosen.label === '域名拦截') {
      const g = ops.regionGateState()
      const cur = g.disabled ? '已解除' : (g.available ? '已启用' : '不可用')
      const items2 = g.disabled
        ? [{ label: '恢复拦截', hint: g.sourceLevel ? '插件源码级已禁用,CLI 无法恢复' : '重新启用公网/银行域名拦截' }, { label: '返回' }]
        : [{ label: '解除拦截', hint: '给 net-scope.js 打补丁(重启 dsh 生效)' }, { label: '返回' }]
      const s2 = await menuSelect({ title: '域名拦截', subtitle: '当前 ' + cur, items: items2 })
      if (s2 === 0) {
        const r = ops.setRegionGate(!g.disabled)
        console.log('  ' + (r.ok ? ok(g.disabled ? '已恢复拦截' : '已解除拦截(重启 dsh 生效)') : bad(r.error || '失败')))
        await waitKey()
      }
    } else if (chosen.label === '能力自检') {
      const r = await ops.purgeSelfcheck()
      if (r.error) console.log('\n  ' + bad(r.error))
      else {
        const s = r.summary || {}
        console.log('\n  ' + head('自检') + dim(' host ' + (s.host?.passed ?? '?') + '/' + (s.host?.total ?? '?') + ' · runtime ' + (s.runtime?.passed ?? '?') + '/' + (s.runtime?.total ?? '?') + ' · layout ' + (s.layout?.passed ?? '?') + '/' + (s.layout?.total ?? '?')))
        for (const l of r.layers || []) {
          const icon = l.ok ? c('green', '✓') : (l.state === 'unknown' || l.applicable === false ? c('gray', '?') : c('red', '✗'))
          console.log('   ' + icon + ' ' + l.title + dim(' ' + (l.applicable === false ? '不适用' : (l.state === 'unknown' ? '待确认' : (l.applied ?? '?') + '/' + (l.total ?? '?')))))
        }
      }
      await waitKey()
    } else if (chosen.label === '运行开关') {
      const t = ops.readTuning()
      const st2 = { boost: t.boost !== false, retry: t.refusalRetry !== false, rewind: t.rewind !== false, inject: t.injectPosition || 'head' }
      const items3 = [
        { label: () => (st2.boost ? c('green', '◼') : c('gray', '◻')) + ' 强化尾段 boost', hint: '系统提示词尾部加固段', onSpace: () => { st2.boost = !st2.boost } },
        { label: () => (st2.retry ? c('green', '◼') : c('gray', '◻')) + ' 拒绝自动重试 retry', hint: '模型推脱时自动加固重试', onSpace: () => { st2.retry = !st2.retry } },
        { label: () => (st2.rewind ? c('green', '◼') : c('gray', '◻')) + ' 回退按钮 rewind', hint: '输入框旁的回退一次', onSpace: () => { st2.rewind = !st2.rewind } },
        { label: () => c('cyan', '[' + st2.inject.padEnd(4) + ']') + ' 注入位置 inject', hint: 'head → tail → both', onSpace: () => { st2.inject = st2.inject === 'head' ? 'tail' : st2.inject === 'tail' ? 'both' : 'head' } },
        { type: 'group', label: '保存' },
        { label: '保存并返回' },
      ]
      const save = await menuSelect({ title: '运行开关', subtitle: '空格切换 · 回车保存', items: items3 })
      if (save < 0) continue
      let changed = 0
      if (st2.boost !== (t.boost !== false)) { await ops.setTuning('boost', st2.boost ? 'on' : 'off'); changed++ }
      if (st2.retry !== (t.refusalRetry !== false)) { await ops.setTuning('retry', st2.retry ? 'on' : 'off'); changed++ }
      if (st2.rewind !== (t.rewind !== false)) { await ops.setTuning('rewind', st2.rewind ? 'on' : 'off'); changed++ }
      if (st2.inject !== (t.injectPosition || 'head')) { await ops.setTuning('inject', st2.inject); changed++ }
      console.log('\n  ' + (changed ? ok('已保存 ' + changed + ' 项(下一轮对话生效)') : dim('未改动')))
      await waitKey()
    } else if (chosen.label === '授权管理') {
      const d = ops.drillState()
      const items4 = d?.granted
        ? [{ label: '撤销演练台授权' }, { label: '返回' }]
        : [{ label: '授权演练台' }, { label: '返回' }]
      const s4 = await menuSelect({ title: '授权管理', subtitle: '当前 ' + (d?.granted ? '已授权' : '未授权'), items: items4 })
      if (s4 === 0) { ops.grantDrill(!d?.granted); console.log('  ' + ok(d?.granted ? '已撤销' : '已授权')); await waitKey() }
    }
  }
}

// ═══ 破甲:备份与恢复 ═══════════════════════════════════
async function menuBackup() {
  while (true) {
    const st = await ops.purgeStatus()
    const bks = st.backups || []
    const usage = ops.backupUsage()
    ui.clear()
    console.log('  ' + [bks.length + ' 个备份', '占用 ' + ops.fmtSize(usage.bytes || 0)].join(c('gray', '  ·  ')))
    const items = [
      { type: 'group', label: '操作' },
      { label: '立即备份', hint: '可输入原因' },
      { label: '刷新列表' },
      { label: '回滚到备份', hint: bks.length ? '从列表选择' : '无备份' },
      { label: '删除备份', hint: bks.length ? '从列表选择(不可恢复)' : '无备份' },
      { label: '清理旧备份', hint: '保留最近若干份' },
      { type: 'group', label: '返回' },
      { label: '返回主菜单' },
    ]
    const sel = await menuSelect({ title: '备份与恢复', subtitle: bks.length + ' 个 · ' + ops.fmtSize(usage.bytes || 0), items })
    if (sel < 0 || sel === items.length - 1) return
    const chosen = items[sel]
    if (chosen.label === '立即备份') {
      const reason = await promptText('备份原因(回车=cli)')
      const r = await ops.purgeBackup()
      console.log('  ' + (r.ok ? ok('备份 ' + (r.id || '') + (reason ? dim(' · ' + reason) : '')) : bad('失败')))
      await waitKey()
    } else if (chosen.label === '刷新列表') continue
    else if (chosen.label === '回滚到备份') {
      if (!bks.length) { console.log('  ' + warn('没有备份')); await waitKey(); continue }
      const s5 = await menuSelect({
        title: '回滚:选择备份',
        items: [...bks.map(b => ({
          label: b.id,
          hint: (b.created_at || '').slice(0, 19).replace('T', ' ') + ' · ' + (b.reason || '') + ' · dsh ' + (b.host_version || '?') + ' · ' + ops.fmtSize(ops.backupDetail(b.id).bytes || 0),
        })), { label: '返回' }],
      })
      if (s5 < 0 || s5 === bks.length) continue
      const bk = bks[s5]
      const r = await ops.purgeRollback(bk.id)
      console.log('  ' + (r.ok ? ok('已回滚到 ' + bk.id) : bad('失败')))
      await waitKey()
    } else if (chosen.label === '删除备份') {
      // 多选批量删除:空格勾选,回车删除选中;删完留在列表可继续
      while (true) {
        const list = (await ops.purgeStatus()).backups || []
        if (!list.length) { console.log('  ' + warn('没有备份')); await waitKey(); break }
        const picks = await menuSelect({
          title: '删除备份', subtitle: '空格多选 · 回车删除选中 · q 返回',
          multi: true,
          items: list.map(b => ({
            label: b.id,
            hint: (b.created_at || '').slice(0, 19).replace('T', ' ') + ' · ' + (b.reason || '') + ' · ' + ops.fmtSize(ops.backupDetail(b.id).bytes || 0),
          })),
        })
        if (picks === null || picks.length === 0) break
        const chk = await menuSelect({ title: '确认删除 ' + picks.length + ' 个备份?', subtitle: '不可恢复', items: [{ label: '确认删除(' + picks.length + ' 个)' }, { label: '取消' }] })
        if (chk !== 0) continue
        let okN = 0, failN = 0
        for (const i of picks) {
          const r = ops.deleteBackup(list[i].id)
          if (r.ok) okN++; else { failN++; console.log('  ' + bad(list[i].id + ' — ' + (r.error || '失败'))) }
        }
        console.log('  ' + (failN ? warn('已删除 ' + okN + ' 个,失败 ' + failN + ' 个') : ok('已删除 ' + okN + ' 个')))
      }
    } else if (chosen.label === '清理旧备份') {
      const r = await ops.purgePrune()
      console.log('  ' + (r.ok ? ok('已清理旧备份') : bad('失败')))
      await waitKey()
    }
  }
}

// ═══ 技能包 ═════════════════════════════════════════════
async function menuSkill(kind) {
  const isRed = kind === 'red'
  while (true) {
    const st = readState(isRed ? REDTEAM_STATE : REVERSE_STATE)
    ui.clear()
    const items = [
      { type: 'group', label: '安装' },
      { label: st ? '更新' : '安装', hint: isRed ? '仓库分类技能 → 统一入口' : '仓库子目录 → 统一入口' },
      { label: '重装', hint: '清空后重新安装(本地源优先)' },
      { label: '卸载', hint: '删除技能包与独立注册' },
      { label: '查看清单', hint: st ? (isRed ? (st.skills?.length || 0) + ' 个技能' : (st.modules?.length || 0) + ' 个模块') : '未安装' },
      { type: 'group', label: '返回' },
      { label: '返回主菜单' },
    ]
    const sel = await menuSelect({ title: isRed ? '红队技能包' : '逆向技能包', subtitle: st ? '已安装 v' + (st.version || '?') : '未安装', items })
    if (sel < 0 || sel === items.length - 1) return
    const chosen = items[sel]
    if (chosen.label === '更新' || chosen.label === '安装') {
      const r = isRed ? await ops.installRedteam() : await ops.installReverse()
      console.log(r?.ok ? '  ' + ok((isRed ? r.count + ' 个技能' : r.modules + ' 个模块') + ' · v' + (r.version || '?')) : '  ' + bad(r?.error || '失败'))
      await waitKey()
    } else if (chosen.label === '重装') {
      if (st) ops.uninstallPack(isRed ? 'red' : 'reverse')
      const r = isRed ? await ops.installRedteam() : await ops.installReverse()
      console.log(r?.ok ? '  ' + ok('重装完成:' + (isRed ? r.count + ' 个技能' : r.modules + ' 个模块') + ' · v' + (r.version || '?') + (r.source ? ' (' + r.source + ')' : '')) : '  ' + bad(r?.error || '失败'))
      await waitKey()
    } else if (chosen.label === '卸载') {
      const chk2 = await menuSelect({ title: '确认卸载' + (isRed ? '红队' : '逆向') + '技能包', subtitle: '将删除已安装技能与独立注册', items: [{ label: '确认卸载' }, { label: '取消' }] })
      if (chk2 !== 0) continue
      const r2 = ops.uninstallPack(isRed ? 'red' : 'reverse')
      console.log('  ' + ok('已卸载,移除 ' + r2.removed + ' 个独立技能目录'))
      await waitKey()
    } else if (chosen.label === '查看清单') {
      if (!st) { console.log('  ' + warn('未安装')); await waitKey(); continue }
      const list = isRed ? (st.skills || []) : (st.modules || [])
      console.log('\n  ' + list.join('\n  '))
      await waitKey()
    }
  }
}

// ═══ 插件商店 ═══════════════════════════════════════════
async function menuPlugins() {
  while (true) {
    const inst = await ops.pluginsInstalled()
    const ex = ops.pluginExemptions()
    const exCount = Object.keys(ex || {}).length
    ui.clear()
    const items = [
      { type: 'group', label: '目录' },
      { label: '在线插件目录', hint: '从自建源拉取 · 多选安装' },
      { label: '已安装插件', hint: inst.length + ' 个' },
      { type: 'group', label: '操作' },
      { label: '安装插件', hint: '输入包名 / 路径 / tarball' },
      { label: '卸载插件', hint: '多选' },
      { label: '更新全部插件', hint: '默认全选 · 空格取消' },
      { type: 'group', label: '兼容性' },
      { label: '版本豁免', hint: exCount ? exCount + ' 条规则' : '无' },
      { type: 'group', label: '维护' },
      { label: '重启 dsh' },
      { type: 'group', label: '返回' },
      { label: '返回主菜单' },
    ]
    const sel = await menuSelect({ title: '插件商店', subtitle: inst.length + ' 个已安装' + (exCount ? ' · ' + exCount + ' 条豁免' : ''), items })
    if (sel < 0 || sel === items.length - 1) return
    const chosen = items[sel]
    if (chosen.label === '在线插件目录') {
      console.log(dim('\n  正在拉取在线目录…'))
      const cat = await ops.pluginsCatalog()
      if (!cat.length) { console.log('  ' + warn('目录为空或自建源不可达(检查密钥)')); await waitKey(); continue }
      const names = new Set(inst.map(p => p.name))
      const picks = await menuSelect({
        title: '在线插件目录', subtitle: cat.length + ' 个可用 · 空格多选安装',
        multi: true,
        items: cat.map(p => ({ label: p.name + ' v' + p.version, hint: (names.has(p.name) ? c('green', '已装 · ') : '') + (p.description || '').slice(0, 44) })),
      })
      if (picks === null || picks.length === 0) continue
      let okN = 0, failN = 0
      for (const i of picks) {
        const target = cat[i]
        console.log(dim('  → 安装 ' + target.name + ' v' + target.version))
        const r = await ops.pluginInstall(target.spec)
        if (r.ok) { okN++; console.log('    ' + ok(target.name)) }
        else { failN++; console.log('    ' + bad(target.name + ' — 失败' + (r.hint ? ' ' + r.hint : ''))) }
      }
      console.log('\n  ' + (failN ? warn('安装完成:成功 ' + okN + ' · 失败 ' + failN) : ok('已安装 ' + okN + ' 个插件(重启 dsh 生效)')))
      await waitKey()
    } else if (chosen.label === '已安装插件') {
      for (const p of inst) {
        const spec = String(p.spec || '')
        const short = spec.replace(/^https?:\/\/[^/]+\//, '').slice(0, 52)
        console.log('  · ' + padName(p.name) + dim(' v' + p.version) + (short ? dim('  ← ' + short) : ''))
      }
      await waitKey()
    } else if (chosen.label === '安装插件') {
      const spec = await promptText('包名 / 本地路径 / tarball')
      if (!spec) continue
      const r = await ops.pluginInstall(spec)
      console.log('  ' + (r.ok ? ok('已安装' + dim(' (重启 dsh 生效)')) : bad('失败' + (r.hint ? ' — ' + r.hint : ''))))
      await waitKey()
    } else if (chosen.label === '卸载插件') {
      if (!inst.length) { console.log('  ' + warn('没有已安装插件')); await waitKey(); continue }
      const picks = await menuSelect({
        title: '卸载插件', subtitle: '空格多选卸载 · 回车确认',
        multi: true,
        items: inst.map(p => ({ label: p.name, hint: 'v' + p.version })),
      })
      if (picks === null || picks.length === 0) continue
      const chk = await menuSelect({ title: '确认卸载 ' + picks.length + ' 个插件?', items: [{ label: '确认卸载(' + picks.length + ' 个)' }, { label: '取消' }] })
      if (chk !== 0) continue
      let okN = 0, failN = 0
      for (const i of picks) {
        const r = await ops.pluginRemove(inst[i].name)
        if (r.ok) { okN++; console.log('    ' + ok('已卸载 ' + inst[i].name)) }
        else { failN++; console.log('    ' + bad(inst[i].name + ' — 失败')) }
      }
      console.log('\n  ' + (failN ? warn('成功 ' + okN + ' · 失败 ' + failN) : ok('已卸载 ' + okN + ' 个(重启 dsh 生效)')))
      await waitKey()
    } else if (chosen.label === '更新全部插件') {
      if (!inst.length) { console.log('  ' + warn('没有已安装插件')); await waitKey(); continue }
      const picks = await menuSelect({
        title: '更新插件', subtitle: '默认全选 · 空格取消不需要的',
        multi: true, checked: inst.map((_, i) => i),
        items: inst.map(p => ({ label: p.name, hint: 'v' + p.version })),
      })
      if (picks === null || picks.length === 0) continue
      let cat2 = []
      try { cat2 = await ops.pluginsCatalog() } catch {}
      const byName = new Map(cat2.map(p => [p.name, p]))
      let okN = 0, failN = 0
      for (const i of picks) {
        const p = inst[i]
        const spec = byName.get(p.name)?.spec || p.spec
        if (!spec) { failN++; console.log('    ' + bad(p.name + ' — 无安装来源')); continue }
        console.log(dim('  → 更新 ' + p.name))
        const r = await ops.pluginInstall(spec)
        if (r.ok) { okN++; console.log('    ' + ok(p.name)) }
        else { failN++; console.log('    ' + bad(p.name + ' — 失败' + (r.hint ? ' ' + r.hint : ''))) }
      }
      console.log('\n  ' + (failN ? warn('成功 ' + okN + ' · 失败 ' + failN) : ok('已更新 ' + okN + ' 个(重启 dsh 生效)')))
      await waitKey()
    } else if (chosen.label === '版本豁免') {
      const cur = ops.pluginExemptions()
      const rows = Object.entries(cur || {})
      const items2 = [
        { type: 'group', label: '现有豁免' },
        ...(rows.length ? rows.map(([k, v]) => ({ label: k, hint: Array.isArray(v) ? v.join(', ') : String(v) })) : [{ label: '（无豁免规则）' }]),
        { type: 'group', label: '操作' },
        { label: '授权豁免', hint: '插件@版本 兼容当前 dsh' },
        { label: '撤销豁免', hint: '多选' },
        { type: 'group', label: '返回' },
        { label: '返回' },
      ]
      const s3 = await menuSelect({ title: '版本豁免', subtitle: rows.length + ' 条', items: items2 })
      if (s3 < 0) continue
      const ch = items2[s3]
      if (ch.label === '授权豁免') {
        const pkg = await promptText('插件@版本(如 dsh-plugin-mcp@0.7.2)')
        if (!pkg) continue
        const dv = await promptText('目标 dsh 版本(如 0.2.1-rc.5)')
        if (!dv) continue
        const r = await ops.setPluginExemption(pkg, dv, true)
        console.log('  ' + (r.ok ? ok('已授权 ' + pkg + ' 兼容 dsh ' + dv + dim(' (重启 dsh 生效)')) : bad('失败')))
        await waitKey()
      } else if (ch.label === '撤销豁免') {
        if (!rows.length) { console.log('  ' + warn('没有豁免规则')); await waitKey(); continue }
        const picks = await menuSelect({
          title: '撤销豁免', subtitle: '空格多选 · 回车撤销',
          multi: true,
          items: rows.map(([k, v]) => ({ label: k, hint: Array.isArray(v) ? v.join(', ') : String(v) })),
        })
        if (picks === null || picks.length === 0) continue
        let okN = 0, failN = 0
        for (const i of picks) {
          const key = rows[i][0]
          const [pkg, ver] = key.split('@')
          const dv = String((cur[key] || [])[0] || '')
          const r = await ops.setPluginExemption(pkg + '@' + ver, dv, false)
          if (r.ok) { okN++; console.log('    ' + ok('已撤销 ' + key)) } else { failN++; console.log('    ' + bad(key + ' — 失败')) }
        }
        console.log('\n  ' + (failN ? warn('成功 ' + okN + ' · 失败 ' + failN) : ok('已撤销 ' + okN + ' 条豁免')))
        await waitKey()
      }
    } else if (chosen.label === '重启 dsh') {
      const r = await ops.restartDsh()
      console.log('  ' + (r.ok ? ok('已拉起 dsh') : bad('失败:' + (r.error || ''))))
      await waitKey()
    }
  }
}
const padName = (s) => s + ' '.repeat(Math.max(0, 24 - s.length))

// ═══ 设置 ═══════════════════════════════════════════════
async function menuSettings() {
  while (true) {
    const tok = core.readToken()
    ui.clear()
    const items = [
      { type: 'group', label: '自建源' },
      { label: '设置访问密钥', hint: tok ? '已配置' : '未配置' },
      { label: '测试连接' },
      { type: 'group', label: '日志' },
      { label: '查看审计日志', hint: '插件动作记录(audit.jsonl)' },
      { label: '查看换包日志', hint: '控制器换包/改名记录' },
      { label: '清空审计日志' },
      { label: '清理全部日志', hint: '含换包与 worker 日志' },
      { type: 'group', label: '返回' },
      { label: '返回主菜单' },
    ]
    const sel = await menuSelect({ title: '设置', subtitle: '自建源 · 日志', items })
    if (sel < 0 || sel === items.length - 1) return
    const chosen = items[sel]
    if (chosen.label === '设置访问密钥') {
      const t = await promptText('Gitea 令牌(输入 - 清除,回车取消)')
      if (t === '-') { core.saveToken(''); console.log('  ' + ok('已清除')) }
      else if (t) { core.saveToken(t); console.log('  ' + ok('已保存')) }
      await waitKey()
    } else if (chosen.label === '测试连接') {
      const v = await core.hubFileVersion('resources/redteam-skill')
      console.log('  ' + (v ? ok('连接正常 · 红队包 v' + v) : bad('连接失败(检查密钥/网络)')))
      await waitKey()
    } else if (chosen.label === '查看审计日志' || chosen.label === '查看换包日志') {
      const isAudit = chosen.label === '查看审计日志'
      const file = isAudit ? ops.auditFile() : ops.handoffFile()
      const r = ops.tailFile(file, 30)
      if (!r.ok) { console.log('  ' + warn('日志不存在:' + file)); await waitKey(); continue }
      console.log('\n  ' + head(file) + dim('  共 ' + r.total + ' 行,显示最近 ' + r.lines.length + ' 行'))
      console.log(c('gray', '  ' + '-'.repeat(60)))
      for (const line of r.lines) {
        let out = line
        if (isAudit) { try { const j = JSON.parse(line); out = [j.at || j.time || '', j.action || j.op || '', j.reason || j.detail || ''].filter(Boolean).join(' · ') || line } catch {} }
        console.log('  ' + String(out).slice(0, 160))
      }
      console.log(c('gray', '  ' + '-'.repeat(60)))
      const more = await menuSelect({ title: '日志操作', items: [{ label: '返回' }, { label: '清空该日志' }] })
      if (more === 1) { const c2 = isAudit ? ops.clearAudit() : (() => { try { execSync('rm -f "' + file + '"'); return { ok: true } } catch (e) { return { ok: false, error: e.message } } })(); console.log('  ' + (c2.ok ? ok('已清空') : bad(c2.error))) ; await waitKey() }
    } else if (chosen.label === '清空审计日志') {
      const r = ops.clearAudit()
      console.log('  ' + (r.ok ? ok('已清空审计日志') : bad(r.error || '失败')))
      await waitKey()
    } else if (chosen.label === '清理全部日志') {
      const r = ops.clearAllLogs()
      console.log('  ' + ok('已清理 ' + r.removed + ' 个日志文件'))
      await waitKey()
    }
  }
}

// ═══ 主菜单 ═════════════════════════════════════════════
async function mainMenu() {
  while (true) {
    ui.clear()
    console.log('\n  ' + c('cyan', 'DSH CONTROLLER') + dim('  ·  ') + await statusLine())
    const rt = readState(REDTEAM_STATE), rv = readState(REVERSE_STATE)
    const items = [
      { type: 'group', label: '破甲' },
      { label: '一键破甲', hint: '安装 / 卸载 / 还原签名' },
      { label: '运行配置', hint: '域名拦截 / 自检 / 开关 / 授权' },
      { label: '备份与恢复', hint: '备份 / 回滚 / 删除' },
      { type: 'group', label: '扩展' },
      { label: '红队技能', hint: rt ? (rt.skills?.length || 0) + ' 个 · v' + (rt.version || '?') : '未安装' },
      { label: '逆向技能', hint: rv ? (rv.modules?.length || 0) + ' 模块 · v' + (rv.version || '?') : '未安装' },
      { type: 'group', label: '管理' },
      { label: '插件商店', hint: '在线目录 / 安装 / 卸载' },
      { label: '设置', hint: '密钥 / 连接 / 日志' },
      { label: '退出' },
    ]
    const sel = await menuSelect({ title: 'DSH Controller', subtitle: 'DeepSeek Harness 管理', items, footerTip: 'v0.1.0' })
    if (sel < 0 || sel === items.length - 1) { ui.closeAsk(); console.log(dim('\n  再见\n')); process.exit(0) }
    const chosen = items[sel]
    if (chosen.label === '一键破甲') await menuPurge()
    else if (chosen.label === '运行配置') await menuRuntime()
    else if (chosen.label === '备份与恢复') await menuBackup()
    else if (chosen.label === '红队技能') await menuSkill('red')
    else if (chosen.label === '逆向技能') await menuSkill('reverse')
    else if (chosen.label === '插件商店') await menuPlugins()
    else if (chosen.label === '设置') await menuSettings()
  }
}

// ═══ 非交互命令 ═════════════════════════════════════════
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
