import { useEffect, useMemo, useRef, useState } from 'react'
import { useForceSimulation } from '../hooks/useForceSimulation.js'
import { EdgeLayer } from './EdgeLayer.jsx'
import { NodeLayer } from './NodeLayer.jsx'
import { SolarSystemBoundary } from './SolarSystemBoundary.jsx'
import { getDecayState } from '../planetDecay.js'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const FOCUS_MAX_ZOOM = 1.5
const FOCUS_PADDING = 90
const FOCUS_DURATION = 420
const INITIAL_FIT_PADDING = 120
const RESET_DURATION = 400
const TOOLTIP_OFFSET = 16
const TOOLTIP_WIDTH = 220
const TOOLTIP_HEIGHT = 58
const DECAY_REFRESH_MS = 60 * 1000

function randomStars(count, width, height) {
  return Array.from({ length: count }, (_, index) => {
    const glow = index < 15
    const tier = Math.random()
    const large = glow || tier > 0.95
    const medium = tier > 0.7 && !large

    return {
      id: index,
      x: Math.random() * width,
      y: Math.random() * height,
      r: large ? 2 + Math.random() * 0.5 : medium ? 1 + Math.random() * 0.8 : 0.5 + Math.random() * 0.5,
      opacity: 0.3 + Math.random() * 0.7,
      glow,
    }
  })
}

function clientToSvg(event, svg) {
  const rect = svg.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * svg.clientWidth,
    y: ((event.clientY - rect.top) / rect.height) * svg.clientHeight,
  }
}

function clientToWorld(event, svg, transform) {
  const point = clientToSvg(event, svg)
  return {
    x: (point.x - transform.x) / transform.k,
    y: (point.y - transform.y) / transform.k,
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function centerTransformForNodes(nodes, width, height) {
  if (nodes.length === 0) return { x: 0, y: 0, k: 1 }

  const minX = Math.min(...nodes.map((node) => node.x ?? 0)) - INITIAL_FIT_PADDING
  const maxX = Math.max(...nodes.map((node) => node.x ?? 0)) + INITIAL_FIT_PADDING
  const minY = Math.min(...nodes.map((node) => node.y ?? 0)) - INITIAL_FIT_PADDING
  const maxY = Math.max(...nodes.map((node) => node.y ?? 0)) + INITIAL_FIT_PADDING
  const boundingBoxWidth = Math.max(1, maxX - minX)
  const boundingBoxHeight = Math.max(1, maxY - minY)
  const scale = Math.max(MIN_ZOOM, Math.min(1, Math.min(width / boundingBoxWidth, height / boundingBoxHeight)))

  return {
    x: (width - boundingBoxWidth * scale) / 2 - minX * scale,
    y: (height - boundingBoxHeight * scale) / 2 - minY * scale,
    k: scale,
  }
}

function hitRadiusForNode(node) {
  return node.type === 'main' ? 24 : 10
}

function formatLastVisited(lastVisited) {
  if (!lastVisited) return 'Never visited'

  const elapsedMinutes = Math.floor((Date.now() - new Date(lastVisited).getTime()) / 60000)
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0) return 'Never visited'
  if (elapsedMinutes < 60) return `${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'} ago`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours} hour${elapsedHours === 1 ? '' : 's'} ago`

  const elapsedDays = Math.floor(elapsedHours / 24)
  return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`
}

function decayTooltipForNode(node, now) {
  if (node.type !== 'sub') return null

  const state = getDecayState(node.lastVisited, now)
  if (state === 'fading') return { label: 'Fading', className: 'node-tooltip-decay--fading' }
  if (state === 'critical') return { label: 'Critical', className: 'node-tooltip-decay--critical' }
  if (state === 'dead') return { label: 'Needs attention', className: 'node-tooltip-decay--dead' }
  return null
}

function tooltipPositionForNode(node, transform, viewport) {
  const screenX = node.x * transform.k + transform.x
  const screenY = node.y * transform.k + transform.y
  const left = screenX + TOOLTIP_OFFSET + TOOLTIP_WIDTH > viewport.width
    ? screenX - TOOLTIP_OFFSET - TOOLTIP_WIDTH
    : screenX + TOOLTIP_OFFSET
  const top = screenY - TOOLTIP_OFFSET - TOOLTIP_HEIGHT < 0
    ? screenY + TOOLTIP_OFFSET
    : screenY - TOOLTIP_OFFSET - TOOLTIP_HEIGHT

  return { left, top }
}

