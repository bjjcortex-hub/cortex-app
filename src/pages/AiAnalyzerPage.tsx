import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { interpretiveAiEngine, type AnalysisInput, type AnalysisResult } from '../core/ai/aiEngine'
import type { GiNogi, NodeType } from '../core/canonical/types'

export default function AiAnalyzerPage() {
  const navigate = useNavigate()

  // Estado dos Inputs
  const [rawText, setRawText]       = useState('')
  const [videoUrl, setVideoUrl]     = useState('')
  const [fromPosture, setFromPosture] = useState('')
  const [mechanism, setMechanism]   = useState('')
  const [toPosture, setToPosture]   = useState('')
  const [giNogi, setGiNogi]         = useState<GiNogi>('both')
  const [nodeType, setNodeType]     = useState<NodeType>('transition')

  // Estado do Processamento
  const [analyzing, setAnalyzing]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]         = useState<AnalysisResult | null>(null)
  const [submittedId, setSubmittedId] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)

  // Exemplos rápidos para demonstração
  const EXAMPLES = [
    {
      title: 'Raspagem de Gancho (Butterfly Sweep) para Montada',
      text: 'Entrada na guarda borboleta com esgrima dupla, elevação dos quadris com o gancho esquerdo e projeção lateral terminando na montada.',
      video: 'https://youtube.com/watch?v=example1',
      from: 'Guarda Borboleta',
      mech: 'Elevação de Gancho + Esgrima Dupla',
      to: 'Posição Montada',
      type: 'transition' as NodeType,
    },
    {
      title: 'Chave de Braço Invertida (Inverted Armbar) da Meia Guarda',
      text: 'Atacante na meia guarda por cima isola o braço distante do defensor com esgrima invertida e aplica pressão no cotovelo com rotação de quadril.',
      video: 'https://youtube.com/watch?v=example2',
      from: 'Meia Guarda Por Cima',
      mech: 'Pressão no Cotovelo + Rotação de Quadril',
      to: 'Submissão / Tap Out',
      type: 'submission' as NodeType,
    },
    {
      title: 'Passagem Emborcando (Stack Pass)',
      text: 'Defensor na guarda fechada é controlado pela cintura, atacante projeta o quadril para frente dobrando as pernas do defensor sobre o pescoço e transita para os 100kg.',
      video: '',
      from: 'Guarda Fechada (Abertura)',
      mech: 'Compressão Cervical + Pressão de Quadril',
      to: 'Controle Lateral (100kg)',
      type: 'transition' as NodeType,
    },
  ]

  function fillExample(ex: typeof EXAMPLES[0]) {
    setRawText(ex.text)
    setVideoUrl(ex.video)
    setFromPosture(ex.from)
    setMechanism(ex.mech)
    setToPosture(ex.to)
    setNodeType(ex.type)
    setResult(null)
    setSubmittedId(null)
  }

  async function handleAnalyze() {
    if (!rawText.trim() && !fromPosture.trim()) {
      setError('Insira uma descrição do movimento ou preencha as posturas.')
      return
    }

    setError(null)
    setAnalyzing(true)
    setResult(null)

    try {
      const input: AnalysisInput = {
        rawText,
        videoUrl,
        fromPosture,
        mechanism,
        toPosture,
        giNogi,
        nodeType,
        gamePhases: ['guard', 'control'],
      }

      // Animação de varredura interpretativa da IA
      await new Promise(r => setTimeout(r, 600))
      const res = await interpretiveAiEngine.analyze(input)
      setResult(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSubmitProposal() {
    if (!result) return
    setSubmitting(true)
    setError(null)

    try {
      const input: AnalysisInput = {
        rawText,
        videoUrl,
        fromPosture: result.signature.from_posture,
        mechanism: result.signature.mechanism,
        toPosture: result.signature.to_posture,
        giNogi,
        nodeType,
      }

      const proposal = await interpretiveAiEngine.submitProposal(input, result)
      setSubmittedId(proposal.id)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="docs-page">
      {/* ─── Header Topbar ─────────────────────────────────────────────────── */}
      <header className="topbar">
        <Link to="/docs" className="logo">BJJ Cortex</Link>
        <span className="topbar-title">Motor de IA Interpretativa (Layer 1)</span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
          <Link to="/docs" className="btn-reset">📁 Documentos</Link>
          <Link to="/grafo" className="btn-reset">🌐 Grafo BJJ</Link>
          <Link to="/curador" className="btn-reset" style={{ borderColor: 'var(--accent)' }}>
            ⚖️ Fila de Curadoria (/curador)
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1000, margin: '24px auto', padding: '0 16px' }}>

        {/* ─── Título e Contexto ───────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--fg)' }}>
            🧠 Análise Biomecânica & IA Interpretativa
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: 14 }}>
            Insira a descrição de uma luta, instrucional ou movimento. A IA extrairá a assinatura estrutural
            <code>{'{ from_posture, mechanism, to_posture }'}</code>, calculará a confiança e proporá novo conceito para triagem humana.
          </p>
        </div>

        {/* ─── Exemplos Rápidos ───────────────────────────────────────────── */}
        <div style={{ background: 'var(--card-bg, rgba(255,255,255,0.03))', padding: 14, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
            ⚡ TESTAR EXEMPLOS PRE-CONFIGURADOS:
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => fillExample(ex)}
                style={{
                  background: 'var(--btn-bg, #1e293b)',
                  color: 'var(--fg, #f8fafc)',
                  border: '1px solid var(--border)',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {ex.title}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Formulário de Input ───────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

          {/* Coluna 1: Texto Bruto & Mídia */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
              Descrição do Movimento ouTranscrição de Vídeo:
              <textarea
                rows={5}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder="Ex: Atacante na guarda borboleta projeta o quadril e aplica raspagem terminando na montada..."
                style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg, #0f172a)', color: '#fff', fontSize: 13, resize: 'vertical' }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
              Link de Vídeo / Referência (opcional):
              <input
                type="text"
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/... ou https://instagram.com/p/..."
                style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg, #0f172a)', color: '#fff', fontSize: 13 }}
              />
            </label>
          </div>

          {/* Coluna 2: Decomposição Guiada */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
                Gi / No-Gi:
                <select
                  value={giNogi}
                  onChange={e => setGiNogi(e.target.value as GiNogi)}
                  style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg, #0f172a)', color: '#fff' }}
                >
                  <option value="both">Ambos (Gi & No-Gi)</option>
                  <option value="gi">Somente Gi (Com Pano)</option>
                  <option value="nogi">Somente No-Gi (Sem Pano)</option>
                </select>
              </label>

              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
                Tipo de Nó Estima:
                <select
                  value={nodeType}
                  onChange={e => setNodeType(e.target.value as NodeType)}
                  style={{ padding: 10, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg, #0f172a)', color: '#fff' }}
                >
                  <option value="transition">Transição</option>
                  <option value="submission">Finalização</option>
                  <option value="position">Posição</option>
                  <option value="principle">Princípio</option>
                </select>
              </label>
            </div>

            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, padding: '0 6px', color: 'var(--accent)' }}>
                Decomposição Biomecânica (opcional)
              </legend>

              <input
                type="text"
                placeholder="Postura Inicial (ex: Guarda Borboleta)"
                value={fromPosture}
                onChange={e => setFromPosture(e.target.value)}
                style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg, #0f172a)', color: '#fff', fontSize: 12 }}
              />
              <input
                type="text"
                placeholder="Mecanismo Chave (ex: Elevação de Gancho)"
                value={mechanism}
                onChange={e => setMechanism(e.target.value)}
                style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg, #0f172a)', color: '#fff', fontSize: 12 }}
              />
              <input
                type="text"
                placeholder="Postura Final (ex: Posição Montada)"
                value={toPosture}
                onChange={e => setToPosture(e.target.value)}
                style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg, #0f172a)', color: '#fff', fontSize: 12 }}
              />
            </fieldset>
          </div>
        </div>

        {/* ─── Botão de Ação ──────────────────────────────────────────────── */}
        {error && (
          <div style={{ color: '#ef4444', marginBottom: 14, fontSize: 13, background: 'rgba(239, 68, 68, 0.1)', padding: 10, borderRadius: 6 }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: 15,
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            border: 'none',
            borderRadius: 8,
            cursor: analyzing ? 'wait' : 'pointer',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
            marginBottom: 24,
          }}
        >
          {analyzing ? '🔍 Analisando Assinatura Biomecânica…' : '🚀 Analisar Movimento via IA Interpretativa'}
        </button>

        {/* ─── Resultado da Análise ───────────────────────────────────────── */}
        {result && (
          <div style={{ background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 30 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Resultado da Extração IA
              </h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: result.confidenceTier === 'high' ? '#22c55e' : result.confidenceTier === 'medium' ? '#f59e0b' : '#ef4444' }}>
                  Confiança: {Math.round(result.confidence * 100)}%
                </span>
                <span className={`confidence-tier tier-${result.confidenceTier}`} style={{ padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                  {result.confidenceTier}
                </span>
              </div>
            </div>

            {/* Assinatura Biomecânica Visual */}
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: 14, borderRadius: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                Assinatura Estrutural Deduzida:
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
                <span style={{ background: '#334155', padding: '6px 12px', borderRadius: 6 }}>{result.signature.from_posture}</span>
                <span style={{ color: 'var(--accent)' }}>➔</span>
                <span style={{ background: '#1e3a8a', color: '#93c5fd', padding: '6px 12px', borderRadius: 6 }}>{result.signature.mechanism}</span>
                <span style={{ color: 'var(--accent)' }}>➔</span>
                <span style={{ background: '#334155', padding: '6px 12px', borderRadius: 6 }}>{result.signature.to_posture}</span>
              </div>
            </div>

            {/* Raciocínio */}
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
              💡 <strong>Raciocínio da IA:</strong> {result.reasoning}
            </div>

            {/* Botão de Submissão de Proposta */}
            {submittedId ? (
              <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', padding: 14, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#4ade80', fontWeight: 600, fontSize: 14 }}>
                  ✅ Proposta registrada com sucesso na fila de governança!
                </span>
                <button
                  onClick={() => navigate('/curador')}
                  style={{ background: '#22c55e', color: '#000', fontWeight: 700, border: 'none', padding: '8px 14px', borderRadius: 6, cursor: 'pointer' }}
                >
                  Ir para a Fila do /curador ➔
                </button>
              </div>
            ) : (
              <button
                onClick={handleSubmitProposal}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fff',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 8,
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                {submitting ? 'Submetendo Proposta…' : '⚖️ Enviar Proposta para Fila de Governança (/curador)'}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
