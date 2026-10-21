# OpenCode 会话管理器（Windows / Linux）

一个轻量的桌面管理器，读取 opencode 本地会话数据库，选择项目后**一键用终端打开 opencode TUI**，并可列出、续接历史会话。Windows 使用 PowerShell / Windows Terminal，Linux 自动检测常见终端模拟器。

技术栈：Electron + React + TypeScript（electron-vite），零原生模块 —— 数据库读取依赖 Node `node:sqlite`（≥ 22.5，22.x 会自动补 `--experimental-sqlite`）。

## 功能

- **项目列表**：自动读取 `~/.local/share/opencode/opencode.db` 中的项目（按最近使用排序），也可手动添加任意文件夹
- **统一搜索**：顶部一个搜索框同时搜索项目与会话，会话按标题与目录查询全库；↑ ↓ 选择、Enter 打开、Esc 清空
- **会话管理**：按项目列出历史会话（标题 / 相对时间 / agent / model），一键续接；搜索到会话可直接定位到所属项目并高亮
- **一键启动**：`打开项目`、`续接会话`、`仅打开终端`、`文件管理器`，均在**新终端窗口**中运行
- **最近 / 收藏**：跨项目最近会话、项目收藏星标，本地持久化
- **引导页**：找不到数据库时提示，支持手动指定数据目录

## 快速开始

```bash
npm install        # 国内镜像已配置在 .npmrc
npm run dev        # 启动开发模式
```

其他命令：

```bash
npm run build      # 构建到 out/
npm run test       # 单元测试（vitest）
npm run typecheck  # 类型检查
npm run preview    # 预览构建产物
```

## 打包

```bash
npm run package          # 生成 NSIS 安装包（release/OpenCodeSessionManager-Setup-*.exe）
npm run package:portable # 生成免安装便携版（release/OpenCodeSessionManager-Portable-*.exe）
npm run package:linux    # 生成 AppImage（release/OpenCodeSessionManager-*.AppImage）
```

- 打包产物位于 `release/`；`db-helper.mjs` 会随 `extraResources` 打进 `resources/`。
- Windows 包内置 `resources/node.exe`；Linux 包使用系统 `node`（需 ≥ 22.5），也支持用 `OPENCODE_MANAGER_NODE=/path/to/node` 指定。
- 启动终端依赖：Windows 为 `pwsh`（或系统 PowerShell）；Linux 需安装常见终端模拟器（gnome-terminal / konsole / xfce4-terminal / mate-terminal / xterm 等），opencode 本身也依赖 Node。
- 未配置自定义图标时使用 Electron 默认图标；如需自定义，放置 `build/icon.ico`（Windows）或 `build/icon.png`（Linux）即可。

## 工作原理

- 主进程通过 stdio JSON 协议驱动 `src/helper/db-helper.mjs`（纯 Node 边车），以**只读**方式查询 SQLite 中的 `project` / `session` 表；opencode 正在运行时也能安全读取（WAL 模式）。
- 顶部搜索框的项目匹配在前端完成；会话搜索由边车按标题与目录查询 `session` / `session_v2`（排除归档会话与子会话，最多 100 条）。
- Windows 启动方式：`pwsh -NoExit -EncodedCommand <base64>`，命令内先 `Set-Location` 到目标目录再执行 `opencode`（或 `opencode -s <sessionId>`），彻底规避空格 / 中文 / 引号问题。
- Linux 启动方式：检测终端模拟器后，用 `$SHELL -l -c "cd -- '<目录>' && opencode [-s <sessionId>]"` 启动；opencode 退出后保留一个交互式 shell。
- 手动项目、收藏、最近记录存放在 Electron 用户数据目录的 `manager-store.json`。

## 结构

```
src/
├── helper/db-helper.mjs    # node:sqlite 只读查询边车（可独立测试）
├── main/                   # 主进程：db-bridge / launcher / store / ipc / 窗口
├── preload/                # contextBridge 暴露 window.api
└── renderer/               # React 中文界面
```

## 已知限制

- 数据目录默认 `~/.local/share/opencode`；若为自定义安装（如 WSL / 其他 XDG 路径），在设置中手动选择。
- 启动依赖 Node 与终端在 PATH（或常见安装目录）中：Linux 会自动查找 `~/.opencode/bin`、`~/.local/bin`、nvm/fnm/volta 等位置。
- Linux 下「以管理员身份启动」不可用（该选项仅在 Windows 显示）；需要提权时请在终端中自行使用 `sudo`。
