import type { AppSettings, OpencodeCheck } from '@shared/types'
import { basename } from '../format'

interface Props {
  settings: AppSettings
  opencodeCheck: OpencodeCheck | null
  hiddenProjects: string[]
  platform: string
  onChange: (patch: Partial<AppSettings>) => void
  onPickDataDir: () => void
  onCheckOpencode: () => void
  onUnhide: (dir: string) => void
  onClose: () => void
}

export default function SettingsModal({
  settings,
  opencodeCheck,
  hiddenProjects,
  platform,
  onChange,
  onPickDataDir,
  onCheckOpencode,
  onUnhide,
  onClose
}: Props) {
  const isWindows = platform === 'win32'
  const terminalLabel = isWindows ? 'PowerShell' : '终端'
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>设置</h3>
          <button className="btn small" onClick={onClose}>
            ✕
          </button>
        </div>

        {isWindows && (
          <div className="field">
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.runAsAdmin}
                onChange={(e) => onChange({ runAsAdmin: e.target.checked })}
              />
              以管理员身份启动终端
            </label>
            <p className="muted">
              勾选后，「打开项目 / PowerShell / 续接会话」将以管理员权限运行，会弹出 UAC 确认。
              有 Windows Terminal 时用提升的 Windows Terminal 打开（显示正常），否则回退控制台窗口。
            </p>
          </div>
        )}

        <div className="field">
          <label>opencode 数据目录</label>
          <div className="path-row">
            <input
              className="text-input"
              readOnly
              value={settings.dataDir || '默认（~/.local/share/opencode）'}
            />
            <button className="btn" onClick={onPickDataDir}>
              浏览…
            </button>
          </div>
        </div>

        <div className="field">
          <label>opencode 命令检测</label>
          <div className="path-row">
            <div className="check-line">
              {opencodeCheck === null ? (
                <span className="muted">检测中…</span>
              ) : opencodeCheck.found ? (
                <span className="ok">✓ 已找到：{opencodeCheck.source}</span>
              ) : (
                <span className="warn">✕ 未找到 opencode（在 PATH 中）</span>
              )}
            </div>
            <button className="btn" onClick={onCheckOpencode}>
              重新检测
            </button>
          </div>
          <p className="muted">
            默认使用 PATH 中的 <code>opencode</code>，在新{terminalLabel}窗口中可直接运行。
          </p>
        </div>

        <div className="field">
          <label>隐藏的项目</label>
          {hiddenProjects.length === 0 ? (
            <p className="muted">暂无隐藏项目。</p>
          ) : (
            hiddenProjects.map((dir) => (
              <div key={dir} className="hidden-row">
                <div className="hidden-info">
                  <span className="hidden-name">{basename(dir)}</span>
                  <span className="hidden-dir">{dir}</span>
                </div>
                <button className="btn small" onClick={() => onUnhide(dir)}>
                  恢复
                </button>
              </div>
            ))
          )}
          <p className="muted">隐藏的项目仅从管理器列表移除，不会改动 opencode 数据。</p>
        </div>

        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
