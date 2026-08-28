export type ViewKind = 'projects' | 'recent' | 'favorites'

interface Props {
  view: ViewKind
  setView: (v: ViewKind) => void
  refreshing: boolean
  onRefresh: () => void
  onAddFolder: () => void
  onOpenSettings: () => void
}

export default function ViewTabs({
  view,
  setView,
  refreshing,
  onRefresh,
  onAddFolder,
  onOpenSettings
}: Props) {
  return (
    <div className="view-tabs">
      <div className="view-tabs-left">
        <button
          className={`view-tab ${view === 'projects' ? 'active' : ''}`}
          onClick={() => setView('projects')}
        >
          项目
        </button>
        <button
          className={`view-tab ${view === 'recent' ? 'active' : ''}`}
          onClick={() => setView('recent')}
        >
          最近会话
        </button>
        <button
          className={`view-tab ${view === 'favorites' ? 'active' : ''}`}
          onClick={() => setView('favorites')}
        >
          收藏
        </button>
      </div>
      <div className="view-tabs-right">
        <button className="btn" onClick={onAddFolder} title="添加任意文件夹为项目">
          ＋ 添加项目文件夹
        </button>
        <button className="btn" onClick={onRefresh} disabled={refreshing} title="刷新数据">
          {refreshing ? '刷新中…' : '⟳ 刷新'}
        </button>
        <button className="btn" onClick={onOpenSettings} title="设置">
          ⚙ 设置
        </button>
      </div>
    </div>
  )
}
