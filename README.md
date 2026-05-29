# WeChat Developer Tools MCP Server

[中文](README_zh-CN.md)

A Model Context Protocol (MCP) server that connects to WeChat Developer Tools via `miniprogram-automator`. Control the IDE and mini-program from an MCP client (Claude Desktop, Cursor, Windsurf, or any AI agent).

## Prerequisites

1.  **Node.js 18+**
2.  **WeChat Developer Tools** installed and running
3.  **Enable Service Port**: Go to **Settings -> Security Settings** and enable **Service Port** (CLI/HTTP invocation)

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

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

### Global Install

```bash
npm install -g wechat-dev-mcp
```

Then configure:

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

### Local Development

```bash
git clone <repo>
cd wechat-dev-mcp
npm install
node index.js
```

Configure Claude Desktop to point to your local file:

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

## Available Tools

### Connection Management
* **`launch`**: Launch DevTools and open a mini-program project. Auto-detects existing instances.
* **`connect`**: Connect to an already running DevTools instance via WebSocket.
* **`disconnect`**: Disconnect the automation session.
* **`check_health`**: **[Run after every code change]** Check connection status, page path, network type, and console errors.
* **`wait_ready`**: Wait for the mini-program to finish compilation and become interactive.

### Navigation
* **`navigate_to`**: Navigate to a page (`reLaunch`, `navigateTo`, `redirectTo`, `switchTab`).
* **`navigate_back`**: Go back in the page stack.
* **`get_page_stack`**: Get the current page stack.

### Data & State
* **`get_page_data`**: Get page data (verify state after interactions).
* **`set_page_data`**: Set page data (mock state for testing).
* **`get_system_info`**: Get device info, SDK version, platform, screen/window size.
* **`get_console_logs`**: Get recent console logs (filter by level: all, error, warn, info, debug).

### Element Interaction
* **`get_element`**: Get element text, WXML, attributes, computed style, value, or property.
* **`get_element_size`**: Get element dimensions (width, height).
* **`get_element_offset`**: Get element position (left, top, right, bottom).
* **`tap_element`**: Tap an element.
* **`longpress_element`**: Long-press an element.
* **`input_text`**: Input text into `<input>` or `<textarea>`.
* **`trigger_event`**: Trigger a custom event (change, blur, submit, etc.).

### Code Execution
* **`evaluate`**: Execute arbitrary JavaScript in the AppService context.
* **`call_method`**: Call a method on the current page.
* **`call_wx_method`**: Call any wx API method (getNetworkType, getLocation, etc.).
* **`mock_wx_method`**: Mock a wx API method for testing.
* **`restore_wx_method`**: Restore a mocked wx API method.

### Mini-Game Tools
* **`get_project_type`**: Detect project type (mini-program or mini-game).
* **`game_get_info`**: Get mini-game runtime info (system info, performance, renderer).
* **`game_get_user_info`**: Get mini-game user info (wx.getUserInfo / wx.getUserProfile).
* **`game_get_open_data_context`**: Check open data context availability.
* **`game_get_cloud_storage`**: Get cloud storage data by keys.

> **Note**: Mini-games don't have pages or DOM elements. When `projectType` is `"game"`, page tools (`get_page_data`, `get_element`, `tap_element`, etc.) will return clear error messages with alternative tool suggestions. Use `evaluate`, `call_wx_method`, `game_*` tools, and `screenshot` instead.

### Cloud & Build
* **`call_cloud_function`**: Call a WeChat Cloud Function.
* **`build_npm`**: Build NPM dependencies.
* **`cloud_functions_deploy`**: Deploy cloud functions.
* **`cloud_functions_list`**: List cloud functions.

### Other
* **`screenshot`**: Take a screenshot (returns base64 or saves to file).
* **`page_scroll_to`**: Scroll the page to a specific position.
* **`wait_for`**: Wait for an element to appear.
* **`get_project_type`**: Detect project type (mini-program vs mini-game).

## Best Practices for AI Agents

Add these rules to `.cursorrules` or your system prompt for the best experience:

```markdown
## WeChat DevTools Workflow

1. **Start**: Before working, use `wechat-devtools_launch` to open the project, or `wechat-devtools_connect` to attach to an existing DevTools instance.

2. **Verify After Changes**: Run `wechat-devtools_check_health` after EVERY code change (edit/write). Fix any errors immediately.

3. **Wait for Compilation**: After launch, use `wechat-devtools_wait_ready` if the mini-program is still compiling. The `check_health` response will show `compilationStatus: "compiling"` until ready.

4. **Check UI**: Use `wechat-devtools_get_element` to verify UI elements exist. Use `wechat-devtools_get_page_data` to confirm data binding.

5. **Debug**: Use `wechat-devtools_evaluate` to execute `console.log` or check `wx` object state. Use `wechat-devtools_get_console_logs` to see recent logs.

6. **Screenshot**: Use `wechat-devtools_screenshot` to visually verify the UI state.

7. **Cloud Functions**: Use `wechat-devtools_call_cloud_function` for cloud function debugging. Use `wechat-devtools_build_npm` for dependency builds.
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WECHAT_PORT` | `9420` | WebSocket automation port |
| `WECHAT_CLI_TIMEOUT` | `120000` | CLI command timeout in ms |
| `WECHAT_AUTOMATOR_TIMEOUT` | `10000` | Automator API call timeout in ms |

## Troubleshooting

* **Connection Refused**: Ensure DevTools is running and Service Port is enabled.
* **Extension context invalidated**: Close and reopen DevTools, or quit and re-launch.
* **Page not ready / Compilation stuck**: Open DevTools to check for compilation errors. Try `wait_ready` with a longer timeout.
* **Path Issues**: Use absolute paths for `projectPath`.
