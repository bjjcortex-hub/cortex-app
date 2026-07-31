import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { pathfinderEngine, type PathResult } from '../core/pathfinder/pathfinderEngine'
import { canonicalConceptRepository } from '../infra/CanonicalConceptRepository'
import type { CanonicalConcept } from '../core/canonical/types'

export default function PathfinderPage() {
  const navigate = useNavigate()

  // Lista de posições para autocomplete
  const [concepts, setConcepts] = useState<CanonicalConcept[]>([])
  const [loadingConcepts, setLoadingConcepts] = useState(true)

  // Seleções
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')

  // Modo de Rota (Dijkstra Weighted vs BFS Shortest)
  const [mode, setMode] = useState<import('../core/pathfinder/pathfinderEngine').PathfinderMode>('dijkstra_weighted')

  // Estado do Cálculo
  const [calculating, setCalculating] = useState(false)
  const [pathResult, setPathResult]   = useState<PathResult | null>(null)
  const [exporting, setExporting]     = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // Carrega posições semente do banco
  useEffect(() => {
    canonicalConceptRepository.list({ limit: 1000 })
      .then(setConcepts)
      .catch(e => setError(String(e)))
      .finally(() => setLoadingConcepts(false))
  }, [])

  async function handleFindPath() {
    if (!sourceId || !targetId) {
      setError('Selecione a Posição de Origem (A) e a Posição de Destino (B).')
      return
    }

    if (sourceId === targetId) {
      setError('Origem e Destino devem ser posições diferentes.')
      return
    }

    setError(null)
    setCalculating(true)
    setPathResult(null)

    try {
      const res = await pathfinderEngine.findPath(sourceId, targetId, mode)
      if (!res) {
        setError('Nenhuma rota encontrada entre as duas posições selecionadas.')
      } else {
        setPathResult(res)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setCalculating(false)
    }
  }

  async function handleExportToFlowchart() {
    if (!pathResult) return
    setExporting(true)
    try {
      const doc = await pathfinderEngine.exportPathToFlowchart(
        pathResult,
        `Rota: ${pathResult.steps[0].nodeName} ➔ ${pathResult.steps[pathResult.steps.length - 1].nodeName}`
      )
      navigate(`/docs/${doc.id}`)
    } catch (e) {
      setError(String(e))
      setExporting(false)
    }
  }

  return (
    <div className="docs-page">
      {/* ─── Topbar ─────────────────────────────────────────────────────────── */}
      <header className="topbar">
        <Link to="/docs" className="logo">BJJ Cortex</Link>
        <span className="topbar-title">Calculador de Rotas de BJJ (Pathfinder)</span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
          <Link to="/docs" className="btn-reset">📁 Documentos</Link>
          <Link to="/grafo" className="btn-reset">🌐 Grafo BJJ</Link>
          <Link to="/ia" className="btn-reset">🧠 IA Analisador</Link>
          <Link to="/curador" className="btn-reset" style={{ borderColor: 'var(--accent)' }}>
            ⚖️ Curadoria
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>

        {/* ─── Header Título ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--fg)' }}>
            🧭 Calculador de Caminhos & Transições de BJJ
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: 14 }}>
            Escolha uma Posição de Origem (A) e uma Posição de Destino (B). O motor de rotas calculará a menor sequência de transições e raspagens biomecânicas.
          </p>
        </div>

        {/* ─── Painel de Seleção ─────────────────────────────────────────────── */}
        <div style={{ background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>

            {/* Posição A (Origem) */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
              <span>📍 Posição de Origem (A):</span>
              <select
                value={sourceId}
                onChange={e => setSourceId(e.target.value)}
                disabled={loadingConcepts}
                style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: '#0f172a', color: '#fff', fontSize: 13 }}
              >
                <option value="">-- Selecione a Origem --</option>
                {concepts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.preferred_name || (c as unknown as Record<string, unknown>).name as string} ({c.canonical_id || c.node_type})
                  </option>
                ))}
              </select>
            </label>

            {/* Posição B (Destino) */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
              <span>🎯 Posição de Destino (B):</span>
              <select
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                disabled={loadingConcepts}
                style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: '#0f172a', color: '#fff', fontSize: 13 }}
              >
                <option value="">-- Selecione o Destino --</option>
                {concepts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.preferred_name || (c as unknown as Record<string, unknown>).name as string} ({c.canonical_id || c.node_type})
                  </option>
                ))}
              </select>
            </label>

          </div>

          {/* Seletor de Modo de Cálculo */}
          <div style={{ margin: '14px 0', padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>
              🎯 Algoritmo de Cálculo de Rota:
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setMode('dijkstra_weighted')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid ' + (mode === 'dijkstra_weighted' ? '#10b981' : 'var(--border)'),
                  background: mode === 'dijkstra_weighted' ? 'rgba(16,185,129,0.15)' : 'transparent',
                  color: mode === 'dijkstra_weighted' ? '#34d399' : 'var(--muted)',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                🎯 Maior Probabilidade (Dijkstra Telemetria)
              </button>

              <button
                type="button"
                onClick={() => setMode('bfs_shortest')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid ' + (mode === 'bfs_shortest' ? '#3b82f6' : 'var(--border)'),
                  background: mode === 'bfs_shortest' ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: mode === 'bfs_shortest' ? '#93c5fd' : 'var(--muted)',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ⚡ Menor Número de Passos (BFS Estrutural)
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: 10, borderRadius: 6, marginBottom: 14, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={handleFindPath}
            disabled={calculating || loadingConcepts}
            style={{
              width: '100%',
              padding: 12,
              fontSize: 15,
              fontWeight: 700,
              color: '#fff',
              background: mode === 'dijkstra_weighted' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border: 'none',
              borderRadius: 8,
              cursor: calculating ? 'wait' : 'pointer',
            }}
          >
            {calculating ? '🧭 Calculando Rota Biomecânica…' : (mode === 'dijkstra_weighted' ? '🚀 Calcular Rota de Maior Probabilidade' : '🚀 Calcular Rota de Menor Passo')}
          </button>
        </div>

        {/* ─── Resultado da Rota Calculada ───────────────────────────────────── */}
        {pathResult && (
          <div style={{ background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 30 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0' }}>
                  {pathResult.mode === 'dijkstra_weighted' ? 'Rota de Maior Probabilidade' : 'Rota de Menor Passo'} ({pathResult.length} transições)
                </h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {pathResult.overallProbability != null && (
                    <span style={{ fontSize: 12, background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid #10b981', padding: '3px 10px', borderRadius: 12, fontWeight: 700 }}>
                      📊 Probabilidade Estimada: {Math.round(pathResult.overallProbability * 100)}%
                    </span>
                  )}
                  {pathResult.hasUnsampledEdges && (
                    <span style={{ fontSize: 11, background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid #f59e0b', padding: '3px 10px', borderRadius: 12, fontWeight: 600 }}>
                      ⚠️ Transições com amostragem pendente (N &lt; 5) utilizam peso neutro (50%)
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleExportToFlowchart}
                disabled={exporting}
                style={{
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: exporting ? 'wait' : 'pointer',
                }}
              >
                {exporting ? 'Exportando…' : '⚡ Exportar para Fluxograma de Treino'}
              </button>
            </div>

            {/* Timeline Passo a Passo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pathResult.steps.map((step, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: idx === 0 ? '#10b981' : idx === pathResult.steps.length - 1 ? '#ef4444' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: '#fff' }}>
                    {idx + 1}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)' }}>
                      {step.nodeName}
                    </div>
                    {step.edgeLabel && (
                      <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span>Ação: {step.edgeLabel}</span>
                        {step.weight != null && (
                          <span style={{ background: step.isUnsampled ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 4, color: step.isUnsampled ? '#fbbf24' : '#34d399', fontSize: 10 }}>
                            {step.isUnsampled ? 'Taxa: 50% (amostragem N < 5)' : `Taxa de Sucesso: ${Math.round(step.weight * 100)}%`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: 11, background: '#334155', color: '#fff', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}>
                    {step.nodeType}
                  </span>
                </div>
              ))}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
