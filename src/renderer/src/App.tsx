import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import type {
  AppSettings,
  DbStatus,
  EnvCheck,
  Favorite,
  OpencodeCheck,
  ProjectInfo,
  RecentSession,
  SessionInfo
} from '@shared/types'
import MainPane from './components/MainPane'
import Onboarding from './components/Onboarding'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import ConfirmModal from './components/ConfirmModal'
import ViewTabs, { type ViewKind } from './components/ViewTabs'
import RecentPage from './components/RecentPage'
import FavoritesPage from './components/FavoritesPage'
import SearchResults, { type SearchItem } from './components/SearchResults'
import { normalizeDir } from '@shared/dir'
import { matchProjects, resolveSessionProject } from '@shared/search'
import type { SessionFocus } from './components/SessionList'

export default function App() {
  const [health, setHealth] = useState<DbStatus | null>(null)
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [settings, setSettings] = useState<AppSettings>({ dataDir: null, opencodePath: null, runAsAdmin: false })
  const [opencodeCheck, setOpencodeCheck] = useState<OpencodeCheck | null>(null)
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null)
  const [view, setView] = useState<ViewKind>('projects')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmHide, setConfirmHide] = useState<ProjectInfo | null>(null)
  const [hiddenProjects, setHiddenProjects] = useState<string[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sessionHits, setSessionHits] = useState<RecentSession[]>([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [focusSession, setFocusSession] = useState<SessionFocus | null>(null)
  const [searchReload, setSearchReload] = useState(0)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3000)
  }, [])

  const reloadHealth = useCallback(async () => {
    try {
      const h = await window.api.health()
      setHealth(h)
      return h
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setHealth({ ok: false, dbPath: null, error: msg })
      return { ok: false, dbPath: null, error: msg }
    }
  }, [])

  const reloadEnv = useCallback(async () => {
    try {
      setEnvCheck(await window.api.environmentCheck())
    } catch {
      setEnvCheck(null)
    }
  }, [])

  const reloadProjects = useCallback(async () => {
    const list = await window.api.listProjects()
    setProjects(list)
    return list
  }, [])

  const reloadExtras = useCallback(async () => {
    const [rec, fav, st, oc, hidden] = await Promise.all([
      window.api.recentSessions(),
      window.api.listFavorites(),
      window.api.getSettings(),
      window.api.checkOpencode(),
      window.api.listHiddenProjects()
    ])
    setRecentSessions(rec)
    setFavorites(fav)
    setSettings(st)
    setOpencodeCheck(oc)
    setHiddenProjects(hidden)
  }, [])

  const reloadSessions = useCallback(async (projectId: string | null) => {
    if (!projectId || projectId.startsWith('manual:')) {
      setSessions([])
      return
    }
    setSessions(await window.api.sessionsByProject(projectId))
  }, [])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      const h = await reloadHealth()
      if (h.ok) {
        await reloadProjects()
        await reloadExtras()
        await reloadSessions(selectedId)
        setSearchReload((n) => n + 1)
      }
    } catch (err) {
      showToast(`刷新失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRefreshing(false)
    }
  }, [reloadHealth, reloadProjects, reloadExtras, reloadSessions, selectedId, showToast])

  useEffect(() => {
    void (async () => {
      const h = await reloadHealth()
      if (h.ok) {
        await Promise.all([reloadProjects(), reloadExtras()])
      }
    })()
    void reloadEnv()
  }, [reloadHealth, reloadProjects, reloadExtras, reloadEnv])

  useEffect(() => {
    void reloadSessions(selectedId)
  }, [selectedId, reloadSessions])

  const searchTerm = query.trim()
  const isSearching = searchTerm.length > 0

  useEffect(() => {
    setActiveIndex(0)
    const kw = query.trim()
    if (!kw) {
      setKeyword('')
      return
    }
    const timer = window.setTimeout(() => setKeyword(kw), 150)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!keyword) {
      setSessionHits([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    window.api
      .searchSessions(keyword)
      .then((rows) => {
        if (cancelled) return
        setSessionHits(rows)
        setActiveIndex(0)
        setSearching(false)
      })
      .catch((err) => {
        if (cancelled) return
        setSessionHits([])
        setSearching(false)
        showToast(`搜索失败：${err instanceof Error ? err.message : String(err)}`)
      })
    return () => {
      cancelled = true
    }
  }, [keyword, searchReload, showToast])

  const projectHits = useMemo(() => matchProjects(projects, keyword), [projects, keyword])

  const searchItems = useMemo<SearchItem[]>(
    () => [
      ...projectHits.map<SearchItem>((project) => ({ kind: 'project', project })),
      ...sessionHits.map<SearchItem>((session) => ({ kind: 'session', session }))
    ],
    [projectHits, sessionHits]
  )

  useEffect(() => {
    setActiveIndex((i) => (searchItems.length === 0 ? 0 : Math.min(i, searchItems.length - 1)))
  }, [searchItems.length])

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  )

  const favoriteKeys = useMemo(() => new Set(favorites.map((f) => f.key)), [favorites])

  const platform = envCheck?.platform ?? (navigator.userAgent.includes('Windows') ? 'win32' : 'linux')
  const isWindows = platform === 'win32'
  const terminalLabel = isWindows ? 'PowerShell' : '终端'

  const selectProject = useCallback(
    (p: ProjectInfo) => {
      setSelectedId(p.id)
      setView('projects')
      setFocusSession(null)
    },
    []
  )

  const toggleFavorite = useCallback(
    async (p: ProjectInfo) => {
      setFavorites(await window.api.toggleFavorite(p.worktree, p.name))
    },
    []
  )

  const toggleFavoriteDir = useCallback(
    async (dir: string, label: string) => {
      setFavorites(await window.api.toggleFavorite(dir, label))
    },
    []
  )
  const launchProject = useCallback(
    async (dir: string) => {
      try {
        const r = await window.api.launchProject(dir)
        if (r.ok) showToast(`已在新${terminalLabel}窗口中启动 opencode`)
        else showToast(`启动失败：${r.error}`)
      } catch (err) {
        showToast(`启动失败：${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [showToast, terminalLabel]
  )

  const launchShell = useCallback(
    async (dir: string) => {
      try {
        const r = await window.api.launchShell(dir)
        if (r.ok) showToast(`已打开${terminalLabel}`)
        else showToast(`启动失败：${r.error}`)
      } catch (err) {
        showToast(`启动失败：${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [showToast, terminalLabel]
  )

  const launchSession = useCallback(
    async (dir: string, sessionId: string) => {
      try {
        const r = await window.api.launchSession(dir, sessionId)
        if (r.ok) showToast(`已在新${terminalLabel}窗口中续接会话`)
        else showToast(`启动失败：${r.error}`)
      } catch (err) {
        showToast(`启动失败：${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [showToast, terminalLabel]
  )

  const activateSearchItem = useCallback(
    (item: SearchItem) => {
      if (item.kind === 'project') {
        setSelectedId(item.project.id)
        setView('projects')
        setFocusSession(null)
        setQuery('')
        return
      }
      const project = resolveSessionProject(projects, item.session)
      if (!project) {
        showToast('未找到该会话所属的项目，可能已被隐藏')
        return
      }
      setSelectedId(project.id)
      setView('projects')
      setFocusSession({ id: item.session.id })
      setQuery('')
    },
    [projects, showToast]
  )

  const onSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setQuery('')
        return
      }
      if (!isSearching || searchItems.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, searchItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = searchItems[activeIndex] ?? searchItems[0]
        if (item) activateSearchItem(item)
      }
    },
    [isSearching, searchItems, activeIndex, activateSearchItem]
  )

  const changeView = useCallback((v: ViewKind) => {
    setView(v)
    setQuery('')
  }, [])

  const addFolder = useCallback(async () => {
    setProjects(await window.api.addFolder())
  }, [])

  const removeManual = useCallback(
    async (dir: string) => {
      setProjects(await window.api.removeManual(dir))
      if (selectedId === `manual:${normalizeDir(dir)}`) {
        setSelectedId(null)
        setSessions([])
      }
    },
    [selectedId]
  )

  const confirmHideAction = useCallback(
    async (p: ProjectInfo) => {
      const list = await window.api.hideProject(p.worktree)
      setProjects(list)
      setHiddenProjects(await window.api.listHiddenProjects())
      if (selectedId === p.id) {
        setSelectedId(null)
        setSessions([])
      }
      setConfirmHide(null)
      showToast(`已隐藏「${p.name}」，可在设置中恢复`)
    },
    [selectedId, showToast]
  )

  const unhideProject = useCallback(
    async (dir: string) => {
      const list = await window.api.unhideProject(dir)
      setProjects(list)
      setHiddenProjects(await window.api.listHiddenProjects())
      showToast('已恢复该项目')
    },
    [showToast]
  )

  const openInExplorer = useCallback(async (dir: string) => {
    await window.api.openInExplorer(dir)
  }, [])

  const pickDataDir = useCallback(async () => {
    const st = await window.api.pickDataDir()
    setSettings(st)
    await refreshAll()
    await reloadEnv()
  }, [refreshAll, reloadEnv])

  const changeSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const st = await window.api.setSettings(patch)
      setSettings(st)
      if (patch.dataDir !== undefined) await refreshAll()
      if (patch.opencodePath !== undefined) setOpencodeCheck(await window.api.checkOpencode())
    },
    [refreshAll]
  )

  const checkOpencode = useCallback(async () => {
    setOpencodeCheck(await window.api.checkOpencode())
  }, [])

  if (health && !health.ok) {
    return (
      <Onboarding
        dbError={health.error ?? '未知错误'}
        env={envCheck}
        onRetry={() => {
          void reloadHealth()
          void reloadEnv()
        }}
        onPickDataDir={pickDataDir}
        onQuit={() => window.api.quit()}
      />
    )
  }

  return (
    <div className="app">
      <ViewTabs
        view={view}
        setView={changeView}
        query={query}
        onQueryChange={setQuery}
        onSearchKeyDown={onSearchKeyDown}
        refreshing={refreshing}
        onRefresh={() => void refreshAll()}
        onAddFolder={() => void addFolder()}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="body">
        {isSearching ? (
          <SearchResults
            keyword={searchTerm}
            items={searchItems}
            activeIndex={activeIndex}
            searching={searching || searchTerm !== keyword}
            onActivate={activateSearchItem}
            onHover={setActiveIndex}
            onResume={(s) => void launchSession(s.directory ?? s.projectWorktree ?? '', s.id)}
          />
        ) : view === 'projects' ? (
          <>
            <Sidebar
              projects={projects}
              favoriteKeys={favoriteKeys}
              selectedId={selectedId}
              onSelectProject={selectProject}
              onToggleFavorite={(p) => void toggleFavorite(p)}
              onHideProject={(p) => setConfirmHide(p)}
              onRemoveManual={(dir) => void removeManual(dir)}
            />
            <MainPane
              project={selectedProject}
              sessions={sessions}
              recentSessions={recentSessions}
              favoriteKeys={favoriteKeys}
              platform={platform}
              focusSession={focusSession}
              onLaunchProject={(d) => void launchProject(d)}
              onLaunchShell={(d) => void launchShell(d)}
              onLaunchSession={(d, id) => void launchSession(d, id)}
              onOpenExplorer={(d) => void openInExplorer(d)}
              onToggleFavorite={(p) => void toggleFavorite(p)}
            />
          </>
        ) : view === 'recent' ? (
          <RecentPage
            recentSessions={recentSessions}
            onResume={(s) => void launchSession(s.directory ?? '', s.id)}
          />
        ) : (
          <FavoritesPage
            favorites={favorites}
            projects={projects}
            favoriteKeys={favoriteKeys}
            recentSessions={recentSessions}
            platform={platform}
            onLaunchProject={(d) => void launchProject(d)}
            onLaunchShell={(d) => void launchShell(d)}
            onLaunchSession={(d, id) => void launchSession(d, id)}
            onOpenExplorer={(d) => void openInExplorer(d)}
            onToggleFavoriteDir={(dir, label) => void toggleFavoriteDir(dir, label)}
            onToggleFavorite={(p) => void toggleFavorite(p)}
          />
        )}
      </div>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          opencodeCheck={opencodeCheck}
          hiddenProjects={hiddenProjects}
          platform={platform}
          onChange={(p) => void changeSettings(p)}
          onPickDataDir={() => void pickDataDir()}
          onCheckOpencode={() => void checkOpencode()}
          onUnhide={(dir) => void unhideProject(dir)}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {confirmHide && (
        <ConfirmModal
          title="隐藏项目"
          message={`确定隐藏「${confirmHide.name}」吗？\n（${confirmHide.worktree}）\n仅从管理器列表移除，不影响 opencode 数据，可在设置中恢复。`}
          confirmText="隐藏"
          onConfirm={() => void confirmHideAction(confirmHide)}
          onCancel={() => setConfirmHide(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
