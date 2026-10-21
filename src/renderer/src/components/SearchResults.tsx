import { useEffect, useRef } from 'react'
import type { ProjectInfo, RecentSession } from '@shared/types'
import { basename, fullTime, modelShort, relativeTime } from '../format'

export type SearchItem =
  | { kind: 'project'; project: ProjectInfo }
  | { kind: 'session'; session: RecentSession }

interface Props {
  keyword: string
  items: SearchItem[]
  activeIndex: number
  searching: boolean
  onActivate: (item: SearchItem) => void
  onHover: (index: number) => void
  onResume: (s: RecentSession) => void
}

export default function SearchResults({
  keyword,
  items,
  activeIndex,
  searching,
  onActivate,
  onHover,
  onResume
}: Props) {
  const rowRefs = useRef(new Map<number, HTMLDivElement>())

  useEffect(() => {
    rowRefs.current.get(activeIndex)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, items])

  const projectCount = items.filter((item) => item.kind === 'project').length
  const sessionCount = items.length - projectCount

  const rowClass = (index: number, base: string) =>
    `${base} ${activeIndex === index ? 'active' : ''}`

  const attachRef = (index: number) => (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(index, el)
    else rowRefs.current.delete(index)
  }

  return (
    <main className="main search-page">
      <div className="search-head">
        <h2>搜索结果</h2>
        <span className="muted">
          「{keyword}」　项目 {projectCount} · 会话 {sessionCount}
        </span>
      </div>

      {searching && <div className="search-status">搜索中…</div>}

      {!searching && items.length === 0 && (
        <div className="empty-block">没有匹配的项目或会话</div>
      )}

      {projectCount > 0 && (
        <>
          <div className="section-title">项目（{projectCount}）</div>
          <div className="search-list">
            {items.map((item, index) =>
              item.kind === 'project' ? (
                <div
                  key={`p:${item.project.id}`}
                  ref={attachRef(index)}
                  className={rowClass(index, 'item search-item')}
                  onMouseEnter={() => onHover(index)}
                  onClick={() => onActivate(item)}
                >
                  <div className="item-main">
                    <div className="item-title">
                      {item.project.name}
                      {item.project.isManual && <span className="badge">手动</span>}
                    </div>
                    <div className="item-sub">{item.project.worktree}</div>
                  </div>
                  <div className="item-side">
                    {!item.project.isManual && (
                      <span className="count">{item.project.sessionCount}</span>
                    )}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </>
      )}

      {sessionCount > 0 && (
        <>
          <div className="section-title">
            会话（{sessionCount}）
            <span className="muted light">点击定位到所属项目，右侧按钮直接续接</span>
          </div>
          <div className="session-list">
            {items.map((item, index) => {
              if (item.kind !== 'session') return null
              const s = item.session
              const model = modelShort(s.model)
              return (
                <div
                  key={`s:${s.id}`}
                  ref={attachRef(index)}
                  className={rowClass(index, 'session-row selectable')}
                  onMouseEnter={() => onHover(index)}
                  onClick={() => onActivate(item)}
                >
                  <div className="session-info">
                    <div className="session-title" title={fullTime(s.timeUpdated)}>
                      {s.title || '新建会话'}
                    </div>
                    <div className="session-meta">
                      <span className="meta-dir">
                        {basename(s.projectWorktree ?? s.directory ?? '')}
                      </span>
                      <span>{relativeTime(s.timeUpdated)}</span>
                      {s.agent && <span className="tag">{s.agent}</span>}
                      {model && <span className="tag model">{model}</span>}
                    </div>
                  </div>
                  <button
                    className="btn small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onResume(s)
                    }}
                    title={`opencode -s ${s.id}`}
                  >
                    ▶ 续接
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
