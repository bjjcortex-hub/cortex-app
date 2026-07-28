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

type LogKind = 'create' | 'edit' | 'delete'
interface LogEntry { id: number; kind: LogKind; msg: string; at: Date }
let _logSeq = 0
const mkLog = (kind: LogKind, msg: string): LogEntry => ({ id: ++_logSeq, kind, msg, at: new Date() })
const fmt = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// ── sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return <span className={`type-badge ${type}`}>{TYPE_PT[type] ?? type}</span>
}

// ── Edge table ────────────────────────────────────────────────────────────────

function EdgeTable({ edges, nodes, dir, onDelete }: {
  edges: AdminEdge[]
  nodes: AdminNode[]
  dir: 'out' | 'in'
  onDelete: (id: string) => void
}) {
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const n of nodes) m[n.id] = n.name
    return m
  }, [nodes])

  if (edges.length === 0) return <div className="admin-empty">Sem {dir === 'out' ? 'saídas' : 'entradas'}.</div>
  return (
    <table className="admin-edge-table">
      <thead>
        <tr>
          <th>{dir === 'out' ? 'Destino' : 'Origem'}</th>
          <th>Tipo</th>
          <th>Resultado</th>
          <th>Sub</th>
          <th>%</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {edges.map(e => {
          const peerId = dir === 'out' ? e.dst_node_id : e.src_node_id
          const peerNode = nodes.find(n => n.id === peerId)
          return (
            <tr key={e.id}>
              <td>
                <span className={`type-dot ${peerNode?.node_type ?? ''}`} />
                {nameMap[peerId] ?? <em style={{ color: 'var(--muted)' }}>{peerId.slice(0, 8)}</em>}
              </td>
              <td>{EDGE_PT[e.edge_type] ?? e.edge_type}</td>
              <td>{e.result_type ? (RESULT_PT[e.result_type] ?? e.result_type) : '—'}</td>
              <td>{e.is_submission ? '✓' : ''}</td>
              <td>{e.attempt_pct != null ? `${e.attempt_pct}%` : '—'}</td>
              <td>
                <button className="admin-del-edge-btn" onClick={() => onDelete(e.id)} title="Remover">✕</button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Add-edge form ─────────────────────────────────────────────────────────────

function AddEdgeForm({ nodes, onSubmit, onClose, dir }: {
  nodes: AdminNode[]
  dir: 'out' | 'in'
  onSubmit: (peerId: string, edgeType: string, result: string, isSub: boolean, pct: string) => Promise<void>
  onClose: () => void
}) {
  const [peerSearch, setPeerSearch] = useState('')
  const [peerId, setPeerId]         = useState('')
  const [peerName, setPeerName]     = useState('')
  const [edgeType, setEdgeType]     = useState('transition')
  const [result,   setResult]       = useState('success')
  const [isSub,    setIsSub]        = useState(false)
  const [pct,      setPct]          = useState('')
  const [saving,   setSaving]       = useState(false)

  const results = useMemo(() => {
    if (peerSearch.length < 2) return []
    const lq = peerSearch.toLowerCase()
    return nodes.filter(n => n.name.toLowerCase().includes(lq) || n.external_id.toLowerCase().includes(lq)).slice(0, 8)
  }, [peerSearch, nodes])

  async function submit() {
    if (!peerId) return
    setSaving(true)
    await onSubmit(peerId, edgeType, result, isSub, pct)
    setSaving(false)
    onClose()
  }

  return (
    <div className="admin-edge-form">
      <div className="admin-field-row">
        <label>{dir === 'out' ? 'Destino' : 'Origem'}</label>
        <div style={{ position: 'relative' }}>
          <input
            className="admin-input"
            placeholder="Buscar nó..."
            value={peerName || peerSearch}
            onChange={e => { setPeerSearch(e.target.value); setPeerId(''); setPeerName('') }}
          />
          {results.length > 0 && !peerId && (
            <ul className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100 }}>
              {results.map(r => (
                <li key={r.id} onMouseDown={() => { setPeerId(r.id); setPeerName(r.name); setPeerSearch('') }}>
                  <span className={`type-dot ${r.node_type}`} />{r.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="admin-field-inline">
        <div className="admin-field-row">
          <label>Tipo</label>
          <select className="admin-input" value={edgeType} onChange={e => setEdgeType(e.target.value)}>
            {EDGE_TYPES.map(t => <option key={t} value={t}>{EDGE_PT[t] ?? t}</option>)}
          </select>
        </div>
        <div className="admin-field-row">
          <label>Resultado</label>
          <select className="admin-input" value={result} onChange={e => setResult(e.target.value)}>
            <option value="">—</option>
            {RESULT_TYPES.map(t => <option key={t} value={t}>{RESULT_PT[t]}</option>)}
          </select>
        </div>
        <div className="admin-field-row">
          <label>% tentativa</label>
          <input className="admin-input" style={{ width: 60 }} value={pct} onChange={e => setPct(e.target.value)} placeholder="0–100" />
        </div>
      </div>
      <label className="admin-check-label">
        <input type="checkbox" checked={isSub} onChange={e => setIsSub(e.target.checked)} />
        É finalização
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="admin-save-btn" onClick={submit} disabled={saving || !peerId}>
          {saving ? 'Adicionando…' : 'Adicionar'}
        </button>
        <button className="btn-reset" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ── Child variant section (within a position parent) ──────────────────────────

function ChildSection({ child, nodes, addLog, onNameSaved }: {
  child: AdminNode
  nodes: AdminNode[]
  addLog: (kind: LogKind, msg: string) => void
  onNameSaved: (id: string, name: string, nameEn: string | null) => void
}) {
  const [outEdges, setOut]     = useState<AdminEdge[]>([])
  const [inEdges,  setIn]      = useState<AdminEdge[]>([])
  const [edgesLoading, setEL]  = useState(true)
  const [editName, setEditName] = useState(false)
  const [nameDraft, setNameDraft] = useState(child.name)
  const [nameEnDraft, setNameEnDraft] = useState(child.name_en ?? '')
  const [savingName, setSavingName] = useState(false)
  const [showAddOut, setShowAddOut] = useState(false)
  const [showAddIn,  setShowAddIn]  = useState(false)

  useEffect(() => {
    setEL(true)
    Promise.all([
      supabase.from('source_edges').select('id,src_node_id,dst_node_id,edge_type,role,result_type,attempt_pct,success_rate,is_submission,label').eq('src_node_id', child.id),
      supabase.from('source_edges').select('id,src_node_id,dst_node_id,edge_type,role,result_type,attempt_pct,success_rate,is_submission,label').eq('dst_node_id', child.id),
    ]).then(([o, i]) => {
      setOut((o.data ?? []) as AdminEdge[])
      setIn((i.data ?? []) as AdminEdge[])
      setEL(false)
    })
  }, [child.id])

  async function saveName() {
    setSavingName(true)
    const raw = nameEnDraft.trim() ? { name: nameEnDraft.trim() } : null
    await supabase.from('source_nodes').update({
      name: nameDraft.trim(),
      ...(raw !== null ? { raw } : {}),
    }).eq('id', child.id)
    addLog('edit', `Editou variante "${child.name}" → "${nameDraft.trim()}"`)
    onNameSaved(child.id, nameDraft.trim(), nameEnDraft.trim() || null)
    setEditName(false)
    setSavingName(false)
  }

  async function deleteEdge(edgeId: string, dir: 'out' | 'in') {
    await supabase.from('source_edges').delete().eq('id', edgeId)
    if (dir === 'out') setOut(p => p.filter(e => e.id !== edgeId))
    else               setIn(p => p.filter(e => e.id !== edgeId))
    addLog('delete', `Removeu aresta de "${child.name}"`)
  }

  async function addEdge(peerId: string, edgeType: string, result: string, isSub: boolean, pct: string, dir: 'out' | 'in') {
    const row = dir === 'out'
      ? { src_node_id: child.id, dst_node_id: peerId, edge_type: edgeType, result_type: result || null, is_submission: isSub, attempt_pct: pct ? parseFloat(pct) : null }
      : { src_node_id: peerId, dst_node_id: child.id, edge_type: edgeType, result_type: result || null, is_submission: isSub, attempt_pct: pct ? parseFloat(pct) : null }
    const { data } = await supabase.from('source_edges').insert(row)
      .select('id,src_node_id,dst_node_id,edge_type,role,result_type,attempt_pct,success_rate,is_submission,label').single()
    if (data) {
      if (dir === 'out') setOut(p => [...p, data as AdminEdge])
      else               setIn(p => [...p, data as AdminEdge])
      addLog('create', `Adicionou ${dir === 'out' ? 'saída' : 'entrada'} em "${child.name}"`)
    }
  }

  // Para posições: usa a parte após "/" (ex: /top, /bottom)
  // Para submissions: remove o prefixo do pai se houver (ex: americana-from-mount → from-mount)
  const suffix = (() => {
    if (child.external_id.includes('/')) return child.external_id.split('/').pop() ?? ''
    const parentPrefix = child.parent_external_id ? child.parent_external_id + '-' : ''
    if (parentPrefix && child.external_id.startsWith(parentPrefix)) {
      return child.external_id.slice(parentPrefix.length)
    }
    return child.external_id
  })()

  return (
    <div className="admin-child-section">
      <div className="admin-child-header">
        <span className="admin-child-tag">/{suffix}</span>
        {editName ? (
          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
            <input className="admin-input" style={{ flex: 1 }} value={nameDraft} onChange={e => setNameDraft(e.target.value)} placeholder="Nome PT" autoFocus />
            <input className="admin-input" style={{ width: 140 }} value={nameEnDraft} onChange={e => setNameEnDraft(e.target.value)} placeholder="Nome EN" />
            <button className="admin-save-btn" onClick={saveName} disabled={savingName || !nameDraft.trim()}>
              {savingName ? '…' : 'OK'}
            </button>
            <button className="btn-reset" onClick={() => { setEditName(false); setNameDraft(child.name); setNameEnDraft(child.name_en ?? '') }}>✕</button>
          </div>
        ) : (
          <>
            <span className="admin-child-name">{child.name}</span>
            {child.name_en && <span className="admin-node-name-en">{child.name_en}</span>}
            <button className="btn-reset" style={{ fontSize: 11, marginLeft: 8 }} onClick={() => setEditName(true)}>✎ renomear</button>
          </>
        )}
      </div>

      {edgesLoading ? <div className="admin-empty">Carregando conexões…</div> : (
        <div className="admin-child-edges">
          <div className="admin-conn-section" style={{ marginTop: 6 }}>
            <div className="admin-conn-header">
              <span>Saídas ({outEdges.length})</span>
              <button className="btn-reset" style={{ fontSize: 11 }} onClick={() => { setShowAddOut(s => !s); setShowAddIn(false) }}>
                {showAddOut ? '✕' : '+ adicionar'}
              </button>
            </div>
            {showAddOut && (
              <AddEdgeForm nodes={nodes} dir="out" onClose={() => setShowAddOut(false)}
                onSubmit={(peerId, et, res, sub, pct) => addEdge(peerId, et, res, sub, pct, 'out')} />
            )}
            <EdgeTable edges={outEdges} nodes={nodes} dir="out" onDelete={id => deleteEdge(id, 'out')} />
          </div>

          <div className="admin-conn-section" style={{ marginTop: 6 }}>
            <div className="admin-conn-header">
              <span>Entradas ({inEdges.length})</span>
              <button className="btn-reset" style={{ fontSize: 11 }} onClick={() => { setShowAddIn(s => !s); setShowAddOut(false) }}>
                {showAddIn ? '✕' : '+ adicionar'}
              </button>
            </div>
            {showAddIn && (
              <AddEdgeForm nodes={nodes} dir="in" onClose={() => setShowAddIn(false)}
                onSubmit={(peerId, et, res, sub, pct) => addEdge(peerId, et, res, sub, pct, 'in')} />
            )}
            <EdgeTable edges={inEdges} nodes={nodes} dir="in" onDelete={id => deleteEdge(id, 'in')} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function Admin() {
  const lang = useLang()
  const dn = (n: AdminNode) => lang === 'en' ? (n.name_en ?? n.name) : n.name

  const [log,     setLog]     = useState<LogEntry[]>([])
  const addLog = (kind: LogKind, msg: string) => setLog(prev => [mkLog(kind, msg), ...prev])

  const [sourceId, setSourceId] = useState<string | null>(null)
  const [nodes,    setNodes]    = useState<AdminNode[]>([])
  const [loading,  setLoading]  = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [typeFilter, setFilter] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(() => nodes.find(n => n.id === selectedId) ?? null, [nodes, selectedId])

  // Children of selected position or submission group parent
  const children = useMemo(() => {
    if (!selected) return []
    if (selected.parent_external_id !== null) return []  // É filho, não pai
    if (selected.node_type !== 'position' && selected.node_type !== 'submission') return []
    return nodes.filter(n => n.parent_external_id === selected.external_id)
  }, [selected, nodes])

  // Edit parent node
  const [editMode, setEditMode] = useState(false)
  const [eName,    setEName]    = useState('')
  const [eNameEn,  setENameEn]  = useState('')
  const [eDesc,    setEDesc]    = useState('')
  const [saving,   setSaving]   = useState(false)

  // Edges for non-position nodes
  const [outEdges,      setOutEdges]      = useState<AdminEdge[]>([])
  const [inEdges,       setInEdges]       = useState<AdminEdge[]>([])
  const [edgesLoading,  setEdgesLoading]  = useState(false)
  const [showAddOut,    setShowAddOut]    = useState(false)
  const [showAddIn,     setShowAddIn]     = useState(false)

  // Delete
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  // Create — common fields
  const [showNew,  setShowNew]  = useState(false)
  const [nName,    setNName]    = useState('')
  const [nExtId,   setNExtId]   = useState('')
  const [nNameEn,  setNNameEn]  = useState('')
  const [nType,    setNType]    = useState('position')
  const [nDesc,    setNDesc]    = useState('')
  const [nParent,  setNParent]  = useState('')
  // Create — position children suffix (includes "por")
  const [nSufTopPT, setNSufTopPT] = useState('por Cima')
  const [nSufTopEN, setNSufTopEN] = useState('Top')
  const [nSufBotPT, setNSufBotPT] = useState('por Baixo')
  const [nSufBotEN, setNSufBotEN] = useState('Bottom')
  const [creating, setCreating] = useState(false)

  // ── load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const { data: srcRows, error: srcErr } = await supabase.from('sources').select('id').eq('key', 'bjjgraph')
        if (srcErr) throw new Error(`sources: ${srcErr.message}`)
        const sid = (srcRows as { id: string }[])?.[0]?.id
        setSourceId(sid)
        if (!sid) { setLoading(false); return }
        let from = 0; const all: AdminNode[] = []
        while (true) {
          const { data, error: nodesErr } = await supabase
            .from('source_nodes')
            .select('id, external_id, node_type, name, name_en:raw->>name, parent_external_id, description, source_id')
            .eq('source_id', sid).order('name').range(from, from + 999)
          if (nodesErr) throw new Error(`source_nodes: ${nodesErr.message}`)
          if (!data || data.length === 0) break
          all.push(...(data as AdminNode[]))
          if (data.length < 1000) break
          from += 1000
        }
        setNodes(all)
      } catch (e) {
        setLoadError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Load edges for non-group-parent nodes
  useEffect(() => {
    if (!selectedId) { setOutEdges([]); setInEdges([]); return }
    // Position parents e submission parents com filhos usam ChildSection para edges
    if (!selected?.parent_external_id && children.length > 0 &&
        (selected?.node_type === 'position' || selected?.node_type === 'submission')) return
    setEdgesLoading(true)
    Promise.all([
      supabase.from('source_edges').select('id,src_node_id,dst_node_id,edge_type,role,result_type,attempt_pct,success_rate,is_submission,label').eq('src_node_id', selectedId),
      supabase.from('source_edges').select('id,src_node_id,dst_node_id,edge_type,role,result_type,attempt_pct,success_rate,is_submission,label').eq('dst_node_id', selectedId),
    ]).then(([o, i]) => { setOutEdges((o.data ?? []) as AdminEdge[]); setInEdges((i.data ?? []) as AdminEdge[]); setEdgesLoading(false) })
  }, [selectedId, selected, children])

  // ── filtered list ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const lq = search.toLowerCase()
    return nodes.filter(n => {
      if (typeFilter === 'position') {
        // Só mostrar posições PAI (sem parent_external_id); filhos acessíveis via pai
        if (n.node_type !== 'position') return false
        if (n.parent_external_id !== null) return false
      } else if (typeFilter === 'submission') {
        // Só mostrar submissions de topo (pai ou standalone); filhos acessíveis via pai
        if (n.node_type !== 'submission') return false
        if (n.parent_external_id !== null) return false
      } else if (typeFilter) {
        if (n.node_type !== typeFilter) return false
      }
      if (!lq) return true
      return dn(n).toLowerCase().includes(lq) || n.external_id.toLowerCase().includes(lq)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, search, typeFilter, lang])

  // ── actions ──────────────────────────────────────────────────────────────────

  function openNode(n: AdminNode) {
    setSelectedId(n.id); setEditMode(false); setConfirmDel(null)
    setShowAddOut(false); setShowAddIn(false)
    setEName(n.name); setENameEn(n.name_en ?? ''); setEDesc(n.description ?? '')
  }

  async function saveEdit() {
    if (!selectedId || !eName.trim()) return
    const prev = nodes.find(n => n.id === selectedId)
    setSaving(true)
    const raw = eNameEn.trim() ? { name: eNameEn.trim() } : null
    await supabase.from('source_nodes').update({
      name: eName.trim(),
      description: eDesc.trim() || null,
      ...(raw !== null ? { raw } : {}),
    }).eq('id', selectedId)
    setNodes(p => p.map(n => n.id !== selectedId ? n : {
      ...n, name: eName.trim(), name_en: eNameEn.trim() || null, description: eDesc.trim() || null,
    }))
    addLog('edit', `Editou "${prev?.name ?? ''}" → "${eName.trim()}"`)
    setEditMode(false); setSaving(false)
  }

  async function deleteNode() {
    if (!selectedId) return
    const target = nodes.find(n => n.id === selectedId)
    // Se for grupo pai (position ou submission com filhos), deletar filhos primeiro
    if (!target?.parent_external_id && (target?.node_type === 'position' || target?.node_type === 'submission')) {
      const kids = nodes.filter(n => n.parent_external_id === target.external_id)
      for (const k of kids) await supabase.from('source_nodes').delete().eq('id', k.id)
      setNodes(p => p.filter(n => n.parent_external_id !== target.external_id))
    }
    await supabase.from('source_nodes').delete().eq('id', selectedId)
    setNodes(p => p.filter(n => n.id !== selectedId))
    addLog('delete', `Excluiu "${target?.name ?? selectedId}"`)
    setSelectedId(null); setConfirmDel(null)
  }

  async function deleteEdge(edgeId: string, dir: 'out' | 'in') {
    await supabase.from('source_edges').delete().eq('id', edgeId)
    if (dir === 'out') setOutEdges(p => p.filter(e => e.id !== edgeId))
    else               setInEdges(p => p.filter(e => e.id !== edgeId))
    addLog('delete', 'Removeu aresta')
  }

  async function addEdge(peerId: string, edgeType: string, result: string, isSub: boolean, pct: string, dir: 'out' | 'in') {
    if (!selectedId) return
    const row = dir === 'out'
      ? { src_node_id: selectedId, dst_node_id: peerId, edge_type: edgeType, result_type: result || null, is_submission: isSub, attempt_pct: pct ? parseFloat(pct) : null }
      : { src_node_id: peerId, dst_node_id: selectedId, edge_type: edgeType, result_type: result || null, is_submission: isSub, attempt_pct: pct ? parseFloat(pct) : null }
    const { data } = await supabase.from('source_edges').insert(row)
      .select('id,src_node_id,dst_node_id,edge_type,role,result_type,attempt_pct,success_rate,is_submission,label').single()
    if (data) {
      if (dir === 'out') setOutEdges(p => [...p, data as AdminEdge])
      else               setInEdges(p => [...p, data as AdminEdge])
      addLog('create', `Adicionou ${dir === 'out' ? 'saída' : 'entrada'}`)
    }
  }

  async function doAddNode() {
    if (!nName.trim() || !nExtId.trim() || !sourceId) return
    setCreating(true)

    const isPosition = nType === 'position'

    // Criar nó pai (ou nó simples para outros tipos)
    const rawParent = nNameEn.trim() ? { name: nNameEn.trim() } : null
    const { data: parentData } = await supabase.from('source_nodes').insert({
      source_id: sourceId,
      name: nName.trim(),
      external_id: nExtId.trim(),
      node_type: nType,
      description: nDesc.trim() || null,
      parent_external_id: isPosition ? null : (nParent.trim() || null),
      ...(rawParent ? { raw: rawParent } : {}),
    }).select('id, external_id, node_type, name, name_en:raw->>name, parent_external_id, description, source_id').single()

    if (!parentData) { setCreating(false); return }
    const parent = parentData as AdminNode

    let newNodes = [parent]

    if (isPosition) {
      // Criar os 2 filhos automaticamente
      const topNamePT = `${nName.trim()} ${nSufTopPT.trim()}`
      const topNameEN = nNameEn.trim() ? `${nNameEn.trim()} ${nSufTopEN.trim()}` : null
      const botNamePT = `${nName.trim()} ${nSufBotPT.trim()}`
      const botNameEN = nNameEn.trim() ? `${nNameEn.trim()} ${nSufBotEN.trim()}` : null

      const insertChildren = [
        {
          source_id: sourceId,
          name: topNamePT,
          external_id: `${nExtId.trim()}/top`,
          node_type: 'position',
          parent_external_id: nExtId.trim(),
          ...(topNameEN ? { raw: { name: topNameEN } } : {}),
        },
        {
          source_id: sourceId,
          name: botNamePT,
          external_id: `${nExtId.trim()}/bottom`,
          node_type: 'position',
          parent_external_id: nExtId.trim(),
          ...(botNameEN ? { raw: { name: botNameEN } } : {}),
        },
      ]
      const { data: childrenData } = await supabase.from('source_nodes')
        .insert(insertChildren)
        .select('id, external_id, node_type, name, name_en:raw->>name, parent_external_id, description, source_id')
      if (childrenData) newNodes = [...newNodes, ...(childrenData as AdminNode[])]
      addLog('create', `Criou posição "${nName.trim()}" com filhos /top e /bottom`)
    } else {
      addLog('create', `Criou nó "${nName.trim()}" (${TYPE_PT[nType] ?? nType})`)
    }

    setNodes(p => [...p, ...newNodes].sort((a, b) => a.name.localeCompare(b.name, 'pt')))
    openNode(parent)
    setShowNew(false)
    setNName(''); setNExtId(''); setNNameEn(''); setNType('position'); setNDesc(''); setNParent('')
    setNSufTopPT('por Cima'); setNSufTopEN('Top')
    setNSufBotPT('por Baixo'); setNSufBotEN('Bottom')
    setCreating(false)
  }

  // ── render ───────────────────────────────────────────────────────────────────

  // É grupo pai se não tem parent_external_id e é position/submission com filhos carregados
  const isGroupParent = !selected?.parent_external_id && children.length > 0 &&
    (selected?.node_type === 'position' || selected?.node_type === 'submission')

  return (
    <div className="admin-layout">

      {/* ── Left: node list ─────────────────────────────────── */}
      <div className="admin-list">

        <div className="admin-list-head">
          <input className="search-input" placeholder="Buscar nó..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="admin-add-btn" onClick={() => { setShowNew(s => !s); setSelectedId(null) }}>
            {showNew ? '✕' : '+ Novo'}
          </button>
        </div>

        <div className="admin-type-filter">
          {[null, 'position', 'transition', 'submission'].map(tp => (
            <button key={tp ?? 'all'} className={`admin-filter-btn${typeFilter === tp ? ' active' : ''}`} onClick={() => setFilter(tp)}>
              {tp ? TYPE_PT[tp] : 'Todos'}
            </button>
          ))}
        </div>

        {/* New node form */}
        {showNew && (
          <div className="admin-new-form">
            <div className="admin-field-row">
              <label>Tipo</label>
              <select className="admin-input" value={nType} onChange={e => setNType(e.target.value)}>
                {NODE_TYPES.map(t => <option key={t} value={t}>{TYPE_PT[t] ?? t}</option>)}
              </select>
            </div>
            <div className="admin-field-row">
              <label>Nome PT</label>
              <input className="admin-input" value={nName} onChange={e => setNName(e.target.value)} placeholder={nType === 'position' ? 'Ex: Montada' : 'Nome'} />
            </div>
            <div className="admin-field-row">
              <label>Nome EN</label>
              <input className="admin-input" value={nNameEn} onChange={e => setNNameEn(e.target.value)} placeholder={nType === 'position' ? 'Ex: Mount' : 'Name EN'} />
            </div>
            <div className="admin-field-row">
              <label>External ID</label>
              <input className="admin-input" value={nExtId} onChange={e => setNExtId(e.target.value)} placeholder={nType === 'position' ? 'Ex: mount' : 'ext-id'} />
            </div>

            {nType === 'position' ? (
              /* Position: children suffix fields */
              <div className="admin-children-preview">
                <div className="admin-children-preview-title">Variantes da posição</div>
                <div className="admin-child-suffix-row">
                  <span className="admin-child-tag">/top</span>
                  <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                    <span className="admin-suffix-prefix">{nName || '[nome]'}</span>
                    <input className="admin-input admin-suffix-input" value={nSufTopPT}
                      onChange={e => setNSufTopPT(e.target.value)} placeholder="por Cima" />
                    <input className="admin-input admin-suffix-input" value={nSufTopEN}
                      onChange={e => setNSufTopEN(e.target.value)} placeholder="Top" style={{ width: 80 }} />
                  </div>
                </div>
                <div className="admin-child-suffix-row">
                  <span className="admin-child-tag">/bottom</span>
                  <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                    <span className="admin-suffix-prefix">{nName || '[nome]'}</span>
                    <input className="admin-input admin-suffix-input" value={nSufBotPT}
                      onChange={e => setNSufBotPT(e.target.value)} placeholder="por Baixo" />
                    <input className="admin-input admin-suffix-input" value={nSufBotEN}
                      onChange={e => setNSufBotEN(e.target.value)} placeholder="Bottom" style={{ width: 80 }} />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="admin-field-row">
                  <label>Parent ext_id</label>
                  <input className="admin-input" value={nParent} onChange={e => setNParent(e.target.value)} placeholder="Opcional" />
                </div>
                <div className="admin-field-row">
                  <label>Descrição</label>
                  <textarea className="admin-input admin-textarea" value={nDesc} onChange={e => setNDesc(e.target.value)} rows={2} />
                </div>
              </>
            )}

            <button className="admin-save-btn" onClick={doAddNode}
              disabled={creating || !nName.trim() || !nExtId.trim()}>
              {creating ? 'Criando…' : nType === 'position' ? 'Criar posição (+ 2 variantes)' : 'Criar nó'}
            </button>
          </div>
        )}

        {/* Node list */}
        {loadError && <div className="admin-empty" style={{ color: '#f87171', wordBreak: 'break-all' }}>{loadError}</div>}
        {loading ? <div className="admin-empty">Carregando…</div> : (
          <div className="admin-node-list">
            <div className="admin-list-count">{filtered.length} {typeFilter === 'position' ? 'posições-pai' : 'nós'}</div>
            {filtered.map(n => (
              <div key={n.id} className={`admin-node-row${selectedId === n.id ? ' active' : ''}`} onClick={() => openNode(n)}>
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
          <div className="admin-empty" style={{ marginTop: 60 }}>Selecione um nó na lista.</div>
        ) : (
          <>
            {/* Header */}
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
                    <span style={{ color: '#ef4444', fontSize: 11 }}>
                      {isGroupParent ? `Excluir também ${children.length} variantes?` : 'Confirmar exclusão?'}
                    </span>
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
              <div className="admin-ext-id">Pai: <strong>{selected.parent_external_id}</strong></div>
            )}

            {/* Edit form — nome do pai */}
            {editMode && (
              <div className="admin-edit-form">
                <div className="admin-field-row">
                  <label>Nome PT</label>
                  <input className="admin-input" value={eName} onChange={e => setEName(e.target.value)} />
                </div>
                <div className="admin-field-row">
                  <label>Nome EN</label>
                  <input className="admin-input" value={eNameEn} onChange={e => setENameEn(e.target.value)} />
                </div>
                {!isGroupParent && (
                  <div className="admin-field-row">
                    <label>Descrição</label>
                    <textarea className="admin-input admin-textarea" value={eDesc} onChange={e => setEDesc(e.target.value)} rows={3} />
                  </div>
                )}
                <button className="admin-save-btn" onClick={saveEdit} disabled={saving || !eName.trim()}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            )}

            {/* ── Grupo PAI (position ou submission): mostra variantes com seus edges ── */}
            {isGroupParent && (
              <div className="admin-children-wrap">
                <div className="admin-children-title">
                  {selected?.node_type === 'submission' ? 'Variações' : 'Variantes'} ({children.length})
                </div>
                {children
                  .sort((a, b) => {
                    // Posições: /top primeiro; submissions: por nome
                    const sa = a.external_id.endsWith('/top') ? 0 : 1
                    const sb = b.external_id.endsWith('/top') ? 0 : 1
                    return sa !== sb ? sa - sb : a.name.localeCompare(b.name, 'pt')
                  })
                  .map(child => (
                    <ChildSection
                      key={child.id}
                      child={child}
                      nodes={nodes}
                      addLog={addLog}
                      onNameSaved={(id, name, nameEn) =>
                        setNodes(p => p.map(n => n.id !== id ? n : { ...n, name, name_en: nameEn }))
                      }
                    />
                  ))
                }
              </div>
            )}

            {/* ── Outros tipos: conexões diretas ── */}
            {!isGroupParent && (
              <div className="admin-connections">
                <div className="admin-conn-section">
                  <div className="admin-conn-header">
                    <span>Saídas ({outEdges.length})</span>
                    <button className="btn-reset" style={{ fontSize: 11 }} onClick={() => { setShowAddOut(s => !s); setShowAddIn(false) }}>
                      {showAddOut ? '✕ Fechar' : '+ Adicionar'}
                    </button>
                  </div>
                  {showAddOut && (
                    <AddEdgeForm nodes={nodes} dir="out" onClose={() => setShowAddOut(false)}
                      onSubmit={(p, et, r, sub, pct) => addEdge(p, et, r, sub, pct, 'out')} />
                  )}
                  {edgesLoading ? <div className="admin-empty">Carregando…</div> :
                    <EdgeTable edges={outEdges} nodes={nodes} dir="out" onDelete={id => deleteEdge(id, 'out')} />}
                </div>

                <div className="admin-conn-section">
                  <div className="admin-conn-header">
                    <span>Entradas ({inEdges.length})</span>
                    <button className="btn-reset" style={{ fontSize: 11 }} onClick={() => { setShowAddIn(s => !s); setShowAddOut(false) }}>
                      {showAddIn ? '✕ Fechar' : '+ Adicionar'}
                    </button>
                  </div>
                  {showAddIn && (
                    <AddEdgeForm nodes={nodes} dir="in" onClose={() => setShowAddIn(false)}
                      onSubmit={(p, et, r, sub, pct) => addEdge(p, et, r, sub, pct, 'in')} />
                  )}
                  {edgesLoading ? <div className="admin-empty">Carregando…</div> :
                    <EdgeTable edges={inEdges} nodes={nodes} dir="in" onDelete={id => deleteEdge(id, 'in')} />}
                </div>
              </div>
            )}
          </>
        )}

        {/* Change log */}
        {log.length > 0 && (
          <div className="admin-log">
            <div className="admin-log-header">
              <span>Log ({log.length})</span>
              <button className="admin-del-edge-btn" onClick={() => setLog([])}>Limpar</button>
            </div>
            <ul className="admin-log-list">
              {log.map(e => (
                <li key={e.id} className={`admin-log-entry ${e.kind}`}>
                  <span className="admin-log-icon">{e.kind === 'create' ? '✚' : e.kind === 'edit' ? '✎' : '✕'}</span>
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
