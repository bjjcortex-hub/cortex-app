import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'

// ── 1. Dados de Posições e Categorias ────────────────────────────────────────

interface PosItem {
  id: string
  title: string
  cat: number
  std?: number
  kids: Array<{ id: string; l: string; role: string; n: number }>
}

const POS: PosItem[] = [
  { id: "empe", title: "Em pé", cat: 0, std: 1, kids: [{ id: "empe", l: "neutro", role: "n", n: 100 }] },
  { id: "joe", title: "De joelhos", cat: 0, std: 1, kids: [{ id: "joe", l: "neutro", role: "n", n: 3 }] },
  { id: "fech", title: "G. fechada", cat: 1, kids: [{ id: "fech-c", l: "cima", role: "c", n: 4 }, { id: "fech-b", l: "baixo", role: "b", n: 2 }] },
  { id: "meia", title: "Meia guarda", cat: 1, kids: [{ id: "meia-c", l: "cima", role: "c", n: 22 }, { id: "meia-b", l: "baixo", role: "b", n: 5 }] },
  { id: "abe", title: "G. aberta", cat: 1, kids: [{ id: "abe-c", l: "cima", role: "c", n: 34 }, { id: "abe-b", l: "baixo", role: "b", n: 9 }] },
  { id: "dlr", title: "De la Riva", cat: 1, kids: [{ id: "dlr-c", l: "cima", role: "c", n: 11 }, { id: "dlr-b", l: "baixo", role: "b", n: 3 }] },
  { id: "ara", title: "Aranha", cat: 1, kids: [{ id: "ara-c", l: "cima", role: "c", n: 5 }, { id: "ara-b", l: "baixo", role: "b", n: 2 }] },
  { id: "hq", title: "Headquarters", cat: 2, kids: [{ id: "hq-c", l: "cima", role: "c", n: 40 }, { id: "hq-b", l: "baixo", role: "b", n: 2 }] },
  { id: "leg", title: "Leg drag", cat: 2, kids: [{ id: "leg-c", l: "cima", role: "c", n: 26 }, { id: "leg-b", l: "baixo", role: "b", n: 1 }] },
  { id: "slx", title: "Single leg X", cat: 2, kids: [{ id: "slx-a", l: "ataca", role: "c", n: 4 }, { id: "slx-d", l: "defende", role: "b", n: 2 }] },
  { id: "c50", title: "50/50", cat: 2, kids: [{ id: "c50-a", l: "ataca", role: "c", n: 3 }, { id: "c50-d", l: "defende", role: "b", n: 1 }] },
  { id: "p100", title: "100 kg", cat: 3, kids: [{ id: "p100-c", l: "cima", role: "c", n: 38 }, { id: "p100-b", l: "baixo", role: "b", n: 4 }] },
  { id: "jnb", title: "Joelho barriga", cat: 3, kids: [{ id: "jnb-c", l: "cima", role: "c", n: 14 }, { id: "jnb-b", l: "baixo", role: "b", n: 1 }] },
  { id: "mon", title: "Montada", cat: 3, kids: [{ id: "mon-c", l: "cima", role: "c", n: 28 }, { id: "mon-b", l: "baixo", role: "b", n: 2 }] },
  { id: "cos", title: "Costas", cat: 3, kids: [{ id: "cos-c", l: "cima", role: "c", n: 33 }, { id: "cos-b", l: "baixo", role: "b", n: 2 }] },
  { id: "tur", title: "Turtle", cat: 3, kids: [{ id: "tur-c", l: "cima", role: "c", n: 16 }, { id: "tur-b", l: "casco", role: "b", n: 3 }] }
]

export const CATNAME: Record<number, string> = { 0: "Neutras", 1: "Guardas", 2: "Passagem & emaranhados", 3: "Controles", 4: "Finalizações" }
export const CATHEX: Record<number, string> = { 0: "#9a958a", 1: "#8a9a4e", 2: "#5b8aa8", 3: "#b08a52", 4: "#a8524e" }
export const SPIDER_POS = POS

// ── 2. Dados de Transição (TR) ───────────────────────────────────────────────

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
  sub?: string
  subNode?: string
}

const G1 = "Entradas — quedas e puxadas", G2 = "Passagens", G3 = "Raspagens",
      G4 = "Escapes e reposições", G5 = "Progressões de controle", G6 = "Finalizações"

