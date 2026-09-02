import { useEffect, useMemo, useRef, useState } from 'react'
import { forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'

const ORBIT_MIN_DISTANCE = 80
const ORBIT_MAX_DISTANCE = 140
const REARRANGE_DURATION = 600
const REARRANGE_MIN_GAP = 28
const DRAG_ALPHA_TARGET = 0.3

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function randomOrbitPosition(mainPlanet) {
  const angle = Math.random() * 2 * Math.PI
  const radius = ORBIT_MIN_DISTANCE + Math.sqrt(Math.random()) * (ORBIT_MAX_DISTANCE - ORBIT_MIN_DISTANCE)

  return {
    x: (mainPlanet.x ?? 0) + radius * Math.cos(angle),
    y: (mainPlanet.y ?? 0) + radius * Math.sin(angle),
  }
}

function radiusFor(node) {
  return node.type === 'main' ? 40 : 12
}

function nearestMain(node, nodes) {
  let nearest = null
  let shortest = Infinity

  for (const candidate of nodes) {
    if (candidate.type !== 'main' || candidate.id === node.id) continue
    const distance = Math.hypot((candidate.x ?? 0) - (node.x ?? 0), (candidate.y ?? 0) - (node.y ?? 0))
    if (distance < shortest) {
      nearest = candidate
      shortest = distance
    }
  }

  return nearest
}

// Main planets are anchors: they never move on their own. Sub planets are free
// bodies so the simulation can shove them around when something is dragged.
function anchorMainPlanets(nodes) {
  for (const node of nodes) {
    if (node.type === 'main') {
      node.fx = node.x
      node.fy = node.y
    } else {
      node.fx = null
      node.fy = null
    }
    node.vx = 0
    node.vy = 0
  }
}

function solarGravity(mainDragRef) {
  let nodes = []

  function force(alpha) {
    const mainPlanets = nodes.filter((node) => node.type === 'main')
    for (const node of nodes) {
      if (node.type !== 'sub') continue
      const lockedDrag = mainDragRef.current
      const lockedToMain = lockedDrag?.subPlanetIds.has(node.id) ? lockedDrag.mainId : null
      if (!node.solarSystemId && !lockedToMain) {
        node.solarSystemId = nearestMain(node, mainPlanets)?.id ?? null
      }
      const targetId = lockedToMain ?? node.solarSystemId
      const target = mainPlanets.find((candidate) => candidate.id === targetId)
      if (!target) continue
      const dx = (target.x ?? 0) - (node.x ?? 0)
      const dy = (target.y ?? 0) - (node.y ?? 0)
      const distance = Math.max(1, Math.hypot(dx, dy))

      if (distance < ORBIT_MIN_DISTANCE) {
        const push = (ORBIT_MIN_DISTANCE - distance) * 0.08 * alpha
        node.vx -= (dx / distance) * push
        node.vy -= (dy / distance) * push
      } else if (distance > ORBIT_MAX_DISTANCE) {
        const pull = (distance - ORBIT_MAX_DISTANCE) * 0.06 * alpha
        node.vx += (dx / distance) * pull
        node.vy += (dy / distance) * pull
      }
    }
  }

  force.initialize = (nextNodes) => {
    nodes = nextNodes
  }

  return force
}

export function useForceSimulation({ nodes, edges, rearrangeRequest, onNodePositionChange }) {
  const [simulationNodes, setSimulationNodes] = useState(nodes)
  const simulationRef = useRef(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const onNodePositionChangeRef = useRef(onNodePositionChange)
  const frameRef = useRef(null)
  const rearrangeAnimationRef = useRef(null)
  const dragNodeRef = useRef(null)
  const mainDragRef = useRef(null)
  const hasInitializedRef = useRef(false)
  const nodeKey = useMemo(() => nodes.map((node) => node.id).join('|'), [nodes])
  const edgeKey = useMemo(() => edges.map((edge) => `${edge.source}-${edge.target}`).join('|'), [edges])

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
    onNodePositionChangeRef.current = onNodePositionChange
  })

  function translateLockedSolarSystem(nodesToMove) {
    const lockedDrag = mainDragRef.current
    if (!lockedDrag) return

    const main = nodesToMove.find((node) => node.id === lockedDrag.mainId)
    if (!main) return

    const dx = (main.x ?? 0) - lockedDrag.lastX
    const dy = (main.y ?? 0) - lockedDrag.lastY
    if (dx === 0 && dy === 0) return

    for (const node of nodesToMove) {
      if (!lockedDrag.subPlanetIds.has(node.id)) continue
      node.x = (node.x ?? 0) + dx
      node.y = (node.y ?? 0) + dy
      node.fx = node.x
      node.fy = node.y
      node.vx = 0
      node.vy = 0
    }

    lockedDrag.lastX = main.x ?? lockedDrag.lastX
    lockedDrag.lastY = main.y ?? lockedDrag.lastY
  }

  function publish(simulation) {
    setSimulationNodes(simulation.nodes().map((node) => ({ ...node })))
  }

  function persist(simulation) {
    const snapshot = simulation.nodes().map((node) => ({ ...node }))
    setSimulationNodes(snapshot)
    onNodePositionChangeRef.current(snapshot)
  }

  useEffect(() => {
    const previousById = new Map((simulationRef.current?.nodes() ?? nodesRef.current).map((node) => [node.id, node]))
    const nextNodes = nodesRef.current.map((node) => ({ ...node, ...(previousById.get(node.id) ?? {}) }))
    const nextEdges = edgesRef.current.map((edge) => ({ ...edge }))
    anchorMainPlanets(nextNodes)

    simulationRef.current?.stop()
    dragNodeRef.current = null
    mainDragRef.current = null

    const simulation = forceSimulation(nextNodes)
      .alpha(0.3)
      .alphaDecay(0.02)
      .velocityDecay(0.4)
      .force(
        'link',
        forceLink(nextEdges)
          .id((node) => node.id)
          .distance(70)
          .strength(0.16),
      )
      .force(
        'charge',
        forceManyBody().strength((node) => (node.type === 'main' ? -300 : -80)),
      )
      .force('gravity', solarGravity(mainDragRef))
      .force('collide', forceCollide((node) => radiusFor(node) + 4).strength(0.9))

    simulation.on('tick', () => {
      translateLockedSolarSystem(simulation.nodes())
      if (frameRef.current) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        publish(simulation)
      })
    })

    // Fires once alpha decays below alphaMin, i.e. the layout has come to rest.
    simulation.on('end', () => persist(simulation))

    simulationRef.current = simulation

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      simulation.stop()
      while (simulation.alpha() >= simulation.alphaMin()) simulation.tick()
      persist(simulation)
    }

    return () => {
      simulation.stop()
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      if (rearrangeAnimationRef.current) {
        cancelAnimationFrame(rearrangeAnimationRef.current)
        rearrangeAnimationRef.current = null
      }
    }
  }, [edgeKey, nodeKey])

  useEffect(() => {
    if (!rearrangeRequest) return
    const simulation = simulationRef.current
    if (!simulation) return

    const currentNodes = simulation.nodes()
    const mainPlanet = currentNodes.find((node) => node.id === rearrangeRequest.mainPlanetId)
    const subPlanets = currentNodes.filter((node) => node.type === 'sub' && node.solarSystemId === rearrangeRequest.mainPlanetId)
    if (!mainPlanet || subPlanets.length === 0) return

    if (rearrangeAnimationRef.current) cancelAnimationFrame(rearrangeAnimationRef.current)
    simulation.stop()

    const starts = new Map(subPlanets.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]))
    const targets = new Map()

    for (const node of subPlanets) {
      let target = randomOrbitPosition(mainPlanet)
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const overlaps = [...targets.values()].some((candidate) => Math.hypot(candidate.x - target.x, candidate.y - target.y) < REARRANGE_MIN_GAP)
        if (!overlaps) break
        target = randomOrbitPosition(mainPlanet)
      }
      targets.set(node.id, target)
    }
    const startedAt = performance.now()

    function step(now) {
      const progress = Math.min(1, (now - startedAt) / REARRANGE_DURATION)
      const eased = easeInOut(progress)

      for (const node of subPlanets) {
        const start = starts.get(node.id)
        const target = targets.get(node.id)
        node.x = start.x + (target.x - start.x) * eased
        node.y = start.y + (target.y - start.y) * eased
        node.vx = 0
        node.vy = 0
      }

      publish(simulation)

      if (progress < 1) {
        rearrangeAnimationRef.current = requestAnimationFrame(step)
      } else {
        rearrangeAnimationRef.current = null
        // Hand back to the simulation with a small nudge so overlaps resolve.
        simulation.alpha(0.1).alphaTarget(0).restart()
      }
    }

    rearrangeAnimationRef.current = requestAnimationFrame(step)
  }, [rearrangeRequest])

  function startDrag(nodeId) {
    const simulation = simulationRef.current
    if (!simulation) return
    const currentNodes = simulation.nodes()
    const node = currentNodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    dragNodeRef.current = node

    if (node.type === 'main') {
      const subPlanets = currentNodes.filter((candidate) => candidate.type === 'sub' && candidate.solarSystemId === node.id)
      mainDragRef.current = {
        mainId: node.id,
        subPlanetIds: new Set(subPlanets.map((candidate) => candidate.id)),
        lastX: node.x ?? 0,
        lastY: node.y ?? 0,
      }

      // Carry the whole solar system rigidly with its main planet.
      for (const sub of subPlanets) {
        sub.fx = sub.x
        sub.fy = sub.y
        sub.vx = 0
        sub.vy = 0
      }
    }

    node.fx = node.x
    node.fy = node.y
    simulation.alphaTarget(DRAG_ALPHA_TARGET).restart()
  }

  function dragTo(point) {
    const node = dragNodeRef.current
    if (!node) return
    node.fx = point.x
    node.fy = point.y
  }

  function endDrag() {
    const node = dragNodeRef.current
    const simulation = simulationRef.current
    if (!node || !simulation) return
    const lockedDrag = mainDragRef.current

    if (node.fx != null) node.x = node.fx
    if (node.fy != null) node.y = node.fy

    if (lockedDrag) {
      translateLockedSolarSystem(simulation.nodes())
      // Main stays anchored where it was dropped; release its subs.
      node.fx = node.x
      node.fy = node.y
      for (const sub of simulation.nodes()) {
        if (!lockedDrag.subPlanetIds.has(sub.id)) continue
        sub.fx = null
        sub.fy = null
      }
    } else {
      // Dropping a sub near a different main re-homes it to that system.
      node.solarSystemId = nearestMain(node, simulation.nodes())?.id ?? node.solarSystemId ?? null
      node.fx = null
      node.fy = null
    }

    node.vx = 0
    node.vy = 0
    mainDragRef.current = null
    dragNodeRef.current = null
    simulation.alphaTarget(0)
  }

  return { nodes: simulationNodes, startDrag, dragTo, endDrag }
}
