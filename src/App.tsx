import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { initAnonymousAuth } from './infra/auth'
import CanvasApp from './pages/CanvasApp'
import DocsListPage from './pages/DocsListPage'
import DocPage from './pages/DocPage'

const router = createBrowserRouter([
  { path: '/',          element: <CanvasApp /> },
  { path: '/docs',      element: <DocsListPage /> },
  { path: '/docs/:id',  element: <DocPage /> },
])

export default function App() {
  useEffect(() => {
    initAnonymousAuth().catch(console.error)
  }, [])

  return <RouterProvider router={router} />
}
