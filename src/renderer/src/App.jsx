import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const POLL_MS = 2000
const MAX_EVENTS = 8

function pad(n) { return String(n).padStart(2, '0') }

function clock(ms) {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatUptime(ms) {
  if (ms == null) return '—'
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  if (m > 0) return `${m} 分 ${s % 60} 秒`
  return `${s} 秒`
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

function StatTile({ label, value, mono, tone }) {
  const toneClass = tone ? `stat-${tone}` : ''
  return (
    <div className={`stat ${toneClass}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${mono ? 'mono' : ''}`}>{value}</div>
    </div>
  )
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

function VersionPanel() {
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [logOpen, setLogOpen] = useState(true)

  const load = useCallback(async () => {
    try {
      setInfo(await window.api.getVersionInfo())
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

  const installOrUpdate = () => run(
    () => window.api.installDsh(),
    info.installed ? '已执行更新(重启 dsh 生效)' : '已执行安装(可启动 dsh)',
  )

  const uninstall = () => {
    if (!confirm('确定卸载 dsh?卸载后「启动 dsh」将不可用,需重新安装。')) return
    void run(() => window.api.uninstallDsh(), '已卸载 dsh')
  }

  const state = !info ? 'loading' : !info.installed ? 'missing' : !info.latest ? 'unknown' : info.upToDate ? 'current' : 'outdated'

  return (
    <>
      <section className="card">
        <h2>dsh 版本 <span className="hint">npm 全局包 @deepseek-ai/dsh</span></h2>

        <div className="version-cards">
          <div className="vcard">
            <div className="vcard-label">当前版本</div>
            <div className="vcard-value mono">{info?.installed || '未安装'}</div>
          </div>
          <div className="vcard">
            <div className="vcard-label">最新版本(npm)</div>
            <div className="vcard-value mono">
              {info?.latest || (info?.latestError ? '获取失败' : '—')}
            </div>
          </div>
        </div>

        <div className="version-status">
          {state === 'current' ? <span className="pill pill-on">已是最新</span> : null}
          {state === 'outdated' ? <span className="pill pill-warn">可更新到 {info.latest}</span> : null}
          {state === 'missing' ? <span className="pill pill-off">未安装</span> : null}
          {info?.latestError ? (
            <span className="muted">获取最新版本失败:已尝试 npmjs 官方源、npmmirror 镜像与 npm CLI。请检查网络,或在 ~/.npmrc 配置可用 registry 后点「重新检测」</span>
          ) : (state === 'outdated' || state === 'missing') ? (
            <span className="muted">安装 / 更新完成后需重启 dsh 生效</span>
          ) : null}
        </div>

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={() => void load()} disabled={busy}>重新检测</button>
          {info?.installed ? (
            <>
              <button type="button" className="btn primary" onClick={installOrUpdate} disabled={busy || info.upToDate}>
                更新到最新
              </button>
              <button type="button" className="btn danger" onClick={uninstall} disabled={busy}>卸载 dsh</button>
            </>
          ) : (
            <button type="button" className="btn primary" onClick={installOrUpdate} disabled={busy}>安装 dsh</button>
          )}
        </div>

        {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
        {notice ? <div className="banner banner-ok" role="status">{notice}</div> : null}

        <OpLog open={logOpen} onToggle={() => setLogOpen(v => !v)} />
      </section>
    </>
  )
}

function PluginPanel({ dshVersion }) {
  const [installed, setInstalled] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [logOpen, setLogOpen] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inst, cat] = await Promise.all([
        window.api.listInstalledPlugins(),
        window.api.fetchPluginCatalog(),
      ])
      setInstalled(inst)
      setCatalog(cat)
      setError('')
    } catch (e) {
      setError(String(e?.message ?? e))
    }
    setLoading(false)
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

  const installOrUpdate = (p) => run(
    () => window.api.installPlugin(p.spec),
    `已安装插件 ${p.name}${p.version ? ` v${p.version}` : ''}(重启 dsh 生效)`,
  )

  const remove = (name) => {
    if (!confirm(`确定卸载插件「${name}」?(重启 dsh 生效)`)) return
    void run(() => window.api.uninstallPlugin(name), `已卸载插件 ${name}(重启 dsh 生效)`)
  }

  const restart = () => run(() => window.api.restartDsh(), '已重启 dsh')

  const installedMap = useMemo(() => new Map(installed.map(p => [p.name, p])), [installed])

  return (
    <>
      <section className="card">
        <h2>已安装插件 <span className="hint">profile: web</span></h2>
        {installed.length === 0 ? (
          <p className="empty">暂无插件(目录 ~/.dsh/profiles/web/)</p>
        ) : (
          <div className="plugin-list">
            {installed.map(p => (
              <div key={p.name} className="plugin-row">
                <div className="plugin-meta">
                  <div className="plugin-name mono">{p.name}</div>
                  <div className="plugin-spec mono">{p.spec}</div>
                </div>
                <div className="actions">
                  <button type="button" className="btn danger" onClick={() => remove(p.name)} disabled={busy}>卸载</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="panel-head">
          <h2>插件仓库 <span className="hint">hub.ifunx.com/skyle1995/dsh-plugins</span></h2>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => void load()} disabled={busy}>刷新目录</button>
            <button type="button" className="btn primary" onClick={restart} disabled={busy}>重启 dsh</button>
          </div>
        </div>

        {error ? <div className="banner banner-error" role="alert">{error}</div> : null}
        {notice ? <div className="banner banner-ok" role="status">{notice}</div> : null}

        {loading ? (
          <p className="empty">加载中…</p>
        ) : catalog.length === 0 ? (
          <p className="empty">仓库为空或无法访问</p>
        ) : (
          <div className="plugin-list">
            {catalog.map(p => {
              const isInstalled = installedMap.has(p.name)
              const compatible = !p.dshRequired || !dshVersion || p.dshRequired === dshVersion
              return (
                <div key={p.name} className="plugin-row">
                  <div className="plugin-meta">
                    <div className="plugin-name">
                      {p.name} <span className="plugin-ver mono">v{p.version}</span>
                      {isInstalled ? <span className="badge badge-installed">已安装</span> : null}
                      {!compatible ? <span className="badge badge-warn">要求 dsh {p.dshRequired},与当前 {dshVersion || '—'} 不兼容</span> : null}
                    </div>
                    <div className="plugin-desc">{p.description || '无描述'}</div>
                  </div>
                  <div className="actions">
                    {isInstalled ? (
                      <>
                        <button type="button" className="btn" onClick={() => installOrUpdate(p)} disabled={busy}>更新</button>
                        <button type="button" className="btn danger" onClick={() => remove(p.name)} disabled={busy}>卸载</button>
                      </>
                    ) : (
                      <button type="button" className="btn primary" onClick={() => installOrUpdate(p)} disabled={busy}>安装</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <OpLog open={logOpen} onToggle={() => setLogOpen(v => !v)} />
      </section>
    </>
  )
}

export default function App() {
  const [tab, setTab] = useState('status')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [events, setEvents] = useState([])
  const [now, setNow] = useState(() => Date.now())
  const prevRunning = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const st = await window.api.getDshStatus()
      setStatus(st)
      setError('')
    } catch (e) {
      setError(String(e?.message ?? e))
    }
  }, [])

  // 每 2 秒轮询 + 窗口聚焦时立即刷新
  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  // 运行时长每秒跳动
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const pushEvent = useCallback((text) => {
    setEvents(prev => [{ time: Date.now(), text }, ...prev].slice(0, MAX_EVENTS))
  }, [])

  // 状态变化时记录事件
  useEffect(() => {
    if (!status) return
    if (prevRunning.current === null) {
      prevRunning.current = status.running
      return
    }
    if (prevRunning.current !== status.running) {
      prevRunning.current = status.running
      pushEvent(status.running
        ? (status.managedByUs ? 'dsh 已启动(本应用)' : '检测到 dsh 已运行(外部进程)')
        : 'dsh 已停止')
    }
  }, [status, pushEvent])

  const act = useCallback(async (fn, label) => {
    setBusy(true)
    try {
      await fn()
      if (label) pushEvent(label)
    } catch (e) {
      setError(String(e?.message ?? e))
    }
    setBusy(false)
    await refresh()
  }, [pushEvent, refresh])

  const running = !!status?.running

  const uptimeMs = useMemo(() => {
    if (!running || status.startedAtMs == null) return null
    return Math.max(0, now - status.startedAtMs)
  }, [running, status, now])

  const toggleDsh = () => act(
    running ? () => window.api.stopDsh() : () => window.api.startDsh(),
    null,
  )
  const restartDsh = () => act(() => window.api.restartDsh(), '已重启 dsh')
  const openUi = () => act(() => window.api.openSessionUi(), '已打开 Web 界面')
  const manualRefresh = () => void refresh()

  if (!status) {
    return (
      <main className="app">
        <header className="hero">
          <div className="brand">
            <span className="brand-mark" />
            <div>
              <h1>DSH Controller</h1>
              <p className="subtitle">DeepSeek Harness 服务状态管理</p>
            </div>
          </div>
        </header>
        <section className="card"><p className="empty">正在获取服务状态…</p></section>
      </main>
    )
  }

  const webLabel = !running
    ? '—'
    : !status.web
      ? '检测中…'
      : (status.web.ok ? (status.web.ms < 1 ? '<1 ms' : `${status.web.ms} ms`) : '无响应')

  const webTone = running && status.web && !status.web.ok ? 'warn' : (running && status.web?.ok ? 'good' : null)

  return (
    <main className="app">
      <header className="hero">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <h1>DSH Controller</h1>
            <p className="subtitle">DeepSeek Harness 服务状态管理</p>
          </div>
        </div>
        <span className={`pill ${running ? 'pill-on' : 'pill-off'}`}>
          {running ? '服务运行中' : '服务已停止'}
        </span>
      </header>

      <nav className="tabs" role="tablist" aria-label="功能导航">
        <button type="button" role="tab" aria-selected={tab === 'status'} className={`tab ${tab === 'status' ? 'active' : ''}`} onClick={() => setTab('status')}>服务状态</button>
        <button type="button" role="tab" aria-selected={tab === 'version'} className={`tab ${tab === 'version' ? 'active' : ''}`} onClick={() => setTab('version')}>版本管理</button>
        <button type="button" role="tab" aria-selected={tab === 'plugins'} className={`tab ${tab === 'plugins' ? 'active' : ''}`} onClick={() => setTab('plugins')}>插件中心</button>
      </nav>

      {tab === 'status' ? (
        <>
          <section className="card status-card">
            <div className="status-main">
              <div className="status-indicator">
                <span className={`status-dot ${running ? 'on' : 'off'}`} aria-hidden="true" />
                <div className="status-copy">
                  <div className="status-title">{running ? '运行中' : '已停止'}</div>
                  <div className="status-sub" title={running ? status.url : undefined}>
                    {running ? status.url : '服务未启动,点击「启动 dsh」开始'}
                  </div>
                </div>
              </div>
              <div className="btn-row">
                <button type="button" className="btn" onClick={manualRefresh} disabled={busy}>刷新</button>
                <button type="button" className="btn" onClick={openUi} disabled={busy || !running}>打开界面</button>
                <button type="button" className="btn" onClick={restartDsh} disabled={busy || !running}>重启</button>
                <button
                  type="button"
                  className={`btn ${running ? 'danger' : 'primary'}`}
                  onClick={toggleDsh}
                  disabled={busy}
                >
                  {busy ? '处理中…' : running ? '停止 dsh' : '启动 dsh'}
                </button>
              </div>
            </div>

            {error ? <div className="banner banner-error" role="alert">{error}</div> : null}

            <div className="status-foot">
              <span className="foot-item">端口 <b className="mono">{status.port}</b></span>
              <span className="foot-item">PID <b className="mono">{status.pid ?? '—'}</b></span>
              <span className={`foot-tag ${!running ? 'tag-off' : status.managedByUs ? 'tag-self' : 'tag-ext'}`}>
                {!running ? '未运行' : status.managedByUs ? '本应用启动' : '外部进程'}
              </span>
              <span className="foot-item foot-right">⟳ 每 2 秒自动刷新</span>
            </div>
          </section>

          <section aria-label="服务指标">
            <div className="grid">
              <StatTile label="运行时长" value={formatUptime(uptimeMs)} />
              <StatTile label="进程 PID" value={status.pid ?? '—'} mono />
              <StatTile label="CPU 占用" value={fmtCpu(status.cpu)} mono />
              <StatTile label="内存占用" value={fmtMem(status.rssMB)} mono />
              <StatTile label="Web UI 延迟" value={webLabel} mono tone={webTone} />
            </div>
            {running && status.procBlocked ? (
              <p className="note-warn">⚠ 当前环境禁止读取进程详情,CPU / 内存等指标暂不可用</p>
            ) : null}
          </section>

          <section className="card">
            <h2>服务详情</h2>
            <dl className="kv">
              <div>
                <dt>dsh 版本</dt>
                <dd className="mono">{status.version || '—'}</dd>
              </div>
              <div>
                <dt>访问地址</dt>
                <dd className="mono">{status.url}</dd>
              </div>
              <div>
                <dt>监听端口</dt>
                <dd className="mono">{status.port}</dd>
              </div>
              <div>
                <dt>进程名称</dt>
                <dd className="mono">{status.procName || '—'}</dd>
              </div>
              <div>
                <dt>运行平台</dt>
                <dd>{platformLabel(status.platform)}</dd>
              </div>
              <div>
                <dt>Web UI 状态码</dt>
                <dd className="mono">{running && status.web?.code != null ? status.web.code : '—'}</dd>
              </div>
              <div>
                <dt>启动时间</dt>
                <dd className="mono">{status.startedAtMs ? new Date(status.startedAtMs).toLocaleString() : '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="card">
            <h2>事件记录 <span className="hint">本次会话</span></h2>
            {events.length === 0 ? (
              <p className="empty">暂无事件</p>
            ) : (
              <ul className="events">
                {events.map((e, i) => (
                  <li key={`${e.time}-${i}`}>
                    <span className="event-time mono">{clock(e.time)}</span>
                    <span className="event-text">{e.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {tab === 'version' ? <VersionPanel /> : null}
      {tab === 'plugins' ? <PluginPanel dshVersion={status.version} /> : null}

      <footer className="foot">
        关闭窗口后应用驻留菜单栏托盘 · 「停止 dsh」会结束占用 3080 端口的进程
      </footer>
    </main>
  )
}
