export interface RawNode {
  id: string
  external_id: string
  node_type: string
  name: string
  name_en: string | null
  parent_external_id: string | null
  description: string | null
  source_node_roles: Array<{ role: string | null; position_type: string | null }> | null
  position_dominance: Array<{ score: number }> | null
}

export interface RawEdge {
  id: string
  src_node_id: string
  dst_node_id: string
  edge_type: string
  role: string | null
  result_type: string | null
  attempt_pct: number | null
  success_rate: number | null
  is_submission: boolean
  label: string | null
}

export interface GraphSnapshot {
  nodes: RawNode[]
  edges: RawEdge[]
  generated_at: string
}

export interface NodeAttrs {
  name: string
  name_en: string | null
  external_id: string
  node_type: string
  parent_external_id: string | null
  role: string | null
  position_type: string | null
  dominance_score: number
  description: string | null
}

export interface EdgeAttrs {
  edge_type: string
  role: string | null
  result_type: string | null
  attempt_pct: number | null
  success_rate: number | null
  is_submission: boolean
  label: string | null
}
