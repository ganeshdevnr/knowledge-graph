import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { RightPanel } from './components/RightPanel.jsx'
import { UniverseMenu } from './components/UniverseMenu.jsx'
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
    if (node.type === 'main') return node
    const { systemId: legacySystemId, ...rest } = node
    return { ...rest, solarSystemId: node.solarSystemId ?? legacySystemId ?? null }
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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [viewportCenter, setViewportCenter] = useState(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))
  const [rearrangeRequest, setRearrangeRequest] = useState(null)

  useEffect(() => {
    saveUniverse({ nodes, edges })
  }, [nodes, edges])

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null

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
    setNodes((current) => {
      const systemIndex = current.filter((node) => node.type === 'main').length
      const main = {
        ...createMainPlanet(`Solar System ${systemIndex + 1}`, Math.random() * window.innerWidth, Math.random() * window.innerHeight),
        systemIndex,
      }
      return [...current, main]
    })
  }

  function addSubPlanet(name) {
    const subPlanet = {
      id: createId('sub'),
      type: 'sub',
      name,
      tags: [],
      createdAt: new Date().toISOString(),
      x: viewportCenter.x,
      y: viewportCenter.y,
      solarSystemId: null,
    }

    setNodes((current) => [...current, subPlanet])
    setSelectedNodeId(subPlanet.id)
    setActiveMainId(null)
  }

  function selectNode(node) {
    if (node.type === 'main') {
      setSelectedNodeId(node.id)
      setActiveMainId(node.id)
      return
    }

    setActiveMainId(null)
    setSelectedNodeId((current) => {
      if (current === node.id) return null
      const selected = nodes.find((candidate) => candidate.id === current)
      if (selected?.type === 'sub') {
        const alreadyExists = edges.some(
          (edge) =>
            (edge.source === selected.id && edge.target === node.id) ||
            (edge.source === node.id && edge.target === selected.id),
        )
        if (!alreadyExists) {
          setEdges((currentEdges) => [...currentEdges, { id: createId('edge'), source: selected.id, target: node.id }])
        }
      }
      return node.id
    })
  }

  function clearSelection() {
    setSelectedNodeId(null)
    setActiveMainId(null)
    setIsMenuOpen(false)
  }

  function deleteNode(nodeId) {
    setSelectedNodeId((current) => (current === nodeId ? null : current))
    setActiveMainId((current) => (current === nodeId ? null : current))
    setNodes((current) => current.filter((node) => node.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
  }

  function updateNode(nodeId, updates) {
    setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, ...updates } : node)))
  }

  return (
    <main className="app-shell">
      <button
        className="menu-toggle"
        type="button"
        aria-label="Toggle universe menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((current) => !current)}
      >
        ✦
      </button>
      <Universe
        edges={edges}
        highlightIds={highlightIds}
        nodes={nodes}
        rearrangeRequest={rearrangeRequest}
        selectedNodeId={selectedNodeId}
        onClearSelection={clearSelection}
        onDeleteEdge={(edgeId) => setEdges((current) => current.filter((edge) => edge.id !== edgeId))}
        onDeleteNode={deleteNode}
        onNodePositionChange={updateNodesFromSimulation}
        onSelectNode={selectNode}
        onViewportCenterChange={setViewportCenter}
      />
      <RightPanel
        node={selectedNode}
        nodes={nodes}
        onClose={clearSelection}
        onRearrange={(mainPlanetId) => setRearrangeRequest({ id: createId('rearrange'), mainPlanetId })}
        onUpdateNode={updateNode}
      />
      <UniverseMenu
        isOpen={isMenuOpen}
        onAddMainPlanet={addMainPlanet}
        onAddSubPlanet={addSubPlanet}
        onClose={() => setIsMenuOpen(false)}
      />
    </main>
  )
}

export default App
