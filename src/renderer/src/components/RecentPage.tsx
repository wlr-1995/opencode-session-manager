import { useMemo, useState } from 'react'
import type { SessionInfo } from '@shared/types'
import SessionList from './SessionList'

interface Props {
  recentSessions: SessionInfo[]
  onResume: (s: SessionInfo) => void
}

export default function RecentPage({ recentSessions, onResume }: Props) {
  const [q, setQ] = useState('')
  const kw = q.trim().toLowerCase()
  const list = useMemo(() => {
    if (!kw) return recentSessions
    return recentSessions.filter(
      (s) =>
        (s.title ?? '').toLowerCase().includes(kw) ||
        (s.directory ?? '').toLowerCase().includes(kw)
    )
  }, [recentSessions, kw])

  return (
    <main className="main centered-page">
      <div className="page-head">
        <h2>最近会话</h2>
        <input
          className="search wide"
          placeholder="搜索会话标题或目录…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {list.length === 0 ? (
        <div className="empty-block">
          {recentSessions.length === 0 ? '暂无会话' : '没有匹配的会话'}
        </div>
      ) : (
        <SessionList sessions={list.slice(0, 80)} onResume={onResume} showDirectory />
      )}
    </main>
  )
}
