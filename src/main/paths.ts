import { app } from 'electron'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function defaultDataDir(): string {
  if (process.env.OPENCODE_DATA_DIR) return process.env.OPENCODE_DATA_DIR
  if (process.env.XDG_DATA_HOME) return join(process.env.XDG_DATA_HOME, 'opencode')
  return join(homedir(), '.local', 'share', 'opencode')
}

export function dbPathFor(dataDir: string): string {
  return join(dataDir, 'opencode.db')
}

export function helperPath(): string {
  const dev = join(app.getAppPath(), 'src', 'helper', 'db-helper.mjs')
  if (existsSync(dev)) return dev
  const packaged = join(process.resourcesPath, 'db-helper.mjs')
  if (existsSync(packaged)) return packaged
  throw new Error(`找不到 db-helper.mjs，尝试位置：${dev}`)
}
