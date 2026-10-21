import { useEffect, useRef, useState } from 'react'
import type { SessionInfo } from '@shared/types'
import { fullTime, modelShort, relativeTime } from '../format'

export interface SessionFocus {
  id: string
}

interface Props {
  sessions: SessionInfo[]
  onResume: (s: SessionInfo) => void
  showDirectory?: boolean
  focus?: SessionFocus | null
}

export default function SessionList({ sessions, onResume, showDirectory, focus }: Props) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const [highlightId, setHighlightId] = useState<string | null>(null)

  useEffect(() => {
    if (!focus) return
    const el = rowRefs.current.get(focus.id)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlightId(focus.id)
    const timer = window.setTimeout(() => setHighlightId(null), 2400)
    return () => window.clearTimeout(timer)
  }, [focus, sessions])

  if (sessions.length === 0) {
    return (
      <div className="empty-block">
        <p>该项目暂无会话。</p>
        <p className="muted">点击上方「打开项目」开始第一个会话。</p>
      </div>
    )
  }

  return (
    <div className="session-list">
      {sessions.map((s) => {
        const agent = s.agent
        const model = modelShort(s.model)
        return (
          <div
            key={s.id}
            ref={(el) => {
              if (el) rowRefs.current.set(s.id, el)
              else rowRefs.current.delete(s.id)
            }}
            className={`session-row ${highlightId === s.id ? 'highlight' : ''}`}
          >
            <div className="session-info">
              <div className="session-title" title={fullTime(s.timeCreated)}>
                {s.title || '新建会话'}
              </div>
              <div className="session-meta">
                {showDirectory && s.directory && <span className="meta-dir">{s.directory}</span>}
                <span>{relativeTime(s.timeUpdated)}</span>
                {agent && <span className="tag">{agent}</span>}
                {model && <span className="tag model">{model}</span>}
              </div>
            </div>
            <button
              className="btn small"
              onClick={() => onResume(s)}
              title={`opencode -s ${s.id}`}
            >
              ▶ 续接会话
            </button>
          </div>
        )
      })}
    </div>
  )
}
