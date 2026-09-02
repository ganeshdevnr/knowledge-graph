function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function RightPanel({ node, nodes, onClose, onRearrange, onUpdateNode }) {
  if (!node) return null

  const system = node.type === 'sub' ? nodes.find((candidate) => candidate.id === node.solarSystemId) : null
  const subPlanetCount = node.type === 'main' ? nodes.filter((candidate) => candidate.solarSystemId === node.id).length : 0

  function saveTags(value) {
    onUpdateNode(
      node.id,
      { tags: value.split(',').map((tag) => tag.trim()).filter(Boolean) },
    )
  }

  return (
    <aside className="right-panel" aria-label="Node details">
      <button className="panel-close" type="button" aria-label="Close details" onClick={onClose}>×</button>
      <p className="eyebrow">{node.type === 'main' ? 'Main Planet' : 'Sub-planet'}</p>
      <h1>{node.name}</h1>
      <dl>
        {node.type === 'sub' ? (
          <>
            <dt>Solar system</dt>
            <dd>{system?.name ?? 'Free-floating'}</dd>
          </>
        ) : null}
        <dt>Created</dt>
        <dd>{formatDate(node.createdAt)}</dd>
      </dl>
      <label className="tag-editor" htmlFor="tags">Tags</label>
      <input
        key={node.id}
        id="tags"
        defaultValue={node.tags?.join(', ') ?? ''}
        placeholder="physics, ideas, research"
        onBlur={(event) => saveTags(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      <div className="tag-chips" aria-label="Current tags">
        {(node.tags ?? []).length > 0 ? node.tags.map((tag) => <span key={tag}>{tag}</span>) : <em>No tags</em>}
      </div>
      {node.type === 'main' ? (
        <>
          <div className="panel-divider" />
          <button className="rearrange-button" type="button" disabled={subPlanetCount === 0} onClick={() => onRearrange(node.id)}>
            ⟳ Rearrange Planets
          </button>
        </>
      ) : null}
    </aside>
  )
}
