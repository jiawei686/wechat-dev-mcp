# WeChat Developer Tools MCP Server

[中文](README_zh-CN.md)

This is a Model Context Protocol (MCP) server that connects to WeChat Developer Tools via `miniprogram-automator`. It allows you to control the IDE and the mini-program from an MCP client (like Claude Desktop or an AI agent).

## Prerequisites

1.  **Node.js**: Version 18+ is recommended (though it may work on older versions with some polyfills, this project is set up for modern Node).
2.  **WeChat Developer Tools**: Must be installed and running.
3.  **Enable Automation**: In WeChat Developer Tools, go to **Settings -> Security Settings** and enable **Service Port** (CLI/HTTP invocation).

## Quick Start

### Using with Claude Desktop (Recommended)

Add the following to your `claude_desktop_config.json` (e.g., `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "wechat-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "wechat-dev-mcp"
      ]
    }
  }
}
```

## Manual Installation

To install globally:

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

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build and run locally:
   ```bash
   node index.js
   ```
4. Configure Claude Desktop to point to your local file:
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

*   **`launch`**: Launch and connect to a mini-program project.
    *   `projectPath`: Absolute path to the project.
    *   `cliPath`: (Optional) Path to the DevTools CLI.
*   **`connect`**: Connect to an already running DevTools instance.
    *   `wsEndpoint`: WebSocket endpoint (e.g., `ws://localhost:9420`).
*   **`navigate_to`**: Navigate to a page (e.g., `/pages/index/index`).
*   **`get_page_data`**: Get data from the current page.
*   **`set_page_data`**: Set data on the current page.
*   **`get_element`**: Get text, attributes, wxml of an element or tap it.
*   **`call_method`**: Call a method on the current page instance.
*   **`evaluate`**: Execute arbitrary JavaScript in the AppService context.
*   **`call_cloud_function`**: Call a WeChat Cloud Function (`wx.cloud.callFunction`).
*   **`build_npm`**: Build NPM dependencies (CLI `build-npm`).
*   **`cloud_functions_deploy`**: Deploy cloud functions (CLI `cloud functions deploy`).
*   **`cloud_functions_list`**: List cloud functions (CLI `cloud functions list`).
*   **`disconnect`**: Disconnect automation.

## Best Practices for AI Agents

To ensure the best experience when using this server with an AI Agent (like Cursor or Windsurf), we recommend adding the following rules to your project's `.cursorrules` or system prompt:

```markdown
ALWAYS run the `wechat-devtools_check_health` tool after making ANY changes to the codebase (editing files, creating files, etc.).
1. If `check_health` shows console errors, YOU MUST fix them immediately.
2. If `check_health` shows the page path is not what you expect, navigate to the correct page.
3. If `check_health` fails (not connected), you MUST run `wechat-devtools_launch` or `connect`.
```

## Troubleshooting

*   **Connection Refused**: Ensure WeChat Developer Tools is running and the Service Port is enabled in Settings.
*   **Path Issues**: Use absolute paths for `projectPath`.
