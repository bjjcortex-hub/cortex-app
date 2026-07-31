import { MultiDirectedGraph } from 'graphology'
import { supabase } from './supabase'
import type { RawEdge, RawNode, GraphSnapshot, NodeAttrs, EdgeAttrs } from '../types'

const PAGE = 1000

async function fetchAllNodes(sourceId: string): Promise<RawNode[]> {
  const results: RawNode[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('source_nodes')
      .select('id, external_id, node_type, name, name_en:raw->>name, parent_external_id, description, source_node_roles(role, position_type), position_dominance(score)')
      .eq('source_id', sourceId)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    results.push(...(data as unknown as RawNode[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return results
}

async function fetchAllEdges(sourceId: string): Promise<RawEdge[]> {
  const results: RawEdge[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('source_edges')
      .select('id, src_node_id, dst_node_id, edge_type, role, result_type, attempt_pct, success_rate, is_submission, label')
      .eq('source_id', sourceId)
      .not('dst_node_id', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    results.push(...(data as unknown as RawEdge[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return results
}

function buildGraph(nodes: RawNode[], edges: RawEdge[]): MultiDirectedGraph {
  const G = new MultiDirectedGraph()

  for (const n of nodes) {
    const roleRow = n.source_node_roles?.[0] ?? null
    const domRow = n.position_dominance?.[0] ?? null
    const attrs: NodeAttrs = {
      name: n.name,
      name_en: n.name_en ?? null,
      external_id: n.external_id,
      node_type: n.node_type,
      parent_external_id: n.parent_external_id ?? null,
      role: roleRow?.role ?? null,
      position_type: roleRow?.position_type ?? null,
      dominance_score: domRow?.score ?? 50,
      description: n.description ?? null,
    }
    G.addNode(n.id, attrs)
  }

  for (const e of edges) {
    if (!e.dst_node_id) continue
    if (!G.hasNode(e.src_node_id) || !G.hasNode(e.dst_node_id)) continue
    const attrs: EdgeAttrs = {
      edge_type: e.edge_type,
      role: e.role,
      result_type: e.result_type,
      attempt_pct: e.attempt_pct,
      success_rate: e.success_rate,
      is_submission: e.is_submission,
      label: e.label,
    }
    G.addEdgeWithKey(e.id, e.src_node_id, e.dst_node_id, attrs)
  }

  return G
}

export async function loadGraphFromSupabase(): Promise<MultiDirectedGraph> {
  // Busca 'grapplemap' ou 'bjjgraph' ou qualquer fonte disponivel
  const { data: srcRows } = await supabase
    .from('sources')
    .select('id')
    .in('key', ['grapplemap', 'bjjgraph'])
    .limit(1)

  let sourceId = srcRows?.[0]?.id

  if (!sourceId) {
    const { data: anyRows } = await supabase.from('sources').select('id').limit(1)
    sourceId = anyRows?.[0]?.id
  }

  if (!sourceId) {
    // Se ainda nao houver fonte, carrega do snapshot local
    return loadGraphFromSnapshot()
  }

  const [nodes, edges] = await Promise.all([
    fetchAllNodes(sourceId),
    fetchAllEdges(sourceId),
  ])
  return buildGraph(nodes, edges)
}

export async function loadGraphFromSnapshot(): Promise<MultiDirectedGraph> {
  const res = await fetch('/graph-snapshot.json')
  if (!res.ok) throw new Error('graph-snapshot.json not found — run: npm run snapshot')
  const snap: GraphSnapshot = await res.json()
  return buildGraph(snap.nodes, snap.edges)
}

export async function loadGraph(): Promise<MultiDirectedGraph> {
  const offline = import.meta.env.VITE_OFFLINE === 'true'
  return offline ? loadGraphFromSnapshot() : loadGraphFromSupabase()
}
