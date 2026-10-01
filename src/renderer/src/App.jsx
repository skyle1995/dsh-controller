import { useCallback, useEffect, useMemo, useState } from 'react'

export default function App() {
  const [tab, setTab] = useState('sessions')
  const [sessions, setSessions] = useState([])
  const [dsh, setDsh] = useState({ running: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(() => new Set())

  const [skills, setSkills] = useState([])
  const [skillForm, setSkillForm] = useState({ name: '', description: '', body: '' })
  const [editingSkill, setEditingSkill] = useState(null)
  const [showSkillForm, setShowSkillForm] = useState(false)

  const [prompt, setPrompt] = useState('')
  const [detail, setDetail] = useState(null) // { sid, title, loading, data }

  const refresh = useCallback(async () => {
    try {
      const [list, status] = await Promise.all([
        window.api.listSessions(),
        window.api.getDshStatus(),
      ])
      setSessions(list)
      setDsh(status)
      setError('')
    } catch (e) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSkills = useCallback(async () => {
    try { setSkills(await window.api.listSkills()) } catch (e) { setError(String(e?.message ?? e)) }
  }, [])

  const loadPrompt = useCallback(async () => {
    try { setPrompt((await window.api.getPrompt()).persona) } catch (e) { setError(String(e?.message ?? e)) }
  }, [])

  const openDetail = useCallback(async (s) => {
    setDetail({ sid: s.id, title: s.title, loading: true, data: null })
    try {
      const data = await window.api.getSessionDetail(s.id)
      setDetail({ sid: s.id, title: s.title, loading: false, data })
    } catch (e) {
      setDetail({ sid: s.id, title: s.title, loading: false, data: { ok: false, error: String(e?.message ?? e) } })
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { void loadSkills() }, [loadSkills])
  useEffect(() => { void loadPrompt() }, [loadPrompt])

  // 提示 4 秒后自动消失
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const act = async (fn) => {
    setBusy(true)
    try { await fn() } catch (e) { setError(String(e?.message ?? e)) }
    setBusy(false)
    await refresh()
  }

  const mutate = async (fn) => {
    setBusy(true)
    setNotice('')
    try {
      await fn()
      const status = await window.api.getDshStatus()
      if (status.running) {
        await window.api.restartDsh()
        setNotice('变更已保存,dsh 已重启。网页端未自动刷新就点「打开界面」。')
      } else {
        setNotice('变更已保存。')
      }
    } catch (e) { setError(String(e?.message ?? e)) }
    setBusy(false)
    await refresh()
  }

  const toggleDsh = () => act(async () => {
    if (dsh.running) await window.api.stopDsh()
    else await window.api.startDsh()
  })

  const groups = useMemo(() => {
    const map = new Map()
    for (const s of sessions) {
      const key = s.workspacePath || ''
      if (!map.has(key)) map.set(key, { title: s.workspaceTitle || '未分组', path: s.workspacePath || '', items: [] })
      map.get(key).items.push(s)
    }
    return [...map.values()].sort((a, b) => (!a.path ? 1 : !b.path ? -1 : a.title.localeCompare(b.title, 'zh')))
  }, [sessions])

  const archivedCount = sessions.filter(s => s.archived).length

  const toggleGroup = (key) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // skills
  const startNewSkill = () => { setSkillForm({ name: '', description: '', body: '' }); setEditingSkill(null); setShowSkillForm(true) }
  const editSkill = (sk) => {
    setSkillForm({ name: sk.name, description: sk.description, body: sk.body.replace(/^---[\s\S]*?\n---\n\n?/, '') })
    setEditingSkill(sk.name)
    setShowSkillForm(true)
  }
  const cancelSkillForm = () => { setShowSkillForm(false); setSkillForm({ name: '', description: '', body: '' }); setEditingSkill(null) }
  const saveSkill = async () => {
    const name = skillForm.name.trim()
    if (!name) { setError('Skill 名称不能为空'); return }
    setBusy(true)
    try {
      const r = await window.api.saveSkill(name, skillForm.description, skillForm.body)
      if (editingSkill && editingSkill !== r.name) await window.api.deleteSkill(editingSkill)
      setEditingSkill(null)
      setSkillForm({ name: '', description: '', body: '' })
      setShowSkillForm(false)
      await loadSkills()
      setNotice('Skill 已保存。')
    } catch (e) { setError(String(e?.message ?? e)) }
    setBusy(false)
  }
  const removeSkill = async (name) => {
    if (!confirm(`删除 skill「${name}」？`)) return
    setBusy(true)
    try { await window.api.deleteSkill(name); await loadSkills(); setNotice('Skill 已删除。') }
    catch (e) { setError(String(e?.message ?? e)) }
    setBusy(false)
  }
  const importSkill = async () => {
    setBusy(true)
    try {
      const r = await window.api.importSkill()
      if (!r.canceled) { await loadSkills(); setNotice(`已导入 Skill「${r.name}」。`) }
    } catch (e) { setError(String(e?.message ?? e)) }
    setBusy(false)
  }

  // prompt
  const savePrompt = async () => {
    setBusy(true)
    try { await window.api.setPrompt(prompt); setNotice('提示词已保存(dsh 会自动热加载)。') }
    catch (e) { setError(String(e?.message ?? e)) }
    setBusy(false)
  }

  return (
    <div className="app">
      <h1>DSH Controller</h1>
      <p className="subtitle">DeepSeek Harness 桌面控制器 · 会话 / Skills / 提示词</p>

      <div className="toolbar">
        <span className={`status-dot ${dsh.running ? 'on' : 'off'}`} />
        <span className="status-text">{dsh.running ? 'dsh 运行中' : 'dsh 已停止'}</span>
        <span className="muted">端口 {dsh.port ?? 3080}</span>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => void refresh()} disabled={busy}>刷新</button>
        <button className="btn primary" onClick={() => act(() => window.api.openSessionUi())} disabled={busy || !dsh.running}>打开界面</button>
        <button className="btn" onClick={() => act(() => window.api.restartDsh())} disabled={busy || !dsh.running}>重启 dsh</button>
        <button className={`btn ${dsh.running ? 'danger' : 'primary'}`} onClick={() => void toggleDsh()} disabled={busy}>
          {dsh.running ? '停止 dsh' : '启动 dsh'}
        </button>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>会话</button>
        <button className={`tab ${tab === 'skills' ? 'active' : ''}`} onClick={() => setTab('skills')}>Skills</button>
        <button className={`tab ${tab === 'prompt' ? 'active' : ''}`} onClick={() => setTab('prompt')}>提示词</button>
      </div>

      {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
      {notice ? <p style={{ color: '#16a34a', margin: '8px 0' }}>{notice}</p> : null}

      {tab === 'sessions' ? (
        loading
          ? <p className="empty">加载中…</p>
          : groups.length === 0
            ? <p className="empty">暂无会话</p>
            : groups.map(g => {
                const key = g.path || '__ungrouped__'
                const isCollapsed = collapsed.has(key)
                return (
                  <section key={key} style={{ marginBottom: 20 }}>
                    <h2 className="group-header" style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleGroup(key)}>
                      <span style={{ width: 14, display: 'inline-block' }}>{isCollapsed ? '▸' : '▾'}</span>
                      <span>📁 {g.title}</span>
                      <span className="muted">({g.items.length})</span>
                      {g.path ? <span className="muted" style={{ fontWeight: 400 }}>{g.path}</span> : null}
                    </h2>
                    {isCollapsed ? null : <SessionList items={g.items} mutate={mutate} onDetail={openDetail} />}
                  </section>
                )
              })
      ) : null}

      {tab === 'skills' ? <SkillsView
        skills={skills}
        form={skillForm}
        editing={editingSkill}
        busy={busy}
        setForm={setSkillForm}
        onNew={startNewSkill}
        onEdit={editSkill}
        onSave={saveSkill}
        onDelete={removeSkill}
        onImport={importSkill}
        showForm={showSkillForm}
        onCancel={cancelSkillForm}
      /> : null}

      {tab === 'prompt' ? <PromptView prompt={prompt} setPrompt={setPrompt} onSave={savePrompt} busy={busy} /> : null}

      {detail ? <DetailModal detail={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  )
}

function SessionList({ items, mutate, onDetail }) {
  return (
    <div className="session-list">
      {items.map(s => (
        <div key={s.id} className="session-row">
          <div className="session-meta">
            <div className="session-title">
              {s.title}
              {s.archived ? <span className="badge" style={{ marginLeft: 8 }}>已归档</span> : null}
            </div>
            <div className="session-id">{s.id}</div>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => onDetail(s)}>详情</button>
            {s.archived
              ? <button className="btn" onClick={() => mutate(() => window.api.unarchiveSession(s.id))}>还原</button>
              : <button className="btn" onClick={() => mutate(() => window.api.archiveSession(s.id))}>归档</button>}
            <button className="btn danger" onClick={() => {
              if (confirm(`确定删除会话「${s.title}」？此操作不可恢复。`)) mutate(() => window.api.deleteSession(s.id))
            }}>删除</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function SkillsView({ skills, form, editing, busy, showForm, setForm, onNew, onEdit, onSave, onDelete, onImport, onCancel }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>Skills({skills.length})</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          {!showForm ? <button className="btn" onClick={onNew}>新建 Skill</button> : null}
          <button className="btn primary" onClick={onImport} disabled={busy}>导入 Skill</button>
        </div>
      </div>

      {showForm ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong>{editing ? '编辑 Skill' : '新建 Skill'}</strong>
            <button className="btn" onClick={onCancel}>取消</button>
          </div>
          <input className="input" placeholder="名称(如 my-skill)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="描述" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <textarea className="textarea" rows={6} placeholder="Skill 正文(给模型的指令)" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
          <button className="btn primary" onClick={onSave} disabled={busy}>{editing ? '更新' : '保存'}</button>
        </div>
      ) : null}

      <div className="session-list">
        {skills.length === 0 ? <p className="empty">暂无 Skill(目录 ~/.dsh/skills/)</p> : null}
        {skills.map(sk => (
          <div key={sk.name} className="session-row">
            <div className="session-meta">
              <div className="session-title">{sk.name}</div>
              {sk.description ? <div className="session-ws">{sk.description}</div> : null}
            </div>
            <div className="actions">
              <button className="btn" onClick={() => onEdit(sk)}>编辑</button>
              <button className="btn danger" onClick={() => onDelete(sk.name)}>删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PromptView({ prompt, setPrompt, onSave, busy }) {
  return (
    <div className="panel">
      <p className="muted" style={{ marginTop: 0 }}>系统提示词(persona)。保存后 dsh 会热加载,无需重启。留空则用默认。</p>
      <textarea className="textarea" rows={14} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="You are a coding agent..." />
      <button className="btn primary" onClick={onSave} disabled={busy}>保存提示词</button>
    </div>
  )
}

function DetailModal({ detail, onClose }) {
  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={e => e.stopPropagation()}>
        <div className="detail-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="detail-title">{detail.title || '会话详情'}</div>
            <div className="muted">{detail.sid}</div>
          </div>
          <button className="btn" onClick={onClose}>关闭</button>
        </div>
        <div className="detail-body">
          {detail.loading ? <p className="empty">加载中…</p> : null}
          {!detail.loading && detail.data && !detail.data.ok ? <p className="empty">{detail.data.error}</p> : null}
          {!detail.loading && detail.data && detail.data.ok ? (
            detail.data.messages.length === 0
              ? <p className="empty">暂无对话内容(空会话)</p>
              : (
                <>
                  {detail.data.truncated ? <p className="muted" style={{ margin: '0 0 10px' }}>仅显示最近 {detail.data.messages.length} 条 / 共 {detail.data.total} 条</p> : null}
                  {detail.data.messages.map((m, i) => <Msg key={i} m={m} />)}
                </>
              )
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Msg({ m }) {
  if (m.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="msg-role">你</div>
        <div className="msg-text">{m.text}</div>
      </div>
    )
  }
  if (m.role === 'assistant') {
    return (
      <div className="msg msg-assistant">
        <div className="msg-role">AI</div>
        {m.reasoning ? (
          <details className="msg-reasoning">
            <summary>思考过程</summary>
            <div className="msg-text dim">{m.reasoning}</div>
          </details>
        ) : null}
        {m.tools && m.tools.length ? <div className="msg-tools">工具:{m.tools.join(', ')}</div> : null}
        {m.text ? <div className="msg-text">{m.text}</div> : null}
      </div>
    )
  }
  return (
    <details className="msg msg-tool">
      <summary>工具结果</summary>
      <div className="msg-text mono">{m.text}</div>
    </details>
  )
}
