import { describe, expect, it } from 'vitest'
import {
  buildAdminArgs,
  buildAdminWtArgs,
  buildPsCommand,
  buildShCommand,
  buildStartArgs,
  buildTerminalArgs,
  chcp65001,
  encodeCommand,
  psEscape,
  shQuote,
  START_WINDOW_TITLE
} from '../src/main/launcher'

function decodeEncoded(args: string[]): string {
  const enc = args[args.indexOf('-EncodedCommand') + 1]
  return Buffer.from(enc, 'base64').toString('utf16le')
}

describe('psEscape', () => {
  it('转义单引号', () => {
    expect(psEscape(`a'b`)).toBe(`a''b`)
  })
  it('普通路径不变', () => {
    expect(psEscape(`D:/sources/实验数据`)).toBe(`D:/sources/实验数据`)
  })
})

describe('buildPsCommand', () => {
  it('生成 Set-Location + opencode', () => {
    const cmd = buildPsCommand({ dir: `D:/sources/实验数据`, opencodeArgs: '' }, null)
    expect(cmd).toContain(`Set-Location -LiteralPath 'D:/sources/实验数据'`)
    expect(cmd).toContain(`; opencode`)
  })

  it('带会话参数续接', () => {
    const cmd = buildPsCommand({ dir: 'D:/a', opencodeArgs: '-s ses_abc' }, null)
    expect(cmd).toContain(`opencode -s ses_abc`)
  })

  it('opencodeArgs 为 null 时只打开目录', () => {
    const cmd = buildPsCommand({ dir: 'D:/a', opencodeArgs: null }, null)
    expect(cmd).toContain(`Set-Location -LiteralPath 'D:/a'`)
    expect(cmd).not.toContain('opencode')
  })

  it('指定 opencodePath 时用 & 调用', () => {
    const cmd = buildPsCommand({ dir: 'D:/a', opencodeArgs: '-s x' }, `C:/oc/opencode.cmd`)
    expect(cmd).toContain(`& 'C:/oc/opencode.cmd' -s x`)
    expect(cmd).not.toContain('opencode -s')
  })

  it('目录含单引号时正确转义', () => {
    const cmd = buildPsCommand({ dir: `D:/it's`, opencodeArgs: null }, null)
    expect(cmd).toContain(`Set-Location -LiteralPath 'D:/it''s'`)
  })
})

describe('encodeCommand', () => {
  it('UTF-16LE base64 可还原', () => {
    const raw = `Set-Location -LiteralPath 'D:/实验/项目'`
    const encoded = encodeCommand(raw)
    const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
    expect(decoded).toBe(raw)
    // base64 不含空格，pwsh -EncodedCommand 无需引号
    expect(encoded).not.toContain(' ')
  })
})

describe('buildStartArgs', () => {
  it('start 标题必须含空格（否则 cmd 会把无引号首参当程序，误启动 OpenCode.exe 桌面端）', () => {
    const args = buildStartArgs('UwBlAHQ')
    expect(START_WINDOW_TITLE).toMatch(/\s/)
    expect(args[0]).toBe('/c')
    expect(args[1]).toBe('start')
    expect(args[2]).toBe(START_WINDOW_TITLE)
    expect(args.slice(3)).toEqual(['pwsh', '-NoExit', '-EncodedCommand', 'UwBlAHQ'])
  })

  it('未安装 PowerShell 7 时可指定 powershell.exe 回退', () => {
    const args = buildStartArgs('UwBlAHQ', 'powershell.exe')
    expect(args.slice(3)).toEqual(['powershell.exe', '-NoExit', '-EncodedCommand', 'UwBlAHQ'])
  })
})

