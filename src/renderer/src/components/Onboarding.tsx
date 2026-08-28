import type { EnvCheck } from '@shared/types'

interface Props {
  dbError: string
  env: EnvCheck | null
  onRetry: () => void
  onPickDataDir: () => void
  onQuit: () => void
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className={`status-row ${ok ? 'ok' : 'warn'}`}>
      <span className="status-mark">{ok ? '✓' : '✕'}</span>
      <span className="status-label">{label}</span>
      <span className="status-detail">{detail}</span>
    </div>
  )
}

export default function Onboarding({ dbError, env, onRetry, onPickDataDir, onQuit }: Props) {
  // 读库优先用应用内置 node.exe；系统 Node 太旧时提示（非致命，通常可用内置版）
  const nodeNeedsUpgrade = env?.node.found && !env.node.sqlite
  const nodeOk = nodeNeedsUpgrade ? false : !!env?.node.found
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="logo">◈</div>
        <h1>OpenCode 会话管理器</h1>
        <p className="muted">暂时无法读取 opencode 数据。</p>
        <div className="error-box">{dbError}</div>

        {env && (
          <div className="env-box">
            <StatusRow
              label="Node.js（读取数据库）"
              ok={nodeOk}
              detail={
                env.node.found
                  ? env.node.sqlite
                    ? `v${env.node.version}`
                    : `v${env.node.version}（偏旧，需 ≥22.5；应用已内置新版 node.exe）`
                  : '系统未安装（应用内置 node.exe 可用）'
              }
            />
            <StatusRow
              label="PowerShell（启动终端）"
              ok={env.pwsh.found}
              detail={
                env.pwsh.found ? (env.pwsh.path ?? '') : '未安装 PowerShell 7，将回退到系统自带 Windows PowerShell'
              }
            />
            <StatusRow
              label="opencode 数据库"
              ok={env.dbExists}
              detail={env.dbExists ? env.dbPath : `未找到：${env.dbPath}`}
            />
          </div>
        )}

        <ol className="steps">
          <li>先通过命令行在任意项目里运行一次 <code>opencode</code>，生成数据文件。</li>
          <li>数据默认位于 <code>~/.local/share/opencode/opencode.db</code>；如用旧版 opencode（文件存储），数据在 <code>project/</code> 目录下。</li>
          <li>若数据在其他位置，点击下方按钮手动选择数据目录。</li>
        </ol>
        <div className="btn-row">
          <button className="btn" onClick={onRetry}>
            ⟳ 重新检测
          </button>
          <button className="btn primary" onClick={onPickDataDir}>
            选择数据目录
          </button>
          <button className="btn" onClick={onQuit}>
            退出
          </button>
        </div>
      </div>
    </div>
  )
}
