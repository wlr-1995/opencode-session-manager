import { useState } from 'react'
import type { ProjectInfo } from '@shared/types'

function TrashIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

interface Props {
  projects: ProjectInfo[]
  favoriteKeys: Set<string>
  selectedId: string | null
  onSelectProject: (p: ProjectInfo) => void
  onToggleFavorite: (p: ProjectInfo) => void
  onHideProject: (p: ProjectInfo) => void
  onRemoveManual: (dir: string) => void
}

export default function Sidebar({
  projects,
  favoriteKeys,
  selectedId,
  onSelectProject,
  onToggleFavorite,
  onHideProject,
  onRemoveManual
}: Props) {
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const filtered = q
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.worktree.toLowerCase().includes(q)
      )
    : projects

  return (
    <aside className="sidebar">
      <div className="search-wrap">
        <input
          className="search"
          placeholder="搜索项目…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="list">
        {filtered.map((p) => (
          <div
            key={p.id}
            className={`item ${selectedId === p.id ? 'active' : ''}`}
            onClick={() => onSelectProject(p)}
          >
            <div className="item-main">
              <div className="item-title">
                {p.name}
                {p.isManual && <span className="badge">手动</span>}
              </div>
              <div className="item-sub">{p.worktree}</div>
            </div>
            <div className="item-side">
              {!p.isManual && (
                <span className="count">{p.sessionCount}</span>
              )}
              <button
                className={`star ${favoriteKeys.has(p.worktree) ? 'on' : ''}`}
                title={favoriteKeys.has(p.worktree) ? '取消收藏' : '收藏'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(p)
                }}
              >
                ★
              </button>
              {p.isManual ? (
                <button
                  className="star remove"
                  title="移除项目"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveManual(p.worktree)
                  }}
                >
                  <TrashIcon />
                </button>
              ) : (
                <button
                  className="star remove"
                  title="隐藏项目（可在设置中恢复）"
                  onClick={(e) => {
                    e.stopPropagation()
                    onHideProject(p)
                  }}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && <div className="empty">没有匹配的项目</div>}
      </div>
    </aside>
  )
}
