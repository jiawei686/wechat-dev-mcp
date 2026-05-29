# WeChat DevTools MCP Server

[English](README.md) | [npm](https://www.npmjs.com/package/wechat-dev-mcp)

通过 [Model Context Protocol](https://modelcontextprotocol.io) (MCP) 控制微信开发者工具和小程序/小游戏。兼容 Claude Desktop、Cursor、Windsurf 等 MCP 客户端。

## 前置条件

| 要求 | 说明 |
|------|------|
| **Node.js** | v18+ |
| **微信开发者工具** | 已安装，并开启 **服务端口**（`设置 → 安全设置`） |
| **小程序 / 小游戏** | 在开发者工具中打开的项目 |

## 快速开始

### Claude Desktop

添加到 `claude_desktop_config.json`：

**npx 快速运行：**
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

**全局安装（推荐，启动更快）：**
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

**本地开发：**
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

## 工具列表（36个）

### 连接管理
| 工具 | 描述 | 参数 |
|------|------|------|
| `launch` | 启动开发者工具并打开项目 | `projectPath`（必填）, `cliPath`, `port` |
| `connect` | 连接到已在运行的实例 | `wsEndpoint`, `projectPath` |
| `disconnect` | 断开自动化连接 | — |
| `check_health` | **[每次改代码后必用]** 检查状态 | — |
| `wait_ready` | 等待编译完成 | `timeout` |
| `get_project_type` | 检测项目类型（`program`/`game`） | — |

### 页面导航（仅小程序）
| 工具 | 描述 | 参数 |
|------|------|------|
| `navigate_to` | 跳转页面 | `url`, `method`（reLaunch/navigateTo/redirectTo/switchTab） |
| `navigate_back` | 返回上一页 | `delta` |
| `get_page_stack` | 获取页面栈 | — |
| `get_page_data` | 获取页面数据 | `path` |
| `set_page_data` | 设置页面数据 | `data` |
| `call_method` | 调用页面方法 | `method`, `args` |

### 元素交互（仅小程序）
| 工具 | 描述 | 参数 |
|------|------|------|
| `get_element` | 获取元素信息 | `selector`, `action` |
| `get_element_size` | 获取元素尺寸 | `selector` |
| `get_element_offset` | 获取元素位置 | `selector` |
| `tap_element` | 点击元素 | `selector` |
| `longpress_element` | 长按元素 | `selector` |
| `input_text` | 输入文本 | `selector`, `value` |
| `trigger_event` | 触发事件 | `selector`, `eventName`, `detail` |

### 代码执行
| 工具 | 描述 | 参数 |
|------|------|------|
| `evaluate` | 执行 JS 代码 | `script`, `args` |
| `call_wx_method` | 调用 wx.* API | `method`, `args` |
| `mock_wx_method` | 模拟 wx.* API | `method`, `result` |
| `restore_wx_method` | 恢复模拟的 API | `method` |

### 小游戏工具
| 工具 | 描述 | 参数 |
|------|------|------|
| `get_project_type` | 自动检测项目类型 | — |
| `game_get_info` | 游戏运行时信息 | — |
| `game_get_user_info` | 用户信息 | — |
| `game_get_open_data_context` | 开放数据域 | — |
| `game_get_cloud_storage` | 云存储数据 | `keys` |

> 小游戏没有页面和 DOM。页面工具（`get_page_data`、`get_element`、`tap_element` 等）在游戏项目上会返回清晰的错误提示。

### 调试工具
| 工具 | 描述 | 参数 |
|------|------|------|
| `get_system_info` | 获取系统信息 | — |
| `get_console_logs` | 获取控制台日志 | `level`, `limit` |
| `screenshot` | 截图 | `path` |
| `page_scroll_to` | 滚动页面 | `scrollTop`, `duration` |
| `wait_for` | 等待元素出现 | `selector`, `timeout` |
| `call_cloud_function` | 调用云函数 | `name`, `data`, `config` |

### CLI 操作
| 工具 | 描述 | 参数 |
|------|------|------|
| `build_npm` | 构建 NPM 依赖 | `projectPath`, `cliPath` |
| `cloud_functions_deploy` | 部署云函数 | `env`, `names` |
| `cloud_functions_list` | 列出云函数 | `env` |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WECHAT_PORT` | `9420` | WebSocket 自动化端口 |
| `WECHAT_CLI_TIMEOUT` | `120000` | CLI 命令超时（毫秒） |
| `WECHAT_AUTOMATOR_TIMEOUT` | `10000` | 自动化 API 超时（毫秒） |

## 工作流

### 小程序调试
```
1. check_health           # 确认连接
2. navigate_to            # 跳转到目标页面
3. get_page_data          # 检查页面数据
4. get_element            # 检查 UI 元素
5. tap_element            # 交互操作
6. check_health           # 确认无报错
```

### 小游戏调试
```
1. check_health           # 确认连接（显示 projectType: "game"）
2. game_get_info          # 获取运行时信息
3. evaluate               # 执行 JS 代码
4. call_wx_method         # 调用 wx API
5. screenshot             # 截图验证
6. get_console_logs       # 查看日志
```

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| 连接被拒绝 | 确保开发者工具已运行，服务端口已开启 |
| Extension context invalidated | 完全重启开发者工具 |
| currentPage() 超时 | 项目仍在编译，使用 `wait_ready` 等待 |
| 页面工具在小游戏上失败 | 改用 `evaluate`、`call_wx_method`、`game_*` 工具 |
| CLI 未找到 | 显式设置 `cliPath` 参数 |

## 项目结构

```
wechat-dev-mcp/
├── index.js           # MCP 服务器入口（单文件实现）
├── package.json       # 包配置
├── AGENTS.md          # AI Agent 工作流指南
├── README.md          # 英文文档
├── README_zh-CN.md    # 中文文档
├── .cursorrules       # Cursor/Windsurf 规则
├── .gitignore         # Git 忽略规则
├── LICENSE            # MIT 许可证
└── yarn.lock          # 依赖锁文件
```
