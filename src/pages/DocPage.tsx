import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { MultiDirectedGraph } from 'graphology'
import { documentRepository } from '../infra/SupabaseDocumentRepository'
import { loadGraph } from '../lib/graphLoader'
import type { BjjDoc, DocumentData } from '../core/document/types'
import CanvasApp from './CanvasApp'
import FlowBuilder from '../components/FlowBuilder'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEBOUNCE_MS = 1500

export default function DocPage() {
  const { id } = useParams<{ id: string }>()

  const [doc,    setDoc]    = useState<BjjDoc | null>(null)
  const [graph,  setGraph]  = useState<MultiDirectedGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,  setError]  = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestData  = useRef<DocumentData | null>(null)

  // Load doc + graph in parallel
  useEffect(() => {
    if (!id) return
    Promise.all([
      documentRepository.get(id),
      loadGraph(),
    ])
      .then(([d, g]) => { setDoc(d); setGraph(g) })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id])

  // Debounced save — called every time canvas emits onDataChange
  const handleDataChange = useCallback((data: DocumentData) => {
    latestData.current = data
    setSaveStatus('saving')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!id || !latestData.current) return
      try {
        await documentRepository.update(id, { data: latestData.current })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch (e) {
        console.error('save error', e)
        setSaveStatus('error')
      }
    }, DEBOUNCE_MS)
  }, [id])

  // Cleanup debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
        <p>Carregando…</p>
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="splash error">
        <p>{error ?? 'Documento não encontrado.'}</p>
        <a href="/docs" style={{ color: 'var(--accent)', marginTop: 12, display: 'block' }}>← Voltar</a>
      </div>
    )
  }

  const saveIndicator = (
    <span style={{ fontSize: 11, color: saveStatus === 'error' ? 'var(--c-submission)' : 'var(--muted)', position: 'fixed', bottom: 10, right: 14, zIndex: 100 }}>
      {saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'saved' ? 'Salvo ✓' : saveStatus === 'error' ? 'Erro ao salvar' : ''}
    </span>
  )

  if (doc.type === 'mindmap') {
    return (
      <>
        <CanvasApp
          key={doc.id}
          initialData={doc.data}
          onDataChange={handleDataChange}
          docTitle={doc.title}
        />
        {saveIndicator}
      </>
    )
  }

  if (doc.type === 'fluxograma') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <FlowBuilder
          key={doc.id}
          graph={graph}
          initialData={doc.data}
          onDataChange={handleDataChange}
        />
        {saveIndicator}
      </div>
    )
  }

  return (
    <div className="splash error">
      <p>Tipo de documento desconhecido: {doc.type}</p>
    </div>
  )
}