describe('buildAdminArgs', () => {
  it('生成 Start-Process -Verb RunAs 的外层脚本（管理员启动）', () => {
    const args = buildAdminArgs('QQ==', 'pwsh')
    expect(args[0]).toBe('-NoProfile')
    const inner = decodeEncoded(args)
    expect(inner).toContain("Start-Process -FilePath 'pwsh' -Verb RunAs")
    expect(inner).toContain("'-NoExit','-EncodedCommand','QQ=='")
  })

  it('管理员启动 Windows Terminal 走 wt.exe', () => {
    const args = buildAdminWtArgs('QQ==', 'powershell.exe')
    const inner = decodeEncoded(args)
    expect(inner).toContain("Start-Process -FilePath 'wt.exe' -Verb RunAs")
    expect(inner).toContain("'powershell.exe'")
  })

  it('无 Windows Terminal 回退 conhost 时先 chcp 65001 避免乱码', () => {
    const fixed = chcp65001(`Set-Location 'D:/x'; opencode`)
    expect(fixed).toBe(`chcp 65001 > $null; Set-Location 'D:/x'; opencode`)
  })
})

describe('shQuote', () => {
  it('转义单引号', () => {
    expect(shQuote(`a'b`)).toBe(`'a'\\''b'`)
  })
  it('含空格的路径整体加引号', () => {
    expect(shQuote('/home/me/My Projects')).toBe(`'/home/me/My Projects'`)
  })
})

describe('buildShCommand', () => {
  it('先 cd 再运行 opencode', () => {
    const cmd = buildShCommand({ dir: '/home/me/My Projects', opencodeArgs: '' }, null, '/bin/bash')
    expect(cmd).toContain(`cd -- '/home/me/My Projects'`)
    expect(cmd).toContain('&& { opencode;')
    expect(cmd).toContain(`exec '/bin/bash' -l`)
  })

  it('续接会话时带 -s 参数', () => {
    const cmd = buildShCommand({ dir: '/tmp/a', opencodeArgs: '-s ses_abc' }, '/opt/oc/opencode', '/bin/zsh')
    expect(cmd).toContain(`'/opt/oc/opencode' -s ses_abc`)
    expect(cmd).toContain(`exec '/bin/zsh' -l`)
  })

  it('opencodeArgs 为 null 时只打开目录', () => {
    const cmd = buildShCommand({ dir: '/tmp/a', opencodeArgs: null }, null)
    expect(cmd).toBe(`cd -- '/tmp/a' && exec '/bin/bash' -l`)
  })
})

describe('buildTerminalArgs', () => {
  const cmd = ['/bin/bash', '-l']

  it('mate-terminal 使用 --working-directory 与单一 -e 命令串', () => {
    const args = buildTerminalArgs('mate-terminal', '/tmp/a b', cmd)
    expect(args).toContain('--working-directory=/tmp/a b')
    expect(args).toContain('-e')
    // -e 只接受一个参数，命令需整体引用
    expect(args[args.length - 1]).toBe(`'/bin/bash' '-l'`)
  })

  it('gnome-terminal / tilix 使用 -- 分隔命令', () => {
    expect(buildTerminalArgs('gnome-terminal', '/tmp/a', cmd)).toEqual([
      '--working-directory=/tmp/a',
      '--title=OpenCode 会话',
      '--',
      ...cmd
    ])
    expect(buildTerminalArgs('tilix', '/tmp/a', cmd).slice(-3)).toEqual(['--', ...cmd])
  })

  it('konsole / xfce4-terminal / alacritty 使用各自的目录参数', () => {
    expect(buildTerminalArgs('konsole', '/tmp/a', cmd).slice(0, 3)).toEqual(['--workdir', '/tmp/a', '-e'])
    expect(buildTerminalArgs('xfce4-terminal', '/tmp/a', cmd).slice(0, 2)).toEqual(['--working-directory=/tmp/a', '-x'])
    expect(buildTerminalArgs('alacritty', '/tmp/a', cmd).slice(0, 3)).toEqual([
      '--working-directory',
      '/tmp/a',
      '-e'
    ])
  })

  it('xterm / x-terminal-emulator 回退 -e', () => {
    expect(buildTerminalArgs('xterm', '/tmp/a', cmd)).toEqual(['-e', ...cmd])
    expect(buildTerminalArgs('x-terminal-emulator', '/tmp/a', cmd)).toEqual(['-e', ...cmd])
  })
})
