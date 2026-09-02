const STORAGE_KEY = 'knowledge-universe-state-v1'

export function loadUniverse() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveUniverse(universe) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(universe))
  } catch {
    // Storage can be unavailable in private browsing; the simulation should still run.
  }
}
