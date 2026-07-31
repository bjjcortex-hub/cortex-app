import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { initAnonymousAuth } from './infra/auth'
import CanvasApp from './pages/CanvasApp'
import DocsListPage from './pages/DocsListPage'
import DocPage from './pages/DocPage'
import CuratorPage from './pages/CuratorPage'
import ConceptEditorPage from './pages/ConceptEditorPage'
import AiAnalyzerPage from './pages/AiAnalyzerPage'
import GraphExplorerPage from './pages/GraphExplorerPage'
import GalleryPage from './pages/GalleryPage'
import BjjAnalyticsPage from './pages/BjjAnalyticsPage'

// Basename para React Router NÃO deve ter barra no final (/cortex-app)
const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

const router = createBrowserRouter([
  { path: '/',                         element: <BjjAnalyticsPage /> },
  { path: '/canvas',                   element: <CanvasApp /> },
  { path: '/docs',                     element: <DocsListPage /> },
  { path: '/docs/:id',                 element: <DocPage /> },
  // ── Central Unificada de Analítica & Telemetria ───────────────────────────
  { path: '/analytics',                element: <BjjAnalyticsPage /> },
  { path: '/cards',                    element: <BjjAnalyticsPage /> },
  { path: '/spider',                   element: <BjjAnalyticsPage /> },
  { path: '/teia',                     element: <BjjAnalyticsPage /> },
  { path: '/rotas',                    element: <BjjAnalyticsPage /> },
  { path: '/pathfinder',               element: <BjjAnalyticsPage /> },
  { path: '/galeria',                  element: <GalleryPage /> },
  { path: '/grafo',                    element: <GraphExplorerPage /> },
  { path: '/explorar',                 element: <GraphExplorerPage /> },
  { path: '/ia',                       element: <AiAnalyzerPage /> },
  { path: '/curador',                  element: <CuratorPage /> },
  { path: '/conceitos/:id',            element: <ConceptEditorPage /> },
  { path: '/conceitos/proposta/:id',   element: <ConceptEditorPage /> },
  { path: '*',                         element: <BjjAnalyticsPage /> },
], { basename: base || '/' })

export default function App() {
  useEffect(() => {
    initAnonymousAuth().catch(console.error)
  }, [])

  return <RouterProvider router={router} />
}
