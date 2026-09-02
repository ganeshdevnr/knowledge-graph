import { SYSTEM_COLORS } from '../constants.js'

export function SolarSystemBoundary({ highlightIds, nodes }) {
  return (
    <g className="boundary-layer" pointerEvents="none">
      {nodes.filter((node) => node.type === 'main').map((node) => {
        const highlighted = !highlightIds || highlightIds.has(node.id)
        return (
          <circle
            key={node.id}
            className="system-boundary"
            cx={node.x}
            cy={node.y}
            r="220"
            fill={`url(#boundary-${node.id})`}
            opacity={highlighted ? 1 : 0.18}
            style={{ color: SYSTEM_COLORS[(node.systemIndex ?? 0) % SYSTEM_COLORS.length] }}
          />
        )
      })}
    </g>
  )
}
