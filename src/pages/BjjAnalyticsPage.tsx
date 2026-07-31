import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import PathfinderPage from './PathfinderPage'

// ── 1. Dados Centrais (100 Lutas do BJJ Cortex) ──────────────────────────────

interface FightItem {
  id: string
  op: string
  res: 'V' | 'D'
  seq: string[]
}

const FIGHTS: FightItem[] = [
  { id: "f01", op: "World Pro · final", res: "V", seq: ["t01", "t12", "t19", "t21", "t37", "t40", "t45"] },
  { id: "f02", op: "ADCC trials · semi", res: "V", seq: ["t01", "t12", "t19", "t21", "t64", "t45"] },
  { id: "f03", op: "IBJJF GP · r1", res: "V", seq: ["t02", "t13", "t19", "t21", "t18", "t38", "t39", "t40", "t45"] },
  { id: "f04", op: "Euro · final", res: "V", seq: ["t01", "t12", "t18", "t37", "t40", "t45"] },
  { id: "f05", op: "Pans · quartas", res: "V", seq: ["t02", "t13", "t19", "t21", "t37", "t40", "t45"] },
  { id: "f06", op: "Worlds · final", res: "V", seq: ["t01", "t12", "t19", "t21", "t20", "t41", "t45"] },
  { id: "f07", op: "Grand Slam RJ", res: "V", seq: ["t06", "t21", "t18", "t38", "t39", "t40", "t45"] },
  { id: "f08", op: "Grand Slam LA", res: "V", seq: ["t01", "t62", "t19", "t21", "t64", "t44"] },
  { id: "f09", op: "BJJ Stars · superluta", res: "V", seq: ["t02", "t13", "t20", "t41", "t45"] },
  { id: "f10", op: "WNO · desafio", res: "V", seq: ["t01", "t12", "t19", "t21", "t37", "t40", "t45"] },
  { id: "f11", op: "AJP Pro Abu Dhabi", res: "V", seq: ["t05", "t18", "t38", "t39", "t40", "t45"] },
  { id: "f12", op: "Copa Podio", res: "V", seq: ["t01", "t12", "t19", "t21", "t18", "t37", "t44"] },
  { id: "f13", op: "Euro · semi", res: "V", seq: ["t02", "t13", "t19", "t21", "t20", "t41", "t45"] },
  { id: "f14", op: "Pans · final", res: "V", seq: ["t01", "t12", "t19", "t21", "t37", "t40", "t45"] },
  { id: "f15", op: "Worlds · semi", res: "V", seq: ["t01", "t12", "t18", "t64", "t46"] },
  { id: "f16", op: "ADCC · r2", res: "V", seq: ["t06", "t21", "t37", "t38", "t39", "t40", "t45"] },
  { id: "f17", op: "Grand Slam TQ", res: "V", seq: ["t02", "t13", "t19", "t21", "t20", "t65"] },
  { id: "f18", op: "Fight to Win", res: "V", seq: ["t01", "t12", "t19", "t21", "t18", "t37", "t40", "t45"] },
  { id: "f19", op: "Puxador · guarda", res: "V", seq: ["t04", "t26", "t12", "t19", "t21", "t37", "t40", "t45"] },
  { id: "f20", op: "Wrestler forte", res: "V", seq: ["t59", "t01", "t12", "t18", "t38", "t39", "t44"] },
  { id: "f21", op: "Leglocker · ADCC", res: "D", seq: ["t03", "t30", "t54"] },
  { id: "f22", op: "Passador reverso", res: "D", seq: ["t09", "t63", "t51"] },
  { id: "f23", op: "Guardeiro · pontos", res: "V", seq: ["t01", "t28", "t19", "t21", "t20", "t41", "t45", "t24", "t11"] },
  { id: "f24", op: "Superluta · casco", res: "V", seq: ["t02", "t13", "t20", "t41", "t40", "t45", "t35", "t32", "t60", "t42", "t34", "t61", "t10", "t62", "t49", "t31", "t58"] },
]

interface TransitionItem {
  id: string
  t?: string
  title: string
  who: 'A' | 'B'
  neut?: string
  n: number
  from: string
  to: string
  fTo?: string
  fN?: number
  escTo?: string
  escN?: number
  state?: string
  g: string
}

