# WeChat Developer Tools MCP Server

[English](README.md)

一个基于 `miniprogram-automator` 的 Model Context Protocol (MCP) 服务器，用于连接微信开发者工具。通过 MCP 客户端（如 Claude Desktop、Cursor、Windsurf 或任何 AI Agent）控制 IDE 和小程序。

## 前置条件

1.  **Node.js 18+**
2.  **微信开发者工具** 已安装并运行
3.  **开启服务端口**：进入 **设置 -> 安全设置**，开启 **服务端口**（CLI/HTTP 调用）

## 快速开始

### Claude Desktop

在 `claude_desktop_config.json` 中添加：

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

### 全局安装

```bash
npm install -g wechat-dev-mcp
```

配置：

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

### 本地开发

```bash
git clone <repo>
cd wechat-dev-mcp
npm install
node index.js
```

配置 Claude Desktop 指向本地文件：

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

### 连接管理
* **`launch`**: 启动开发者工具并打开小程序项目。自动检测已有实例。
* **`connect`**: 连接到已在运行的开发者工具实例。
* **`disconnect`**: 断开自动化连接。
* **`check_health`**: **[每次修改代码后必用]** 检查连接状态、页面路径、网络类型和控制台错误。
* **`wait_ready`**: 等待小程序编译完成并进入可交互状态。

### 导航
* **`navigate_to`**: 跳转到指定页面（支持 `reLaunch`、`navigateTo`、`redirectTo`、`switchTab`）。
* **`navigate_back`**: 返回上一页。
* **`get_page_stack`**: 获取当前页面栈。

### 数据与状态
* **`get_page_data`**: 获取页面数据（验证交互后的状态变化）。
* **`set_page_data`**: 设置页面数据（模拟状态用于测试）。
* **`get_system_info`**: 获取设备信息、SDK 版本、平台、屏幕/窗口尺寸。
* **`get_console_logs`**: 获取最近的控制台日志（按级别过滤：all、error、warn、info、debug）。

### 元素交互
* **`get_element`**: 获取元素的文本、WXML、属性、计算样式、值或属性。
* **`get_element_size`**: 获取元素尺寸（宽、高）。
* **`get_element_offset`**: 获取元素位置（左、上、右、下）。
* **`tap_element`**: 点击元素。
* **`longpress_element`**: 长按元素。
* **`input_text`**: 向 `<input>` 或 `<textarea>` 输入文本。
* **`trigger_event`**: 触发自定义事件（change、blur、submit 等）。

### 代码执行
* **`evaluate`**: 在 AppService 上下文中执行任意 JavaScript。
* **`call_method`**: 调用当前页面的方法。
* **`call_wx_method`**: 调用任意 wx API 方法（getNetworkType、getLocation 等）。
* **`mock_wx_method`**: 模拟 wx API 方法用于测试。
* **`restore_wx_method`**: 恢复被模拟的 wx API 方法。

### 云开发与构建
* **`call_cloud_function`**: 调用微信云函数。
* **`build_npm`**: 构建 NPM 依赖。
* **`cloud_functions_deploy`**: 部署云函数。
* **`cloud_functions_list`**: 列出云函数。

### 其他
* **`screenshot`**: 截图（返回 base64 或保存到文件）。
* **`page_scroll_to`**: 滚动页面到指定位置。
* **`wait_for`**: 等待元素出现。

## AI Agent 最佳实践

将以下规则添加到 `.cursorrules` 或系统提示词中：

```markdown
## 微信开发者工具工作流

1. **启动**: 开始工作前，使用 `wechat-devtools_launch` 打开项目，或使用 `wechat-devtools_connect` 连接到已有实例。

2. **修改后必检查**: 每次修改代码后，**必须** 运行 `wechat-devtools_check_health`。立即修复所有错误。

3. **等待编译**: 启动后，如果小程序仍在编译，使用 `wechat-devtools_wait_ready` 等待。`check_health` 会显示 `compilationStatus: "compiling"` 直到就绪。

4. **验证 UI**: 使用 `wechat-devtools_get_element` 检查关键元素。使用 `wechat-devtools_get_page_data` 确认数据绑定。

5. **调试**: 使用 `wechat-devtools_evaluate` 执行 `console.log` 或检查 `wx` 对象。使用 `wechat-devtools_get_console_logs` 查看日志。

6. **截图**: 使用 `wechat-devtools_screenshot` 直观验证 UI 状态。

7. **云函数**: 使用 `wechat-devtools_call_cloud_function` 调试云函数。使用 `wechat-devtools_build_npm` 构建依赖。
```

## 环境变量

| 变量 | 默认值 | 描述 |
|----------|---------|-------------|
| `WECHAT_PORT` | `9420` | WebSocket 自动化端口 |
| `WECHAT_CLI_TIMEOUT` | `120000` | CLI 命令超时时间（毫秒） |
| `WECHAT_AUTOMATOR_TIMEOUT` | `10000` | 自动化 API 超时时间（毫秒） |

## 常见问题排查

* **连接被拒绝**: 确保开发者工具正在运行，并且已开启服务端口。
* **Extension context invalidated**: 关闭并重新打开开发者工具，或退出后重新启动。
* **页面未就绪 / 编译卡住**: 打开开发者工具检查编译错误。尝试使用 `wait_ready` 并增加超时时间。
* **路径问题**: `projectPath` 请务必使用绝对路径。
