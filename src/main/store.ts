import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings, Favorite, RecentItem } from '@shared/types'

export interface StoreData {
  settings: AppSettings
  favorites: Favorite[]
  recents: RecentItem[]
  manualProjects: { name: string; dir: string }[]
  hiddenProjects: string[]
}

const DEFAULT_SETTINGS: AppSettings = {
  dataDir: null,
  terminal: 'pwsh',
  opencodePath: null
}

export function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, '/').replace(/\/+$/, '')
}

export class Store {
  private readonly file: string
  private data: StoreData

  constructor(file?: string) {
    this.file = file ?? join(app.getPath('userData'), 'manager-store.json')
    this.data = this.load()
  }

  private load(): StoreData {
    try {
      if (!existsSync(this.file)) return { settings: { ...DEFAULT_SETTINGS }, favorites: [], recents: [], manualProjects: [], hiddenProjects: [] }
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StoreData>
      return {
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
        favorites: raw.favorites ?? [],
        recents: raw.recents ?? [],
        manualProjects: raw.manualProjects ?? [],
        hiddenProjects: raw.hiddenProjects ?? []
      }
    } catch {
      return { settings: { ...DEFAULT_SETTINGS }, favorites: [], recents: [], manualProjects: [], hiddenProjects: [] }
    }
  }

  save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
  }

  getSettings(): AppSettings {
    return { ...this.data.settings }
  }

  setSettings(patch: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...patch }
    this.save()
    return this.getSettings()
  }

  isFavorite(dir: string): boolean {
    const key = normalizeDir(dir)
    return this.data.favorites.some((f) => f.key === key)
  }

  toggleFavorite(dir: string, label: string): Favorite[] {
    const key = normalizeDir(dir)
    const idx = this.data.favorites.findIndex((f) => f.key === key)
    if (idx >= 0) {
      this.data.favorites.splice(idx, 1)
    } else {
      this.data.favorites.unshift({ key, label, dir: key })
    }
    this.save()
    return this.listFavorites()
  }

  listFavorites(): Favorite[] {
    return [...this.data.favorites]
  }

  addRecent(dir: string, label: string): void {
    const key = normalizeDir(dir)
    this.data.recents = [
      { key, label, dir: key, at: Date.now() },
      ...this.data.recents.filter((r) => r.key !== key)
    ].slice(0, 20)
    this.save()
  }

  listRecents(): RecentItem[] {
    return [...this.data.recents]
  }

  addManualProject(dir: string): { name: string; dir: string }[] {
    const key = normalizeDir(dir)
    const base = key.split('/').filter(Boolean).pop() ?? key
    const existing = this.data.manualProjects.some((m) => normalizeDir(m.dir) === key)
    if (!existing) {
      this.data.manualProjects.unshift({ name: base, dir: key })
      this.save()
    }
    return this.listManualProjects()
  }

  removeManualProject(dir: string): { name: string; dir: string }[] {
    const key = normalizeDir(dir)
    this.data.manualProjects = this.data.manualProjects.filter((m) => normalizeDir(m.dir) !== key)
    this.save()
    return this.listManualProjects()
  }

  listManualProjects(): { name: string; dir: string }[] {
    return [...this.data.manualProjects]
  }

  isHidden(dir: string): boolean {
    const key = normalizeDir(dir)
    return this.data.hiddenProjects.includes(key)
  }

  hideProject(dir: string): string[] {
    const key = normalizeDir(dir)
    if (!this.data.hiddenProjects.includes(key)) {
      this.data.hiddenProjects.push(key)
      this.save()
    }
    return this.listHiddenProjects()
  }

  unhideProject(dir: string): string[] {
    const key = normalizeDir(dir)
    this.data.hiddenProjects = this.data.hiddenProjects.filter((k) => k !== key)
    this.save()
    return this.listHiddenProjects()
  }

  listHiddenProjects(): string[] {
    return [...this.data.hiddenProjects]
  }
}
