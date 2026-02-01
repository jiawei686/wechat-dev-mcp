#!/usr/bin/env node

// 1. Monkey patch console.log to ensure library logs don't corrupt JSON-RPC on stdout
const originalLog = console.log;
console.log = function(...args) {
  console.error(...args);
};

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import automator from "miniprogram-automator";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

// Global state
let miniProgram = null;
let connectedProjectPath = null;
let connectedCliPath = null;
const DEFAULT_PORT = process.env.WECHAT_PORT || 9420;
const consoleLogs = []; // Ring buffer for logs

// Helper to find CLI path
function getCliPath(customPath) {
  if (customPath && fs.existsSync(customPath)) return customPath;
  if (connectedCliPath && fs.existsSync(connectedCliPath)) return connectedCliPath;
  
  if (process.platform === 'darwin') {
    const defaultMacPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
    if (fs.existsSync(defaultMacPath)) return defaultMacPath;
  } else if (process.platform === 'win32') {
    const defaultWinPath = 'C:\\Program Files (x86)\\Tencent\\WeChatDevTools\\cli.bat';
    if (fs.existsSync(defaultWinPath)) return defaultWinPath;
  }
  return null;
}

// Helper to execute CLI command
function executeCli(args, cliPath) {
  return new Promise((resolve, reject) => {
    const finalCliPath = getCliPath(cliPath);
    if (!finalCliPath) {
      return reject(new Error("WeChat DevTools CLI not found. Please specify cliPath."));
    }
    
    execFile(finalCliPath, args, (error, stdout, stderr) => {
      if (error) {
        // Some CLI commands return non-zero exit code even on partial success or just warnings, 
        // but usually error means failure.
        // We attach stderr to error message
        return reject(new Error(`CLI Execution Failed: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`));
      }
      resolve(stdout);
    });
  });
}

function setupListeners(mp) {
  // Clear old logs on new connection
  consoleLogs.length = 0;
  
  // Listen for console logs
  mp.on('console', msg => {
    // Keep last 50 logs
    if (consoleLogs.length >= 50) {
      consoleLogs.shift();
    }
    consoleLogs.push({
      type: 'console',
      level: msg.level,
      text: msg.text, // automator msg.text might be a promise or string depending on version, usually string in newer
      args: msg.args, // raw args
      timestamp: Date.now()
    });
  });

  // Listen for exceptions
  mp.on('exception', err => {
    if (consoleLogs.length >= 50) {
      consoleLogs.shift();
    }
    consoleLogs.push({
      type: 'exception',
      level: 'error',
      text: err.message || JSON.stringify(err),
      timestamp: Date.now()
    });
  });
}

// Tool definitions
const TOOLS = {
  LAUNCH: "launch",
  CONNECT: "connect", 
  CHECK_HEALTH: "check_health",
  NAVIGATE_TO: "navigate_to",
  GET_PAGE_DATA: "get_page_data",
  SET_PAGE_DATA: "set_page_data",
  GET_ELEMENT: "get_element",
  TAP_ELEMENT: "tap_element",
  INPUT_TEXT: "input_text",
  TRIGGER_EVENT: "trigger_event",
  CALL_METHOD: "call_method",
  EVALUATE: "evaluate",
  CALL_CLOUD_FUNCTION: "call_cloud_function",
  BUILD_NPM: "build_npm",
  CLOUD_FUNCTIONS_DEPLOY: "cloud_functions_deploy",
  CLOUD_FUNCTIONS_LIST: "cloud_functions_list",
  DISCONNECT: "disconnect"
};

