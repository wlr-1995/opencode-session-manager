import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

const DEFAULT_DATA_DIR = join(homedir(), '.local', 'share', 'opencode')

export function defaultDbPath(dataDir = process.env.OPENCODE_DATA_DIR || DEFAULT_DATA_DIR) {
  return join(dataDir, 'opencode.db')
}

let _db = null
let _openedPath = null

export function openDb(dbPath) {
  if (_db && _openedPath === dbPath) return _db
  if (_db) {
    try {
      _db.close()
    } catch {
      /* ignore */
    }
    _db = null
    _openedPath = null
  }
  if (!dbPath || !existsSync(dbPath)) {
    const e = new Error(`未找到 opencode 数据库：${dbPath ?? '(未指定)'}`)
    e.code = 'ENOENT'
    throw e
  }
  _db = new DatabaseSync(dbPath, { readOnly: true })
  _openedPath = dbPath
  return _db
}

export function closeDb() {
  if (_db) {
    try {
      _db.close()
    } catch {
      /* ignore */
    }
  }
  _db = null
  _openedPath = null
}

export function health(dbPath) {
  if (!dbPath || !existsSync(dbPath)) return { ok: false, dbPath, error: '数据库文件不存在' }
  try {
    openDb(dbPath)
    return { ok: true, dbPath }
  } catch (err) {
    return { ok: false, dbPath, error: err instanceof Error ? err.message : String(err) }
  }
}

export function listProjects(dbPath) {
  const db = openDb(dbPath)
  const rows = db
    .prepare(
      `SELECT p.id, p.worktree, p.vcs, p.name, p.time_updated AS time_updated,
              (SELECT COUNT(*) FROM session s WHERE s.project_id = p.id AND s.time_archived IS NULL AND s.parent_id IS NULL) AS session_count,
              (SELECT MAX(s.time_updated) FROM session s WHERE s.project_id = p.id AND s.time_archived IS NULL AND s.parent_id IS NULL) AS last_session_at
         FROM project p
        WHERE p.id <> 'global'
        ORDER BY COALESCE(last_session_at, p.time_updated) DESC`
    )
    .all()
  const projects = rows.map((r) => ({
    id: r.id,
    name: r.name || basenameSafe(r.worktree),
    worktree: r.worktree,
    vcs: r.vcs,
    timeUpdated: r.time_updated ?? 0,
    lastSessionAt: r.last_session_at ?? null,
    sessionCount: r.session_count ?? 0
  }))
  // 部分会话挂在 global 项目下，但每个会话自带 directory（如非 git 目录）。
  // 按 directory 聚合出“派生项目”，补全项目列表。
  const derived = db
    .prepare(
      `SELECT s.directory AS directory,
              COUNT(*) AS session_count,
              MAX(s.time_updated) AS last_session_at
         FROM session s
        WHERE s.project_id = 'global' AND s.time_archived IS NULL AND s.parent_id IS NULL
          AND s.directory IS NOT NULL AND s.directory <> ''
        GROUP BY s.directory`
    )
    .all()
  const seen = new Set(projects.map((p) => normalizeDir(p.worktree)))
  for (const r of derived) {
    const dir = normalizeDir(r.directory)
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    projects.push({
      id: `dir:${dir}`,
      name: basenameSafe(dir),
      worktree: dir,
      vcs: null,
      timeUpdated: r.last_session_at ?? 0,
      lastSessionAt: r.last_session_at ?? null,
      sessionCount: r.session_count ?? 0
    })
  }
  projects.sort((a, b) => (b.lastSessionAt ?? b.timeUpdated) - (a.lastSessionAt ?? a.timeUpdated))
  return projects
}

export function listSessionsByProject(dbPath, projectId) {
  const db = openDb(dbPath)
  let sql
  let params
  if (typeof projectId === 'string' && projectId.startsWith('dir:')) {
    // 派生项目：按会话 directory 查询
    sql = `SELECT id, project_id, directory, title, agent, model, time_created, time_updated
             FROM session
            WHERE directory = ? AND time_archived IS NULL AND parent_id IS NULL
            ORDER BY time_updated DESC
            LIMIT 300`
    params = [projectId.slice(4)]
  } else {
    sql = `SELECT id, project_id, directory, title, agent, model, time_created, time_updated
             FROM session
            WHERE project_id = ? AND time_archived IS NULL AND parent_id IS NULL
            ORDER BY time_updated DESC
            LIMIT 300`
    params = [projectId]
  }
  const rows = db.prepare(sql).all(...params)
  return rows.map(mapSession)
}

export function listRecentSessions(dbPath, limit = 50) {
  const db = openDb(dbPath)
  const rows = db
    .prepare(
      `SELECT s.id, s.project_id, s.directory, s.title, s.agent, s.model, s.time_created, s.time_updated,
              COALESCE(NULLIF(p.worktree, '/'), s.directory) AS project_worktree
         FROM session s
         LEFT JOIN project p ON p.id = s.project_id
        WHERE s.time_archived IS NULL AND s.parent_id IS NULL
        ORDER BY s.time_updated DESC
        LIMIT ?`
    )
    .all(limit)
  return rows.map((r) => ({ ...mapSession(r), projectWorktree: r.project_worktree ?? null }))
}

function mapSession(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    directory: r.directory ?? null,
    title: r.title ?? null,
    agent: r.agent ?? null,
    model: r.model ?? null,
    timeCreated: r.time_created ?? 0,
    timeUpdated: r.time_updated ?? 0
  }
}

function basenameSafe(p) {
  if (!p) return '(未命名)'
  const parts = String(p).replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function normalizeDir(p) {
  if (!p) return ''
  return String(p).replace(/\\/g, '/').replace(/\/+$/, '')
}

function handle(req) {
  const { id, op, dbPath } = req
  switch (op) {
    case 'ping':
      return { dbPath, version: 1 }
    case 'health':
      return health(dbPath)
    case 'projects':
      return listProjects(dbPath)
    case 'sessions':
      return listSessionsByProject(dbPath, req.projectId)
    case 'recentSessions':
      return listRecentSessions(dbPath, req.limit ?? 50)
    default:
      throw new Error(`未知操作：${op}`)
  }
}

export function createHandler(dbPath) {
  return (req) => {
    if (req.dbPath !== dbPath) closeDb()
    return handle(req)
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  const defaultPath = defaultDbPath()
  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let id = null
    try {
      const req = JSON.parse(trimmed)
      id = req.id ?? null
      const dbPath = req.dbPath || defaultPath
      const data = handle({ ...req, dbPath })
      process.stdout.write(JSON.stringify({ id, ok: true, data }) + '\n')
    } catch (err) {
      process.stdout.write(
        JSON.stringify({
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        }) + '\n'
      )
    }
  })
  rl.on('close', () => closeDb())
}
