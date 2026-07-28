import LZString from 'lz-string'

const LS_KEY = 'bjj-explorer-v2'
const STATE_VERSION = 2

export interface ManualEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  latent?: boolean
}

export interface PersistedState {
  v: typeof STATE_VERSION
  root: string | null
  extra: string[]
  faded: string[]
  active: string[]
  hidden: string[]
  locked: string[]
  positions: Array<[string, number, number]>
  manualEdges: ManualEdge[]
}

export function serialize(state: Omit<PersistedState, 'v'>): string {
  return JSON.stringify({ v: STATE_VERSION, ...state })
}

export function deserialize(json: string): PersistedState | null {
  try {
    const obj = JSON.parse(json) as PersistedState
    if (obj?.v !== STATE_VERSION) return null
    if (obj.root !== null && typeof obj.root !== 'string') return null
    if (!Array.isArray(obj.faded)) obj.faded = []
    if (!Array.isArray(obj.manualEdges)) obj.manualEdges = []
    return obj
  } catch {
    return null
  }
}

export function saveToStorage(state: Omit<PersistedState, 'v'>): void {
  const json = serialize(state)
  try {
    localStorage.setItem(LS_KEY, json)
  } catch {
    // quota exceeded — ignore
  }
  const compressed = LZString.compressToEncodedURIComponent(json)
  window.history.replaceState(null, '', '#' + compressed)
}

export function loadFromStorage(): PersistedState | null {
  // URL hash takes priority (enables sharing)
  const hash = window.location.hash.slice(1)
  if (hash) {
    const json = LZString.decompressFromEncodedURIComponent(hash)
    if (json) {
      const s = deserialize(json)
      if (s) return s
    }
  }
  const json = localStorage.getItem(LS_KEY)
  return json ? deserialize(json) : null
}

export function clearStorage(): void {
  localStorage.removeItem(LS_KEY)
  window.history.replaceState(null, '', window.location.pathname)
}
