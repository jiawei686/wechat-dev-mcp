# WeChat Developer Tools MCP Server

This is a Model Context Protocol (MCP) server that connects to WeChat Developer Tools via `miniprogram-automator`. It allows you to control the IDE and the mini-program from an MCP client (like Claude Desktop or an AI agent).

## Prerequisites

1.  **Node.js**: Version 18+ is recommended (though it may work on older versions with some polyfills, this project is set up for modern Node).
2.  **WeChat Developer Tools**: Must be installed and running.
3.  **Enable Automation**: In WeChat Developer Tools, go to **Settings -> Security Settings** and enable **Service Port** (CLI/HTTP invocation).

## Installation

```bash
npm install
# or
yarn install
```

## Usage

### 1. Start the MCP Server

You can run the server directly:

```bash
node index.js
```

### 2. Configure with MCP Client (e.g., Claude Desktop)

Add the following to your MCP client configuration (e.g., `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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
*   **`disconnect`**: Disconnect automation.

## Troubleshooting

*   **Connection Refused**: Ensure WeChat Developer Tools is running and the Service Port is enabled in Settings.
*   **Path Issues**: Use absolute paths for `projectPath`.
