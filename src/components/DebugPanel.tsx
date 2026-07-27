import { useMemo, useState } from 'react'
import { MultiDirectedGraph } from 'graphology'
import type { NodeAttrs, EdgeAttrs } from '../types'
import { tNodeType, tResultType } from '../lib/i18n'

interface Props {
  graph: MultiDirectedGraph | null
}

export default function DebugPanel({ graph }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [nodeId, setNodeId] = useState<string | null>(null)

  const results = useMemo(() => {
    if (!graph || query.length < 2) return []
    const lq = query.toLowerCase()
    const hits: Array<{ id: string; name: string; type: string }> = []
    graph.forEachNode((id, attrs) => {
      const a = attrs as NodeAttrs
      if (a.name.toLowerCase().includes(lq)) hits.push({ id, name: a.name, type: a.node_type })
      if (hits.length >= 10) return
    })
    return hits
  }, [graph, query])

  const edgeInfo = useMemo(() => {
    if (!graph || !nodeId) return null
    const nodeExists = graph.hasNode(nodeId)
    if (!nodeExists) return { error: `Nó ${nodeId} NÃO existe no grafo` }

    const attrs = graph.getNodeAttributes(nodeId) as NodeAttrs
    const name = attrs.name
    const nodeType = attrs.node_type

    const out: Array<{ name: string; nodeType: string; edgeType: string; resultType: string | null; pct: number | null }> = []
    const inn: Array<{ name: string; nodeType: string; edgeType: string; resultType: string | null; pct: number | null }> = []

    graph.forEachOutEdge(nodeId, (_, eAttrs, _s, _tgt, _sa, tgtA) => {
      const ea = eAttrs as EdgeAttrs
      const ta = tgtA as NodeAttrs
      out.push({ name: ta.name, nodeType: ta.node_type, edgeType: ea.edge_type, resultType: ea.result_type, pct: ea.attempt_pct })
    })

    graph.forEachInEdge(nodeId, (_, eAttrs, _src, _t, srcA) => {
      const ea = eAttrs as EdgeAttrs
      const sa = srcA as NodeAttrs
      inn.push({ name: sa.name, nodeType: sa.node_type, edgeType: ea.edge_type, resultType: ea.result_type, pct: ea.attempt_pct })
    })

    out.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    inn.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))

    // sample result_type distribution across ALL edges in graph
    const rtCounts: Record<string, number> = {}
    graph.forEachEdge((_, eAttrs) => {
      const key = (eAttrs as EdgeAttrs).result_type ?? 'null'
      rtCounts[key] = (rtCounts[key] ?? 0) + 1
    })

    return { name, nodeType, out, inn, rtCounts }
  }, [graph, nodeId])

  if (!graph) return null

  const totalEdges = graph.size
  const totalNodes = graph.order

  const badge = (v: string | null) => {
    const colors: Record<string, string> = {
      success: '#10b981', failure: '#ef4444', counter: '#f59e0b',
      transition: '#6366f1', submission_from: '#dc2626',
      part_of_system: '#8b5cf6', related: '#64748b',
    }
    const key = v ?? 'null'
    return (
      <span style={{
        background: colors[key] ?? '#334155',
        color: '#fff', fontSize: 10, borderRadius: 3,
        padding: '1px 5px', marginLeft: 4,
      }}>{key}</span>
    )
  }

  return (
    <div style={{
      position: 'fixed', bottom: 12, left: 12, zIndex: 9999,
      fontFamily: 'monospace', fontSize: 12,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
          borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11,
        }}
      >
        🔍 Debug ({totalNodes} nós · {totalEdges} edges)
      </button>

      {open && (
        <div style={{
          marginTop: 6, background: '#0d1117', border: '1px solid #334155',
          borderRadius: 8, padding: 12, width: 480, maxHeight: '70vh',
          overflowY: 'auto', color: '#e2e8f0',
        }}>
          <div style={{ marginBottom: 8 }}>
            <input
              placeholder="Buscar nó..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', background: '#1e293b', border: '1px solid #334155',
                color: '#e2e8f0', borderRadius: 4, padding: '4px 8px', fontSize: 12,
                boxSizing: 'border-box',
              }}
            />
            {results.length > 0 && (
              <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', background: '#1e293b', border: '1px solid #334155', borderRadius: 4 }}>
                {results.map(r => (
                  <li
                    key={r.id}
                    onClick={() => { setNodeId(r.id); setQuery(r.name); }}
                    style={{ padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #334155' }}
                  >
                    <span style={{ color: '#64748b', marginRight: 6 }}>{tNodeType(r.type)}</span>
                    {r.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {edgeInfo && 'error' in edgeInfo && (
            <div style={{ color: '#ef4444' }}>{edgeInfo.error}</div>
          )}

          {edgeInfo && !('error' in edgeInfo) && (
            <>
              <div style={{ marginBottom: 8, color: '#7dd3fc' }}>
                <strong>{edgeInfo.name}</strong>
                <span style={{ color: '#475569', marginLeft: 8 }}>{tNodeType(edgeInfo.nodeType)}</span>
              </div>

              <div style={{ marginBottom: 8, padding: 6, background: '#1e293b', borderRadius: 4, fontSize: 11 }}>
                <strong style={{ color: '#94a3b8' }}>result_type no grafo inteiro:</strong>{' '}
                {Object.entries(edgeInfo.rtCounts).map(([k, v]) => (
                  <span key={k} style={{ marginRight: 8 }}>{badge(k === 'null' ? null : k)} {tResultType(k === 'null' ? null : k)} {v}</span>
                ))}
              </div>

              <div style={{ marginBottom: 4, color: '#94a3b8' }}>
                ↗ OUT ({edgeInfo.out.length})
              </div>
              {edgeInfo.out.length === 0
                ? <div style={{ color: '#475569', paddingLeft: 8 }}>nenhuma</div>
                : edgeInfo.out.map((e, i) => (
                  <div key={i} style={{ paddingLeft: 8, marginBottom: 2 }}>
                    {badge(e.edgeType)}{badge(e.resultType)}
                    <span style={{ color: '#e2e8f0', marginLeft: 6 }}>{e.name}</span>
                    <span style={{ color: '#64748b', marginLeft: 6 }}>{e.pct != null ? `${e.pct}%` : ''}</span>
                  </div>
                ))
              }

              <div style={{ marginTop: 8, marginBottom: 4, color: '#94a3b8' }}>
                ↙ IN ({edgeInfo.inn.length})
              </div>
              {edgeInfo.inn.length === 0
                ? <div style={{ color: '#475569', paddingLeft: 8 }}>nenhuma</div>
                : edgeInfo.inn.map((e, i) => (
                  <div key={i} style={{ paddingLeft: 8, marginBottom: 2 }}>
                    {badge(e.edgeType)}{badge(e.resultType)}
                    <span style={{ color: '#e2e8f0', marginLeft: 6 }}>{e.name}</span>
                    <span style={{ color: '#64748b', marginLeft: 6 }}>{e.pct != null ? `${e.pct}%` : ''}</span>
                  </div>
                ))
              }
            </>
          )}

          {!edgeInfo && (
            <div style={{ color: '#475569' }}>Selecione um nó para ver suas edges.</div>
          )}
        </div>
      )}
    </div>
  )
}
