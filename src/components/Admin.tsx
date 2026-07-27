import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'

// ── types ─────────────────────────────────────────────────────────────────────

interface AdminNode {
  id: string
  external_id: string
  node_type: string
  name: string
  name_en: string | null
  parent_external_id: string | null
  description: string | null
  source_id: string
}

interface AdminEdge {
  id: string
  src_node_id: string
  dst_node_id: string
  edge_type: string
  role: string | null
  result_type: string | null
  attempt_pct: number | null
  success_rate: number | null
  is_submission: boolean
  label: string | null
}

// ── constants ─────────────────────────────────────────────────────────────────

const NODE_TYPES = ['position', 'transition', 'submission', 'principle', 'system']
const EDGE_TYPES = ['transition', 'submission_from', 'counter', 'related', 'part_of_system', 'role_of']
const RESULT_TYPES = ['success', 'failure', 'counter']

const TYPE_PT: Record<string, string> = {
  position: 'Posição', transition: 'Transição', submission: 'Finalização',
  principle: 'Princípio', system: 'Sistema',
}
const EDGE_PT: Record<string, string> = {
  transition: 'Transição', submission_from: 'Finalização de', counter: 'Counter',
  related: 'Relacionado', part_of_system: 'Sistema', role_of: 'Papel',
}
const RESULT_PT: Record<string, string> = {
  success: 'Sucesso', failure: 'Falha', counter: 'Counter',
}

// ── types ─────────────────────────────────────────────────────────────────────

type LogKind = 'create' | 'edit' | 'delete'

interface LogEntry {
  id: number
  kind: LogKind
  msg: string
  at: Date
}

// ── helpers ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return <span className={`type-badge ${type}`}>{TYPE_PT[type] ?? type}</span>
}

let _logSeq = 0
function mkLog(kind: LogKind, msg: string): LogEntry {
  return { id: ++_logSeq, kind, msg, at: new Date() }
}

