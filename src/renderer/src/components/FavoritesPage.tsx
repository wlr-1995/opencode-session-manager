import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Favorite, ProjectInfo, RecentSession, SessionInfo } from '@shared/types'
import MainPane from './MainPane'

interface Props {
  favorites: Favorite[]
  projects: ProjectInfo[]
  favoriteKeys: Set<string>
  recentSessions: RecentSession[]
  onLaunchProject: (dir: string) => void
  onLaunchShell: (dir: string) => void
  onLaunchSession: (dir: string, sessionId: string) => void
  onOpenExplorer: (dir: string) => void
  onToggleFavoriteDir: (dir: string, label: string) => void
  onToggleFavorite: (p: ProjectInfo) => void
}

export default function FavoritesPage({
  favorites,
  projects,
  favoriteKeys,
  recentSessions,
  onLaunchProject,
  onLaunchShell,
  onLaunchSession,
  onOpenExplorer,
  onToggleFavoriteDir,
  onToggleFavorite
}: Props) {
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])

  const kw = q.trim().toLowerCase()
  const list = useMemo<ProjectInfo[]>(() => {
    const seen = new Set<string>()
    const favs: ProjectInfo[] = []
    for (const p of projects) {
      if (favoriteKeys.has(p.worktree)) {
        favs.push(p)
        seen.add(p.worktree)
      }
    }
    // 收藏但当前不在项目列表里的目录（例如已被隐藏），仍展示，可取消收藏
    for (const f of favorites) {
      if (!seen.has(f.key)) {
        favs.push({
          id: `manual:${f.key}`,
          name: f.label,
          worktree: f.key,
          vcs: null,
          timeUpdated: 0,
          lastSessionAt: null,
          sessionCount: 0,
          isManual: true
        })
      }
    }
    if (!kw) return favs
    return favs.filter(
      (p) => p.name.toLowerCase().includes(kw) || p.worktree.toLowerCase().includes(kw)
    )
  }, [favorites, projects, favoriteKeys, kw])

  const selected = useMemo(() => list.find((p) => p.id === selectedId) ?? null, [list, selectedId])

  useEffect(() => {
    if (!selected || selected.id.startsWith('manual:')) {
      setSessions([])
      return
    }
    window.api
      .sessionsByProject(selected.id)
      .then(setSessions)
      .catch(() => setSessions([]))
  }, [selected])

  const select = useCallback((p: ProjectInfo) => setSelectedId(p.id), [])

  return (
    <div className="body">
      <aside className="sidebar">
        <div className="search-wrap">
          <input
            className="search"
            placeholder="搜索收藏…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="list">
          {list.map((p) => (
            <div
              key={p.id}
              className={`item ${selectedId === p.id ? 'active' : ''}`}
              onClick={() => select(p)}
            >
              <div className="item-main">
                <div className="item-title">
                  {p.name}
                  {p.isManual && <span className="badge">手动</span>}
                </div>
                <div className="item-sub">{p.worktree}</div>
              </div>
              <div className="item-side">
                {!p.isManual && <span className="count">{p.sessionCount}</span>}
                <button
                  className="star on"
                  title="取消收藏"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavoriteDir(p.worktree, p.name)
                  }}
                >
                  ★
                </button>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="empty">
              {favorites.length === 0 ? '暂无收藏，在项目上点 ★' : '没有匹配的收藏'}
            </div>
          )}
        </div>
      </aside>

      <MainPane
        project={selected}
        sessions={sessions}
        recentSessions={recentSessions}
        favoriteKeys={favoriteKeys}
        onLaunchProject={onLaunchProject}
        onLaunchShell={onLaunchShell}
        onLaunchSession={onLaunchSession}
        onOpenExplorer={onOpenExplorer}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  )
}
