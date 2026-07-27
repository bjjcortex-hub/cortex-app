import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'

cytoscape.use(fcose as cytoscape.Ext)

// ── colors ────────────────────────────────────────────────────────────────────

const dark = window.matchMedia('(prefers-color-scheme: dark)').matches

const C = dark
  ? {
      canvasBg: '#0d1117',
      cardBg: '#161b22',
      positionStroke: '#0F6E56', positionText: '#9FE1CB',
      submissionStroke: '#993C1D', submissionText: '#F5C4B3',
      transitionFill: '#1e2733', transitionStroke: '#475569', transitionText: '#94a3b8',
      systemFill: '#1e1a3b', systemStroke: '#7c3aed', systemText: '#c4b5fd',
      principleFill: '#1a2e1a', principleStroke: '#b45309', principleText: '#fcd34d',
      groupContainerBg: 'rgba(30,39,51,0.65)',
      edgeActive: '#6b7280', edgeLatent: '#d97706',
      edgeSubmission: '#7f1d1d', edgeSystem: '#7c3aed',
      highlight: '#7F77DD', highlightText: '#fff',
      pillBg: '#1e293b', pillText: '#94a3b8',
      closeBg: 'rgba(30,39,51,0.92)', closeColor: '#94a3b8',
    }
  : {
      canvasBg: '#f8fafc',
      cardBg: '#ffffff',
      positionStroke: '#0F6E56', positionText: '#085041',
      submissionStroke: '#993C1D', submissionText: '#712B13',
      transitionFill: '#F1F5F9', transitionStroke: '#94a3b8', transitionText: '#475569',
      systemFill: '#f5f3ff', systemStroke: '#7c3aed', systemText: '#5b21b6',
      principleFill: '#fffbeb', principleStroke: '#b45309', principleText: '#92400e',
      groupContainerBg: 'rgba(248,250,252,0.75)',
      edgeActive: '#94a3b8', edgeLatent: '#d97706',
      edgeSubmission: '#ef4444', edgeSystem: '#7c3aed',
      highlight: '#7F77DD', highlightText: '#fff',
      pillBg: '#e2e8f0', pillText: '#475569',
      closeBg: 'rgba(241,245,249,0.92)', closeColor: '#64748b',
    }