function fmt(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── main component ────────────────────────────────────────────────────────────

export default function Admin() {
  const lang = useLang()
  const dn = (n: AdminNode) => lang === 'en' ? (n.name_en ?? n.name) : n.name

  // change log
  const [log, setLog] = useState<LogEntry[]>([])
  const addLog = (kind: LogKind, msg: string) => setLog(prev => [mkLog(kind, msg), ...prev])

  // source id
  const [sourceId, setSourceId] = useState<string | null>(null)

  // node list
  const [nodes, setNodes]       = useState<AdminNode[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [typeFilter, setFilter] = useState<string | null>(null)

  // selected node
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(() => nodes.find(n => n.id === selectedId) ?? null, [nodes, selectedId])

  // name lookup for edge display
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const n of nodes) m[n.id] = dn(n)
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, lang])

  // edges
  const [outEdges, setOutEdges] = useState<AdminEdge[]>([])
  const [inEdges,  setInEdges]  = useState<AdminEdge[]>([])
  const [edgesLoading, setEdgesLoading] = useState(false)

  // edit mode
  const [editMode, setEditMode]   = useState(false)
  const [eName,    setEName]      = useState('')
  const [eDesc,    setEDesc]      = useState('')
  const [eType,    setEType]      = useState('position')
  const [eParent,  setEParent]    = useState('')
  const [saving,   setSaving]     = useState(false)

  // new node
  const [showNew,  setShowNew]  = useState(false)
  const [nName,    setNName]    = useState('')
  const [nExtId,   setNExtId]   = useState('')
  const [nNameEn,  setNNameEn]  = useState('')
  const [nType,    setNType]    = useState('position')
  const [nDesc,    setNDesc]    = useState('')
  const [nParent,  setNParent]  = useState('')
  const [creating, setCreating] = useState(false)

  // new outgoing edge
  const [showEdge,     setShowEdge]     = useState(false)
  const [eDstSearch,   setEDstSearch]   = useState('')
  const [eDstId,       setEDstId]       = useState('')
  const [eDstName,     setEDstName]     = useState('')
  const [eEdgeType,    setEEdgeType]    = useState('transition')
  const [eResult,      setEResult]      = useState('success')
  const [eIsSub,       setEIsSub]       = useState(false)
  const [ePct,         setEPct]         = useState('')
  const [addingEdge,   setAddingEdge]   = useState(false)

  // new incoming edge
  const [showInEdge,   setShowInEdge]   = useState(false)
  const [iSrcSearch,   setISrcSearch]   = useState('')
  const [iSrcId,       setISrcId]       = useState('')
  const [iSrcName,     setISrcName]     = useState('')
  const [iEdgeType,    setIEdgeType]    = useState('transition')
  const [iResult,      setIResult]      = useState('success')
  const [iIsSub,       setIIsSub]       = useState(false)
  const [iPct,         setIPct]         = useState('')
  const [addingInEdge, setAddingInEdge] = useState(false)

  // confirm delete
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  // ── load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: src } = await supabase.from('sources').select('id').eq('key', 'bjjgraph').single()
      const sid = (src as { id: string })?.id
      setSourceId(sid)
      if (!sid) { setLoading(false); return }

      let from = 0
      const all: AdminNode[] = []
      while (true) {
        const { data } = await supabase
          .from('source_nodes')
          .select('id, external_id, node_type, name, name_en:raw->>name, parent_external_id, description, source_id')
          .eq('source_id', sid)
          .order('name')
          .range(from, from + 999)
        if (!data || data.length === 0) break
        all.push(...(data as AdminNode[]))
        if (data.length < 1000) break
        from += 1000
      }
      setNodes(all)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedId) { setOutEdges([]); setInEdges([]); return }
    setEdgesLoading(true)
    Promise.all([
      supabase.from('source_edges')
        .select('id, src_node_id, dst_node_id, edge_type, role, result_type, attempt_pct, success_rate, is_submission, label')
        .eq('src_node_id', selectedId),
      supabase.from('source_edges')
        .select('id, src_node_id, dst_node_id, edge_type, role, result_type, attempt_pct, success_rate, is_submission, label')
        .eq('dst_node_id', selectedId),
    ]).then(([o, i]) => {
      setOutEdges((o.data ?? []) as AdminEdge[])
      setInEdges((i.data ?? []) as AdminEdge[])
      setEdgesLoading(false)
    })
  }, [selectedId])

  // ── filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const lq = search.toLowerCase()
    return nodes.filter(n => {
      if (typeFilter && n.node_type !== typeFilter) return false
      if (!lq) return true
      return dn(n).toLowerCase().includes(lq) || n.external_id.toLowerCase().includes(lq)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, search, typeFilter, lang])

  // ── edge dst search ───────────────────────────────────────────────────────

  const dstResults = useMemo(() => {
    if (eDstSearch.length < 2) return []
    const lq = eDstSearch.toLowerCase()
    return nodes.filter(n =>
      dn(n).toLowerCase().includes(lq) || n.external_id.toLowerCase().includes(lq)
    ).slice(0, 8)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eDstSearch, nodes, lang])

  const srcResults = useMemo(() => {
    if (iSrcSearch.length < 2) return []
    const lq = iSrcSearch.toLowerCase()
    return nodes.filter(n =>
      dn(n).toLowerCase().includes(lq) || n.external_id.toLowerCase().includes(lq)
    ).slice(0, 8)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iSrcSearch, nodes, lang])

  // ── actions ───────────────────────────────────────────────────────────────

  function openNode(n: AdminNode) {
    setSelectedId(n.id)
    setEditMode(false)
    setShowEdge(false)
    setShowInEdge(false)
    setConfirmDel(null)
    setEName(n.name)
    setEDesc(n.description ?? '')
    setEType(n.node_type)
    setEParent(n.parent_external_id ?? '')
  }

  async function saveEdit() {
    if (!selectedId || !eName.trim()) return
    const prev = nodes.find(n => n.id === selectedId)
    setSaving(true)
    await supabase.from('source_nodes').update({
      name: eName.trim(),
      description: eDesc.trim() || null,
      node_type: eType,
      parent_external_id: eParent.trim() || null,
    }).eq('id', selectedId)
    setNodes(p => p.map(n => n.id !== selectedId ? n : {
      ...n, name: eName.trim(), description: eDesc.trim() || null,
      node_type: eType, parent_external_id: eParent.trim() || null,
    }))
    addLog('edit', `Editou "${prev?.name ?? eName.trim()}" → nome: "${eName.trim()}", tipo: ${TYPE_PT[eType] ?? eType}`)
    setEditMode(false)
    setSaving(false)
  }

  async function deleteNode() {
    if (!selectedId) return
    const target = nodes.find(n => n.id === selectedId)
    await supabase.from('source_nodes').delete().eq('id', selectedId)
    setNodes(p => p.filter(n => n.id !== selectedId))
    addLog('delete', `Excluiu nó "${target?.name ?? selectedId}" (${TYPE_PT[target?.node_type ?? ''] ?? target?.node_type})`)
    setSelectedId(null)
    setConfirmDel(null)
  }

  async function doDeleteEdge(edgeId: string, dir: 'out' | 'in') {
    const edges = dir === 'out' ? outEdges : inEdges
    const edge = edges.find(e => e.id === edgeId)
    await supabase.from('source_edges').delete().eq('id', edgeId)
    if (dir === 'out') setOutEdges(p => p.filter(e => e.id !== edgeId))
    else               setInEdges(p => p.filter(e => e.id !== edgeId))
    if (edge) {
      const srcName = nameMap[edge.src_node_id] ?? edge.src_node_id.slice(0, 8)
      const dstName = nameMap[edge.dst_node_id] ?? edge.dst_node_id.slice(0, 8)
      addLog('delete', `Removeu aresta ${EDGE_PT[edge.edge_type] ?? edge.edge_type}: "${srcName}" → "${dstName}"`)
    }
  }

  async function doAddEdge() {
    if (!selectedId || !eDstId) return
    setAddingEdge(true)
    const { data } = await supabase.from('source_edges').insert({
      src_node_id: selectedId,
      dst_node_id: eDstId,
      edge_type: eEdgeType,
      result_type: eResult || null,
      is_submission: eIsSub,
      attempt_pct: ePct ? parseFloat(ePct) : null,
    }).select('id, src_node_id, dst_node_id, edge_type, role, result_type, attempt_pct, success_rate, is_submission, label').single()
    if (data) {
      setOutEdges(p => [...p, data as AdminEdge])
      const srcName = nameMap[selectedId] ?? selectedId.slice(0, 8)
      addLog('create', `Adicionou saída ${EDGE_PT[eEdgeType] ?? eEdgeType}: "${srcName}" → "${eDstName}"`)
    }
    setShowEdge(false)
    setEDstId(''); setEDstSearch(''); setEDstName(''); setEPct(''); setEIsSub(false)
    setAddingEdge(false)
  }

  async function doAddInEdge() {
    if (!selectedId || !iSrcId) return
    setAddingInEdge(true)
    const { data } = await supabase.from('source_edges').insert({
      src_node_id: iSrcId,
      dst_node_id: selectedId,
      edge_type: iEdgeType,
      result_type: iResult || null,
      is_submission: iIsSub,
      attempt_pct: iPct ? parseFloat(iPct) : null,
    }).select('id, src_node_id, dst_node_id, edge_type, role, result_type, attempt_pct, success_rate, is_submission, label').single()
    if (data) {
      setInEdges(p => [...p, data as AdminEdge])
      const dstName = nameMap[selectedId] ?? selectedId.slice(0, 8)
      addLog('create', `Adicionou entrada ${EDGE_PT[iEdgeType] ?? iEdgeType}: "${iSrcName}" → "${dstName}"`)
    }
    setShowInEdge(false)
    setISrcId(''); setISrcSearch(''); setISrcName(''); setIPct(''); setIIsSub(false)
    setAddingInEdge(false)
  }

  async function doAddNode() {
    if (!nName.trim() || !nExtId.trim() || !sourceId) return
    setCreating(true)
    const raw = nNameEn.trim() ? { name: nNameEn.trim() } : null
    const { data } = await supabase.from('source_nodes').insert({
      source_id: sourceId,
      name: nName.trim(),
      external_id: nExtId.trim(),
      node_type: nType,
      description: nDesc.trim() || null,
      parent_external_id: nParent.trim() || null,
      ...(raw ? { raw } : {}),
    }).select('id, external_id, node_type, name, name_en:raw->>name, parent_external_id, description, source_id').single()
    if (data) {
      setNodes(p => [...p, data as AdminNode].sort((a, b) => a.name.localeCompare(b.name, 'pt')))
      openNode(data as AdminNode)
      addLog('create', `Criou nó "${nName.trim()}" (${TYPE_PT[nType] ?? nType}, ext_id: ${nExtId.trim()})`)
    }
    setShowNew(false)
    setNName(''); setNExtId(''); setNNameEn(''); setNType('position'); setNDesc(''); setNParent('')
    setCreating(false)
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="admin-layout">

      {/* ── Left: node list ─────────────────────────────────── */}
      <div className="admin-list">

        {/* Controls */}
        <div className="admin-list-head">
          <input
            className="search-input"
            placeholder="Buscar nó..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="admin-add-btn" onClick={() => { setShowNew(s => !s); setSelectedId(null) }}>
            {showNew ? '✕' : '+ Novo'}
          </button>
        </div>

        {/* Type filter */}
        <div className="admin-type-filter">
          {[null, 'position', 'transition', 'submission'].map(tp => (
            <button
              key={tp ?? 'all'}
              className={`admin-filter-btn${typeFilter === tp ? ' active' : ''}`}
              onClick={() => setFilter(tp)}
            >
              {tp ? TYPE_PT[tp] : 'Todos'}
            </button>
          ))}
        </div>

        {/* New node form */}
        {showNew && (
          <div className="admin-new-form">
            <div className="admin-field-row">
              <label>Nome (PT)</label>
              <input className="admin-input" value={nName} onChange={e => setNName(e.target.value)} placeholder="Ex: Montada por Cima" />
            </div>
            <div className="admin-field-row">
              <label>Nome (EN)</label>
              <input className="admin-input" value={nNameEn} onChange={e => setNNameEn(e.target.value)} placeholder="Ex: Mount Top" />
            </div>
            <div className="admin-field-row">
              <label>External ID</label>
              <input className="admin-input" value={nExtId} onChange={e => setNExtId(e.target.value)} placeholder="Ex: mount/top" />
            </div>
            <div className="admin-field-row">
              <label>Tipo</label>
              <select className="admin-input" value={nType} onChange={e => setNType(e.target.value)}>
                {NODE_TYPES.map(t => <option key={t} value={t}>{TYPE_PT[t] ?? t}</option>)}
              </select>
            </div>
            <div className="admin-field-row">
              <label>Parent ext_id</label>
              <input className="admin-input" value={nParent} onChange={e => setNParent(e.target.value)} placeholder="Ex: mount" />
            </div>
            <div className="admin-field-row">
              <label>Descrição</label>
              <textarea className="admin-input admin-textarea" value={nDesc} onChange={e => setNDesc(e.target.value)} rows={2} />
            </div>
            <button className="admin-save-btn" onClick={doAddNode} disabled={creating || !nName.trim() || !nExtId.trim()}>
              {creating ? 'Criando…' : 'Criar nó'}
            </button>
          </div>
        )}

        {/* Node list */}
        {loading ? (
          <div className="admin-empty">Carregando…</div>
        ) : (
          <div className="admin-node-list">
            <div className="admin-list-count">{filtered.length} nós</div>
            {filtered.map(n => (
              <div
                key={n.id}
                className={`admin-node-row${selectedId === n.id ? ' active' : ''}`}
                onClick={() => openNode(n)}
              >
                <span className={`type-dot ${n.node_type}`} />
                <div className="admin-node-names">
                  <span className="admin-node-name">{n.name}</span>
                  {n.name_en && <span className="admin-node-name-en">{n.name_en}</span>}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="admin-empty">Nenhum nó encontrado.</div>}
          </div>
        )}
      </div>

      {/* ── Right: node detail ──────────────────────────────── */}
      <div className="admin-detail">
        {!selected ? (
          <div className="admin-empty" style={{ marginTop: 60 }}>
            Selecione um nó na lista.
          </div>
        ) : (
          <>
            {/* Node header */}
            <div className="admin-detail-head">
              <div className="admin-detail-title">
                <TypeBadge type={selected.node_type} />
                <span className="admin-detail-name">{selected.name}</span>
                {selected.name_en && <span className="admin-node-name-en">{selected.name_en}</span>}
              </div>
              <div className="admin-detail-actions">
                <button className="btn-reset" onClick={() => { setEditMode(e => !e); setConfirmDel(null) }}>
                  {editMode ? 'Cancelar' : '✎ Editar'}
                </button>
                {confirmDel === selected.id ? (
                  <>
                    <span style={{ color: '#ef4444', fontSize: 11 }}>Confirmar exclusão?</span>
                    <button className="admin-del-btn" onClick={deleteNode}>Sim</button>
                    <button className="btn-reset" onClick={() => setConfirmDel(null)}>Não</button>
                  </>
                ) : (
                  <button className="admin-del-btn" onClick={() => setConfirmDel(selected.id)}>Excluir</button>
                )}
              </div>
            </div>

            <div className="admin-ext-id">{selected.external_id}</div>
            {selected.parent_external_id && (
              <div className="admin-ext-id">
                Pai: <strong>{selected.parent_external_id}</strong>
              </div>
            )}

            {/* Edit form */}
            {editMode && (
              <div className="admin-edit-form">
                <div className="admin-field-row">
                  <label>Nome (PT)</label>
                  <input className="admin-input" value={eName} onChange={e => setEName(e.target.value)} />
                </div>
                <div className="admin-field-row">
                  <label>Tipo</label>
                  <select className="admin-input" value={eType} onChange={e => setEType(e.target.value)}>
                    {NODE_TYPES.map(t => <option key={t} value={t}>{TYPE_PT[t] ?? t}</option>)}
                  </select>
                </div>
                <div className="admin-field-row">
                  <label>Parent ext_id</label>
                  <input className="admin-input" value={eParent} onChange={e => setEParent(e.target.value)} />
                </div>
                <div className="admin-field-row">
                  <label>Descrição</label>
                  <textarea className="admin-input admin-textarea" value={eDesc} onChange={e => setEDesc(e.target.value)} rows={3} />
                </div>
                <button className="admin-save-btn" onClick={saveEdit} disabled={saving || !eName.trim()}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            )}

            {/* Connections */}
            <div className="admin-connections">

              {/* Outgoing */}
              <div className="admin-conn-section">
                <div className="admin-conn-header">
                  <span>Saídas ({outEdges.length})</span>
                  <button className="btn-reset" style={{ fontSize: 11 }} onClick={() => setShowEdge(s => !s)}>
                    {showEdge ? '✕ Fechar' : '+ Adicionar'}
                  </button>
                </div>

                {/* Add edge form */}
                {showEdge && (
                  <div className="admin-edge-form">
                    <div className="admin-field-row">
                      <label>Destino</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="admin-input"
                          placeholder="Buscar nó destino..."
                          value={eDstName || eDstSearch}
                          onChange={e => { setEDstSearch(e.target.value); setEDstId(''); setEDstName('') }}
                        />
                        {dstResults.length > 0 && !eDstId && (
                          <ul className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100 }}>
                            {dstResults.map(r => (
                              <li key={r.id} onMouseDown={() => { setEDstId(r.id); setEDstName(dn(r)); setEDstSearch('') }}>
                                <span className={`type-dot ${r.node_type}`} />
                                {dn(r)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="admin-field-inline">
                      <div className="admin-field-row">
                        <label>Tipo aresta</label>
                        <select className="admin-input" value={eEdgeType} onChange={e => setEEdgeType(e.target.value)}>
                          {EDGE_TYPES.map(t => <option key={t} value={t}>{EDGE_PT[t] ?? t}</option>)}
                        </select>
                      </div>
                      <div className="admin-field-row">
                        <label>Resultado</label>
                        <select className="admin-input" value={eResult} onChange={e => setEResult(e.target.value)}>
                          <option value="">—</option>
                          {RESULT_TYPES.map(t => <option key={t} value={t}>{RESULT_PT[t]}</option>)}
                        </select>
                      </div>
                      <div className="admin-field-row">
                        <label>% tentativa</label>
                        <input className="admin-input" style={{ width: 60 }} value={ePct} onChange={e => setEPct(e.target.value)} placeholder="0–100" />
                      </div>
                    </div>
                    <label className="admin-check-label">
                      <input type="checkbox" checked={eIsSub} onChange={e => setEIsSub(e.target.checked)} />
                      É finalização
                    </label>
                    <button
                      className="admin-save-btn"
                      onClick={doAddEdge}
                      disabled={addingEdge || !eDstId}
                    >
                      {addingEdge ? 'Adicionando…' : 'Adicionar conexão'}
                    </button>
                  </div>
                )}

                {edgesLoading ? (
                  <div className="admin-empty">Carregando…</div>
                ) : outEdges.length === 0 ? (
                  <div className="admin-empty">Sem saídas.</div>
                ) : (
                  <table className="admin-edge-table">
                    <thead>
                      <tr>
                        <th>Destino</th>
                        <th>Tipo</th>
                        <th>Resultado</th>
                        <th>Sub</th>
                        <th>%</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {outEdges.map(e => (
                        <tr key={e.id}>
                          <td>
                            <span className={`type-dot ${nodes.find(n => n.id === e.dst_node_id)?.node_type ?? ''}`} />
                            {nameMap[e.dst_node_id] ?? <em style={{ color: 'var(--muted)' }}>{e.dst_node_id.slice(0, 8)}</em>}
                          </td>
                          <td>{EDGE_PT[e.edge_type] ?? e.edge_type}</td>
                          <td>{e.result_type ? (RESULT_PT[e.result_type] ?? e.result_type) : '—'}</td>
                          <td>{e.is_submission ? '✓' : ''}</td>
                          <td>{e.attempt_pct != null ? `${e.attempt_pct}%` : '—'}</td>
                          <td>
                            <button className="admin-del-edge-btn" onClick={() => doDeleteEdge(e.id, 'out')} title="Remover">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Incoming */}
              <div className="admin-conn-section">
                <div className="admin-conn-header">
                  <span>Entradas ({inEdges.length})</span>
                  <button className="btn-reset" style={{ fontSize: 11 }} onClick={() => setShowInEdge(s => !s)}>
                    {showInEdge ? '✕ Fechar' : '+ Adicionar'}
                  </button>
                </div>

                {/* Add incoming edge form */}
                {showInEdge && (
                  <div className="admin-edge-form">
                    <div className="admin-field-row">
                      <label>Origem</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="admin-input"
                          placeholder="Buscar nó origem..."
                          value={iSrcName || iSrcSearch}
                          onChange={e => { setISrcSearch(e.target.value); setISrcId(''); setISrcName('') }}
                        />
                        {srcResults.length > 0 && !iSrcId && (
                          <ul className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100 }}>
                            {srcResults.map(r => (
                              <li key={r.id} onMouseDown={() => { setISrcId(r.id); setISrcName(dn(r)); setISrcSearch('') }}>
                                <span className={`type-dot ${r.node_type}`} />
                                {dn(r)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="admin-field-inline">
                      <div className="admin-field-row">
                        <label>Tipo aresta</label>
                        <select className="admin-input" value={iEdgeType} onChange={e => setIEdgeType(e.target.value)}>
                          {EDGE_TYPES.map(t => <option key={t} value={t}>{EDGE_PT[t] ?? t}</option>)}
                        </select>
                      </div>
                      <div className="admin-field-row">
                        <label>Resultado</label>
                        <select className="admin-input" value={iResult} onChange={e => setIResult(e.target.value)}>
                          <option value="">—</option>
                          {RESULT_TYPES.map(t => <option key={t} value={t}>{RESULT_PT[t]}</option>)}
                        </select>
                      </div>
                      <div className="admin-field-row">
                        <label>% tentativa</label>
                        <input className="admin-input" style={{ width: 60 }} value={iPct} onChange={e => setIPct(e.target.value)} placeholder="0–100" />
                      </div>
                    </div>
                    <label className="admin-check-label">
                      <input type="checkbox" checked={iIsSub} onChange={e => setIIsSub(e.target.checked)} />
                      É finalização
                    </label>
                    <button
                      className="admin-save-btn"
                      onClick={doAddInEdge}
                      disabled={addingInEdge || !iSrcId}
                    >
                      {addingInEdge ? 'Adicionando…' : 'Adicionar conexão'}
                    </button>
                  </div>
                )}

                {edgesLoading ? (
                  <div className="admin-empty">Carregando…</div>
                ) : inEdges.length === 0 ? (
                  <div className="admin-empty">Sem entradas.</div>
                ) : (
                  <table className="admin-edge-table">
                    <thead>
                      <tr>
                        <th>Origem</th>
                        <th>Tipo</th>
                        <th>Resultado</th>
                        <th>Sub</th>
                        <th>%</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {inEdges.map(e => (
                        <tr key={e.id}>
                          <td>
                            <span className={`type-dot ${nodes.find(n => n.id === e.src_node_id)?.node_type ?? ''}`} />
                            {nameMap[e.src_node_id] ?? <em style={{ color: 'var(--muted)' }}>{e.src_node_id.slice(0, 8)}</em>}
                          </td>
                          <td>{EDGE_PT[e.edge_type] ?? e.edge_type}</td>
                          <td>{e.result_type ? (RESULT_PT[e.result_type] ?? e.result_type) : '—'}</td>
                          <td>{e.is_submission ? '✓' : ''}</td>
                          <td>{e.attempt_pct != null ? `${e.attempt_pct}%` : '—'}</td>
                          <td>
                            <button className="admin-del-edge-btn" onClick={() => doDeleteEdge(e.id, 'in')} title="Remover">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

            </div>
          </>
        )}

        {/* ── Change log ────────────────────────────────────── */}
        {log.length > 0 && (
          <div className="admin-log">
            <div className="admin-log-header">
              <span>Log de alterações ({log.length})</span>
              <button className="admin-del-edge-btn" onClick={() => setLog([])}>Limpar</button>
            </div>
            <ul className="admin-log-list">
              {log.map(e => (
                <li key={e.id} className={`admin-log-entry ${e.kind}`}>
                  <span className="admin-log-icon">
                    {e.kind === 'create' ? '✚' : e.kind === 'edit' ? '✎' : '✕'}
                  </span>
                  <span className="admin-log-msg">{e.msg}</span>
                  <span className="admin-log-time">{fmt(e.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
