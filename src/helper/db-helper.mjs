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
let _sessionTable = null

// OpenCode 2.0 起把会话写入 session_v2，1.x 的 session 表就此冻结不再更新。
// 打开数据库时探测一次；旧库没有 session_v2，继续按 session 读。
function detectSessionTable(db) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'`)
    .get()
  return row ? 'session_v2' : 'session'
}

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
    _sessionTable = null
  }
  if (!dbPath || !existsSync(dbPath)) {
    const e = new Error(`未找到 opencode 数据库：${dbPath ?? '(未指定)'}`)
    e.code = 'ENOENT'
    throw e
  }
  _db = new DatabaseSync(dbPath, { readOnly: true })
  _openedPath = dbPath
  _sessionTable = detectSessionTable(_db)
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
  _sessionTable = null
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
  const table = _sessionTable
  const rows = db
    .prepare(
      `SELECT p.id, p.worktree, p.vcs, p.name, p.time_updated AS time_updated,
              (SELECT COUNT(*) FROM ${table} s WHERE s.project_id = p.id AND s.time_archived IS NULL AND s.parent_id IS NULL) AS session_count,
              (SELECT MAX(s.time_updated) FROM ${table} s WHERE s.project_id = p.id AND s.time_archived IS NULL AND s.parent_id IS NULL) AS last_session_at
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
  // 1.x 期间非 git 目录的会话挂在 global 项目下，只靠 session.directory 指回目录；
  // 2.0 会给同一目录补一条真正的 project 记录。两者必须按目录合并，否则这条
  // project 记录会把 global 会话遮蔽成 0 条。只有完全没有 project 记录的目录，
  // 才补成一个「派生项目」。
  const derived = db
    .prepare(
      `SELECT s.directory AS directory,
              COUNT(*) AS session_count,
              MAX(s.time_updated) AS last_session_at
         FROM ${table} s
        WHERE s.project_id = 'global' AND s.time_archived IS NULL AND s.parent_id IS NULL
          AND s.directory IS NOT NULL AND s.directory <> ''
        GROUP BY s.directory`
    )
    .all()
  const byDirectory = new Map()
  for (const r of derived) {
    const dir = normalizeDir(r.directory)
    if (!dir) continue
    const acc = byDirectory.get(dir) ?? { sessionCount: 0, lastSessionAt: null }
    acc.sessionCount += r.session_count ?? 0
    acc.lastSessionAt = Math.max(acc.lastSessionAt ?? 0, r.last_session_at ?? 0) || null
    byDirectory.set(dir, acc)
  }
  const byWorktree = new Map(projects.map((p) => [normalizeDir(p.worktree), p]))
  for (const [dir, acc] of byDirectory) {
    const project = byWorktree.get(dir)
    if (project) {
      project.sessionCount += acc.sessionCount
      project.lastSessionAt = Math.max(project.lastSessionAt ?? 0, acc.lastSessionAt ?? 0) || null
      continue
    }
    projects.push({
      id: `dir:${dir}`,
      name: basenameSafe(dir),
      worktree: dir,
      vcs: null,
      timeUpdated: acc.lastSessionAt ?? 0,
      lastSessionAt: acc.lastSessionAt,
      sessionCount: acc.sessionCount
    })
  }
  projects.sort((a, b) => (b.lastSessionAt ?? b.timeUpdated) - (a.lastSessionAt ?? a.timeUpdated))
  return projects
}

export function listSessionsByProject(dbPath, projectId) {
  const db = openDb(dbPath)
  const table = _sessionTable
  if (typeof projectId === 'string' && projectId.startsWith('dir:')) {
    // 派生项目：按会话 directory 查询
    return db
      .prepare(
        `SELECT id, project_id, directory, title, agent, model, time_created, time_updated
           FROM ${table}
          WHERE directory = ? AND time_archived IS NULL AND parent_id IS NULL
          ORDER BY time_updated DESC
          LIMIT 300`
      )
      .all(projectId.slice(4))
      .map(mapSession)
  }
  // 真实项目记录：既包含 project_id 命中的会话，也包含挂在 global 项目下、但
  // directory 指向该项目 worktree 的历史会话（2.0 的按目录项目记录接管的正是这些）。
  const project = db.prepare(`SELECT worktree FROM project WHERE id = ?`).get(projectId)
  const worktree = normalizeDir(project?.worktree)
  return db
    .prepare(
      `SELECT id, project_id, directory, title, agent, model, time_created, time_updated
         FROM ${table}
        WHERE time_archived IS NULL AND parent_id IS NULL
          AND (project_id = ?
               OR (project_id = 'global' AND rtrim(replace(directory, '\\', '/'), '/') = ?))
        ORDER BY time_updated DESC
        LIMIT 300`
    )
    .all(projectId, worktree)
    .map(mapSession)
}

export function listRecentSessions(dbPath, limit = 50) {
  const db = openDb(dbPath)
  const rows = db
    .prepare(
      `SELECT s.id, s.project_id, s.directory, s.title, s.agent, s.model, s.time_created, s.time_updated,
              COALESCE(NULLIF(p.worktree, '/'), s.directory) AS project_worktree
         FROM ${_sessionTable} s
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
