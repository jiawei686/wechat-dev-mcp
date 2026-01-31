# WeChat Developer Tools MCP Server

[English](README.md)

这是一个连接微信开发者工具（WeChat Developer Tools）的 Model Context Protocol (MCP) 服务器，基于 `miniprogram-automator` 实现。它允许你通过 MCP 客户端（如 Claude Desktop 或 AI Agent）控制 IDE 和小程序。

## 前置条件

1.  **Node.js**: 建议使用版本 18+（尽管可能在旧版本上也能运行，但本项目是针对现代 Node 环境设置的）。
2.  **微信开发者工具**: 必须已安装并运行。
3.  **开启自动化**: 在微信开发者工具中，进入 **设置 -> 安全设置**，开启 **服务端口**（CLI/HTTP 调用）。

## 安装

```bash
npm install
# 或者
yarn install
```

## 使用方法

### 1. 启动 MCP 服务器

你可以直接运行服务器：

```bash
node index.js
```

### 2. 在 MCP 客户端配置（例如 Claude Desktop）

将以下内容添加到你的 MCP 客户端配置文件中（例如 macOS 上的 `~/Library/Application Support/Claude/claude_desktop_config.json`）：

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

## 可用工具

*   **`launch`**: 启动并连接到一个小程序项目。
    *   `projectPath`: 项目的绝对路径。
    *   `cliPath`: （可选）开发者工具 CLI 的路径。
*   **`connect`**: 连接到一个已经在运行的开发者工具实例。
    *   `wsEndpoint`: WebSocket 端点（例如 `ws://localhost:9420`）。
*   **`navigate_to`**: 跳转到指定页面（例如 `/pages/index/index`）。
*   **`get_page_data`**: 获取当前页面的数据。
*   **`set_page_data`**: 设置当前页面的数据。
*   **`get_element`**: 获取元素的文本、属性、wxml 或点击元素。
*   **`call_method`**: 调用当前页面实例的方法。
*   **`disconnect`**: 断开自动化连接。

## 常见问题排查

*   **连接被拒绝 (Connection Refused)**: 确保微信开发者工具正在运行，并且在设置中开启了服务端口。
*   **路径问题**: `projectPath` 请务必使用绝对路径。
