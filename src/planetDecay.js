const DAY_MS = 24 * 60 * 60 * 1000

export function interpolateColor(baseColor, targetColor, t) {
  const base = parseHexColor(baseColor)
  const target = parseHexColor(targetColor)
  const clampedT = Math.max(0, Math.min(1, t))

  const r = Math.round(base.r + (target.r - base.r) * clampedT)
  const g = Math.round(base.g + (target.g - base.g) * clampedT)
  const b = Math.round(base.b + (target.b - base.b) * clampedT)

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function getDecayState(lastVisited, now = Date.now()) {
  if (!lastVisited) return 'dead'

  const visitedAt = new Date(lastVisited).getTime()
  const elapsed = now - visitedAt
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'dead'
  if (elapsed <= 3 * DAY_MS) return 'healthy'
  if (elapsed <= 7 * DAY_MS) return 'fading'
  if (elapsed <= 15 * DAY_MS) return 'critical'
  return 'dead'
}

export function getDecayVisual(baseColor, lastVisited, now = Date.now()) {
  const state = getDecayState(lastVisited, now)

  if (state === 'fading') {
    return {
      state,
      color: interpolateColor(baseColor, '#444455', 0.4),
      filter: 'url(#sub-glow-fading)',
      opacity: 0.85,
    }
  }

  if (state === 'critical') {
    return {
      state,
      color: interpolateColor(baseColor, '#333344', 0.7),
      filter: 'url(#sub-glow-critical)',
      opacity: 0.65,
    }
  }

  if (state === 'dead') {
    return {
      state,
      color: '#222233',
      filter: 'url(#sub-glow-dead)',
      opacity: 0.4,
    }
  }

  return {
    state,
    color: baseColor,
    filter: 'url(#sub-glow)',
    opacity: 1,
  }
}

function parseHexColor(color) {
  const hex = color.replace('#', '')
  const normalized = hex.length === 3
    ? hex.split('').map((channel) => channel + channel).join('')
    : hex

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function toHex(channel) {
  return channel.toString(16).padStart(2, '0')
}
