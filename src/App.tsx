import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { initAnonymousAuth } from './infra/auth'
import CanvasApp from './pages/CanvasApp'
import DocsListPage from './pages/DocsListPage'
import DocPage from './pages/DocPage'
import CuratorPage from './pages/CuratorPage'
import ConceptEditorPage from './pages/ConceptEditorPage'
import AiAnalyzerPage from './pages/AiAnalyzerPage'

const router = createBrowserRouter([
  { path: '/',                         element: <CanvasApp /> },
  { path: '/docs',                     element: <DocsListPage /> },
  { path: '/docs/:id',                 element: <DocPage /> },
  // ── Governança e IA (Blocos 4 & 5) ────────────────────────────────────────
  { path: '/ia',                       element: <AiAnalyzerPage /> },
  { path: '/curador',                  element: <CuratorPage /> },
  { path: '/conceitos/:id',            element: <ConceptEditorPage /> },
  { path: '/conceitos/proposta/:id',   element: <ConceptEditorPage /> },
])

export default function App() {
  useEffect(() => {
    initAnonymousAuth().catch(console.error)
  }, [])

  return <RouterProvider router={router} />
}
