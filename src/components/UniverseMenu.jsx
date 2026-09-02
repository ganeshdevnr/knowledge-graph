import { useState } from 'react'

export function UniverseMenu({ isOpen, onAddMainPlanet, onAddSubPlanet, onClose }) {
  const [name, setName] = useState('')

  function submit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onAddSubPlanet(trimmed)
    setName('')
  }

  return (
    <aside className={`universe-menu${isOpen ? ' is-open' : ''}`} aria-label="Universe menu" aria-hidden={!isOpen}>
      <button className="panel-close" type="button" aria-label="Close universe menu" onClick={onClose}>×</button>
      <p>Universe</p>
      <button type="button" onClick={onAddMainPlanet}>New Solar System</button>
      <div className="universe-menu__divider" />
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="topic-name">Sub-planet topic name</label>
        <input
          id="topic-name"
          value={name}
          placeholder="Add sub-planet topic..."
          onChange={(event) => setName(event.target.value)}
        />
      </form>
    </aside>
  )
}