export function Universe({
  connectSourceId,
  edges,
  highlightIds,
  nodes,
  rearrangeRequest,
  selectedNodeId,
  onClearSelection,
  onConnectTarget,
  onDeleteEdge,
  onDeleteNode,
  onNodePositionChange,
  onViewportCenterChange,
  onSelectNode,
}) {
  const svgRef = useRef(null)
  const panRef = useRef(null)
  const nodePointerRef = useRef(null)
  const animationRef = useRef(null)
  const resetViewRef = useRef(null)
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [transform, setTransform] = useState(() => centerTransformForNodes(nodes, window.innerWidth, window.innerHeight))
  const transformRef = useRef(transform)
  const [isPanning, setIsPanning] = useState(false)
  const [deleteEdgeId, setDeleteEdgeId] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [decayNow, setDecayNow] = useState(() => Date.now())
  const stars = useMemo(() => randomStars(520, window.innerWidth, window.innerHeight), [])
  const resetShortcutLabel = useMemo(() => (navigator.platform.includes('Mac') ? '⌘0' : 'Ctrl+0'), [])
  const simulation = useForceSimulation({ nodes, edges, rearrangeRequest, onNodePositionChange })

  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  useEffect(() => {
    onViewportCenterChange({
      x: (size.width / 2 - transform.x) / transform.k,
      y: (size.height / 2 - transform.y) / transform.k,
    })
  }, [onViewportCenterChange, size.height, size.width, transform])

  useEffect(() => () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
  }, [])

  useEffect(() => {
    function resize() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }

    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setDecayNow(Date.now()), DECAY_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [])

  const visibleNodes = simulation.nodes
  const renderedNodes = useMemo(() => {
    const latestById = new Map(nodes.map((node) => [node.id, node]))
    return visibleNodes.map((node) => {
      const latest = latestById.get(node.id)
      return latest ? { ...latest, x: node.x, y: node.y, solarSystemId: node.solarSystemId ?? latest.solarSystemId ?? null } : node
    })
  }, [nodes, visibleNodes])

  const connectLinkedIds = useMemo(() => {
    if (!connectSourceId) return null
    const linked = new Set()
    for (const edge of edges) {
      if (edge.source === connectSourceId) linked.add(edge.target)
      else if (edge.target === connectSourceId) linked.add(edge.source)
    }
    return linked
  }, [connectSourceId, edges])

  useEffect(() => {
    resetViewRef.current = resetView
  })

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key === '0') {
        event.preventDefault()
        resetViewRef.current?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function cancelFocusAnimation() {
    if (!animationRef.current) return
    cancelAnimationFrame(animationRef.current)
    animationRef.current = null
  }

  function animateToTransform(target, duration = FOCUS_DURATION) {
    cancelFocusAnimation()
    const start = transformRef.current
    const startedAt = performance.now()

    function step(now) {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = easeInOut(progress)
      const next = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        k: start.k + (target.k - start.k) * eased,
      }
      transformRef.current = next
      setTransform(next)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(step)
      } else {
        animationRef.current = null
      }
    }

    animationRef.current = requestAnimationFrame(step)
  }

  function resetView() {
    onClearSelection()
    if (visibleNodes.length === 0) return
    animateToTransform(centerTransformForNodes(visibleNodes, size.width, size.height), RESET_DURATION)
  }

  function focusSolarSystem(mainId) {
    const systemNodes = visibleNodes.filter((node) => node.id === mainId || node.solarSystemId === mainId)
    if (systemNodes.length === 0) return

    const minX = Math.min(...systemNodes.map((node) => node.x ?? 0)) - FOCUS_PADDING
    const maxX = Math.max(...systemNodes.map((node) => node.x ?? 0)) + FOCUS_PADDING
    const minY = Math.min(...systemNodes.map((node) => node.y ?? 0)) - FOCUS_PADDING
    const maxY = Math.max(...systemNodes.map((node) => node.y ?? 0)) + FOCUS_PADDING
    const boxWidth = Math.max(1, maxX - minX)
    const boxHeight = Math.max(1, maxY - minY)
    const scale = Math.min(FOCUS_MAX_ZOOM, MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(size.width / boxWidth, size.height / boxHeight)))
    const centerX = minX + boxWidth / 2
    const centerY = minY + boxHeight / 2

    animateToTransform({
      x: size.width / 2 - centerX * scale,
      y: size.height / 2 - centerY * scale,
      k: scale,
    })
  }

  function handleSelectNode(node) {
    if (connectSourceId) {
      if (node.id !== connectSourceId) onConnectTarget(node)
      return
    }
    onSelectNode(node)
    if (node.type === 'main') focusSolarSystem(node.id)
  }

  function handleNodeMouseEnter(node) {
    if (connectSourceId || nodePointerRef.current?.isDragging) return
    setHoveredNodeId(node.id)
  }

  function handleNodeMouseLeave() {
    setHoveredNodeId(null)
  }

  function handleWheel(event) {
    event.preventDefault()
    cancelFocusAnimation()
    const svg = svgRef.current
    if (!svg) return

    const pointer = clientToSvg(event, svg)
    const world = clientToWorld(event, svg, transform)
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, transform.k * (event.deltaY > 0 ? 0.88 : 1.14)))

    setTransform({
      x: pointer.x - world.x * nextZoom,
      y: pointer.y - world.y * nextZoom,
      k: nextZoom,
    })
  }

  function findNodeAtPoint(point) {
    const hits = visibleNodes
      .map((node) => ({ node, distance: Math.hypot(point.x - (node.x ?? 0), point.y - (node.y ?? 0)) }))
      .filter(({ node, distance }) => distance <= hitRadiusForNode(node))

    const subPlanetHits = hits.filter(({ node }) => node.type === 'sub').sort((a, b) => a.distance - b.distance)
    if (subPlanetHits.length > 0) return subPlanetHits[0].node

    return hits.filter(({ node }) => node.type === 'main').sort((a, b) => a.distance - b.distance)[0]?.node ?? null
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return
    const svg = svgRef.current
    if (!svg) return

    const hitNode = findNodeAtPoint(clientToWorld(event, svg, transform))
    if (hitNode) {
      setContextMenu(null)
      nodePointerRef.current = {
        node: hitNode,
        clientX: event.clientX,
        clientY: event.clientY,
        canvasX: (event.clientX - transform.x) / transform.k,
        canvasY: (event.clientY - transform.y) / transform.k,
        isDragging: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    if (event.target !== svgRef.current && !event.target.classList.contains('space-bg')) return
    cancelFocusAnimation()
    setDeleteEdgeId(null)
    setContextMenu(null)
    panRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      transform,
      moved: false,
    }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleContextMenu(event) {
    const svg = svgRef.current
    if (!svg) return

    const hitNode = findNodeAtPoint(clientToWorld(event, svg, transform))
    if (!hitNode) return

    event.preventDefault()
    setContextMenu({ nodeId: hitNode.id, x: event.clientX, y: event.clientY })
  }

  function handlePointerMove(event) {
    if (nodePointerRef.current) {
      const candidate = nodePointerRef.current
      const distance = Math.hypot(event.clientX - candidate.clientX, event.clientY - candidate.clientY)
      if (!candidate.isDragging && distance > 4) {
        candidate.isDragging = true
        setHoveredNodeId(null)
        cancelFocusAnimation()
        simulation.startDrag(candidate.node.id)
      }
      if (candidate.isDragging && svgRef.current) simulation.dragTo(clientToWorld(event, svgRef.current, transform))
      return
    }

    if (panRef.current) {
      const distance = Math.hypot(event.clientX - panRef.current.clientX, event.clientY - panRef.current.clientY)
      if (distance > 4) panRef.current.moved = true
      setTransform({
        ...panRef.current.transform,
        x: panRef.current.transform.x + event.clientX - panRef.current.clientX,
        y: panRef.current.transform.y + event.clientY - panRef.current.clientY,
      })
      return
    }

  }

  function handlePointerUp(event) {
    if (nodePointerRef.current) {
      const candidate = nodePointerRef.current
      nodePointerRef.current = null
      if (candidate.isDragging) {
        simulation.endDrag()
      } else {
        handleSelectNode(candidate.node)
      }
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // Pointer capture may already be released after node context menus.
      }
      return
    }

    if (panRef.current && !panRef.current.moved) onClearSelection()
    panRef.current = null
    setIsPanning(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture may already be released after node context menus.
    }
  }

  const activeEdge = edges.find((edge) => edge.id === deleteEdgeId)
  const activeSource = visibleNodes.find((node) => node.id === activeEdge?.source)
  const activeTarget = visibleNodes.find((node) => node.id === activeEdge?.target)
  const hoveredSimulationNode = !connectSourceId ? visibleNodes.find((node) => node.id === hoveredNodeId && node.type === 'sub') : null
  const hoveredLatestNode = hoveredSimulationNode ? nodes.find((node) => node.id === hoveredSimulationNode.id) : null
  const hoveredNode = hoveredSimulationNode && hoveredLatestNode
    ? { ...hoveredLatestNode, x: hoveredSimulationNode.x, y: hoveredSimulationNode.y }
    : hoveredSimulationNode
  const tooltipPosition = hoveredNode ? tooltipPositionForNode(hoveredNode, transform, size) : null
  const tooltipDecay = hoveredNode ? decayTooltipForNode(hoveredNode, decayNow) : null

  return (
    <>
      <svg
        ref={svgRef}
        aria-label="Knowledge Universe"
        className={`universe${isPanning ? ' is-panning' : ''}${connectSourceId ? ' is-connecting' : ''}`}
        role="application"
        viewBox={`0 0 ${size.width} ${size.height}`}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
      <defs>
        <filter id="main-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="sub-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="sub-glow-fading" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="2.1" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="sub-glow-critical" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="1.05" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="sub-glow-dead" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="0.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="edge-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="star-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        {nodes.filter((node) => node.type === 'main').map((node) => (
          <radialGradient key={node.id} id={`boundary-${node.id}`}>
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="64%" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <rect className="space-bg" x="0" y="0" width={size.width} height={size.height} />
      <g className="stars" pointerEvents="none">
        {stars.map((star) => (
          <circle key={star.id} cx={star.x} cy={star.y} r={star.r} opacity={star.opacity} filter={star.glow ? 'url(#star-glow)' : undefined} />
        ))}
      </g>
        <g className="universe-content" transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          <SolarSystemBoundary nodes={visibleNodes} highlightIds={highlightIds} />
          <EdgeLayer
            edges={edges}
            highlightIds={highlightIds}
            nodes={renderedNodes}
            onSelectEdge={setDeleteEdgeId}
          />
          <NodeLayer
            connectLinkedIds={connectLinkedIds}
            connectSourceId={connectSourceId}
            decayNow={decayNow}
            highlightIds={highlightIds}
            nodes={visibleNodes}
            selectedNodeId={selectedNodeId}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
          />
          {activeSource && activeTarget ? (
            <g className="edge-delete" transform={`translate(${(activeSource.x + activeTarget.x) / 2} ${(activeSource.y + activeTarget.y) / 2})`}>
              <circle r="13" />
              <text textAnchor="middle" dominantBaseline="central" onClick={() => onDeleteEdge(deleteEdgeId)}>×</text>
            </g>
          ) : null}
        </g>
      </svg>
      {contextMenu ? (
        <div className="node-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => {
              onDeleteNode(contextMenu.nodeId)
              setContextMenu(null)
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
      {hoveredNode && tooltipPosition ? (
        <div className="node-tooltip" style={{ left: tooltipPosition.left, top: tooltipPosition.top }}>
          <strong>{hoveredNode.name}</strong>
          <span>{formatLastVisited(hoveredNode.lastVisited)}</span>
          {tooltipDecay ? <span className={`node-tooltip-decay ${tooltipDecay.className}`}>{tooltipDecay.label}</span> : null}
        </div>
      ) : null}
      <button className="reset-view-button" type="button" title={`Reset view (${resetShortcutLabel})`} aria-label={`Reset view (${resetShortcutLabel})`} onClick={resetView}>
        ⊞
      </button>
    </>
  )
}
