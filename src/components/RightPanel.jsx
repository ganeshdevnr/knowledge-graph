import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function AddPlanetForm({ onAdd }) {
  const [name, setName] = useState('')

  function submit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setName('')
  }

  return (
    <form className="add-planet-form" onSubmit={submit}>
      <label className="panel-section-label" htmlFor="add-planet-name">Add Planet</label>
      <input
        id="add-planet-name"
        value={name}
        placeholder="Planet name..."
        onChange={(event) => setName(event.target.value)}
      />
    </form>
  )
}

function DisconnectAllButton({ count, onDisconnectAll }) {
  const [confirming, setConfirming] = useState(false)

  function handleClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    onDisconnectAll()
    setConfirming(false)
  }

  return (
    <button
      className={`disconnect-button${confirming ? ' is-confirming' : ''}`}
      type="button"
      disabled={count === 0}
      onClick={handleClick}
    >
      {confirming ? `Remove ${count} connection${count === 1 ? '' : 's'}?` : `Disconnect All${count > 0 ? ` (${count})` : ''}`}
    </button>
  )
}

function InlineName({ name, onSave }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef(null)
  const isCancellingRef = useRef(false)

  useEffect(() => {
    if (!isEditing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isEditing])

  function save() {
    if (isCancellingRef.current) {
      isCancellingRef.current = false
      return
    }
    const trimmed = draft.trim()
    setIsEditing(false)
    if (!trimmed) {
      setDraft(name)
      return
    }
    if (trimmed !== name) onSave(trimmed)
    setDraft(trimmed)
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="inline-name-input"
        value={draft}
        aria-label="Planet name"
        onBlur={save}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            isCancellingRef.current = true
            setDraft(name)
            setIsEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button className="inline-name-button" type="button" onClick={() => setIsEditing(true)}>
      {name}
    </button>
  )
}

function DeleteSolarSystemButton({ onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!confirming) return undefined

    const timeout = window.setTimeout(() => setConfirming(false), 5000)
    function cancelOnOutsidePointerDown(event) {
      if (!buttonRef.current?.contains(event.target)) setConfirming(false)
    }

    document.addEventListener('pointerdown', cancelOnOutsidePointerDown)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('pointerdown', cancelOnOutsidePointerDown)
    }
  }, [confirming])

  function handleClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    onDelete()
  }

  return (
    <div>
      <button
        ref={buttonRef}
        className={`delete-button${confirming ? ' is-confirming' : ''}`}
        type="button"
        onClick={handleClick}
      >
        {confirming ? 'Confirm Delete' : 'Delete Solar System'}
      </button>
      {confirming ? <p className="delete-warning">This will delete all planets in this solar system</p> : null}
    </div>
  )
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function NotesModal({ node, onClose, onUpdateNode }) {
  const [mode, setMode] = useState('preview')
  const [draft, setDraft] = useState(node.notes ?? '')
  const [saved, setSaved] = useState(false)
  const [visited, setVisited] = useState(false)
  const saveResetRef = useRef(null)
  const visitResetRef = useRef(null)

  useEffect(() => () => {
    window.clearTimeout(saveResetRef.current)
    window.clearTimeout(visitResetRef.current)
  }, [])

  function saveNotes() {
    onUpdateNode(node.id, { notes: draft })
    setSaved(true)
    window.clearTimeout(saveResetRef.current)
    saveResetRef.current = window.setTimeout(() => setSaved(false), 1500)
  }

  function markVisited() {
    onUpdateNode(node.id, { notes: draft, lastVisited: new Date().toISOString() })
    setVisited(true)
    window.clearTimeout(visitResetRef.current)
    visitResetRef.current = window.setTimeout(() => setVisited(false), 1500)
  }

  const trimmedDraft = draft.trim()
  const previewHtml = trimmedDraft ? marked.parse(escapeHtml(draft), { async: false }) : ''

  return createPortal(
    <div className="notes-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-modal="true"
        aria-labelledby="notes-modal-title"
        className="notes-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="notes-modal-header">
          <p className="eyebrow">Sub-planet</p>
          <h2 id="notes-modal-title">{node.name}</h2>
          <button className="notes-modal-close" type="button" aria-label="Close notes" onClick={onClose}>×</button>
        </header>
        <div className="notes-mode-toggle" role="group" aria-label="Notes mode">
          <button className={mode === 'edit' ? 'is-active' : ''} type="button" onClick={() => setMode('edit')}>Edit</button>
          <button className={mode === 'preview' ? 'is-active' : ''} type="button" onClick={() => setMode('preview')}>Preview</button>
        </div>
        <div className="notes-modal-body">
          {mode === 'edit' ? (
            <textarea
              aria-label="Markdown notes"
              autoFocus
              className="notes-textarea"
              placeholder="Write your notes in markdown..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : trimmedDraft ? (
            <div className="notes-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <div className="notes-empty-preview">Nothing to preview yet</div>
          )}
        </div>
        <footer className="notes-modal-footer">
          <button className="connect-button" type="button" onClick={saveNotes}>{saved ? 'Saved ✓' : 'Save'}</button>
          <button className="visited-button" type="button" onClick={markVisited}>{visited ? 'Visited' : 'Visit'}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

export function RightPanel({
  connectionCount,
  isConnecting,
  node,
  nodes,
  onAddSubPlanet,
  onClose,
  onDeleteNode,
  onDeleteSolarSystem,
  onDisconnectAll,
  onRearrange,
  onToggleConnect,
  onUpdateNode,
}) {
  const [isNotesOpen, setIsNotesOpen] = useState(false)

  if (!node) return null

  const system = node.type === 'sub' ? nodes.find((candidate) => candidate.id === node.solarSystemId) : null
  const subPlanetCount = node.type === 'main' ? nodes.filter((candidate) => candidate.solarSystemId === node.id).length : 0

  return (
    <aside className="right-panel" aria-label="Node details">
      <button className="panel-close" type="button" aria-label="Close details" onClick={onClose}>×</button>
      <p className="eyebrow">{node.type === 'main' ? 'Main Planet' : 'Sub-planet'}</p>
      <InlineName key={node.id} name={node.name} onSave={(name) => onUpdateNode(node.id, { name })} />
      <div className="panel-divider" />
      <div className="panel-meta">
        <span>Created {formatDate(node.createdAt)}</span>
        {node.type === 'sub' ? <span>Solar system {system?.name ?? 'Free-floating'}</span> : null}
      </div>
      {node.type === 'main' ? (
        <>
          <div className="panel-divider" />
          <AddPlanetForm key={node.id} onAdd={(name) => onAddSubPlanet(name, node.id)} />
          <div className="panel-divider" />
          <button className="rearrange-button" type="button" disabled={subPlanetCount === 0} onClick={() => onRearrange(node.id)}>
            ⟳ Rearrange Planets
          </button>
          <div className="panel-divider" />
          <DeleteSolarSystemButton onDelete={() => onDeleteSolarSystem(node.id)} />
        </>
      ) : (
        <>
          <div className="panel-divider" />
          <div className="panel-actions">
            <button className="connect-button" type="button" onClick={() => setIsNotesOpen(true)}>
              Open Notes
            </button>
            <button
              aria-pressed={isConnecting}
              className="connect-button"
              type="button"
              onClick={onToggleConnect}
            >
              {isConnecting ? 'Cancel Connect' : 'Connect'}
            </button>
            <DisconnectAllButton key={node.id} count={connectionCount} onDisconnectAll={onDisconnectAll} />
          </div>
          <div className="panel-divider" />
          <button className="delete-button" type="button" onClick={() => onDeleteNode(node.id)}>Delete Planet</button>
        </>
      )}
      {isNotesOpen && node.type === 'sub' ? <NotesModal key={node.id} node={node} onClose={() => setIsNotesOpen(false)} onUpdateNode={onUpdateNode} /> : null}
    </aside>
  )
}