const server = new Server(
  {
    name: "wechat-devtools-mcp",
    version: "1.0.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: TOOLS.LAUNCH,
        description: "Launch and connect to WeChat Developer Tools. [REQUIRED INITIAL STEP] Use this tool first to start controlling a mini-program. Requires the absolute project path.",
        inputSchema: zodToJsonSchema(
          z.object({
            projectPath: z.string().describe("Absolute path to the mini-program project"),
            cliPath: z.string().optional().describe("Path to the WeChat DevTools CLI executable (optional, will try to auto-detect)"),
            port: z.number().optional().describe("Port for automation (optional)"),
          })
        ),
      },
      {
        name: TOOLS.CONNECT,
        description: "Connect to an already running WeChat Developer Tools instance via WebSocket. Use this if 'launch' fails or you want to attach to an existing session.",
        inputSchema: zodToJsonSchema(
          z.object({
            wsEndpoint: z.string().optional().describe(`WebSocket endpoint (e.g., ws://localhost:9420). Defaults to ws://localhost:${DEFAULT_PORT}`),
          })
        ),
      },
      {
        name: TOOLS.CHECK_HEALTH,
        description: "[MANDATORY] Run this tool AFTER EVERY CODE CHANGE (edit/write) to verify the mini-program is running correctly. Returns current page path, network status, and recent console errors. FIX ANY ERRORS IMMEDIATELY.",
        inputSchema: zodToJsonSchema(z.object({})),
      },
      {
        name: TOOLS.NAVIGATE_TO,
        description: "Navigate to a specific page in the mini-program.",
        inputSchema: zodToJsonSchema(
          z.object({
            url: z.string().describe("The URL of the page to navigate to (e.g., /pages/index/index)"),
          })
        ),
      },
      {
        name: TOOLS.GET_PAGE_DATA,
        description: "Get the data of the current page. Useful for verifying state changes after interactions or API calls.",
        inputSchema: zodToJsonSchema(
          z.object({
            path: z.string().optional().describe("The data path to retrieve (optional, returns full data if omitted)"),
          })
        ),
      },
      {
        name: TOOLS.SET_PAGE_DATA,
        description: "Set data on the current page. Use this to mock state or trigger UI updates for testing.",
        inputSchema: zodToJsonSchema(
          z.object({
            data: z.record(z.any()).describe("The data object to set"),
          })
        ),
      },
      {
        name: TOOLS.GET_ELEMENT,
        description: "Get information about an element (text, wxml, attributes, computed style). Use this to inspect UI.",
        inputSchema: zodToJsonSchema(
          z.object({
            selector: z.string().describe("The CSS selector of the element"),
            action: z.enum(["text", "wxml", "outerWxml", "attribute", "style"]).optional().default("text").describe("Action to perform: 'text' (content), 'wxml' (structure), 'attribute' (get attr), 'style' (get style)"),
            attributeName: z.string().optional().describe("Attribute name (required if action is 'attribute')"),
            styleName: z.string().optional().describe("Style name (required if action is 'style')"),
          })
        ),
      },
      {
        name: TOOLS.TAP_ELEMENT,
        description: "Tap (click) an element on the current page.",
        inputSchema: zodToJsonSchema(
          z.object({
            selector: z.string().describe("The CSS selector of the element to tap"),
          })
        ),
      },
      {
        name: TOOLS.INPUT_TEXT,
        description: "Input text into an element (e.g., <input>, <textarea>).",
        inputSchema: zodToJsonSchema(
          z.object({
            selector: z.string().describe("The CSS selector of the input element"),
            value: z.string().describe("The text value to input"),
          })
        ),
      },
      {
        name: TOOLS.TRIGGER_EVENT,
        description: "Trigger a custom event on an element.",
        inputSchema: zodToJsonSchema(
          z.object({
            selector: z.string().describe("The CSS selector of the element"),
            eventName: z.string().describe("The name of the event to trigger (e.g., 'change')"),
            detail: z.record(z.any()).optional().describe("Event detail object"),
          })
        ),
      },
      {
        name: TOOLS.CALL_METHOD,
        description: "Call a method on the current page.",
        inputSchema: zodToJsonSchema(
          z.object({
            method: z.string().describe("The name of the method to call"),
            args: z.array(z.union([z.string(), z.number(), z.boolean(), z.object({}).passthrough()])).optional().default([]).describe("Arguments to pass to the method"),
          })
        ),
      },
      {
        name: TOOLS.EVALUATE,
        description: "Execute arbitrary JavaScript code in the AppService context. Use this for complex logic, accessing global objects (like 'wx'), or debugging. Returns the result of the last expression.",
        inputSchema: zodToJsonSchema(
          z.object({
            script: z.string().describe("The JavaScript code to execute. Can be a function body string."),
            args: z.array(z.union([z.string(), z.number(), z.boolean(), z.object({}).passthrough()])).optional().default([]).describe("Arguments to pass if script is a function"),
          })
        ),
      },
      {
        name: TOOLS.CALL_CLOUD_FUNCTION,
        description: "Call a WeChat Cloud Function. Wrapper for wx.cloud.callFunction.",
        inputSchema: zodToJsonSchema(
          z.object({
            name: z.string().describe("The name of the cloud function"),
            data: z.record(z.any()).optional().describe("Data to pass to the function"),
            config: z.record(z.any()).optional().describe("Cloud configuration (e.g. env)"),
          })
        ),
      },
      {
        name: TOOLS.BUILD_NPM,
        description: "Build NPM dependencies for the mini-program using the CLI tool.",
        inputSchema: zodToJsonSchema(
          z.object({
            projectPath: z.string().optional().describe("Absolute path to the project. Defaults to currently connected project."),
            cliPath: z.string().optional().describe("Path to DevTools CLI."),
          })
        ),
      },
      {
        name: TOOLS.CLOUD_FUNCTIONS_DEPLOY,
        description: "Deploy cloud functions using the CLI tool.",
        inputSchema: zodToJsonSchema(
          z.object({
            env: z.string().describe("Cloud environment ID"),
            names: z.array(z.string()).describe("List of cloud function names to deploy"),
            remoteNpmInstall: z.boolean().optional().default(false).describe("Install npm dependencies in the cloud"),
            projectPath: z.string().optional().describe("Absolute path to the project. Defaults to currently connected project."),
            cliPath: z.string().optional().describe("Path to DevTools CLI."),
          })
        ),
      },
      {
        name: TOOLS.CLOUD_FUNCTIONS_LIST,
        description: "List cloud functions in an environment using the CLI tool.",
        inputSchema: zodToJsonSchema(
          z.object({
            env: z.string().describe("Cloud environment ID"),
            projectPath: z.string().optional().describe("Absolute path to the project. Defaults to currently connected project."),
            cliPath: z.string().optional().describe("Path to DevTools CLI."),
          })
        ),
      },
      {
        name: TOOLS.DISCONNECT,
        description: "Disconnect from the mini-program.",
        inputSchema: zodToJsonSchema(z.object({})),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case TOOLS.LAUNCH: {
        if (miniProgram) {
          return { content: [{ type: "text", text: "Already connected to a Mini Program instance. Disconnect first." }] };
        }
        const { projectPath, cliPath, port } = args;
        const options = { projectPath, cliPath, port };
        // Remove undefined keys
        Object.keys(options).forEach(key => options[key] === undefined && delete options[key]);
        
        // Update global paths
        if (projectPath) connectedProjectPath = projectPath;
        if (cliPath) connectedCliPath = cliPath;

        // Try to connect to existing instance first
        const tryPort = port || DEFAULT_PORT;
        try {
          // Attempt connection (short timeout might be good but connect usually fails fast if port closed)
          miniProgram = await automator.connect({ wsEndpoint: `ws://localhost:${tryPort}` });
          setupListeners(miniProgram);
          return { content: [{ type: "text", text: `Connected to existing Mini Program instance on port ${tryPort}.` }] };
        } catch (e) {
          // If connection fails, launch new instance
          // console.error("Connect failed, launching new instance:", e);
          miniProgram = await automator.launch(options);
          setupListeners(miniProgram);
          return { content: [{ type: "text", text: "Successfully launched and connected to Mini Program." }] };
        }
      }

      case TOOLS.CONNECT: {
        if (miniProgram) {
          return { content: [{ type: "text", text: "Already connected to a Mini Program instance. Disconnect first." }] };
        }
        let { wsEndpoint } = args;
        if (!wsEndpoint) {
          wsEndpoint = `ws://localhost:${DEFAULT_PORT}`;
        }
        miniProgram = await automator.connect({ wsEndpoint });
        setupListeners(miniProgram);
        return { content: [{ type: "text", text: "Successfully connected to Mini Program." }] };
      }

      case TOOLS.CHECK_HEALTH: {
        if (!miniProgram) {
          return { content: [{ type: "text", text: JSON.stringify({ connected: false, error: "Not connected" }) }] };
        }
        
        // 1. Get Page Path
        let pagePath = "unknown";
        try {
          const page = await miniProgram.currentPage();
          pagePath = page ? page.path : "no_page_found";
        } catch (e) {
          pagePath = `error_getting_path: ${e.message}`;
        }

        // 2. Get Recent Errors (Console Error or Exceptions)
        // Filter logs where level is 'error' or type is 'exception'
        const recentErrors = consoleLogs
          .filter(log => log.level === 'error' || log.type === 'exception')
          .slice(-5) // Get last 5
          .map(log => `[${new Date(log.timestamp).toISOString().split('T')[1].slice(0,8)}] ${log.text}`);

        // 3. Network Status (Mock / System Info)
        let networkType = "unknown";
        try {
          const res = await miniProgram.systemInfo(); 
          // systemInfo in automator might not directly have networkType? 
          // Actually miniProgram.systemInfo() returns what wx.getSystemInfo returns.
          // But networkType is usually in wx.getNetworkType.
          // Let's try to call wx.getNetworkType via remote evaluation if possible, 
          // but miniProgram.evaluate or callWxMethod might be needed.
          // Automator has callWxMethod? No, page has callMethod (for internal methods).
          // miniProgram has `remote`? No.
          // Actually miniProgram.evaluate() runs code in the app service context.
          const netRes = await miniProgram.evaluate(() => new Promise(resolve => wx.getNetworkType({ success: resolve, fail: () => resolve({ networkType: 'fail' }) })));
          if (netRes) networkType = netRes.networkType;
        } catch (e) {
          networkType = `check_failed: ${e.message}`;
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              connected: true,
              pagePath,
              networkType,
              recentConsoleErrors: recentErrors.length > 0 ? recentErrors : ["No recent errors"]
            }, null, 2)
          }]
        };
      }

      case TOOLS.DISCONNECT: {
        if (!miniProgram) {
          return { content: [{ type: "text", text: "Not connected." }] };
        }
        await miniProgram.disconnect();
        miniProgram = null;
        return { content: [{ type: "text", text: "Disconnected." }] };
      }

      // For all other commands, check connection first
      default: {
        if (!miniProgram) {
          return { isError: true, content: [{ type: "text", text: "Not connected to Mini Program. Use launch or connect first." }] };
        }
        
        // Handle other tools
        switch (name) {
          case TOOLS.NAVIGATE_TO: {
            const { url } = args;
            const page = await miniProgram.reLaunch(url); // using reLaunch to be safe, or navigateTo
            // Note: automator.navigateTo returns the page object
            return { content: [{ type: "text", text: `Navigated to ${url}. Path: ${page.path}` }] };
          }

          case TOOLS.GET_PAGE_DATA: {
            const page = await miniProgram.currentPage();
            const { path } = args;
            const data = await page.data(path);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
          }

          case TOOLS.SET_PAGE_DATA: {
            const page = await miniProgram.currentPage();
            const { data } = args;
            await page.setData(data);
            return { content: [{ type: "text", text: "Data set successfully." }] };
          }

          case TOOLS.GET_ELEMENT: {
            const page = await miniProgram.currentPage();
            const { selector, action, attributeName, styleName } = args;
            const element = await page.$(selector);
            
            if (!element) {
              return { isError: true, content: [{ type: "text", text: `Element not found: ${selector}` }] };
            }

            let result;
            if (action === "text") result = await element.text();
            else if (action === "wxml") result = await element.wxml();
            else if (action === "outerWxml") result = await element.outerWxml();
            else if (action === "attribute") result = await element.attribute(attributeName);
            else if (action === "style") result = await element.style(styleName);
            else {
              return { isError: true, content: [{ type: "text", text: `Invalid action for get_element: ${action}` }] };
            }
            
            return { content: [{ type: "text", text: String(result) }] };
          }

          case TOOLS.TAP_ELEMENT: {
            const page = await miniProgram.currentPage();
            const { selector } = args;
            const element = await page.$(selector);
            if (!element) return { isError: true, content: [{ type: "text", text: `Element not found: ${selector}` }] };
            await element.tap();
            return { content: [{ type: "text", text: `Tapped element: ${selector}` }] };
          }

          case TOOLS.INPUT_TEXT: {
            const page = await miniProgram.currentPage();
            const { selector, value } = args;
            const element = await page.$(selector);
            if (!element) return { isError: true, content: [{ type: "text", text: `Element not found: ${selector}` }] };
            await element.input(value || "");
            return { content: [{ type: "text", text: `Input value "${value}" into ${selector}` }] };
          }

          case TOOLS.TRIGGER_EVENT: {
            const page = await miniProgram.currentPage();
            const { selector, eventName, detail } = args;
            const element = await page.$(selector);
            if (!element) return { isError: true, content: [{ type: "text", text: `Element not found: ${selector}` }] };
            await element.trigger(eventName, detail || {});
            return { content: [{ type: "text", text: `Triggered event "${eventName}" on ${selector}` }] };
          }

          case TOOLS.CALL_METHOD: {
             const page = await miniProgram.currentPage();
             const { method, args: methodArgs } = args;
             const result = await page.callMethod(method, ...methodArgs);
             return { content: [{ type: "text", text: result === undefined ? "undefined" : JSON.stringify(result, null, 2) }] };
          }

          case TOOLS.EVALUATE: {
            const { script, args: scriptArgs } = args;
            // Handle script execution
            // automator.evaluate accepts function or string.
            // If string, it is treated as function body if args are provided, or raw script?
            // "If the first argument is a string, it will be treated as the function body."
            // So we can wrap it.
            const result = await miniProgram.evaluate(script, ...scriptArgs);
            return { content: [{ type: "text", text: result === undefined ? "undefined" : JSON.stringify(result, null, 2) }] };
          }

          case TOOLS.CALL_CLOUD_FUNCTION: {
            const { name: funcName, data, config } = args;
            const result = await miniProgram.evaluate((n, d, c) => {
              return wx.cloud.callFunction({
                name: n,
                data: d,
                config: c
              }).catch(err => ({ _isError: true, message: err.message, err }));
            }, funcName, data, config);

            if (result && result._isError) {
              return { isError: true, content: [{ type: "text", text: `Cloud function failed: ${result.message}` }] };
            }

            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case TOOLS.BUILD_NPM: {
            const { projectPath, cliPath } = args;
            const targetProject = projectPath || connectedProjectPath;
            if (!targetProject) {
              return { isError: true, content: [{ type: "text", text: "Project path is required. Connect first or provide projectPath." }] };
            }
            
            try {
              const output = await executeCli(['build-npm', '--project', targetProject], cliPath);
              return { content: [{ type: "text", text: `NPM Build Success:\n${output}` }] };
            } catch (e) {
              return { isError: true, content: [{ type: "text", text: e.message }] };
            }
          }

          case TOOLS.CLOUD_FUNCTIONS_DEPLOY: {
            const { env, names, remoteNpmInstall, projectPath, cliPath } = args;
            const targetProject = projectPath || connectedProjectPath;
            if (!targetProject) {
              return { isError: true, content: [{ type: "text", text: "Project path is required. Connect first or provide projectPath." }] };
            }

            const cliArgs = ['cloud', 'functions', 'deploy', '--project', targetProject, '--env', env, '--names', ...names];
            if (remoteNpmInstall) {
              cliArgs.push('--remote-npm-install');
            }

            try {
              const output = await executeCli(cliArgs, cliPath);
              return { content: [{ type: "text", text: `Cloud Functions Deployed:\n${output}` }] };
            } catch (e) {
              return { isError: true, content: [{ type: "text", text: e.message }] };
            }
          }

          case TOOLS.CLOUD_FUNCTIONS_LIST: {
            const { env, projectPath, cliPath } = args;
            const targetProject = projectPath || connectedProjectPath;
            if (!targetProject) {
              return { isError: true, content: [{ type: "text", text: "Project path is required. Connect first or provide projectPath." }] };
            }

            try {
              const output = await executeCli(['cloud', 'functions', 'list', '--project', targetProject, '--env', env], cliPath);
              return { content: [{ type: "text", text: output }] };
            } catch (e) {
              return { isError: true, content: [{ type: "text", text: e.message }] };
            }
          }

          default:
            return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
        }
      }
    }
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }
});

// Helper for Zod to JSON Schema since we can't easily import zod-to-json-schema in this environment without proper setup or it might conflict
// Actually, I can use a simplified helper or just rely on manual schema construction if needed, but the library is installed.
// Let's try to import it properly.

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("WeChat DevTools MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
