# WeChat DevTools MCP Server

[中文](README_zh-CN.md) | [npm](https://www.npmjs.com/package/wechat-dev-mcp)

Control WeChat Developer Tools and mini-programs/mini-games via the [Model Context Protocol](https://modelcontextprotocol.io) (MCP). Works with Claude Desktop, Cursor, Windsurf, and any MCP-compatible AI agent.

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js** | v18+ |
| **WeChat DevTools** | Installed, with **Service Port** enabled (`设置 → 安全设置 → 服务端口`) |
| **Mini-program / Mini-game** | An open project in DevTools |

## Quick Start

### With Claude Desktop

Add to your `claude_desktop_config.json`:

**Quick (npx):**
```json
{
  "mcpServers": {
    "wechat-devtools": {
      "command": "npx",
      "args": ["-y", "wechat-dev-mcp"]
    }
  }
}
```

**Global install (recommended for speed):**
```bash
npm install -g wechat-dev-mcp
```

```json
{
  "mcpServers": {
    "wechat-devtools": {
      "command": "wechat-dev-mcp",
      "args": []
    }
  }
}
```

**Local development:**
```bash
git clone https://github.com/jiawei686/wechat-dev-mcp.git
cd wechat-dev-mcp
npm install
```

```json
{
  "mcpServers": {
    "wechat-devtools": {
      "command": "node",
      "args": ["/absolute/path/to/wechat-dev-mcp/index.js"]
    }
  }
}
```

### With Cursor / Windsurf

Point to the same `command` and `args` in your MCP configuration.

## Tool Reference (36 tools)

### Connection

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `launch` | Launch DevTools & open a project. Auto-detects existing instances. | `projectPath` (required), `cliPath`, `port` |
| `connect` | Connect to a running DevTools via WebSocket. | `wsEndpoint` (default `ws://localhost:9420`), `projectPath` |
| `disconnect` | Disconnect the automation session. | — |
| `check_health` | **[Run after every code change]** Check connection, page path, network, console errors, project type. | — |
| `wait_ready` | Wait for mini-program to finish compiling. | `timeout` (default 60000ms) |
| `get_project_type` | Detect current project type (`"program"` or `"game"`). | — |

### Page / Navigation (mini-program only)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `navigate_to` | Navigate to a page. | `url`, `method` (`reLaunch`/`navigateTo`/`redirectTo`/`switchTab`) |
| `navigate_back` | Go back in the page stack. | `delta` (default 1) |
| `get_page_stack` | Get the current page stack. | — |
| `get_page_data` | Get page data (verify state). | `path` (optional) |
| `set_page_data` | Set page data (mock state for testing). | `data` (object) |
| `call_method` | Call a page method (e.g. `onLoad`, `onShow`). | `method`, `args` |

### Element Interaction (mini-program only)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_element` | Get element text, WXML, attributes, style, value, or property. | `selector`, `action` |
| `get_element_size` | Get element dimensions. | `selector` |
| `get_element_offset` | Get element position. | `selector` |
| `tap_element` | Tap an element. | `selector` |
| `longpress_element` | Long-press an element. | `selector` |
| `input_text` | Input text into `<input>` / `<textarea>`. | `selector`, `value` |
| `trigger_event` | Trigger a custom event (change, blur, submit). | `selector`, `eventName`, `detail` |

### Code Execution

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `evaluate` | Execute arbitrary JS in the AppService context. Returns the last expression. | `script`, `args` |
| `call_wx_method` | Call any `wx.*` API (e.g. `getNetworkType`, `getLocation`, `scanCode`). | `method`, `args` |
| `mock_wx_method` | Mock a `wx.*` API to return a custom result. | `method`, `result` |
| `restore_wx_method` | Restore a mocked `wx.*` API. | `method` |

### Mini-Game Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_project_type` | Auto-detect project type (reads `project.config.json`). | — |
| `game_get_info` | Game runtime info (system info, performance, renderer). | — |
| `game_get_user_info` | User info via `wx.getUserInfo` / `wx.getUserProfile`. | — |
| `game_get_open_data_context` | Check open data context availability. | — |
| `game_get_cloud_storage` | Cloud storage data by keys. | `keys` (string[]) |

> Mini-games don't have pages or DOM. Page tools (`get_page_data`, `get_element`, `tap_element`, etc.) return clear errors with alternative suggestions when used on a game project.

### Debugging

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_system_info` | Get device info, SDK version, platform, screen/window size. | — |
| `get_console_logs` | Get recent console logs from the mini-program. | `level`, `limit` |
| `screenshot` | Take a screenshot (base64 or file). | `path` (optional) |
| `page_scroll_to` | Scroll the page to a position. | `scrollTop`, `duration` |
| `wait_for` | Wait for an element to appear. | `selector`, `timeout` |
| `call_cloud_function` | Call a WeChat Cloud Function. | `name`, `data`, `config` |

### CLI Operations

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `build_npm` | Build NPM dependencies via DevTools CLI. | `projectPath`, `cliPath` |
| `cloud_functions_deploy` | Deploy cloud functions. | `env`, `names`, `remoteNpmInstall` |
| `cloud_functions_list` | List cloud functions. | `env` |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WECHAT_PORT` | `9420` | WebSocket automation port |
| `WECHAT_CLI_TIMEOUT` | `120000` | CLI command timeout (ms) |
| `WECHAT_AUTOMATOR_TIMEOUT` | `10000` | Automator API timeout (ms) |

## Workflows

### Mini-Program Debugging

```
1. check_health          # verify connection
2. navigate_to           # go to target page
3. get_page_data         # check state
4. get_element           # verify UI elements
5. tap_element           # interact
6. check_health          # verify no errors after change
```

### Mini-Game Debugging

```
1. check_health          # verify connection (shows projectType: "game")
2. game_get_info         # get runtime info
3. evaluate              # run JS in game context
4. call_wx_method        # call wx APIs
5. screenshot            # visually verify
6. get_console_logs      # check logs
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Connection refused" | Ensure DevTools is running and Service Port is enabled (`设置 → 安全设置`) |
| "Extension context invalidated" | Restart DevTools completely |
| "currentPage() timed out" | Project is still compiling; use `wait_ready` or wait longer |
| Page tools fail on game | Use `evaluate`, `call_wx_method`, `game_*` tools instead |
| CLI not found | Set `cliPath` explicitly, or check DevTools installation path |

## Project Structure

```
wechat-dev-mcp/
├── index.js           # MCP server entry point (single-file implementation)
├── package.json       # Package manifest
├── AGENTS.md          # AI agent workflow guide
├── README.md          # English documentation
├── README_zh-CN.md    # Chinese documentation
├── .cursorrules       # Cursor/Windsurf IDE rules
├── .gitignore         # Git ignore rules
├── LICENSE            # MIT License
└── yarn.lock          # Dependency lockfile
```