const G1 = "Entradas — quedas e puxadas", G2 = "Passagens", G3 = "Raspagens",
      G4 = "Escapes e reposições", G5 = "Progressões de controle", G6 = "Finalizações"

const TR: TransitionItem[] = [
  { id: "t01", t: "t", title: "Single leg", who: "A", n: 22, from: "Em pé", to: "Guarda aberta (passador)", g: G1 },
  { id: "t02", t: "t", title: "Body lock / arrastão", who: "A", n: 14, from: "Em pé", to: "Meia guarda (passador)", g: G1 },
  { id: "t03", t: "t", title: "Guard pull (raro)", who: "A", n: 3, from: "Em pé", to: "De la Riva (guardeiro)", g: G1 },
  { id: "t04", t: "t", title: "Puxada do oponente", who: "B", n: 9, from: "Em pé", to: "Guarda aberta (passador)", g: G1 },
  { id: "t05", t: "t", title: "Double leg", who: "A", n: 6, from: "Em pé", to: "100 kg (por cima)", g: G1 },
  { id: "t06", t: "t", title: "Ankle pick", who: "A", n: 5, from: "Em pé", to: "Leg drag (passador)", g: G1 },
  { id: "t09", t: "t", title: "Queda sofrida (rara)", who: "B", n: 3, from: "Em pé", to: "Meia guarda (guardeiro)", g: G1 },
  { id: "t10", t: "t", title: "Disputa de pegada", who: "A", n: 3, from: "De joelhos", to: "Guarda aberta (passador)", g: G1 },
  { id: "t59", t: "t", title: "Queda defendida (sprawl de A)", who: "B", neut: "A", n: 9, from: "Em pé", to: "Em pé", g: G1 },
  { id: "t60", t: "t", title: "Queda do A defendida", who: "A", neut: "B", n: 2, from: "Em pé", to: "Em pé", g: G1 },

  { id: "t12", t: "t", title: "Entrada headquarters", who: "A", n: 24, from: "Guarda aberta (passador)", to: "Headquarters (passador)", g: G2 },
  { id: "t13", t: "t", title: "Passagem de meia (body lock)", who: "A", n: 16, from: "Meia guarda (passador)", to: "Headquarters (passador)", g: G2 },
  { id: "t11", t: "t", title: "Abertura de guarda", who: "A", n: 4, from: "Guarda fechada (passador)", to: "Headquarters (passador)", g: G2 },
  { id: "t62", t: "t", title: "Entrada headquarters (DLR)", who: "A", n: 8, from: "De la Riva (passador)", to: "Headquarters (passador)", g: G2 },
  { id: "t19", t: "t", title: "Leg drag", who: "A", n: 22, from: "Headquarters (passador)", to: "Leg drag (passador)", g: G2 },
  { id: "t18", t: "t", title: "Knee cut", who: "A", n: 14, from: "Headquarters (passador)", to: "100 kg (por cima)", g: G2 },
  { id: "t21", t: "t", title: "Consolidou leg drag", who: "A", n: 20, from: "Leg drag (passador)", to: "100 kg (por cima)", g: G2 },
  { id: "t20", t: "t", title: "Forçou o casco", who: "A", n: 9, from: "Headquarters (passador)", to: "Turtle (por cima)", g: G2 },

  { id: "t24", t: "t", title: "Raspagem de meia (defensiva)", who: "A", n: 4, from: "Meia guarda (guardeiro)", to: "Meia guarda (passador)", g: G3 },
  { id: "t26", t: "t", title: "Recomposição para cima", who: "A", n: 3, from: "Guarda aberta (guardeiro)", to: "Guarda aberta (passador)", g: G3 },
  { id: "t28", t: "t", title: "Raspagem SLX", who: "A", n: 4, from: "Single leg X (ataca)", to: "Headquarters (passador)", g: G3 },

  { id: "t32", t: "t", title: "Reposição de guarda", who: "A", n: 4, from: "100 kg (por baixo)", to: "Guarda aberta (guardeiro)", g: G4 },
  { id: "t35", t: "t", title: "Granby / reposição", who: "A", n: 3, from: "Turtle (casqueado)", to: "Guarda aberta (guardeiro)", g: G4 },

  { id: "t37", t: "t", title: "Progressão p/ montada", who: "A", n: 14, from: "100 kg (por cima)", to: "Montada (por cima)", g: G5 },
  { id: "t38", t: "t", title: "Joelho na barriga", who: "A", n: 14, from: "100 kg (por cima)", to: "Joelho na barriga (por cima)", g: G5 },
  { id: "t39", t: "t", title: "J. barriga p/ montada", who: "A", n: 9, from: "Joelho na barriga (por cima)", to: "Montada (por cima)", g: G5 },
  { id: "t40", t: "t", title: "Pegada das costas (montada)", who: "A", n: 20, from: "Montada (por cima)", to: "Costas (controlando)", g: G5 },
  { id: "t41", t: "t", title: "Ataque ao casco → costas", who: "A", n: 13, from: "Turtle (por cima)", to: "Costas (controlando)", g: G5 },
  { id: "t64", t: "t", title: "Costas direto do 100 kg", who: "A", n: 7, from: "100 kg (por cima)", to: "Costas (controlando)", g: G5 },

  { id: "t45", t: "s", title: "Mata-leão pelas costas", who: "A", n: 24, from: "Costas (controlando)", to: "Vitória por finalização", escTo: "Montada (por cima)", escN: 6, g: G6 },
  { id: "t44", t: "s", title: "Armlock / estrang. da montada", who: "A", n: 9, from: "Montada (por cima)", to: "Vitória por finalização", escTo: "Costas (controlando)", escN: 3, g: G6 },
  { id: "t46", t: "s", title: "Estrang. do 100 kg", who: "A", n: 5, from: "100 kg (por cima)", to: "Vitória por finalização", escTo: "100 kg (por cima)", escN: 2, g: G6 },
  { id: "t65", t: "s", title: "Mata-leão do casco", who: "A", n: 4, from: "Turtle (por cima)", to: "Vitória por finalização", escTo: "Costas (controlando)", escN: 2, g: G6 },
]

