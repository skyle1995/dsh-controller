import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import semver from 'semver'


// 与 dsh-app-boot 的规则保持一致:semver 范围匹配且允许预发布版本参与
const WORKSPACE_RANGES = new Set(['workspace:^', 'workspace:~', 'workspace:*'])

function satisfiesRange(version, range) {
  if (!range) return true
  const r = String(range).trim()
  if (WORKSPACE_RANGES.has(r)) return true
  try { return semver.satisfies(version, r, { includePrerelease: true }) } catch { return false }
}

// 插件 manifest 里声明的所有 dsh-* 范围都必须满足;没有声明则不限制
function isPluginCompatible(p, dshVersion) {
  if (!dshVersion) return true
  const ranges = Array.isArray(p?.dshRanges) && p.dshRanges.length
    ? p.dshRanges
    : (p?.dshRequired ? [{ range: p.dshRequired }] : [])
  if (!ranges.length) return true
  return ranges.every(r => satisfiesRange(dshVersion, r.range))
}

function pad(n) { return String(n).padStart(2, '0') }

function clock(ms) {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}


function fmtCpu(v) { return v == null ? '—' : `${Math.round(v)}%` }

function fmtMem(v) {
  if (v == null) return '—'
  return v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${v} MB`
}

function platformLabel(p) {
  if (p === 'darwin') return 'macOS'
  if (p === 'win32') return 'Windows'
  if (p === 'linux') return 'Linux'
  return p || '—'
}


function OpLog({ open, onToggle }) {
  const [text, setText] = useState('')
  const boxRef = useRef(null)

  useEffect(() => window.api.onOpLog((chunk) => setText(t => t + chunk)), [])

  useEffect(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [text])

  return (
    <details className="op-log" open={open}>
      <summary onClick={(e) => { e.preventDefault(); onToggle() }}>操作日志</summary>
      <pre className="op-log-box" ref={boxRef}>{text || '暂无输出'}</pre>
    </details>
  )
}

function PluginPanel() {
  const [dshVersion, setDshVersion] = useState(null)
  const [installed, setInstalled] = useState([])
  const [catalog, setCatalog] = useState([])
  const [exemptions, setExemptions] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [logOpen, setLogOpen] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inst, cat, ex] = await Promise.all([
        window.api.listInstalledPlugins(),
        window.api.fetchPluginCatalog(),
        window.api.listPluginExemptions(),
      ])
      setInstalled(inst)
      setCatalog(cat)
      setExemptions(ex ?? {})
      setError('')
    } catch (e) {
      setError(String(e?.message ?? e))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    window.api.getDshVersion?.().then(v => setDshVersion(v)).catch(() => {})
  }, [load])

  const run = async (fn, label) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const r = await fn()
      setNotice(typeof label === 'function' ? label(r) : label)
      await load()
    } catch (e) {
      setError(String(e?.message ?? e))
    }
    setBusy(false)
  }

  const installOrUpdate = (p) => run(
    () => window.api.installPlugin(p.spec),
    `已安装插件 ${p.name}${p.version ? ` v${p.version}` : ''}(重启 dsh 生效)`,
  )

  const updateAll = () => run(
    () => window.api.updateAllPlugins(),
    (res) => {
      const list = res ?? []
      const ok = list.filter(p => p.ok).length
      const bad = list.filter(p => !p.ok)
      const hinted = list.filter(p => (p.hints ?? []).length)
      let text = ok ? `已更新 ${ok} 个插件到最新版` : '没有需要更新的插件'
      if (bad.length) text += `;失败:${bad.map(p => p.name).join('、')}(详见操作日志)`
      if (hinted.length) text += `;${hinted.map(p => p.name).join('、')} 仍要求旧版 dsh,请点「授权兼容」`
      return `${text}(重启 dsh 生效)`
    },
  )

  const remove = (name) => {
    if (!confirm(`确定卸载插件「${name}」?(重启 dsh 生效)`)) return
    void run(() => window.api.uninstallPlugin(name), `已卸载插件 ${name}(重启 dsh 生效)`)
  }

  const restart = () => run(() => window.api.restartDsh(), '已重启 dsh')

  const isIncompatible = (p) => !isPluginCompatible(p, dshVersion)
  const isExempted = (p) => !!dshVersion && !!p.version &&
    (exemptions[`${p.name}@${p.version}`] ?? []).includes(dshVersion)

  const setExemption = (p, enable) => {
    if (enable && !confirm(
      `授权 ${p.name}@${p.version} 在 dsh ${dshVersion} 上运行?\n\n` +
      '官方提示:不兼容插件可能导致崩溃或数据丢失;授权只对「这个插件版本 + 这个 dsh 版本」精确生效,插件或 dsh 升级后需重新授权。',
    )) return
    void run(
      () => window.api.setVersionExemption(p.name, p.version, dshVersion, enable),
      enable
        ? `已授权 ${p.name}@${p.version} 兼容 dsh ${dshVersion}(重启 dsh 生效)`
        : `已撤销 ${p.name} 的兼容授权`,
    )
  }

  const installedMap = useMemo(() => new Map(installed.map(p => [p.name, p])), [installed])
  const catalogMap = useMemo(() => new Map(catalog.map(p => [p.name, p])), [catalog])
  const [subTab, setSubTab] = useState('installed')

  const available = catalog.filter(p => !installedMap.has(p.name))

  return (
    <section className="card">
      <div className="panel-head">
        <h2>插件中心 <span className="hint">自建仓库 · profile: desktop</span></h2>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void load()} disabled={busy}>刷新目录</button>
          <button type="button" className="btn" onClick={updateAll} disabled={busy || installed.length === 0}>全部更新</button>
          <button type="button" className="btn primary" onClick={restart} disabled={busy}>重启桌面版</button>
        </div>
      </div>

      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
      {notice ? <div className="banner banner-ok" role="status">{notice}</div> : null}

      <nav className="tabs" role="tablist" aria-label="插件列表" style={{ marginTop: 12 }}>
        <button type="button" role="tab" aria-selected={subTab === 'installed'} className={`tab ${subTab === 'installed' ? 'active' : ''}`} onClick={() => setSubTab('installed')}>
          已安装({installed.length})
        </button>
        <button type="button" role="tab" aria-selected={subTab === 'available'} className={`tab ${subTab === 'available' ? 'active' : ''}`} onClick={() => setSubTab('available')}>
          可安装({available.length})
        </button>
      </nav>

      {subTab === 'installed' ? (
        installed.length === 0 ? (
          <p className="empty">暂无插件;到「可安装」标签浏览仓库</p>
        ) : (
          <div className="plugin-list">
            {installed.map(p => {
              const bad = isIncompatible(p)
              const granted = isExempted(p)
              const latest = catalogMap.get(p.name)?.version
              const hasUpdate = !!(latest && p.version && latest !== p.version)
              return (
                <div key={p.name} className="plugin-row">
                  <div className="plugin-meta">
                    <div className="plugin-name">
                      {p.name} <span className="plugin-ver mono">v{p.version ?? '—'}</span>
                      {hasUpdate ? <span className="badge badge-warn">可更新 v{latest}</span> : null}
                      {bad && !granted
                        ? <span className="badge badge-warn">要求 dsh {p.dshRequired},与当前 {dshVersion} 不兼容</span>
                        : null}
                      {bad && granted
                        ? <span className="badge badge-installed">已授权兼容 {dshVersion}</span>
                        : null}
                    </div>
                    <div className="plugin-spec mono">{p.spec}</div>
                  </div>
                  <div className="actions">
                    {bad && !granted
                      ? <button type="button" className="btn" onClick={() => setExemption(p, true)} disabled={busy}>授权兼容</button>
                      : null}
                    {bad && granted
                      ? <button type="button" className="btn" onClick={() => setExemption(p, false)} disabled={busy}>撤销授权</button>
                      : null}
                    <button type="button" className={hasUpdate ? 'btn primary' : 'btn'} onClick={() => installOrUpdate(p)} disabled={busy}>
                      {hasUpdate ? '更新' : '重装'}
                    </button>
                    <button type="button" className="btn danger" onClick={() => remove(p.name)} disabled={busy}>卸载</button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        loading ? (
          <p className="empty">加载中…</p>
        ) : available.length === 0 ? (
          <p className="empty">仓库为空或全部已安装</p>
        ) : (
          <div className="plugin-list">
            {available.map(p => {
              const compatible = isPluginCompatible(p, dshVersion)
              return (
                <div key={p.name} className="plugin-row">
                  <div className="plugin-meta">
                    <div className="plugin-name">
                      {p.name} <span className="plugin-ver mono">v{p.version}</span>
                      {!compatible ? <span className="badge badge-warn">要求 dsh {p.dshRequired},与当前 {dshVersion || '—'} 不兼容</span> : null}
                    </div>
                    <div className="plugin-desc">{p.description || '无描述'}</div>
                  </div>
                  <div className="actions">
                    <button type="button" className="btn primary" onClick={() => installOrUpdate(p)} disabled={busy}>安装</button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      <OpLog open={logOpen} onToggle={() => setLogOpen(v => !v)} />
    </section>
  )
}

// ── 红队技能包(统一入口)──
function RedteamPackPanel() {
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try { setInfo((await window.api.getPurgeSkills())?.redteam); setError('') }
    catch (e) { setError(String(e?.message ?? e)) }
  }, [])
  useEffect(() => { void load() }, [load])

  const run = async (fn, label) => {
    setBusy(true); setError(''); setNotice('')
    try { const r = await fn(); setNotice(typeof label === 'function' ? label(r) : label); await load() }
    catch (e) { setError(String(e?.message ?? e)) }
    setBusy(false)
  }

  const rt = info
  const install = () => void run(
    () => window.api.installPurgeSkills(),
    (r) => `红队技能包已安装(v${r.version} 统一入口,dsh 新会话生效)${r.migrated?.length ? ';已自动迁移清理 ' + r.migrated.length + ' 个旧分散技能' : ''}`,
  )
  const uninstall = () => {
    if (!confirm('确定卸载红队技能包?将删除统一入口目录 redteam-skill。')) return
    void run(() => window.api.uninstallPurgeSkills(), (r) => `已卸载红队技能包`)
  }

  return (
    <section className="card">
      <h2>红队技能包 <span className="hint">统一入口 redteam-skill · 测绘 / 隧道 / 横向 / WebShell 等</span></h2>

      <div className="version-cards">
        <div className="vcard">
          <div className="vcard-label">安装状态</div>
          <div className="vcard-value mono">{rt?.installed ? (rt.upToDate ? '已安装·最新' : '已安装·可更新') : '未安装'}</div>
        </div>
        <div className="vcard">
          <div className="vcard-label">技能数量</div>
          <div className="vcard-value mono">{rt?.installed ? `${rt.skillCount} 个` : (rt?.available ? `${rt.available} 个可装` : '—')}</div>
        </div>
        <div className="vcard">
          <div className="vcard-label">破甲插件</div>
          <div className="vcard-value mono">{rt?.pluginInstalled ? `v${rt.pluginVersion ?? '?'}` : '未安装'}</div>
        </div>
      </div>

      <div className="version-status">
        {rt?.installed
          ? <span className={`pill ${rt.upToDate ? 'pill-on' : 'pill-warn'}`}>{rt.upToDate ? '最新' : '插件已更新,技能可同步'}</span>
          : <span className="pill pill-off">未安装</span>}
        <span className="muted">
          {rt?.installed
            ? `提取自 v${rt.installedVersion ?? '?'} · 安装于 ${rt.installedAt ? new Date(rt.installedAt).toLocaleString() : '—'}`
            : '安装为单一入口技能 redteam-skill,按描述路由,经索引进入子技能'}
        </span>
      </div>

      {rt?.legacyScattered ? (
        <p className="note-warn">⚠ 检测到 {rt.legacyScattered} 个旧版分散技能目录,点「安装」会自动迁移清理。</p>
      ) : null}

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button type="button" className="btn" onClick={() => void load()} disabled={busy}>刷新</button>
        {rt?.installed ? (
          <>
            <button type="button" className="btn primary" onClick={install} disabled={busy}>
              {rt.upToDate ? '重装' : '更新'}
            </button>
            <button type="button" className="btn danger" onClick={uninstall} disabled={busy}>卸载</button>
          </>
        ) : (
          <button type="button" className="btn primary" onClick={install} disabled={busy || !rt?.pluginInstalled || !rt?.available}>
            安装
          </button>
        )}
      </div>

      {!rt?.pluginInstalled ? (
        <p className="note-warn">⚠ 技能源自破甲插件:请先在「破甲」页签安装破甲插件。</p>
      ) : null}

      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
      {notice ? <div className="banner banner-ok" role="status">{notice}</div> : null}

      <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
        安装为 <span className="mono">~/.dsh/skills/redteam-skill/</span>:入口 SKILL.md 提供全部子技能的路由索引,
        子技能正文在 SKILLS/ 下,对所有 dsh 会话生效;版本跟随破甲插件。
      </p>
    </section>
  )
}

// ── 逆向技能包(reverse-skill)──
function ReversePackPanel() {
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try { setInfo((await window.api.getPurgeSkills())?.reverse); setError('') }
    catch (e) { setError(String(e?.message ?? e)) }
  }, [])
  useEffect(() => { void load() }, [load])

  const run = async (fn, label) => {
    setBusy(true); setError(''); setNotice('')
    try { await fn(); setNotice(label); await load() }
    catch (e) { setError(String(e?.message ?? e)) }
    setBusy(false)
  }

  const install = () => void run(() => window.api.installReverseSkill(), '逆向技能包已安装(dsh 新会话生效)')
  const uninstall = () => {
    if (!confirm('确定卸载逆向技能包(reverse-skill)?')) return
    void run(() => window.api.uninstallReverseSkill(), '逆向技能包已卸载')
  }

  const rv = info

  return (
    <section className="card">
      <h2>逆向技能包 <span className="hint">reverse-skill · 逆向 / CTF / 安全研究路由包</span></h2>

      <div className="version-cards">
        <div className="vcard">
          <div className="vcard-label">安装状态</div>
          <div className="vcard-value mono">{rv?.installed ? (rv.upToDate ? '已安装·最新' : '已安装·可更新') : '未安装'}</div>
        </div>
        <div className="vcard">
          <div className="vcard-label">技能数量</div>
          <div className="vcard-value mono">{rv?.installed ? `${rv.skillCount ?? 0} 个` : '—'}</div>
        </div>
        <div className="vcard">
          <div className="vcard-label">版本</div>
          <div className="vcard-value mono">
            {rv?.installed
              ? ('v' + (rv.installedVersion ?? '—')) + (!rv.upToDate && rv.latest ? ' → v' + rv.latest : '')
              : (rv?.latest ? 'v' + rv.latest : '—')}
          </div>
        </div>
      </div>

      <div className="version-status">
        {rv?.installed
          ? <span className={`pill ${rv.upToDate ? 'pill-on' : 'pill-warn'}`}>{rv.upToDate ? '最新' : '有更新'}</span>
          : <span className="pill pill-off">未安装</span>}
        <span className="muted">
          {rv?.installed
            ? (rv.upToDate ? '已装 v' + (rv.installedVersion ?? '—') + ' · 最新' : '已装 v' + (rv.installedVersion ?? '—') + ' → 最新 v' + (rv.latest ?? '?'))
              + (rv.installedAt ? ' · 装于 ' + new Date(rv.installedAt).toLocaleString() : '')
            : (rv?.latest ? '最新 v' + rv.latest : '检测自建源版本…')}
        </span>
      </div>

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button type="button" className="btn" onClick={() => void load()} disabled={busy}>刷新</button>
        <button type="button" className="btn primary" onClick={install} disabled={busy}>
          {rv?.installed ? (rv.upToDate ? '重装' : '更新') : '安装'}
        </button>
        {rv?.installed ? (
          <button type="button" className="btn danger" onClick={uninstall} disabled={busy}>卸载</button>
        ) : null}
      </div>

      {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
      {notice ? <div className="banner banner-ok" role="status">{notice}</div> : null}

      <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
        安装为 <span className="mono">~/.dsh/skills/reverse-skill/</span>(入口 SKILL.md + RULES.md 路由矩阵)。
        从自建 Git 克隆下发(hub.ifunx.com/skyle1995/reverse-skill),commit 作版本,插件自动比对已装/最新。
      </p>
    </section>
  )
}

// ── 破甲(dsh-purge)── 控制器只做外部编排,补丁逻辑由插件自身完成 ──
const PURGE_INJECT_MODES = ['head', 'tail', 'both']
const fmtTime = (iso) => {
  try { return new Date(iso).toLocaleString() } catch { return String(iso ?? '') }
}

function PurgePanel() {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [check, setCheck] = useState(null)

  const load = useCallback(async () => {
    try {
      setState(await window.api.getPurgeState())
      setError('')
    } catch (e) {
      setError(String(e?.message ?? e))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async (fn, label) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
      setNotice(label)
      await load()
    } catch (e) {
      setError(String(e?.message ?? e))
    }
    setBusy(false)
  }

  const install = () => void run(
    () => window.api.installPurge(),
    state?.installed ? '破甲插件已更新(重启 dsh 后生效)' : '破甲插件已安装(重启 dsh 后生效)',
  )

  const apply = () => {
    if (!confirm('确定应用破甲补丁?将修改本机 dsh 安装目录的文件(写入前自动备份),重启 dsh 后生效。')) return
    void run(() => window.api.applyPurge(), '破甲已应用,重启 dsh 后生效')
  }

  const applyAndRestart = () => {
    if (!confirm('确定应用破甲补丁并重启 dsh?修改宿主文件前会自动备份。')) return
    void run(async () => {
      await window.api.applyPurge()
      await window.api.restartDsh()
    }, '破甲已应用,dsh 已重启')
  }

  const revert = () => {
    if (!confirm('确定回滚破甲补丁?被修改的 dsh 文件会还原为补丁前备份,重启 dsh 后生效。')) return
    void run(() => window.api.revertPurge(), '破甲补丁已回滚,重启 dsh 后生效')
  }

  const uninstall = () => {
    if (!confirm('确定卸载破甲插件?会先还原已应用的补丁,再清理插件文件,重启 dsh 后生效。')) return
    void run(() => window.api.uninstallPurge(), '破甲插件已卸载,重启 dsh 后生效')
  }

  const selfcheck = () => void run(async () => {
    setCheck(await window.api.selfcheckPurge())
  }, '自检完成')

  const unrestrict = () => {
    if (!confirm('确定解除公网/银行域名拦截(region gate)?将修改破甲插件文件 lib/net-scope.js(自动备份,可恢复),重启 dsh 后生效。请自行确保在已授权环境中使用。')) return
    void run(() => window.api.unrestrictPurge(), '已解除拦截,重启 dsh 后生效;插件更新后会自动重打')
  }

  const restoreRestrict = () => void run(
    () => window.api.restoreRestrictPurge(),
    '已恢复插件默认拦截,重启 dsh 后生效',
  )

  const grantDrill = () => void run(
    () => window.api.grantPurgeDrill(),
    '演练台已授权(写入 drill-grant.json)',
  )

  const backup = () => void run(() => window.api.backupPurge(), '已创建备份')

  const rollbackTo = (id) => {
    if (!confirm(`确定回滚到备份 ${id}?当前插件状态会被该备份覆盖。`)) return
    void run(() => window.api.rollbackPurge(id), `已回滚到备份 ${id}`)
  }

  const prune = () => void run(() => window.api.prunePurge(), '旧备份已清理')

  const tune = (key, value) => void run(
    () => window.api.tunePurge(key, value),
    `已设置 ${key} = ${value}(下一轮对话生效,无需重启)`,
  )

  const compat = state?.compatibility
  const compatLevelText = { qualified: '已验证', unverified: '未验证', mixed: '组件混装', 'no-host': '未定位宿主' }
  const tuning = state?.tuning
  const boostOn = tuning?.boost !== false // purge 默认全开
  const rewindOn = tuning ? tuning.rewind !== false : true
  const retryOn = tuning?.refusalRetry === true // 默认关
  const injectMode = tuning?.injectPosition || 'head'

  const Toggle = ({ label, on, onKey, desc }) => (
    <div className="purge-tune-row">
      <div>
        <strong>{label}</strong>
        {desc ? <span className="hint"> {desc}</span> : null}
      </div>
      <div className="btn-row">
        <button type="button" className={`btn small ${on ? 'primary' : ''}`} disabled={busy || on} onClick={() => tune(onKey, 'on')}>开</button>
        <button type="button" className={`btn small ${!on ? 'primary' : ''}`} disabled={busy || !on} onClick={() => tune(onKey, 'off')}>关</button>
      </div>
    </div>
  )

  return (
    <>
      <section className="card">
        <h2>破甲 dsh-purge <span className="hint">宿主策略补丁 · 提示词注入 · 备份回滚</span></h2>

        <div className="version-cards">
          <div className="vcard">
            <div className="vcard-label">已装版本</div>
            <div className="vcard-value mono">{state?.installed ? `v${state.version ?? '?'}` : '未安装'}</div>
          </div>
          <div className="vcard">
            <div className="vcard-label">自建源最新</div>
            <div className="vcard-value mono">{state?.latest ? `v${state.latest}` : '—'}</div>
          </div>
          <div className="vcard">
            <div className="vcard-label">宿主兼容</div>
            <div className="vcard-value mono">{compat ? (compatLevelText[compat.level] ?? compat.level) : '—'}</div>
          </div>
        </div>

        <div className="version-status">
          {state?.installed
            ? <span className="pill pill-on">已安装</span>
            : <span className="pill pill-off">未安装</span>}
          <span className="muted">
            {state?.installed
              ? `包 ${state.package}${state.cliAvailable ? '' : '(CLI 缺失,部分功能不可用)'} · 备份 ${state.backups?.length ?? 0} 份`
              : '一键安装破甲插件,应用后重启 dsh 生效'}
          </span>
        </div>

        {compat?.message ? <p className="muted">{compat.message}</p> : null}
        {state?.dshBase ? <p className="muted" style={{ fontSize: 12 }}>宿主目录(CLI 版自动定位):{state.dshBase}</p> : null}

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={() => void load()} disabled={busy}>刷新</button>
          {state?.installed ? (
            <>
              <button type="button" className="btn primary" onClick={applyAndRestart} disabled={busy || !state.cliAvailable}>应用并重启</button>
              <button type="button" className="btn" onClick={apply} disabled={busy || !state.cliAvailable}>应用</button>
              <button type="button" className="btn" onClick={revert} disabled={busy || !state.cliAvailable}>回滚补丁</button>
              <button type="button" className="btn" onClick={selfcheck} disabled={busy || !state.cliAvailable}>自检</button>
              <button type="button" className="btn" onClick={backup} disabled={busy || !state.cliAvailable}>备份</button>
              <button type="button" className="btn" onClick={install} disabled={busy || !state.latest}>更新插件</button>
              <button type="button" className="btn danger" onClick={uninstall} disabled={busy}>卸载</button>
            </>
          ) : (
            <button type="button" className="btn primary" onClick={install} disabled={busy || !state?.latest}>安装破甲插件</button>
          )}
        </div>

        {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
        {notice ? <div className="banner banner-ok" role="status">{notice}</div> : null}
      </section>

      {state?.installed ? (
        <>
          <section className="card">
            <h2>运行时开关 <span className="hint">下一轮对话生效,无需重启 dsh</span></h2>
            <Toggle label="强化尾段 boost" on={boostOn} onKey="boost" desc="系统提示词尾部加固段,长上下文抗漂移" />
            <Toggle label="拒绝自动重试 retry" on={retryOn} onKey="retry" desc="模型推脱时自动加固并重试一次" />
            <Toggle label="输入框回退按钮 rewind" on={rewindOn} onKey="rewind" desc="会话输入框旁的「回退一次」" />
            <div className="purge-tune-row">
              <div><strong>注入位置 inject</strong><span className="hint"> 系统提示词里的注入段位置</span></div>
              <div className="btn-row">
                {PURGE_INJECT_MODES.map(m => (
                  <button key={m} type="button" className={`btn small ${injectMode === m ? 'primary' : ''}`}
                    disabled={busy || injectMode === m} onClick={() => tune('inject', m)}>{m}</button>
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <h2>限制管理 <span className="hint">插件手动加的拦截,可解除 / 恢复</span></h2>
            <div className="purge-tune-row">
              <div>
                <strong>公网 / 银行域名拦截(region gate)</strong>
                <span className="hint"> 攻击任务里的 CN/HK/MO 域名与银行域名会被直接拒绝;私网与本机不拦</span>
              </div>
              <div className="btn-row">
                {state?.unrestricted
                  ? <button type="button" className="btn" onClick={restoreRestrict} disabled={busy}>恢复拦截</button>
                  : <button type="button" className="btn primary" onClick={unrestrict} disabled={busy}>解除拦截</button>}
              </div>
            </div>
            <div className="purge-tune-row">
              <div>
                <strong>演练台授权</strong>
                <span className="hint"> 红队演练台的启动确认,授权后不再每次弹窗</span>
              </div>
              <div className="btn-row">
                {state?.drillGranted
                  ? <span className="pill pill-on">已授权</span>
                  : <button type="button" className="btn" onClick={grantDrill} disabled={busy}>一键授权</button>}
              </div>
            </div>
            {state?.unrestrictMarked && !state?.unrestricted ? (
              <p className="muted" style={{ marginBottom: 0 }}>检测到「已解除」标记但补丁不在(插件可能刚更新),点「解除拦截」重打即可。</p>
            ) : null}
            <p className="note-warn" style={{ marginBottom: 0 }}>
              ⚠ 解除拦截只移除插件作者的手动限制,不改变你的授权边界;请在已获授权的环境中使用。
            </p>
          </section>

          {check ? (
            <section className="card">
              <h2>自检结果 <span className="hint">逐层证据,不适用项单独标注</span></h2>
              {check.summary ? (
                <div className="version-status" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                  {['host', 'runtime', 'config', 'layout'].map(k => (
                    check.summary[k] ? (
                      <span key={k} className={`pill ${check.summary[k].ok ? 'pill-on' : 'pill-off'}`}>
                        {k} {check.summary[k].passed}/{check.summary[k].total}
                      </span>
                    ) : null
                  ))}
                  {check.summary.uncertain?.layers ? <span className="pill pill-warn">待核实 {check.summary.uncertain.layers} 层</span> : null}
                  {check.summary.broken?.layers ? <span className="pill pill-off">损坏 {check.summary.broken.layers} 层</span> : null}
                </div>
              ) : null}
              <ul className="purge-layers">
                {(check.layers ?? []).map((l, i) => (
                  <li key={i} className={l.ok ? 'purge-layer-ok' : 'purge-layer-bad'}>
                    <span className="mono">{l.ok ? '✓' : (l.applicable === false ? '·' : '✗')}</span>{' '}
                    {l.title} <span className="muted">{l.applicable === false ? '不适用' : `${l.applied ?? 0}/${l.total ?? '?'}`}</span>
                    {l.note ? <span className="hint"> {l.note}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card">
            <h2>备份 <span className="hint">应用 / 安装 / 回滚前自动快照</span></h2>
            {state.backups?.length ? (
              <>
                <ul className="purge-backups">
                  {state.backups.map(b => (
                    <li key={b.id}>
                      <span className="mono">{b.id}</span>
                      <span className="muted"> {fmtTime(b.created_at)} · {b.reason ?? ''}{b.host_version ? ` · dsh ${b.host_version}` : ''}</span>
                      <button type="button" className="btn small" disabled={busy} onClick={() => rollbackTo(b.id)}>回滚到此</button>
                    </li>
                  ))}
                </ul>
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button type="button" className="btn" onClick={prune} disabled={busy}>清理旧备份</button>
                </div>
              </>
            ) : (
              <p className="muted">暂无备份。「应用」或「备份」操作会自动创建。</p>
            )}
          </section>

          <section className="card">
            <h2>最近动作 <span className="hint">插件审计日志(audit.jsonl)</span></h2>
            {state.auditTail?.length ? (
              <ul className="purge-audit">
                {state.auditTail.map((a, i) => (
                  <li key={i}><span className="mono">{a.event}</span> <span className="muted">{fmtTime(a.at)}</span></li>
                ))}
              </ul>
            ) : (
              <p className="muted">暂无记录。插件的应用 / 回滚 / 开关操作会写入审计。</p>
            )}
          </section>
        </>
      ) : null}

      <section className="card">
        <h2>说明</h2>
        <p className="muted">
          破甲功能由 DSH 插件实现:控制器负责安装、状态展示与操作编排,
          宿主文件修改与备份还原全部由插件自身完成。应用后需重启 dsh 才生效。
        </p>
        <p className="note-warn">
          ⚠ 破甲补丁会修改本机 dsh 安装目录的文件(写入前自动备份)。请在你拥有或已获授权的环境中使用。
        </p>
      </section>
    </>
  )
}

export default function App() {
  const [tab, setTab] = useState('plugins')

  return (
    <main className="app">
      <header className="hero">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <h1>DSH Controller</h1>
            <p className="subtitle">DeepSeek Harness 桌面管理 · 插件 / 破甲 / 技能包</p>
          </div>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="功能导航">
        <button type="button" role="tab" aria-selected={tab === 'plugins'} className={`tab ${tab === 'plugins' ? 'active' : ''}`} onClick={() => setTab('plugins')}>插件中心</button>
        <button type="button" role="tab" aria-selected={tab === 'purge'} className={`tab ${tab === 'purge' ? 'active' : ''}`} onClick={() => setTab('purge')}>破甲</button>
        <button type="button" role="tab" aria-selected={tab === 'redteam'} className={`tab ${tab === 'redteam' ? 'active' : ''}`} onClick={() => setTab('redteam')}>红队技能包</button>
        <button type="button" role="tab" aria-selected={tab === 'reverse'} className={`tab ${tab === 'reverse' ? 'active' : ''}`} onClick={() => setTab('reverse')}>逆向技能包</button>
      </nav>

      {tab === 'plugins' ? <PluginPanel /> : null}
      {tab === 'purge' ? <PurgePanel /> : null}
      {tab === 'redteam' ? <RedteamPackPanel /> : null}
      {tab === 'reverse' ? <ReversePackPanel /> : null}

      <footer className="foot">
        关闭窗口即退出应用 · 桌面版进程由 DeepSeek Harness 自身管理
      </footer>
    </main>
  )
}
