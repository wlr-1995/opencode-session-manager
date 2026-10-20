import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import type { EnvCheck } from '@shared/types'

const isWindows = process.platform === 'win32'

export interface TerminalInfo {
  found: boolean
  path: string | null
  name: string | null
}

/** Linux 上常见的终端模拟器，按优先级排列 */
export const TERMINAL_CANDIDATES = [
  'x-terminal-emulator',
  'gnome-terminal',
  'konsole',
  'xfce4-terminal',
  'mate-terminal',
  'tilix',
  'kitty',
  'alacritty',
  'wezterm',
  'xterm'
]

/** GUI 启动时 PATH 往往不完整，补充一些常见目录 */
function extraBinDirs(): string[] {
  const home = homedir()
  const dirs = [
    join(home, '.opencode', 'bin'),
    join(home, '.local', 'bin'),
    join(home, 'bin'),
    join(home, 'nodejs', 'bin'),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/opt/homebrew/bin'
  ]
  const scan = (base: string, rest: string[]): void => {
    try {
      for (const name of readdirSync(base)) dirs.push(join(base, name, ...rest))
    } catch {
      /* 目录不存在 */
    }
  }
  // nvm / fnm / volta 安装的 node
  scan(join(home, '.nvm', 'versions', 'node'), ['bin'])
  scan(join(home, '.local', 'share', 'fnm', 'node-versions'), ['installation', 'bin'])
  dirs.push(join(home, '.volta', 'bin'))
  return dirs
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** 在 PATH 与常见安装目录中查找可执行文件；Windows 继续使用 where.exe */
export function findExecutable(name: string): string | null {
  if (isWindows) {
    try {
      const out = execFileSync('where.exe', [name], { encoding: 'utf8', windowsHide: true })
      for (const line of out.split(/\r?\n/)) {
        const t = line.trim()
        if (t && existsSync(t)) return t
      }
    } catch {
      /* 未找到 */
    }
    return null
  }
  const seen = new Set<string>()
  for (const dir of [...(process.env.PATH ?? '').split(delimiter), ...extraBinDirs()]) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    const full = join(dir, name)
    if (isExecutableFile(full)) return full
  }
  return null
}

/** 读取数据库用的 Node：环境变量 > 打包内置 > PATH / 常见目录 */
export function findNodeBinary(): string | null {
  const override = process.env.OPENCODE_MANAGER_NODE
  if (override && existsSync(override)) return override
  const bundled = join(process.resourcesPath ?? '', isWindows ? 'node.exe' : 'node')
  if (process.resourcesPath && existsSync(bundled)) return bundled
  return findExecutable('node')
}

let sqliteArgsCache: string[] | null = null

/**
 * Node 22.5–23.x 的 node:sqlite 需要 --experimental-sqlite（24+ 默认可用）。
 * 启动 helper 前探测一次，返回需要的额外参数。
 */
export function nodeSqliteArgs(): string[] {
  if (sqliteArgsCache) return sqliteArgsCache
  const bin = findNodeBinary()
  if (!bin) return []
  const works = (args: string[]): boolean => {
    try {
      execFileSync(bin, [...args, '-e', "require('node:sqlite'); process.exit(0)"], {
        timeout: 5000,
        stdio: 'ignore',
        windowsHide: true
      })
      return true
    } catch {
      return false
    }
  }
  if (works([])) sqliteArgsCache = []
  else if (works(['--experimental-sqlite'])) sqliteArgsCache = ['--experimental-sqlite']
  else sqliteArgsCache = []
  return sqliteArgsCache
}

export function checkNode(): { found: boolean; version: string | null; sqlite: boolean } {
  const bin = findNodeBinary()
  if (!bin) return { found: false, version: null, sqlite: false }
  let version: string | null = null
  try {
    version = execFileSync(bin, ['-p', 'process.versions.node'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    }).trim()
  } catch {
    /* node 不可用 */
  }
  let sqlite = false
  if (version) {
    try {
      execFileSync(bin, [...nodeSqliteArgs(), '-e', "require('node:sqlite'); process.exit(0)"], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
        stdio: 'ignore'
      })
      sqlite = true
    } catch {
      /* node:sqlite 不可用（Node < 22.5） */
    }
  }
  return { found: version !== null, version, sqlite }
}

export function checkPwsh(): { found: boolean; path: string | null } {
  if (!isWindows) return { found: false, path: null }
  try {
    const out = execFileSync('where.exe', ['pwsh'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    })
    const line = out.split(/\r?\n/).find(Boolean)
    return line ? { found: true, path: line } : { found: false, path: null }
  } catch {
    return { found: false, path: null }
  }
}

export function checkWt(): { found: boolean; path: string | null } {
  if (!isWindows) return { found: false, path: null }
  try {
    const out = execFileSync('where.exe', ['wt'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    })
    const line = out.split(/\r?\n/).find(Boolean)
    return line ? { found: true, path: line } : { found: false, path: null }
  } catch {
    return { found: false, path: null }
  }
}

/** Linux/macOS 上查找可用的终端模拟器（优先环境变量 TERMINAL） */
export function checkTerminal(): TerminalInfo {
  if (isWindows) {
    const wt = checkWt()
    return { found: wt.found, path: wt.path, name: wt.found ? 'wt.exe' : null }
  }
  const preferred = process.env.TERMINAL
  if (preferred) {
    const path = preferred.includes('/') ? preferred : findExecutable(preferred)
    if (path && isExecutableFile(path)) return { found: true, path, name: basename(path) }
  }
  for (const name of TERMINAL_CANDIDATES) {
    const path = findExecutable(name)
    if (path) return { found: true, path, name }
  }
  return { found: false, path: null, name: null }
}

/** 启动终端用：Windows 优先 PowerShell 7；Linux/macOS 使用用户登录 shell */
export function resolveShellName(): string {
  if (!isWindows) {
    const sh = process.env.SHELL
    if (sh && isExecutableFile(sh)) return sh
    return findExecutable('bash') ?? '/bin/sh'
  }
  return checkPwsh().found ? 'pwsh' : 'powershell.exe'
}

export function checkEnvironment(dbPath: string): EnvCheck {
  return {
    platform: process.platform,
    node: checkNode(),
    pwsh: checkPwsh(),
    terminal: checkTerminal(),
    dbPath,
    dbExists: existsSync(dbPath)
  }
}
