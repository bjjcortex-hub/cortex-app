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
import PathfinderPage from './pages/PathfinderPage'
import GalleryPage from './pages/GalleryPage'
import SpiderNetPage from './pages/SpiderNetPage'

const router = createBrowserRouter([
  { path: '/',                         element: <CanvasApp /> },
  { path: '/docs',                     element: <DocsListPage /> },
  { path: '/docs/:id',                 element: <DocPage /> },
  // ── Governança, IA, Rotas, Teia, Galeria & Grafo ───────────────────────────
  { path: '/spider',                   element: <SpiderNetPage /> },
  { path: '/teia',                     element: <SpiderNetPage /> },
  { path: '/rotas',                    element: <PathfinderPage /> },
  { path: '/pathfinder',               element: <PathfinderPage /> },
  { path: '/galeria',                  element: <GalleryPage /> },
  { path: '/grafo',                    element: <GraphExplorerPage /> },
  { path: '/explorar',                 element: <GraphExplorerPage /> },
  { path: '/ia',                       element: <AiAnalyzerPage /> },
  { path: '/curador',                  element: <CuratorPage /> },
  { path: '/conceitos/:id',            element: <ConceptEditorPage /> },
  { path: '/conceitos/proposta/:id',   element: <ConceptEditorPage /> },
], { basename: import.meta.env.BASE_URL || '/' })

export default function App() {
  useEffect(() => {
    initAnonymousAuth().catch(console.error)
  }, [])

  return <RouterProvider router={router} />
}