const TR: TransitionItem[] = [
  { id: "t01", t: "t", title: "Single leg", who: "A", n: 22, from: "empe", to: "abe-c", g: G1 },
  { id: "t02", t: "t", title: "Body lock / arrastão", who: "A", n: 14, from: "empe", to: "meia-c", g: G1 },
  { id: "t03", t: "t", title: "Guard pull (raro)", who: "A", n: 3, from: "empe", to: "dlr-b", g: G1 },
  { id: "t04", t: "t", title: "Puxada do oponente", who: "B", n: 9, from: "empe", to: "abe-c", g: G1 },
  { id: "t05", t: "t", title: "Double leg", who: "A", n: 6, from: "empe", to: "p100-c", g: G1 },
  { id: "t06", t: "t", title: "Ankle pick", who: "A", n: 5, from: "empe", to: "leg-c", g: G1 },
  { id: "t09", t: "t", title: "Queda sofrida (rara)", who: "B", n: 3, from: "empe", to: "meia-b", g: G1 },
  { id: "t10", t: "t", title: "Disputa de pegada", who: "A", n: 3, from: "joe", to: "abe-c", g: G1 },
  { id: "t59", t: "t", title: "Queda defendida (sprawl de A)", who: "B", neut: "A", n: 9, from: "empe", to: "empe", g: G1 },
  { id: "t60", t: "t", title: "Queda do A defendida", who: "A", neut: "B", n: 2, from: "empe", to: "empe", g: G1 },

  { id: "t12", t: "t", title: "Entrada headquarters", who: "A", n: 24, from: "abe-c", to: "hq-c", g: G2 },
  { id: "t13", t: "t", title: "Passagem de meia (body lock)", who: "A", n: 16, from: "meia-c", to: "hq-c", g: G2 },
  { id: "t11", t: "t", title: "Abertura de guarda", who: "A", n: 4, from: "fech-c", to: "hq-c", g: G2 },
  { id: "t62", t: "t", title: "Entrada headquarters (DLR)", who: "A", n: 8, from: "dlr-c", to: "hq-c", g: G2 },
  { id: "t19", t: "t", title: "Leg drag", who: "A", n: 22, from: "hq-c", to: "leg-c", g: G2 },
  { id: "t18", t: "t", title: "Knee cut", who: "A", n: 14, from: "hq-c", to: "p100-c", g: G2 },
  { id: "t21", t: "t", title: "Consolidou leg drag", who: "A", n: 20, from: "leg-c", to: "p100-c", g: G2 },
  { id: "t20", t: "t", title: "Forçou o casco", who: "A", n: 9, from: "hq-c", to: "tur-c", g: G2 },
  { id: "t63", t: "t", title: "Passagem sofrida (rara)", who: "B", n: 2, from: "abe-b", to: "p100-b", g: G2 },

  { id: "t24", t: "t", title: "Raspagem de meia (defensiva)", who: "A", n: 4, from: "meia-b", to: "meia-c", g: G3 },
  { id: "t26", t: "t", title: "Recomposição para cima", who: "A", n: 3, from: "abe-b", to: "abe-c", g: G3 },
  { id: "t28", t: "t", title: "Raspagem SLX", who: "A", n: 4, from: "slx-a", to: "hq-c", g: G3 },
  { id: "t30", t: "t", title: "Emaranhou a perna (sofrido)", who: "B", n: 2, from: "slx-d", to: "c50-d", g: G3 },
  { id: "t31", t: "t", title: "Berimbolo", who: "A", n: 0, from: "dlr-b", to: "cos-c", state: "latent", g: G3 },

  { id: "t32", t: "t", title: "Reposição de guarda", who: "A", n: 4, from: "p100-b", to: "abe-b", g: G4 },
  { id: "t35", t: "t", title: "Granby / reposição", who: "A", n: 3, from: "tur-b", to: "abe-b", g: G4 },
  { id: "t61", t: "t", title: "Recomposição de guarda", who: "B", neut: "A", n: 3, from: "abe-b", to: "abe-b", g: G4 },
  { id: "t34", t: "t", title: "Fuga das costas (rara)", who: "A", n: 2, from: "cos-b", to: "abe-b", g: G4 },

  { id: "t37", t: "t", title: "Progressão p/ montada", who: "A", n: 14, from: "p100-c", to: "mon-c", g: G5 },
  { id: "t38", t: "t", title: "Joelho na barriga", who: "A", n: 14, from: "p100-c", to: "jnb-c", g: G5 },
  { id: "t39", t: "t", title: "J. barriga p/ montada", who: "A", n: 9, from: "jnb-c", to: "mon-c", g: G5 },
  { id: "t40", t: "t", title: "Pegada das costas (montada)", who: "A", n: 20, from: "mon-c", to: "cos-c", g: G5 },
  { id: "t41", t: "t", title: "Ataque ao casco → costas", who: "A", n: 13, from: "tur-c", to: "cos-c", g: G5 },
  { id: "t64", t: "t", title: "Costas direto do 100 kg", who: "A", n: 7, from: "p100-c", to: "cos-c", g: G5 },
  { id: "t42", t: "t", title: "Montou (sofrido, raro)", who: "B", n: 2, from: "p100-b", to: "mon-b", g: G5 },

  { id: "t45", t: "s", title: "Mata-leão pelas costas", who: "A", sub: "mataleao", n: 24, from: "cos-c", to: "vit-fin", escTo: "mon-c", escN: 6, g: G6 },
  { id: "t44", t: "s", title: "Armlock / estrang. da montada", who: "A", sub: "armlock", n: 9, from: "mon-c", to: "vit-fin", escTo: "cos-c", escN: 3, g: G6 },
  { id: "t46", t: "s", title: "Estrang. do 100 kg", who: "A", sub: "estrang", n: 5, from: "p100-c", to: "vit-fin", escTo: "p100-c", escN: 2, g: G6 },
  { id: "t65", t: "s", title: "Mata-leão do casco", who: "A", sub: "mataleao", n: 4, from: "tur-c", to: "vit-fin", escTo: "cos-c", escN: 2, g: G6 },
  { id: "t49", t: "s", title: "Botinha (50/50)", who: "A", sub: "leglock", n: 1, from: "c50-a", to: "vit-fin", g: G6 },
  { id: "t51", t: "s", title: "Estrangulamento sofrido", who: "B", sub: "estrang", n: 2, from: "p100-b", to: "der-fin", escTo: "abe-b", escN: 1, g: G6 },
  { id: "t54", t: "s", title: "Leglock sofrido (50/50)", who: "B", sub: "leglock", n: 1, from: "c50-d", to: "der-fin", escTo: "empe", escN: 1, g: G6 },
  { id: "t58", t: "s", title: "Estrang. berimbolo", who: "A", sub: "mataleao", n: 0, from: "cos-c", to: "vit-fin", state: "latent", g: G6 },
]

