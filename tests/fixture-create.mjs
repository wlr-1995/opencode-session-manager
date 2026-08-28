import { DatabaseSync } from 'node:sqlite'

const dbPath = process.env.FIXTURE_DB
if (!dbPath) {
  process.exit(2)
}

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
    INSERT INTO session (id, project_id, parent_id, directory, title, agent, model, time_created, time_updated, time_archived) VALUES
      ('s1', 'p1', NULL, 'D:/proj/alpha', '修复登录', 'build', '{"id":"m1","providerID":"p","variant":"high"}', 100, 900, NULL),
      ('s2', 'p1', NULL, 'D:/proj/alpha', '重构', 'plan', NULL, 200, 800, NULL),
      ('s3', 'p1', NULL, 'D:/proj/alpha', '旧归档', 'build', NULL, 300, 700, 1000),
      ('s4', 'global', NULL, 'D:/proj/other', '全局会话', 'build', NULL, 400, 600, NULL),
      ('s5', 'p1', 's1', 'D:/proj/alpha', 'explore 子会话', 'explore', NULL, 500, 950, NULL);
`)
db.close()
