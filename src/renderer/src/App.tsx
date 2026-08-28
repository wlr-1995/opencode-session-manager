import { useCallback, useEffect, useMemo, useState } from 'react'
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

export default function App() {
  const [health, setHealth] = useState<DbStatus | null>(null)
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [settings, setSettings] = useState<AppSettings>({ dataDir: null, terminal: 'pwsh', opencodePath: null })
  const [opencodeCheck, setOpencodeCheck] = useState<OpencodeCheck | null>(null)
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null)
  const [view, setView] = useState<ViewKind>('projects')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmHide, setConfirmHide] = useState<ProjectInfo | null>(null)
  const [hiddenProjects, setHiddenProjects] = useState<string[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

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

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  )

  const favoriteKeys = useMemo(() => new Set(favorites.map((f) => f.key)), [favorites])

  const selectProject = useCallback(
    (p: ProjectInfo) => {
      setSelectedId(p.id)
      setView('projects')
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
        if (r.ok) showToast('已在新 PowerShell 窗口中启动 opencode')
        else showToast(`启动失败：${r.error}`)
      } catch (err) {
        showToast(`启动失败：${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [showToast]
  )

  const launchShell = useCallback(
    async (dir: string) => {
      try {
        const r = await window.api.launchShell(dir)
        if (r.ok) showToast('已打开 PowerShell')
        else showToast(`启动失败：${r.error}`)
      } catch (err) {
        showToast(`启动失败：${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [showToast]
  )

  const launchSession = useCallback(
    async (dir: string, sessionId: string) => {
      try {
        const r = await window.api.launchSession(dir, sessionId)
        if (r.ok) showToast('已在新 PowerShell 窗口中续接会话')
        else showToast(`启动失败：${r.error}`)
      } catch (err) {
        showToast(`启动失败：${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [showToast]
  )

  const addFolder = useCallback(async () => {
    setProjects(await window.api.addFolder())
  }, [])

  const removeManual = useCallback(
    async (dir: string) => {
      setProjects(await window.api.removeManual(dir))
      if (selectedId === `manual:${dir.replace(/\\/g, '/').replace(/\/+$/, '')}`) {
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
        setView={setView}
        refreshing={refreshing}
        onRefresh={() => void refreshAll()}
        onAddFolder={() => void addFolder()}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="body">
        {view === 'projects' ? (
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