// ── 3. Lista de Lutas (FIGHTS) ────────────────────────────────────────────────

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

export default function SpiderNetPage() {
  const [selectedFights, setSelectedFights] = useState<Set<string>>(new Set(FIGHTS.map(f => f.id)))
  const [filterAction, setFilterAction]     = useState<'ALL' | 'A' | 'B'>('ALL')
  const [activeTransition, setActiveTransition] = useState<string | null>(null)

  // Alterna seleção de uma luta
  function toggleFight(id: string) {
    setSelectedFights(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedFights(new Set(FIGHTS.map(f => f.id)))
  }

  function selectNone() {
    setSelectedFights(new Set())
  }

  // Contagem dinâmica baseada nas lutas selecionadas
  const liveTransitionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    FIGHTS.forEach(f => {
      if (selectedFights.has(f.id)) {
        f.seq.forEach(tid => {
          counts[tid] = (counts[tid] || 0) + 1
        })
      }
    })
    return counts
  }, [selectedFights])

  const filteredTransitions = useMemo(() => {
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
        <span className="topbar-title">BJJ Spider Net — Teia de Convergência Radial</span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
          <Link to="/docs" className="btn-reset">📁 Documentos</Link>
          <Link to="/rotas" className="btn-reset">🧭 Rotas BJJ</Link>
          <Link to="/galeria" className="btn-reset">🌍 Galeria</Link>
          <Link to="/grafo" className="btn-reset">🌐 Grafo BJJ</Link>
          <Link to="/curador" className="btn-reset" style={{ borderColor: 'var(--accent)' }}>⚖️ Curadoria</Link>
        </div>
      </header>

      <div style={{ padding: '16px 20px', display: 'flex', gap: 20 }}>
        {/* ── Painel de Lutas (Esquerda) ── */}
        <div style={{ width: 260, background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
              Lutas ({selectedFights.size}/{FIGHTS.length})
            </h3>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={selectAll} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#334155', color: '#fff', border: 'none', cursor: 'pointer' }}>Todas</button>
              <button onClick={selectNone} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#334155', color: '#fff', border: 'none', cursor: 'pointer' }}>Nenhuma</button>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
            Marque/desmarque as lutas para recalcular as frequências de transições e desfechos na teia.
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

        {/* ── Painel de Transições (Centro/Direita) ── */}
        <div style={{ flex: 1, background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              Matriz de Frequência das Transições
            </h2>

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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            {filteredTransitions.map(t => {
              const count = liveTransitionCounts[t.id] || 0
              const isActive = activeTransition === t.id

              return (
                <div
                  key={t.id}
                  onMouseEnter={() => setActiveTransition(t.id)}
                  onMouseLeave={() => setActiveTransition(null)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: isActive ? 'rgba(59,130,246,0.2)' : 'rgba(0,0,0,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--fg)' }}>
                      {t.title}
                    </span>
                    <span style={{ fontSize: 11, background: count > 0 ? '#3b82f6' : '#334155', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                      ×{count}
                    </span>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Origem: <strong>{t.from}</strong> ➔ Destino: <strong>{t.to}</strong>
                  </div>

                  <div style={{ fontSize: 10, color: t.who === 'A' ? '#34d399' : '#fbbf24', marginTop: 2 }}>
                    Executado por: {t.who === 'A' ? 'Atleta A (Ataque)' : 'Oponente B'} | Categoria: {t.g}
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </div>
  )
}
