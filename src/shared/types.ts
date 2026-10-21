export interface ProjectInfo {
  id: string
  name: string
  worktree: string
  vcs: string | null
  timeUpdated: number
  lastSessionAt: number | null
  sessionCount: number
  isManual?: boolean
}

export interface SessionInfo {
  id: string
  projectId: string
  directory: string | null
  title: string | null
  agent: string | null
  model: string | null
  timeCreated: number
  timeUpdated: number
}

export interface RecentSession extends SessionInfo {
  projectWorktree: string | null
}

export interface DbStatus {
  ok: boolean
  dbPath: string | null
  error?: string
}

export interface AppSettings {
  dataDir: string | null
  opencodePath: string | null
  /** 以管理员身份启动终端窗口 */
  runAsAdmin: boolean
}

export interface Favorite {
  key: string
  label: string
  dir: string
}

export interface RecentItem {
  key: string
  label: string
  dir: string
  at: number
}

export interface LaunchResult {
  ok: boolean
  error?: string
}

export interface OpencodeCheck {
  found: boolean
  source?: string
}

export interface EnvNodeInfo {
  found: boolean
  version: string | null
  /** 系统 node 是否支持 node:sqlite（需 Node ≥ 22.5） */
  sqlite: boolean
}

export interface EnvTerminalInfo {
  found: boolean
  path: string | null
}

export interface EnvCheck {
  /** 当前运行平台（win32 / linux / darwin） */
  platform: string
  node: EnvNodeInfo
  pwsh: { found: boolean; path: string | null }
  terminal: EnvTerminalInfo
  dbPath: string
  dbExists: boolean
}

export interface ManagerApi {
  health(): Promise<DbStatus>
  environmentCheck(): Promise<EnvCheck>
  listProjects(): Promise<ProjectInfo[]>
  sessionsByProject(projectId: string): Promise<SessionInfo[]>
  recentSessions(): Promise<RecentSession[]>
  searchSessions(keyword: string): Promise<RecentSession[]>
  toggleFavorite(dir: string, label: string): Promise<Favorite[]>
  listFavorites(): Promise<Favorite[]>
  listRecents(): Promise<RecentItem[]>
  addFolder(): Promise<ProjectInfo[]>
  removeManual(dir: string): Promise<ProjectInfo[]>
  hideProject(dir: string): Promise<ProjectInfo[]>
  unhideProject(dir: string): Promise<ProjectInfo[]>
  listHiddenProjects(): Promise<string[]>
  launchProject(dir: string): Promise<LaunchResult>
  launchShell(dir: string): Promise<LaunchResult>
  launchSession(dir: string, sessionId: string): Promise<LaunchResult>
  openInExplorer(dir: string): Promise<void>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  pickDataDir(): Promise<AppSettings>
  checkOpencode(): Promise<OpencodeCheck>
  quit(): void
}
