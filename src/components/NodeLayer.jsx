import { SYSTEM_COLORS } from '../constants.js'
import { getDecayVisual } from '../planetDecay.js'

function nodeColor(node, nodes) {
  if (node.type === 'main') return '#eefcff'
  const main = nodes.find((candidate) => candidate.id === node.solarSystemId)
  return SYSTEM_COLORS[(main?.systemIndex ?? 0) % SYSTEM_COLORS.length]
}

export function NodeLayer({ connectLinkedIds, connectSourceId, decayNow, highlightIds, nodes, selectedNodeId, onNodeMouseEnter, onNodeMouseLeave }) {
  return (
    <g className="node-layer">
      {nodes.map((node) => {
        const selected = selectedNodeId === node.id
        const highlighted = !highlightIds || highlightIds.has(node.id)
        const baseColor = nodeColor(node, nodes)
        const decayVisual = node.type === 'sub' ? getDecayVisual(baseColor, node.lastVisited, decayNow) : null
        const connectClass = !connectSourceId
          ? ''
          : node.id === connectSourceId
            ? ' is-connect-source'
            : connectLinkedIds?.has(node.id)
              ? ' is-connect-linked'
              : ' is-connect-target'

        return (
          <g key={node.id}>
            {node.type === 'sub' ? (
              <circle
                className="planet-hit-area"
                cx={node.x}
                cy={node.y}
                r="10"
                onMouseEnter={() => onNodeMouseEnter?.(node)}
                onMouseLeave={onNodeMouseLeave}
              />
            ) : null}
            <circle
              className={`planet-node planet-node--${node.type}${decayVisual?.state === 'dead' && highlighted ? ' is-dead' : ''}${selected ? ' is-selected' : ''}${connectClass}`}
              cx={node.x}
              cy={node.y}
              r={node.type === 'main' ? 24 : 10}
              fill={decayVisual?.color ?? baseColor}
              filter={node.type === 'main' ? 'url(#main-glow)' : decayVisual.filter}
              opacity={highlighted ? (decayVisual?.opacity ?? 1) : 0.1}
              pointerEvents="none"
            />
          </g>
        )
      })}
    </g>
  )
}
