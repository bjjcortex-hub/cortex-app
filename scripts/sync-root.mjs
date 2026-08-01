// scripts/sync-root.mjs
// Executado MANUALMENTE depois de `npm run build` para sincronizar dist/ com a raiz do repo.
// NÃO adicionar como postbuild — o sync sobrescreve o index.html que o Vite usa como entrada.
//
// Uso: node scripts/sync-root.mjs
// Ou via: npm run deploy (que faz: build → sync → gh-pages)

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  console.log(`  synced: ${path.relative(root, dest)}`)
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true })
  console.log(`  synced: ${path.relative(root, dest)}/`)
}

console.log('[sync-root] Sincronizando dist/ → raiz do repo...')
copyFile(path.join(dist, 'index.html'), path.join(root, 'index.html'))
copyFile(path.join(dist, '404.html'), path.join(root, '404.html'))
if (fs.existsSync(path.join(dist, '.nojekyll'))) {
  copyFile(path.join(dist, '.nojekyll'), path.join(root, '.nojekyll'))
}
copyDir(path.join(dist, 'static'), path.join(root, 'static'))
console.log('[sync-root] Concluído.')

// IMPORTANTE: index.html raiz agora aponta para o bundle compilado.
// Para voltar a poder fazer `npm run build`, restaure o index.html original com:
//   git checkout -- index.html
console.log('[sync-root] Para recompilar depois: execute git checkout -- index.html')