export default function BjjAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'cards' | 'spider' | 'rotas'>('cards')
  const [selectedFights, setSelectedFights] = useState<Set<string>>(new Set(FIGHTS.map(f => f.id)))
  const [filterAction, setFilterAction]     = useState<'ALL' | 'A' | 'B'>('ALL')
  const [hoverTransition, setHoverTransition] = useState<string | null>(null)

  function toggleFight(id: string) {
    setSelectedFights(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const liveCounts = useMemo(() => {
    const map: Record<string, number> = {}
    FIGHTS.forEach(f => {
      if (selectedFights.has(f.id)) {
        f.seq.forEach(tid => { map[tid] = (map[tid] || 0) + 1 })
      }
    })
    return map
  }, [selectedFights])

  const filteredTR = useMemo(() => {
    return TR.filter(t => {
      if (filterAction === 'A' && t.who !== 'A') return false
      if (filterAction === 'B' && t.who !== 'B') return false
      return true
    })
  }, [filterAction])

  return (
    <div className="docs-page">
      {/* ── Topbar ── */}
      <header className="topbar">
        <Link to="/docs" className="logo">BJJ Cortex</Link>
        <span className="topbar-title">Central Unificada de Analítica & Telemetria de Lutas</span>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#0f172a', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          <button
            onClick={() => setActiveTab('cards')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'cards' ? '#3b82f6' : 'transparent',
              color: '#fff',
            }}
          >
            🎴 Visão Cards (100 Lutas)
          </button>

          <button
            onClick={() => setActiveTab('spider')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'spider' ? '#8b5cf6' : 'transparent',
              color: '#fff',
            }}
          >
            🕸️ Teia Spider Net (Radial)
          </button>

          <button
            onClick={() => setActiveTab('rotas')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'rotas' ? '#10b981' : 'transparent',
              color: '#fff',
            }}
          >
            🧭 Rotas (Pathfinder Dijkstra)
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
          <Link to="/docs" className="btn-reset">📁 Documentos</Link>
          <Link to="/galeria" className="btn-reset">🌍 Galeria</Link>
          <Link to="/grafo" className="btn-reset">🌐 Grafo BJJ</Link>
          <Link to="/curador" className="btn-reset" style={{ borderColor: 'var(--accent)' }}>⚖️ Curadoria</Link>
        </div>
      </header>

      {/* ── Conteúdo Conectado ── */}
      {activeTab === 'rotas' ? (
        <PathfinderPage />
      ) : (
        <div style={{ padding: '16px 20px', display: 'flex', gap: 20 }}>

          {/* ── Esquerda: Seletor de 24 Lutas ── */}
          <div style={{ width: 260, background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
                Filtro de Lutas ({selectedFights.size}/{FIGHTS.length})
              </h3>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setSelectedFights(new Set(FIGHTS.map(f => f.id)))} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#334155', color: '#fff', border: 'none', cursor: 'pointer' }}>Todas</button>
                <button onClick={() => setSelectedFights(new Set())} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#334155', color: '#fff', border: 'none', cursor: 'pointer' }}>Nenhuma</button>
              </div>
            </div>

            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
              Selecione quais lutas alimentam o cálculo de frequências e taxas de sucesso.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
              {FIGHTS.map(f => {
                const isSelected = selectedFights.has(f.id)
                return (
                  <div
                    key={f.id}
                    onClick={() => toggleFight(f.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: isSelected ? '#93c5fd' : 'var(--fg)' }}>
                      vs {f.op}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: f.res === 'V' ? '#10b981' : '#ef4444',
                      color: '#fff'
                    }}>
                      {f.res}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Centro: Visualização em Cards ou Teia Spider Net ── */}
          <div style={{ flex: 1, background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0' }}>
                  {activeTab === 'cards' ? '🎴 Matriz em Cards de Posições e Funil de Ataque' : '🕸️ Diagrama de Convergência Radial (Spider Net)'}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Modo de Exibição: {activeTab === 'cards' ? 'Colunas por Fase de Combate' : 'Anéis Concêntricos por Categoria'} | Lutas Ativas: {selectedFights.size}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setFilterAction('ALL')}
                  style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: filterAction === 'ALL' ? '#3b82f6' : '#334155', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                >
                  Ambos
                </button>
                <button
                  onClick={() => setFilterAction('A')}
                  style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: filterAction === 'A' ? '#10b981' : '#334155', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                >
                  Ataque (Atleta A)
                </button>
                <button
                  onClick={() => setFilterAction('B')}
                  style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: filterAction === 'B' ? '#f59e0b' : '#334155', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                >
                  Oponente (B)
                </button>
              </div>
            </div>

            {/* Grid de Cards / Transições */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
              {filteredTR.map(t => {
                const count = liveCounts[t.id] || 0
                const isHovered = hoverTransition === t.id
                const successRate = t.escN ? Math.round((count / (count + t.escN)) * 100) : 100

                return (
                  <div
                    key={t.id}
                    onMouseEnter={() => setHoverTransition(t.id)}
                    onMouseLeave={() => setHoverTransition(null)}
                    style={{
                      padding: 14,
                      borderRadius: 8,
                      border: isHovered ? '2px solid #3b82f6' : '1px solid var(--border)',
                      background: isHovered ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0,0,0,0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)' }}>
                        {t.title}
                      </span>
                      <span style={{ fontSize: 12, background: count > 0 ? '#3b82f6' : '#334155', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                        ×{count}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div>De: <strong style={{ color: 'var(--fg)' }}>{t.from}</strong></div>
                      <div>Para: <strong style={{ color: '#93c5fd' }}>{t.to}</strong></div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11 }}>
                      <span style={{ color: t.who === 'A' ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
                        {t.who === 'A' ? 'Ataque (Atleta A)' : 'Oponente (B)'}
                      </span>

                      {t.t === 's' && (
                        <span style={{ color: '#34d399', fontWeight: 700, background: 'rgba(52,211,153,0.1)', padding: '1px 6px', borderRadius: 4 }}>
                          Taxa: {successRate}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

          </div>

        </div>
      )}
    </div>
  )
}
