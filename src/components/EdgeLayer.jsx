import { SYSTEM_COLORS } from '../constants.js'

function colorFor(node, nodes) {
  const main = nodes.find((candidate) => candidate.id === node?.solarSystemId)
  return SYSTEM_COLORS[(main?.systemIndex ?? 0) % SYSTEM_COLORS.length]
}

export function EdgeLayer({ edges, highlightIds, nodes, onSelectEdge }) {
  return (
    <g className="edge-layer">
      {edges.map((edge) => {
        const source = nodes.find((node) => node.id === edge.source)
        const target = nodes.find((node) => node.id === edge.target)
        if (!source || !target) return null

        const crossSystem = source.solarSystemId !== target.solarSystemId
        const highlighted = !highlightIds || (highlightIds.has(source.id) && highlightIds.has(target.id))

        return (
          <line
            key={edge.id}
            className="universe-edge"
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke={crossSystem ? 'rgba(238, 247, 255, 0.68)' : colorFor(source, nodes)}
            opacity={highlighted ? 0.86 : 0.1}
            onClick={(event) => {
              event.stopPropagation()
              onSelectEdge(edge.id)
            }}
          />
        )
      })}
    </g>
  )
}
