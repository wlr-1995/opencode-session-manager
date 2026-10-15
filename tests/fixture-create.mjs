import { DatabaseSync } from 'node:sqlite'

const dbPath = process.env.FIXTURE_DB
if (!dbPath) {
  process.exit(2)
}

// v1：仅 OpenCode 1.x 的 session 表
// v2：session 表（升级前的冻结快照）与 session_v2 表（2.0 起写入的表）同时存在
const schema = process.env.FIXTURE_SCHEMA === 'v2' ? 'v2' : 'v1'

const db = new DatabaseSync(dbPath)

db.exec(`
  CREATE TABLE project (
    id TEXT PRIMARY KEY, worktree TEXT, vcs TEXT, name TEXT,
    icon_url TEXT, icon_color TEXT, time_created INTEGER, time_updated INTEGER,
    time_initialized INTEGER, sandboxes TEXT, commands TEXT, icon_url_override TEXT
  );
  CREATE TABLE session (
    id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, slug TEXT, directory TEXT,
    title TEXT, version INTEGER, share_url TEXT, summary_additions INTEGER,
    summary_deletions INTEGER, summary_files INTEGER, summary_diffs INTEGER,
    revert TEXT, permission TEXT, time_created INTEGER, time_updated INTEGER,
    time_compacting INTEGER, time_archived INTEGER, workspace_id TEXT, path TEXT,
    agent TEXT, model TEXT, cost REAL, tokens_input INTEGER, tokens_output INTEGER,
    tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER, metadata TEXT
  );
  INSERT INTO project (id, worktree, vcs, name, time_updated) VALUES
    ('global', '/', NULL, NULL, 1),
    ('p1', 'D:/proj/alpha', 'git', 'Alpha', 1000),
    ('p2', 'D:/proj/beta', 'git', NULL, 500);
`)

// 升级到 2.0 之后，opencode 会为非 git 目录建一条真正的 project 记录。
// 它与会带 directory 的 global 会话指向同一目录，正是遮蔽问题的来源。
if (schema === 'v2') {
  db.exec(`
    CREATE TABLE session_v2 (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, workspace_id TEXT, parent_id TEXT,
      fork_session_id TEXT, fork_boundary TEXT, slug TEXT NOT NULL, directory TEXT NOT NULL,
      path TEXT, title TEXT, version TEXT NOT NULL, share_url TEXT,
      summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
      summary_diffs TEXT, metadata TEXT, cost REAL DEFAULT 0 NOT NULL,
      tokens_input INTEGER DEFAULT 0 NOT NULL, tokens_output INTEGER DEFAULT 0 NOT NULL,
      tokens_reasoning INTEGER DEFAULT 0 NOT NULL, tokens_cache_read INTEGER DEFAULT 0 NOT NULL,
      tokens_cache_write INTEGER DEFAULT 0 NOT NULL, revert TEXT, permission TEXT,
      agent TEXT, model TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
      time_compacting INTEGER, time_archived INTEGER, time_suspended INTEGER,
      resume_attempts INTEGER DEFAULT 0 NOT NULL, time_idle INTEGER, time_viewed INTEGER,
      idle_outcome TEXT
    );
  `)
  db.prepare(
    `INSERT INTO project (id, worktree, vcs, name, time_updated) VALUES (?, ?, ?, ?, ?)`
  ).run('p3', 'D:/proj/other', null, null, 500)
}

const COLUMNS = `id, project_id, parent_id, slug, directory, title, version, agent, model,
  time_created, time_updated, time_archived`

// 1.x 期间的历史会话：s4 挂在 global 项目下，但 directory 指向自己的目录。
// s5 是子会话，s3 已归档，两者都不该出现在列表里。
const legacySessions = [
  ['s1', 'p1', null, 'D:/proj/alpha', '修复登录', 'build', '{"id":"m1","providerID":"p","variant":"high"}', 100, 900, null],
  ['s2', 'p1', null, 'D:/proj/alpha', '重构', 'plan', null, 200, 800, null],
  ['s3', 'p1', null, 'D:/proj/alpha', '旧归档', 'build', null, 300, 700, 1000],
  ['s4', 'global', null, 'D:/proj/other', '全局会话', 'build', null, 400, 600, null],
  ['s5', 'p1', 's1', 'D:/proj/alpha', 'explore 子会话', 'explore', null, 500, 950, null]
]

// 2.0 起的会话只写 session_v2，session 表里没有。
const v2Sessions = [
  ['s6', 'p1', null, 'D:/proj/alpha', 'V2 新会话', 'build', '{"id":"m2","providerID":"p","variant":"high"}', 1100, 1200, null]
]

function insertAll(table, sessions, version) {
  const stmt = db.prepare(`INSERT INTO ${table} (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const s of sessions) {
    const [id, projectId, parentId, directory, title, agent, model, created, updated, archived] = s
    stmt.run(id, projectId, parentId, id, directory, title, version, agent, model, created, updated, archived)
  }
}

insertAll('session', legacySessions, '1.18.31')
if (schema === 'v2') insertAll('session_v2', [...legacySessions, ...v2Sessions], '2.0.29')

db.close()
