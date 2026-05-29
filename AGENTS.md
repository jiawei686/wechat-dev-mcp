# AI Agent Workflow Guide for WeChat DevTools MCP

This guide helps AI agents (Claude, Cursor, Windsurf) effectively use the WeChat DevTools MCP server.

## Getting Started

### Step 1: Establish Connection

```json
// Use 'launch' to open a project:
{
  "name": "launch",
  "arguments": {
    "projectPath": "/absolute/path/to/your/project"
  }
}

// Or 'connect' to attach to an already running DevTools:
{
  "name": "connect",
  "arguments": {
    "wsEndpoint": "ws://localhost:9420",
    "projectPath": "/absolute/path/to/your/project"  // helps detect game vs program
  }
}
```

### Step 2: Wait for Readiness

After launching, the project may need time to compile. Use `wait_ready` or check `check_health`:

```json
{
  "name": "check_health"
}
// Response includes: connected, pagePath, projectType, compilationStatus, pageReady
```

If `compilationStatus` is `"compiling"`, wait with `wait_ready`:
```json
{
  "name": "wait_ready",
  "arguments": { "timeout": 60000 }
}
```

## Detect Project Type

Always check `projectType` from `check_health` before choosing tools:

```json
// check_health response:
{
  "projectType": "program",     // mini-program with pages
  // or
  "projectType": "game"         // mini-game, no pages
}
```

### For Mini-Programs (`projectType: "program"`)
Use: `get_page_data`, `get_element`, `tap_element`, `navigate_to`, etc.

### For Mini-Games (`projectType: "game"`)
Use: `evaluate`, `call_wx_method`, `game_get_info`, `screenshot`, etc.
**Avoid**: `get_page_data`, `get_element`, `tap_element`, `navigate_to` - these will fail with helpful error messages.

## Debug Loop

### After Every Code Change

```
1. check_health           → verify no compilation errors
2. Get recent logs:       → get_console_logs(level: "error")
3. Fix any errors found   → edit/write files
4. Re-check               → check_health
```

### UI Verification

```
1. Navigate to page:      → navigate_to(url, method: "navigateTo")
2. Get page data:         → get_page_data()
3. Inspect element:       → get_element(selector, action: "wxml")
4. Check text content:    → get_element(selector, action: "text")
5. Verify styling:        → get_element(selector, action: "style", styleName: "color")
6. Visual check:          → screenshot()
```

### Cloud Function Debugging

```
1. Call function:         → call_cloud_function(name: "myFunc", data: { key: "value" })
2. Check logs:            → get_console_logs()
3. If error, fix code
4. Deploy:                → build_npm() + cloud_functions_deploy(env: "dev", names: ["myFunc"])
```

## Common Pitfalls

| Mistake | Correct Approach |
|---------|-----------------|
| Using page tools on a game | Use `evaluate` or `call_wx_method` instead |
| Not waiting for compilation | Use `wait_ready` after `launch` |
| Forgetting `check_health` after edits | Run `check_health` after EVERY write/edit |
| Using `reLaunch` when you want `navigateTo` | `reLaunch` clears the page stack; use `navigateTo` to preserve history |
| Hardcoding paths | Use absolute paths for `projectPath` |
