import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type {
  AppSettings,
  DbStatus,
  EnvCheck,
  Favorite,
  LaunchResult,
  OpencodeCheck,
  ProjectInfo,
  RecentItem,
  RecentSession,
  SessionInfo
} from '@shared/types'
import { DbBridge } from './db-bridge'
import { checkEnvironment } from './environment'
import { launchInTerminal } from './launcher'
import { dbPathFor, defaultDataDir } from './paths'
import { normalizeDir, Store } from './store'

export function registerIpc(bridge: DbBridge, store: Store): void {
  const resolveDbPath = (settings: AppSettings): string => dbPathFor(settings.dataDir || defaultDataDir())

  const request = <T>(op: string, payload: Record<string, unknown> = {}, dbPath?: string): Promise<T> => {
    const path = dbPath ?? resolveDbPath(store.getSettings())
    return bridge.request<T>(op, { ...payload, dbPath: path })
  }

  const listProjects = async (): Promise<ProjectInfo[]> => {
    const hidden = new Set(store.listHiddenProjects())
    const dbProjects = (await request<ProjectInfo[]>('projects')).filter(
      (p) => !hidden.has(normalizeDir(p.worktree))
    )
    // 手动项目与真实/派生项目去重：目录已被覆盖的手动项不再显示，并从存储清理，避免空重复项
    const known = new Set(dbProjects.map((p) => normalizeDir(p.worktree)))
    for (const m of store.listManualProjects()) {
      if (known.has(normalizeDir(m.dir))) store.removeManualProject(m.dir)
    }
    const manual = store.listManualProjects().map<ProjectInfo>((m) => ({
      id: `manual:${normalizeDir(m.dir)}`,
      name: m.name,
      worktree: m.dir,
      vcs: null,
      timeUpdated: 0,
      lastSessionAt: null,
      sessionCount: 0,
      isManual: true
    }))
    return [...manual, ...dbProjects]
  }

  ipcMain.handle('db:health', async (): Promise<DbStatus> => {
    const path = resolveDbPath(store.getSettings())
    const status = await request<DbStatus>('health', {}, path)
    return { ...status, dbPath: path }
  })

  ipcMain.handle('environment:check', (): EnvCheck => {
    return checkEnvironment(resolveDbPath(store.getSettings()))
  })

  ipcMain.handle('projects:list', async (): Promise<ProjectInfo[]> => listProjects())

  ipcMain.handle('sessions:byProject', async (_e, projectId: string): Promise<SessionInfo[]> => {
    if (projectId.startsWith('manual:')) return []
    return request<SessionInfo[]>('sessions', { projectId })
  })

  ipcMain.handle('sessions:recent', async (): Promise<RecentSession[]> => {
    return request<RecentSession[]>('recentSessions', { limit: 50 })
  })

  ipcMain.handle('favorites:toggle', async (_e, dir: string, label: string): Promise<Favorite[]> => {
    return store.toggleFavorite(dir, label)
  })
  ipcMain.handle('favorites:list', async (): Promise<Favorite[]> => store.listFavorites())

  ipcMain.handle('recents:list', async (): Promise<RecentItem[]> => store.listRecents())

  ipcMain.handle('projects:addFolder', async (): Promise<ProjectInfo[]> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: '选择项目文件夹',
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          title: '选择项目文件夹',
          properties: ['openDirectory', 'createDirectory']
        })
    if (result.canceled || result.filePaths.length === 0) return listProjects()
    const dir = normalizeDir(result.filePaths[0])
    store.addManualProject(dir)
    store.addRecent(dir, dir.split('/').filter(Boolean).pop() ?? dir)
    return listProjects()
  })

  ipcMain.handle('projects:removeManual', async (_e, dir: string): Promise<ProjectInfo[]> => {
    store.removeManualProject(dir)
    return listProjects()
  })

  ipcMain.handle('projects:hide', async (_e, dir: string): Promise<ProjectInfo[]> => {
    store.hideProject(dir)
    return listProjects()
  })

  ipcMain.handle('projects:unhide', async (_e, dir: string): Promise<ProjectInfo[]> => {
    store.unhideProject(dir)
    return listProjects()
  })

  ipcMain.handle('projects:listHidden', (): string[] => store.listHiddenProjects())

  ipcMain.handle('launch:project', (_e, dir: string): LaunchResult => {
    const key = normalizeDir(dir)
    store.addRecent(key, key.split('/').filter(Boolean).pop() ?? key)
    return launchInTerminal({ dir: key, opencodeArgs: '' }, store.getSettings().terminal, store.getSettings().opencodePath)
  })

  ipcMain.handle('launch:shell', (_e, dir: string): LaunchResult => {
    const key = normalizeDir(dir)
    return launchInTerminal({ dir: key, opencodeArgs: null }, store.getSettings().terminal, store.getSettings().opencodePath)
  })

  ipcMain.handle('launch:session', (_e, dir: string, sessionId: string): LaunchResult => {
    const key = normalizeDir(dir)
    store.addRecent(key, key.split('/').filter(Boolean).pop() ?? key)
    return launchInTerminal(
      { dir: key, opencodeArgs: `-s ${sessionId}` },
      store.getSettings().terminal,
      store.getSettings().opencodePath
    )
  })

  ipcMain.handle('shell:explorer', async (_e, dir: string): Promise<void> => {
    if (existsSync(dir)) await shell.openPath(dir)
  })

  ipcMain.handle('settings:get', (): AppSettings => store.getSettings())

  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>): AppSettings => {
    return store.setSettings(patch)
  })

  ipcMain.handle('settings:pickDataDir', async (): Promise<AppSettings> => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = { title: '选择 opencode 数据目录（含 opencode.db）', properties: ['openDirectory' as const] }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return store.getSettings()
    return store.setSettings({ dataDir: result.filePaths[0] })
  })

  ipcMain.handle('opencode:check', (): OpencodeCheck => {
    const explicit = store.getSettings().opencodePath
    if (explicit && existsSync(explicit)) return { found: true, source: explicit }
    const out = runWhere()
    if (out.ok) return { found: true, source: out.line }
    return { found: false }
  })

  ipcMain.on('app:quit', () => {
    bridge.kill()
    app.quit()
  })
}

function runWhere(): { ok: boolean; line?: string } {
  try {
    const out = execFileSync('where.exe', ['opencode'], { encoding: 'utf8', windowsHide: true })
    const line = out.split(/\r?\n/).find(Boolean)
    return line ? { ok: true, line } : { ok: false }
  } catch {
    return { ok: false }
  }
}
