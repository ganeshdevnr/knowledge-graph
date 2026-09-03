import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { RightPanel } from './components/RightPanel.jsx'
import { Universe } from './components/Universe.jsx'
import { loadUniverse, saveUniverse } from './storage.js'

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`
}

function createMainPlanet(name = 'Origin System', x = window.innerWidth / 2, y = window.innerHeight / 2) {
  return {
    id: createId('main'),
    type: 'main',
    name,
    notes: '',
    tags: ['system'],
    createdAt: new Date().toISOString(),
    x,
    y,
    systemIndex: 0,
  }
}

function initialUniverse() {
  return {
    nodes: [createMainPlanet()],
    edges: [],
  }
}

function normalizeMembership(nodes) {
  return nodes.map((node) => {
    if (node.type === 'main') return { ...node, notes: node.notes ?? '' }
    const { systemId: legacySystemId, ...rest } = node
    return { ...rest, notes: node.notes ?? '', lastVisited: node.lastVisited ?? node.createdAt, solarSystemId: node.solarSystemId ?? legacySystemId ?? null }
  })
}

function reachableSubPlanets(startId, edges) {
  const seen = new Set([startId])
  const queue = [startId]

  while (queue.length > 0) {
    const current = queue.shift()
    for (const edge of edges) {
      const next = edge.source === current ? edge.target : edge.target === current ? edge.source : null
      if (next && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }

  return seen
}

function App() {
  const [nodes, setNodes] = useState(() => normalizeMembership(loadUniverse()?.nodes ?? initialUniverse().nodes))
  const [edges, setEdges] = useState(() => loadUniverse()?.edges ?? [])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [activeMainId, setActiveMainId] = useState(null)
  const [connectSourceId, setConnectSourceId] = useState(null)
  const [viewportCenter, setViewportCenter] = useState(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))
  const [rearrangeRequest, setRearrangeRequest] = useState(null)

  useEffect(() => {
    saveUniverse({ nodes, edges })
  }, [nodes, edges])

  useEffect(() => {
    if (!connectSourceId) return
    function handleEscape(event) {
      if (event.key === 'Escape') setConnectSourceId(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [connectSourceId])

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const connectSource = nodes.find((node) => node.id === connectSourceId) ?? null

  const highlightIds = useMemo(() => {
    if (activeMainId) {
      return new Set(nodes.filter((node) => node.id === activeMainId || node.solarSystemId === activeMainId).map((node) => node.id))
    }

    if (selectedNode?.type === 'sub') return reachableSubPlanets(selectedNode.id, edges)
    if (selectedNode?.type === 'main') {
      return new Set(nodes.filter((node) => node.id === selectedNode.id || node.solarSystemId === selectedNode.id).map((node) => node.id))
    }

    return null
  }, [activeMainId, edges, nodes, selectedNode])

  const updateNodesFromSimulation = useCallback((nextNodes) => {
    setNodes((current) => {
      const byId = new Map(nextNodes.map((node) => [node.id, node]))
      return current.map((node) => {
        const next = byId.get(node.id)
        if (!next) return node
        return { ...node, x: next.x, y: next.y, solarSystemId: next.solarSystemId ?? node.solarSystemId ?? null }
      })
    })
  }, [])

  function addMainPlanet() {
    setSelectedNodeId(null)
    setActiveMainId(null)
    setConnectSourceId(null)
    setNodes((current) => {
      const systemIndex = current.filter((node) => node.type === 'main').length
      const nextSystemNumber = current.reduce((max, node) => {
        const match = node.type === 'main' ? /^Solar System (\d+)$/.exec(node.name) : null
        return match ? Math.max(max, Number(match[1])) : max
      }, 0) + 1
      const main = {
        ...createMainPlanet(`Solar System ${nextSystemNumber}`, viewportCenter.x, viewportCenter.y),
        systemIndex,
      }
      return [...current, main]
    })
  }

  function addSubPlanet(name, mainPlanetId) {
    const createdAt = new Date().toISOString()
    const subPlanet = {
      id: createId('sub'),
      type: 'sub',
      name,
      notes: '',
      tags: [],
      createdAt,
      lastVisited: createdAt,
      x: viewportCenter.x,
      y: viewportCenter.y,
      solarSystemId: mainPlanetId ?? null,
    }

    setNodes((current) => [...current, subPlanet])
  }

  function selectNode(node) {
    if (node.type === 'main') {
      setSelectedNodeId(node.id)
      setActiveMainId(node.id)
      return
    }

    setActiveMainId(null)
    if (selectedNodeId !== node.id) {
      setNodes((current) => current.map((candidate) => (candidate.id === node.id ? { ...candidate, lastVisited: new Date().toISOString() } : candidate)))
    }
    setSelectedNodeId((current) => (current === node.id ? null : node.id))
  }

  function clearSelection() {
    setSelectedNodeId(null)
    setActiveMainId(null)
    setConnectSourceId(null)
  }

  function toggleConnection(sourceId, targetId) {
    setEdges((current) => {
      const existing = current.find(
        (edge) =>
          (edge.source === sourceId && edge.target === targetId) ||
          (edge.source === targetId && edge.target === sourceId),
      )
      if (existing) return current.filter((edge) => edge.id !== existing.id)
      return [...current, { id: createId('edge'), source: sourceId, target: targetId }]
    })
    setConnectSourceId(null)
  }

  function disconnectAll(nodeId) {
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
  }

  function deleteNode(nodeId) {
    setSelectedNodeId((current) => (current === nodeId ? null : current))
    setActiveMainId((current) => (current === nodeId ? null : current))
    setConnectSourceId((current) => (current === nodeId ? null : current))
    setNodes((current) => current.filter((node) => node.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
  }

  function deleteSolarSystem(mainPlanetId) {
    const idsToDelete = new Set(nodes.filter((node) => node.id === mainPlanetId || node.solarSystemId === mainPlanetId).map((node) => node.id))
    setSelectedNodeId(null)
    setActiveMainId(null)
    setConnectSourceId((current) => (idsToDelete.has(current) ? null : current))
    setNodes((current) => current.filter((node) => !idsToDelete.has(node.id)))
    setEdges((current) => current.filter((edge) => !idsToDelete.has(edge.source) && !idsToDelete.has(edge.target)))
  }

  function updateNode(nodeId, updates) {
    setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, ...updates } : node)))
  }

  return (
    <main className="app-shell">
      <button
        className="menu-toggle"
        type="button"
        aria-label="Create new solar system"
        onClick={addMainPlanet}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
          <path d="M12 2.5l1.35 6.7 6.15 2.8-6.15 2.8L12 21.5l-1.35-6.7L4.5 12l6.15-2.8L12 2.5Z" />
          <circle cx="12" cy="12" r="2.15" />
        </svg>
      </button>
      <Universe
        connectSourceId={connectSourceId}
        edges={edges}
        highlightIds={connectSourceId ? null : highlightIds}
        nodes={nodes}
        rearrangeRequest={rearrangeRequest}
        selectedNodeId={selectedNodeId}
        onClearSelection={clearSelection}
        onConnectTarget={(node) => toggleConnection(connectSourceId, node.id)}
        onDeleteEdge={(edgeId) => setEdges((current) => current.filter((edge) => edge.id !== edgeId))}
        onDeleteNode={deleteNode}
        onNodePositionChange={updateNodesFromSimulation}
        onSelectNode={selectNode}
        onViewportCenterChange={setViewportCenter}
      />
      <RightPanel
        connectionCount={selectedNode ? edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).length : 0}
        isConnecting={connectSourceId !== null && connectSourceId === selectedNodeId}
        node={selectedNode}
        nodes={nodes}
        onAddSubPlanet={addSubPlanet}
        onClose={clearSelection}
        onDisconnectAll={() => disconnectAll(selectedNodeId)}
        onDeleteNode={deleteNode}
        onDeleteSolarSystem={deleteSolarSystem}
        onRearrange={(mainPlanetId) => setRearrangeRequest({ id: createId('rearrange'), mainPlanetId })}
        onToggleConnect={() => setConnectSourceId((current) => (current === selectedNodeId ? null : selectedNodeId))}
        onUpdateNode={updateNode}
      />
      {connectSource ? (
        <div className="connect-mode-indicator" role="status">
          Connect mode — linking from “{connectSource.name}”. Click a planet to connect or disconnect, Esc to cancel.
        </div>
      ) : null}
    </main>
  )
}

export default App
