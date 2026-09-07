import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { EnvCheck } from '@shared/types'

export function checkNode(): { found: boolean; version: string | null; sqlite: boolean } {
  let version: string | null = null
  try {
    version = execFileSync('node', ['-p', 'process.versions.node'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    }).trim()
  } catch {
    /* 未找到 node */
  }
  let sqlite = false
  if (version) {
    try {
      execFileSync('node', ['-e', "require('node:sqlite'); process.exit(0)"], {
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

/** 启动终端用：优先 PowerShell 7（pwsh），否则回退系统自带 Windows PowerShell（powershell.exe） */
export function resolveShellName(): string {
  return checkPwsh().found ? 'pwsh' : 'powershell.exe'
}

export function checkEnvironment(dbPath: string): EnvCheck {
  return {
    node: checkNode(),
    pwsh: checkPwsh(),
    dbPath,
    dbExists: existsSync(dbPath)
  }
}