function buildStyle(): cytoscape.StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'center', 'text-halign': 'center',
        'font-size': 12, 'text-wrap': 'wrap', 'text-max-width': '144px',
        shape: 'round-rectangle',
        'border-width': 2,
        'transition-property': 'background-color, border-color, border-width',
        'transition-duration': 150,
      },
    },
    {
      selector: 'node[nodeType = "position"]',
      style: {
        width: 160, height: 50,
        'background-color': C.cardBg, 'border-color': C.positionStroke,
        color: C.positionText, 'font-weight': 600,
      },
    },
    {
      selector: 'node[nodeType = "submission"]',
      style: {
        width: 160, height: 50,
        'background-color': C.cardBg, 'border-color': C.submissionStroke,
        color: C.submissionText, 'font-weight': 600,
      },
    },
    {
      selector: 'node[nodeType = "transition"]',
      style: {
        width: 130, height: 38,
        'background-color': C.transitionFill, 'border-color': C.transitionStroke,
        color: C.transitionText, 'font-size': 11, 'text-max-width': '118px',
        'border-width': 1.5,
      },
    },
    {
      selector: 'node[nodeType = "system"]',
      style: {
        shape: 'hexagon', width: 180, height: 56,
        'background-color': C.systemFill, 'border-color': C.systemStroke, 'border-width': 2,
        color: C.systemText, 'font-weight': 700, 'font-size': 12, 'text-max-width': '162px',
      },
    },
    {
      selector: 'node[nodeType = "principle"]',
      style: {
        shape: 'diamond', width: 160, height: 48,
        'background-color': C.principleFill, 'border-color': C.principleStroke, 'border-width': 2,
        color: C.principleText, 'font-size': 11, 'text-max-width': '140px',
      },
    },
    // Expanded group container — parent frame
    {
      selector: 'node.group-parent',
      style: {
        shape: 'round-rectangle',
        'background-color': C.groupContainerBg,
        'border-color': C.positionStroke,
        'border-style': 'dashed',
        'border-width': 1.5,
        'text-valign': 'top',
        'text-margin-y': -8,
        'font-weight': 600,
        'font-size': 12,
        color: C.positionText,
        padding: '36px',
      },
    },
    // Collapsed group — single card representing parent + children
    {
      selector: 'node.group-collapsed',
      style: {
        'border-width': 3,
        width: 180, height: 60,
        'font-weight': 700,
      },
    },
    {
      selector: 'node.highlighted',
      style: {
        'border-color': C.highlight, 'border-width': 2.5,
        'background-color': C.highlight, color: C.highlightText,
      },
    },
    {
      selector: 'node:selected',
      style: { 'border-width': 2.5, 'border-color': C.highlight },
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier', 'control-point-step-size': 40,
        'target-arrow-shape': 'triangle', width: 1.2,
        'font-size': 10, color: C.pillText,
        'text-background-color': C.pillBg, 'text-background-opacity': 1,
        'text-background-padding': '3px', 'text-rotation': 'autorotate',
        'transition-property': 'line-color, target-arrow-color, line-style, opacity',
        'transition-duration': 180,
      },
    },
    {
      selector: 'edge.active',
      style: {
        'line-color': C.edgeActive, 'target-arrow-color': C.edgeActive,
        'line-style': 'solid', label: 'data(edgeLabel)', opacity: 1,
      },
    },
    {
      selector: 'edge.active[isSubmission = 1]',
      style: { 'line-color': C.edgeSubmission, 'target-arrow-color': C.edgeSubmission },
    },
    {
      selector: 'edge.active[edgeType = "part_of_system"]',
      style: {
        'line-color': C.edgeSystem, 'target-arrow-color': C.edgeSystem,
        'line-style': 'dotted', width: 1,
      },
    },
    {
      selector: 'edge.latent',
      style: {
        'line-color': C.edgeLatent, 'target-arrow-color': C.edgeLatent,
        'line-style': 'dashed', 'line-dash-pattern': [6, 4],
        opacity: 0.55, label: '',
      },
    },
    {
      selector: 'edge.highlighted',
      style: {
        'line-color': C.highlight, 'target-arrow-color': C.highlight,
        opacity: 1, width: 2,
      },
    },
    {
      selector: 'edge.flat-edge',
      style: {
        label: 'data(edgeLabel)',
        'text-rotation': 'none',
        'font-size': 9,
        'text-wrap': 'wrap',
        'text-max-width': '90px',
        'text-background-padding': '4px',
        'curve-style': 'unbundled-bezier',
        'control-point-distances': [60],
        'control-point-weights': [0.5],
      },
    },
    {
      selector: 'edge.flat-edge.latent',
      style: { opacity: 0.45 },
    },
    { selector: 'node.faded', style: { opacity: 0.2 } },
    { selector: 'edge.faded', style: { opacity: 0.08 } },
  ]
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface CyNodeDef {
  id: string; label: string; nodeType: string; x: number; y: number; locked: boolean
  parentId?: string
  isGroupParent?: boolean
  isGroupCollapsed?: boolean
  hasChildren?: boolean
}
export interface CyEdgeDef {
  id: string; source: string; target: string
  state: 'active' | 'latent'; edgeLabel: string; isSubmission: boolean
  edgeType?: string
}
export interface GraphCanvasHandle {
  fitToNode: (nodeId: string) => void
  fitAll: () => void
}

interface Props {
  nodes: CyNodeDef[]
  edges: CyEdgeDef[]
  selectedNodeId: string | null
  highlightedNodeId: string | null
  highlightedEdgeId: string | null
  rootNodeId: string | null
  fadedNodeIds?: Set<string>
  onNodeClick: (id: string) => void
  onNodeDblClick?: (id: string) => void
  onGroupToggle?: (id: string) => void
  onEdgeClick: (id: string) => void
  onNodeDragEnd: (id: string, pos: { x: number; y: number }) => void
  onHideNode: (id: string) => void
  onNodeRightClick: (id: string, x: number, y: number) => void
  onBgClick: () => void
}

// ── component ─────────────────────────────────────────────────────────────────

