import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  DbStatus,
  EnvCheck,
  Favorite,
  LaunchResult,
  ManagerApi,
  OpencodeCheck,
  ProjectInfo,
  RecentItem,
  RecentSession,
  SessionInfo
} from '../shared/types'

const api: ManagerApi = {
  health: () => ipcRenderer.invoke('db:health') as Promise<DbStatus>,
  environmentCheck: () => ipcRenderer.invoke('environment:check') as Promise<EnvCheck>,
  listProjects: () => ipcRenderer.invoke('projects:list') as Promise<ProjectInfo[]>,
  sessionsByProject: (projectId: string) =>
    ipcRenderer.invoke('sessions:byProject', projectId) as Promise<SessionInfo[]>,
  recentSessions: () => ipcRenderer.invoke('sessions:recent') as Promise<RecentSession[]>,
  toggleFavorite: (dir: string, label: string) =>
    ipcRenderer.invoke('favorites:toggle', dir, label) as Promise<Favorite[]>,
  listFavorites: () => ipcRenderer.invoke('favorites:list') as Promise<Favorite[]>,
  listRecents: () => ipcRenderer.invoke('recents:list') as Promise<RecentItem[]>,
  addFolder: () => ipcRenderer.invoke('projects:addFolder') as Promise<ProjectInfo[]>,
  removeManual: (dir: string) => ipcRenderer.invoke('projects:removeManual', dir) as Promise<ProjectInfo[]>,
  hideProject: (dir: string) => ipcRenderer.invoke('projects:hide', dir) as Promise<ProjectInfo[]>,
  unhideProject: (dir: string) => ipcRenderer.invoke('projects:unhide', dir) as Promise<ProjectInfo[]>,
  listHiddenProjects: () => ipcRenderer.invoke('projects:listHidden') as Promise<string[]>,
  launchProject: (dir: string) => ipcRenderer.invoke('launch:project', dir) as Promise<LaunchResult>,
  launchShell: (dir: string) => ipcRenderer.invoke('launch:shell', dir) as Promise<LaunchResult>,
  launchSession: (dir: string, sessionId: string) =>
    ipcRenderer.invoke('launch:session', dir, sessionId) as Promise<LaunchResult>,
  openInExplorer: (dir: string) => ipcRenderer.invoke('shell:explorer', dir) as Promise<void>,
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
  setSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke('settings:set', patch) as Promise<AppSettings>,
  pickDataDir: () => ipcRenderer.invoke('settings:pickDataDir') as Promise<AppSettings>,
  checkOpencode: () => ipcRenderer.invoke('opencode:check') as Promise<OpencodeCheck>,
  quit: () => {
    ipcRenderer.send('app:quit')
  }
}

contextBridge.exposeInMainWorld('api', api)
