import type { ProjectInfo, RecentSession, SessionInfo } from '@shared/types'
import SessionList from './SessionList'

interface Props {
  project: ProjectInfo | null
  sessions: SessionInfo[]
  recentSessions: RecentSession[]
  favoriteKeys: Set<string>
  platform: string
  onLaunchProject: (dir: string) => void
  onLaunchShell: (dir: string) => void
  onLaunchSession: (dir: string, sessionId: string) => void
  onOpenExplorer: (dir: string) => void
  onToggleFavorite: (p: ProjectInfo) => void
}

export default function MainPane({
  project,
  sessions,
  recentSessions,
  favoriteKeys,
  platform,
  onLaunchProject,
  onLaunchShell,
  onLaunchSession,
  onOpenExplorer,
  onToggleFavorite
}: Props) {
  const isWindows = platform === 'win32'
  const terminalLabel = isWindows ? 'PowerShell' : '终端'
  const fileManagerLabel = isWindows ? '资源管理器' : '文件管理器'
  if (!project) {
    return (
      <main className="main">
        <div className="pane-placeholder">
          <h2>欢迎使用 OpenCode 会话管理器</h2>
          <p className="muted">在左侧选择一个项目，或添加一个文件夹。</p>
        </div>
        <div className="section-title">最近使用</div>
        {recentSessions.length === 0 ? (
          <div className="muted">暂无</div>
        ) : (
          <SessionList
            sessions={recentSessions.slice(0, 10)}
            onResume={(s) => onLaunchSession(s.directory ?? '', s.id)}
            showDirectory
          />
        )}
      </main>
    )
  }

  const isFav = favoriteKeys.has(project.worktree)

  return (
    <main className="main">
      <div className="project-header">
        <div className="project-title-wrap">
          <h2>
            {project.name}
            {project.isManual && <span className="badge">手动</span>}
          </h2>
          <div className="project-path" title={project.worktree}>
            {project.worktree}
          </div>
        </div>
        <div className="project-actions">
          <button
            className={`star big ${isFav ? 'on' : ''}`}
            title={isFav ? '取消收藏' : '收藏'}
            onClick={() => onToggleFavorite(project)}
          >
            ★
          </button>
          <button className="btn primary" onClick={() => onLaunchProject(project.worktree)}>
            ▶ 打开项目
          </button>
          <button
            className="btn"
            onClick={() => onLaunchShell(project.worktree)}
            title={`在项目目录打开${terminalLabel}（不启动 opencode）`}
          >
            ⌨ {terminalLabel}
          </button>
          <button
            className="btn"
            onClick={() => onOpenExplorer(project.worktree)}
            title={`在${fileManagerLabel}中打开`}
          >
            📁 {fileManagerLabel}
          </button>
        </div>
      </div>

      <div className="section-title">
        会话（{sessions.length}）
        {!project.isManual && (
          <span className="muted light">按最近更新排序，可直接续接</span>
        )}
      </div>
      <SessionList sessions={sessions} onResume={(s) => onLaunchSession(s.directory ?? project.worktree, s.id)} />
    </main>
  )
}