const GraphCanvas = forwardRef<GraphCanvasHandle, Props>(function GraphCanvas(
  {
    nodes, edges, selectedNodeId, highlightedNodeId, highlightedEdgeId,
    rootNodeId, fadedNodeIds, onNodeClick, onNodeDblClick, onGroupToggle, onEdgeClick,
    onNodeDragEnd, onHideNode, onNodeRightClick, onBgClick,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const didDragRef = useRef(false)

  const [hoverBtn, setHoverBtn] = useState<{ id: string; px: number; py: number } | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep latest callbacks in refs so init useEffect doesn't stale-close over them
  const onNodeDblClickRef = useRef(onNodeDblClick)
  const onGroupToggleRef = useRef(onGroupToggle)
  useEffect(() => { onNodeDblClickRef.current = onNodeDblClick }, [onNodeDblClick])
  useEffect(() => { onGroupToggleRef.current = onGroupToggle }, [onGroupToggle])

  useImperativeHandle(ref, () => ({
    fitToNode: (nodeId: string) => {
      const cy = cyRef.current
      if (!cy || !cy.hasElementWithId(nodeId)) return
      cy.animate(
        { fit: { eles: cy.$id(nodeId).union(cy.elements(':selected')), padding: 120 } } as Parameters<cytoscape.Core['animate']>[0],
        { duration: 350 },
      )
    },
    fitAll: () => {
      const cy = cyRef.current
      if (!cy) return
      cy.animate({ fit: { eles: cy.elements(), padding: 60 } } as Parameters<cytoscape.Core['animate']>[0], { duration: 300 })
    },
  }))

  // Init cytoscape once
  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: buildStyle(),
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: 0.1,
      maxZoom: 4,
      boxSelectionEnabled: false,
    })

    cy.on('mousedown', 'node', () => { didDragRef.current = false })
    cy.on('mousemove', 'node', () => { didDragRef.current = true })

    cy.on('tap', 'node', (e) => {
      if (!didDragRef.current) onNodeClick(e.target.id())
    })
    cy.on('dbltap', 'node', (e) => {
      const id = e.target.id()
      onNodeDblClickRef.current?.(id)
      // Also trigger group toggle on double-click if node has children
      if (e.target.data('hasChildren')) onGroupToggleRef.current?.(id)
    })
    cy.on('tap', 'edge', (e) => onEdgeClick(e.target.id()))
    cy.on('tap', (e) => { if (e.target === cy) onBgClick() })

    cy.on('cxttap', 'node', (e) => {
      const oe = e.originalEvent as MouseEvent
      oe?.preventDefault?.()
      onNodeRightClick(e.target.id(), oe.clientX, oe.clientY)
    })

    cy.on('dragfreeon', 'node', (e) => {
      const pos = e.target.position()
      onNodeDragEnd(e.target.id(), { x: pos.x, y: pos.y })
    })

    cy.on('mouseover', 'node', (e) => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      const rp = e.target.renderedPosition()
      setHoverBtn({ id: e.target.id(), px: rp.x, py: rp.y })
    })
    cy.on('mouseout', 'node', () => {
      hoverTimerRef.current = setTimeout(() => setHoverBtn(null), 180)
    })
    cy.on('viewport', () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      setHoverBtn(null)
    })

    cyRef.current = cy
    return () => { cy.destroy(); cyRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync elements — two-pass so compound parents always exist before children
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    const existingNodeIds = new Set(cy.nodes().map((n) => n.id()))
    const existingEdgeIds = new Set(cy.edges().map((e) => e.id()))
    const newNodeIds = new Set(nodes.map((n) => n.id))
    const newEdgeIds = new Set(edges.map((e) => e.id))

    cy.nodes().forEach((n) => { if (!newNodeIds.has(n.id())) n.remove() })
    cy.edges().forEach((e) => { if (!newEdgeIds.has(e.id())) e.remove() })

    // First pass: non-children (standalone nodes + group parents)
    const nonChildren = nodes.filter((n) => !n.parentId)
    const children = nodes.filter((n) => !!n.parentId)

    for (const n of nonChildren) {
      if (existingNodeIds.has(n.id)) {
        cy.$id(n.id).data('label', n.label)
        cy.$id(n.id).data('nodeType', n.nodeType)
        cy.$id(n.id).data('hasChildren', n.hasChildren ?? false)
      } else {
        cy.add({
          group: 'nodes',
          data: { id: n.id, label: n.label, nodeType: n.nodeType, hasChildren: n.hasChildren ?? false },
          position: { x: n.x, y: n.y },
        })
      }
      const node = cy.$id(n.id)
      node.toggleClass('group-parent', !!n.isGroupParent)
      node.toggleClass('group-collapsed', !!n.isGroupCollapsed)
      if (!n.locked && existingNodeIds.has(n.id)) {
        const cur = node.position()
        if (Math.abs(cur.x - n.x) > 2 || Math.abs(cur.y - n.y) > 2) {
          node.position({ x: n.x, y: n.y })
        }
      }
    }

    // Second pass: children of compound parents
    for (const n of children) {
      if (existingNodeIds.has(n.id)) {
        cy.$id(n.id).data('label', n.label)
        cy.$id(n.id).data('nodeType', n.nodeType)
      } else {
        cy.add({
          group: 'nodes',
          data: { id: n.id, label: n.label, nodeType: n.nodeType, parent: n.parentId },
          position: { x: n.x, y: n.y },
        })
      }
      const node = cy.$id(n.id)
      node.removeClass('group-parent group-collapsed')
      if (!n.locked && existingNodeIds.has(n.id)) {
        const cur = node.position()
        if (Math.abs(cur.x - n.x) > 2 || Math.abs(cur.y - n.y) > 2) {
          node.position({ x: n.x, y: n.y })
        }
      }
    }

    edges.forEach((e) => {
      const isFlat = e.id.startsWith('flat:')
      if (existingEdgeIds.has(e.id)) {
        const el = cy.$id(e.id)
        el.data('edgeLabel', e.edgeLabel)
        el.data('isSubmission', e.isSubmission ? 1 : 0)
        el.data('edgeType', e.edgeType ?? '')
        el.removeClass('active latent flat-edge').addClass(e.state)
        if (isFlat) el.addClass('flat-edge')
      } else {
        const added = cy.add({
          group: 'edges',
          data: {
            id: e.id, source: e.source, target: e.target,
            edgeLabel: e.edgeLabel, isSubmission: e.isSubmission ? 1 : 0,
            edgeType: e.edgeType ?? '',
          },
        })
        added.addClass(e.state)
        if (isFlat) added.addClass('flat-edge')
      }
    })
  }, [nodes, edges])

  // Highlights
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().removeClass('highlighted')
    cy.edges().removeClass('highlighted')
    if (highlightedNodeId && cy.hasElementWithId(highlightedNodeId))
      cy.$id(highlightedNodeId).addClass('highlighted')
    if (highlightedEdgeId && cy.hasElementWithId(highlightedEdgeId))
      cy.$id(highlightedEdgeId).addClass('highlighted')
  }, [highlightedNodeId, highlightedEdgeId])

  // Selection
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().unselect()
    if (selectedNodeId && cy.hasElementWithId(selectedNodeId))
      cy.$id(selectedNodeId).select()
  }, [selectedNodeId])

  // Faded nodes/edges
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().removeClass('faded')
    cy.edges().removeClass('faded')
    fadedNodeIds?.forEach((id) => {
      if (!cy.hasElementWithId(id)) return
      cy.$id(id).addClass('faded')
      cy.$id(id).connectedEdges().addClass('faded')
    })
  }, [fadedNodeIds])

  function handleHideBtnClick() {
    if (!hoverBtn) return
    setHoverBtn(null)
    onHideNode(hoverBtn.id)
  }

  function handleGroupBtnClick() {
    if (!hoverBtn) return
    onGroupToggleRef.current?.(hoverBtn.id)
  }

  const isRoot = hoverBtn?.id === rootNodeId
  const hoverCy = hoverBtn && cyRef.current ? cyRef.current.$id(hoverBtn.id) : null
  const hoverHasChildren = !!(hoverCy?.data('hasChildren'))
  const hoverIsGroupCollapsed = !!(hoverCy?.hasClass('group-collapsed'))
  const hoverIsGroupParent = !!(hoverCy?.hasClass('group-parent'))
  const showGroupBtn = onGroupToggle && (hoverHasChildren || hoverIsGroupCollapsed || hoverIsGroupParent)
  const groupBtnLabel = hoverIsGroupParent ? '⊖' : '⊕'
  const groupBtnTitle = hoverIsGroupParent ? 'Recolher grupo' : 'Expandir como grupo'

  const btnBase: React.CSSProperties = {
    position: 'absolute',
    top: hoverBtn ? hoverBtn.py - 26 : 0,
    background: C.closeBg,
    border: `0.5px solid ${dark ? '#334155' : '#cbd5e1'}`,
    color: C.closeColor,
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 11,
    cursor: 'pointer',
    pointerEvents: 'all',
    zIndex: 10,
    lineHeight: '18px',
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: C.canvasBg }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {hoverBtn && (
        <div
          onMouseEnter={() => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current) }}
          onMouseLeave={() => setHoverBtn(null)}
          style={{ position: 'absolute', top: hoverBtn.py - 26, left: hoverBtn.px + 52, display: 'flex', gap: 4, zIndex: 10 }}
        >
          {showGroupBtn && (
            <button
              onClick={handleGroupBtnClick}
              title={groupBtnTitle}
              style={{ ...btnBase, position: 'static', color: hoverIsGroupParent ? C.edgeLatent : C.positionText }}
            >
              {groupBtnLabel}
            </button>
          )}
          {!isRoot && (
            <button onClick={handleHideBtnClick} title="Ocultar" style={{ ...btnBase, position: 'static' }}>
              ×
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 60 } } as Parameters<cytoscape.Core['animate']>[0], { duration: 300 })}
        style={{
          position: 'absolute', bottom: 12, right: 12,
          background: dark ? '#1e293b' : '#e2e8f0',
          border: `0.5px solid ${dark ? '#334155' : '#cbd5e1'}`,
          color: dark ? '#94a3b8' : '#475569',
          borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
        }}
      >
        Encaixar
      </button>
    </div>
  )
})

export default GraphCanvas
