import type { SessionInfo } from '@shared/types'
import SessionList from './SessionList'

interface Props {
  recentSessions: SessionInfo[]
  onResume: (s: SessionInfo) => void
}

export default function RecentPage({ recentSessions, onResume }: Props) {
  return (
    <main className="main centered-page">
      <div className="page-head">
        <h2>最近会话</h2>
        <span className="muted">最多显示最近 50 条，完整搜索请用顶部搜索框</span>
      </div>
      {recentSessions.length === 0 ? (
        <div className="empty-block">暂无会话</div>
      ) : (
        <SessionList sessions={recentSessions.slice(0, 80)} onResume={onResume} showDirectory />
      )}
    </main>
  )
}
