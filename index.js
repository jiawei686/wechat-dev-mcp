#!/usr/bin/env node

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

const DEFAULT_PORT = parseInt(process.env.WECHAT_PORT || "9420", 10);
const CLI_TIMEOUT = parseInt(process.env.WECHAT_CLI_TIMEOUT || "120000", 10);
const MAX_LOG_ENTRIES = 200;
const AUTOMATOR_TIMEOUT = parseInt(process.env.WECHAT_AUTOMATOR_TIMEOUT || "10000", 10);

let miniProgram = null;
let connectedProjectPath = null;
let connectedCliPath = null;
const consoleLogs = [];

function withTimeout(promise, ms, errorMsg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg || `Operation timed out after ${ms}ms`)), ms))
  ]);
}

function getCliPath(customPath) {
  if (customPath && fs.existsSync(customPath)) return customPath;
  if (connectedCliPath && fs.existsSync(connectedCliPath)) return connectedCliPath;

  if (process.platform === 'darwin') {
    const defaultMacPath = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
    if (fs.existsSync(defaultMacPath)) return defaultMacPath;
    const altMacPath = '/Applications/wechatwebdevtools.app/Contents/Resources/app.nw/bin/cli';
    if (fs.existsSync(altMacPath)) return altMacPath;
  } else if (process.platform === 'win32') {
    const paths = [
      'C:\\Program Files (x86)\\Tencent\\WeChatDevTools\\cli.bat',
      'C:\\Program Files\\Tencent\\WeChatDevTools\\cli.bat',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  } else if (process.platform === 'linux') {
    const paths = [
      '/opt/wechatdevtools/cli',
      '/usr/local/wechatdevtools/cli',
      '/usr/share/wechatdevtools/cli',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function executeCli(args, cliPath) {
  return new Promise((resolve, reject) => {
    const finalCliPath = getCliPath(cliPath);
    if (!finalCliPath) {
      return reject(new Error("WeChat DevTools CLI not found. Please provide a valid cliPath."));
    }

    const child = execFile(finalCliPath, args, { timeout: CLI_TIMEOUT }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          return reject(new Error(`CLI execution timed out after ${CLI_TIMEOUT}ms`));
        }
        return reject(new Error(`CLI failed: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`));
      }
      resolve(stdout);
    });
  });
}

function addLog(entry) {
  if (consoleLogs.length >= MAX_LOG_ENTRIES) {
    consoleLogs.shift();
  }
  consoleLogs.push(entry);
}

function setupListeners(mp) {
  consoleLogs.length = 0;

  mp.on('console', msg => {
    addLog({
      type: 'console',
      level: msg.level,
      text: msg.text,
      args: msg.args,
      timestamp: Date.now()
    });
  });

  mp.on('exception', err => {
    addLog({
      type: 'exception',
      level: 'error',
      text: err.message || JSON.stringify(err),
      stack: err.stack,
      timestamp: Date.now()
    });
  });
}

async function ensureConnected() {
  if (!miniProgram) {
    throw new Error("Not connected to Mini Program. Use 'launch' or 'connect' first.");
  }
}

async function callWithTimeout(fn, timeoutMs) {
  return withTimeout(fn(), timeoutMs || AUTOMATOR_TIMEOUT, `Automator call timed out after ${timeoutMs || AUTOMATOR_TIMEOUT}ms`);
}

async function getCurrentPage() {
  const page = await callWithTimeout(() => miniProgram.currentPage());
  if (!page) {
    throw new Error("No page is currently open in the mini-program. The project may still be compiling or no project is open.");
  }
  return page;
}

async function queryElement(selector) {
  const page = await getCurrentPage();
  const element = await callWithTimeout(() => page.$(selector));
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
}

const WAIT_READY_MAX_ATTEMPTS = 20;
const WAIT_READY_INTERVAL = 3000;

async function waitMiniProgramReady(mp, maxWaitMs) {
  const maxAttempts = Math.ceil((maxWaitMs || WAIT_READY_MAX_ATTEMPTS * WAIT_READY_INTERVAL) / WAIT_READY_INTERVAL);
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const page = await withTimeout(mp.currentPage(), 5000, 'currentPage() timed out');
      if (page) return page;
    } catch {}
    await new Promise(r => setTimeout(r, WAIT_READY_INTERVAL));
  }
  return null;
}

function stringifyResult(result) {
  if (result === undefined || result === null) return String(result);
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

const inputSchema = z.object({
  projectPath: z.string().describe("Absolute path to the mini-program project"),
  cliPath: z.string().optional().describe("Path to the WeChat DevTools CLI executable"),
  port: z.number().optional().describe("Port for automation (default: " + DEFAULT_PORT + ")"),
});

const connectSchema = z.object({
  wsEndpoint: z.string().optional().describe("WebSocket endpoint (e.g., ws://localhost:9420)"),
});

const navigateToSchema = z.object({
  url: z.string().describe("The page URL to navigate to (e.g., /pages/index/index)"),
  method: z.enum(["reLaunch", "navigateTo", "redirectTo", "switchTab"])
    .optional().default("reLaunch")
    .describe("Navigation method: reLaunch (clear stack), navigateTo (push), redirectTo (replace), switchTab (tab bar)"),
});

const getPageDataSchema = z.object({
  path: z.string().optional().describe("Data path to retrieve (optional, returns full data if omitted)"),
});

const setPageDataSchema = z.object({
  data: z.record(z.any()).describe("The data object to set on the page"),
});

const getElementSchema = z.object({
  selector: z.string().describe("CSS selector of the element"),
  action: z.enum(["text", "wxml", "outerWxml", "attribute", "style", "value", "property"])
    .optional().default("text")
    .describe("What to get: text content, wxml, outerWxml, attribute value, computed style, element value, or property"),
  attributeName: z.string().optional().describe("Attribute name (required if action is 'attribute')"),
  styleName: z.string().optional().describe("Style name (required if action is 'style')"),
  propertyName: z.string().optional().describe("Property name (required if action is 'property')"),
});

const tapElementSchema = z.object({
  selector: z.string().describe("CSS selector of the element to tap"),
});

const inputTextSchema = z.object({
  selector: z.string().describe("CSS selector of the input element"),
  value: z.string().describe("Text value to input"),
});

const triggerEventSchema = z.object({
  selector: z.string().describe("CSS selector of the element"),
  eventName: z.string().describe("Event name to trigger (e.g., 'change', 'blur')"),
  detail: z.record(z.any()).optional().describe("Event detail object"),
});

const callMethodSchema = z.object({
  method: z.string().describe("Name of the page method to call"),
  args: z.array(z.any()).optional().default([]).describe("Arguments to pass to the method"),
});

const evaluateSchema = z.object({
  script: z.string().describe("JavaScript code to execute in the AppService context"),
  args: z.array(z.any()).optional().default([]).describe("Arguments to pass if script is a function body"),
});

const callCloudFunctionSchema = z.object({
  name: z.string().describe("Cloud function name"),
  data: z.record(z.any()).optional().describe("Data to pass to the function"),
  config: z.record(z.any()).optional().describe("Cloud config (e.g. env)"),
});

const buildNpmSchema = z.object({
  projectPath: z.string().optional().describe("Project path (defaults to currently connected project)"),
  cliPath: z.string().optional().describe("Path to DevTools CLI"),
});

const cloudFunctionsDeploySchema = z.object({
  env: z.string().describe("Cloud environment ID"),
  names: z.array(z.string()).describe("Cloud function names to deploy"),
  remoteNpmInstall: z.boolean().optional().default(false).describe("Install npm dependencies in the cloud"),
  projectPath: z.string().optional().describe("Project path (defaults to currently connected project)"),
  cliPath: z.string().optional().describe("Path to DevTools CLI"),
});

const cloudFunctionsListSchema = z.object({
  env: z.string().describe("Cloud environment ID"),
  projectPath: z.string().optional().describe("Project path (defaults to currently connected project)"),
  cliPath: z.string().optional().describe("Path to DevTools CLI"),
});

const getConsoleLogsSchema = z.object({
  level: z.enum(["all", "error", "warn", "info", "debug"])
    .optional().default("all").describe("Filter logs by level"),
  limit: z.number().optional().default(50).describe("Maximum number of logs to return"),
});

const navigateBackSchema = z.object({
  delta: z.number().optional().default(1).describe("Number of pages to go back"),
});

const pageScrollToSchema = z.object({
  scrollTop: z.number().describe("Scroll target position in pixels"),
  duration: z.number().optional().describe("Scroll animation duration in ms"),
});

const getElementSizeSchema = z.object({
  selector: z.string().describe("CSS selector of the element"),
});

const getElementOffsetSchema = z.object({
  selector: z.string().describe("CSS selector of the element"),
});

const longpressElementSchema = z.object({
  selector: z.string().describe("CSS selector of the element to long-press"),
});

const getPageStackSchema = z.object({});

const callWxMethodSchema = z.object({
  method: z.string().describe("wx API method name (e.g., 'getNetworkType', 'getLocation')"),
  args: z.array(z.any()).optional().default([]).describe("Arguments to pass to the method"),
});

const mockWxMethodSchema = z.object({
  method: z.string().describe("wx API method name to mock"),
  result: z.any().describe("Mock result object to return"),
});

const restoreWxMethodSchema = z.object({
  method: z.string().describe("wx API method name to restore"),
});

const screenshotSchema = z.object({
  path: z.string().optional().describe("File path to save the screenshot (optional, returns base64 if omitted)"),
});

const waitForSchema = z.object({
  selector: z.string().optional().describe("CSS selector to wait for"),
  data: z.string().optional().describe("Data path to wait for a specific value"),
  timeout: z.number().optional().default(5000).describe("Maximum wait time in ms"),
});

const waitReadySchema = z.object({
  timeout: z.number().optional().default(60000).describe("Maximum time to wait in ms"),
});

const TOOLS = {
  LAUNCH: "launch",
  CONNECT: "connect",
  CHECK_HEALTH: "check_health",
  NAVIGATE_TO: "navigate_to",
  NAVIGATE_BACK: "navigate_back",
  GET_PAGE_STACK: "get_page_stack",
  GET_PAGE_DATA: "get_page_data",
  SET_PAGE_DATA: "set_page_data",
  GET_ELEMENT: "get_element",
  GET_ELEMENT_SIZE: "get_element_size",
  GET_ELEMENT_OFFSET: "get_element_offset",
  TAP_ELEMENT: "tap_element",
  LONGPRESS_ELEMENT: "longpress_element",
  INPUT_TEXT: "input_text",
  TRIGGER_EVENT: "trigger_event",
  CALL_METHOD: "call_method",
  EVALUATE: "evaluate",
  CALL_CLOUD_FUNCTION: "call_cloud_function",
  CALL_WX_METHOD: "call_wx_method",
  MOCK_WX_METHOD: "mock_wx_method",
  RESTORE_WX_METHOD: "restore_wx_method",
  GET_SYSTEM_INFO: "get_system_info",
  SCREENSHOT: "screenshot",
  PAGE_SCROLL_TO: "page_scroll_to",
  WAIT_FOR: "wait_for",
  WAIT_READY: "wait_ready",
  GET_CONSOLE_LOGS: "get_console_logs",
  BUILD_NPM: "build_npm",
  CLOUD_FUNCTIONS_DEPLOY: "cloud_functions_deploy",
  CLOUD_FUNCTIONS_LIST: "cloud_functions_list",
  DISCONNECT: "disconnect",
};

const server = new Server(
  { name: "wechat-devtools-mcp", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

function registerTool(name, description, schema) {
  return { name, description, inputSchema: zodToJsonSchema(schema) };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      registerTool(TOOLS.LAUNCH,
        "[REQUIRED INITIAL STEP] Launch and connect WeChat Developer Tools. Opens a mini-program project and establishes an automation connection.",
        inputSchema
      ),
      registerTool(TOOLS.CONNECT,
        "Connect to an already running WeChat Developer Tools instance via WebSocket. Use if 'launch' fails or to attach to existing session.",
        connectSchema
      ),
      registerTool(TOOLS.CHECK_HEALTH,
        "[MANDATORY after every code change] Check mini-program health: connection status, current page path, network type, and recent console errors. Fix any errors immediately.",
        z.object({})
      ),
      registerTool(TOOLS.NAVIGATE_TO,
        "Navigate to a specific page in the mini-program. Supports reLaunch (default, clears stack), navigateTo (pushes to stack), redirectTo (replaces current), and switchTab (tab bar).",
        navigateToSchema
      ),
      registerTool(TOOLS.NAVIGATE_BACK,
        "Navigate back to the previous page in the mini-program stack.",
        navigateBackSchema
      ),
      registerTool(TOOLS.GET_PAGE_STACK,
        "Get the current page stack of the mini-program, showing all pages in order.",
        getPageStackSchema
      ),
      registerTool(TOOLS.GET_PAGE_DATA,
        "Get the data of the current page. Useful for verifying state after interactions or API calls.",
        getPageDataSchema
      ),
      registerTool(TOOLS.SET_PAGE_DATA,
        "Set data on the current page. Use to mock state or trigger UI updates for testing.",
        setPageDataSchema
      ),
      registerTool(TOOLS.GET_ELEMENT,
        "Get element information: text content, WXML structure, attributes, computed style, value, or property. Essential for UI verification.",
        getElementSchema
      ),
      registerTool(TOOLS.GET_ELEMENT_SIZE,
        "Get the size (width, height) of an element on the page.",
        getElementSizeSchema
      ),
      registerTool(TOOLS.GET_ELEMENT_OFFSET,
        "Get the offset position (left, top, right, bottom) of an element relative to the page.",
        getElementOffsetSchema
      ),
      registerTool(TOOLS.TAP_ELEMENT,
        "Tap (click) an element on the current page.",
        tapElementSchema
      ),
      registerTool(TOOLS.LONGPRESS_ELEMENT,
        "Long-press an element on the current page.",
        longpressElementSchema
      ),
      registerTool(TOOLS.INPUT_TEXT,
        "Input text into an element (e.g., <input>, <textarea>).",
        inputTextSchema
      ),
      registerTool(TOOLS.TRIGGER_EVENT,
        "Trigger a custom event (e.g., 'change', 'blur', 'submit') on an element.",
        triggerEventSchema
      ),
      registerTool(TOOLS.CALL_METHOD,
        "Call a method defined on the current page instance.",
        callMethodSchema
      ),
      registerTool(TOOLS.EVALUATE,
        "Execute arbitrary JavaScript code in the AppService context. Use for complex logic, debugging, or accessing global objects like 'wx'. Returns the last expression value.",
        evaluateSchema
      ),
      registerTool(TOOLS.CALL_CLOUD_FUNCTION,
        "Call a WeChat Cloud Function via wx.cloud.callFunction.",
        callCloudFunctionSchema
      ),
      registerTool(TOOLS.CALL_WX_METHOD,
        "Call any wx API method (e.g., getNetworkType, getLocation, getStorage, scanCode). Returns the result directly.",
        callWxMethodSchema
      ),
      registerTool(TOOLS.MOCK_WX_METHOD,
        "Mock a wx API method to return a custom result. Useful for testing without real device APIs.",
        mockWxMethodSchema
      ),
      registerTool(TOOLS.RESTORE_WX_METHOD,
        "Restore a previously mocked wx API method to its original implementation.",
        restoreWxMethodSchema
      ),
      registerTool(TOOLS.GET_SYSTEM_INFO,
        "Get comprehensive system info: device info, SDK version, platform, screen size, window size, etc.",
        z.object({})
      ),
      registerTool(TOOLS.SCREENSHOT,
        "Take a screenshot of the current mini-program view. Can save to file or return as base64.",
        screenshotSchema
      ),
      registerTool(TOOLS.PAGE_SCROLL_TO,
        "Scroll the current page to a specific scroll position.",
        pageScrollToSchema
      ),
      registerTool(TOOLS.WAIT_FOR,
        "Wait for an element to appear on the page or a condition to be met. Useful before interacting with dynamic content.",
        waitForSchema
      ),
      registerTool(TOOLS.WAIT_READY,
        "Wait for the mini-program to finish compiling and become ready for interaction. Use after 'launch' if the project is still compiling.",
        waitReadySchema
      ),
      registerTool(TOOLS.GET_CONSOLE_LOGS,
        "Get recent console logs from the mini-program. Filter by level (all, error, warn, info, debug).",
        getConsoleLogsSchema
      ),
      registerTool(TOOLS.BUILD_NPM,
        "Build NPM dependencies for the mini-program using the DevTools CLI.",
        buildNpmSchema
      ),
      registerTool(TOOLS.CLOUD_FUNCTIONS_DEPLOY,
        "Deploy cloud functions to a WeChat cloud environment using the DevTools CLI.",
        cloudFunctionsDeploySchema
      ),
      registerTool(TOOLS.CLOUD_FUNCTIONS_LIST,
        "List cloud functions in a WeChat cloud environment using the DevTools CLI.",
        cloudFunctionsListSchema
      ),
      registerTool(TOOLS.DISCONNECT,
        "Disconnect the automation session from the mini-program.",
        z.object({})
      ),
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case TOOLS.LAUNCH: {
        if (miniProgram) {
          return { content: [{ type: "text", text: "Already connected. Disconnect first or use 'connect' to attach." }] };
        }
        const { projectPath, cliPath, port } = args;

        if (!projectPath) {
          return { isError: true, content: [{ type: "text", text: "projectPath is required." }] };
        }
        if (!fs.existsSync(projectPath)) {
          return { isError: true, content: [{ type: "text", text: `Project path does not exist: ${projectPath}` }] };
        }

        const options = { projectPath, cliPath, port };
        Object.keys(options).forEach(key => options[key] === undefined && delete options[key]);

        if (projectPath) connectedProjectPath = projectPath;
        if (cliPath) connectedCliPath = cliPath;

        const tryPort = port || DEFAULT_PORT;
        const projectReady = async (mp) => {
          const page = await withTimeout(mp.currentPage(), 5000, 'no page');
          return !!page;
        };

        // Step 1: Try connecting to an already-running DevTools instance
        let connectedToExisting = false;
        try {
          const mp = await withTimeout(
            automator.connect({ wsEndpoint: `ws://localhost:${tryPort}` }),
            AUTOMATOR_TIMEOUT,
            `Connection to port ${tryPort} timed out`
          );

          // Step 2: Check if a project is already open
          if (await projectReady(mp).catch(() => false)) {
            miniProgram = mp;
            setupListeners(miniProgram);
            const page = await callWithTimeout(() => miniProgram.currentPage(), 3000);
            return { content: [{ type: "text", text: `Connected to existing instance on port ${tryPort}, page: ${page.path}` }] };
          }

          // Step 3: Instance is running without a project — use CLI to open it
          const finalCliPath = getCliPath(cliPath);
          if (!finalCliPath) {
            try { mp.disconnect(); } catch {}
            return { isError: true, content: [{ type: "text", text: "DevTools is running but no project is open. Provide cliPath to auto-open, or open the project manually in DevTools." }] };
          }
          console.error(`Opening project ${projectPath} via CLI...`);
          await executeCli(['open', '--project', projectPath, '--port', String(tryPort)], finalCliPath);

          // Step 4: Wait for project to compile and load
          const readyPage = await waitMiniProgramReady(mp, 60000);
          if (readyPage) {
            miniProgram = mp;
            setupListeners(miniProgram);
            return { content: [{ type: "text", text: `Opened project ${projectPath} in existing DevTools, page: ${readyPage.path}` }] };
          }
          try { mp.disconnect(); } catch {}
          return { isError: true, content: [{ type: "text", text: "Connected to DevTools but the mini-program failed to load. Check DevTools for compilation errors." }] };
        } catch {}

        // Step 5: No running instance — launch DevTools with the project
        try {
          miniProgram = await withTimeout(
            automator.launch(options),
            AUTOMATOR_TIMEOUT * 3,
            'Launch timed out'
          );
          setupListeners(miniProgram);

          // Wait for mini-program to be ready (compilation + simulator)
          const page = await waitMiniProgramReady(miniProgram, 60000);
          if (page) {
            return { content: [{ type: "text", text: `Launched project at ${projectPath}, page: ${page.path}` }] };
          }

          // Connected but mini-program is not ready yet
          return { content: [{ type: "text", text: `Launched project at ${projectPath} but mini-program is still compiling. Use 'wait_ready' to wait for compilation to finish, or 'check_health' to check status.` }] };
        } catch (launchError) {
          miniProgram = null;
          return { isError: true, content: [{ type: "text", text: `Launch failed: ${launchError.message}` }] };
        }
      }

      case TOOLS.CONNECT: {
        if (miniProgram) {
          return { content: [{ type: "text", text: "Already connected. Disconnect first." }] };
        }
        let { wsEndpoint } = args;
        if (!wsEndpoint) {
          wsEndpoint = `ws://localhost:${DEFAULT_PORT}`;
        }
        try {
          miniProgram = await withTimeout(
            automator.connect({ wsEndpoint }),
            AUTOMATOR_TIMEOUT,
            `Connection to ${wsEndpoint} timed out`
          );
          setupListeners(miniProgram);
          return { content: [{ type: "text", text: `Connected to Mini Program at ${wsEndpoint}.` }] };
        } catch (e) {
          return { isError: true, content: [{ type: "text", text: `Failed to connect: ${e.message}` }] };
        }
      }

      case TOOLS.CHECK_HEALTH: {
        if (!miniProgram) {
          return { content: [{ type: "text", text: JSON.stringify({ connected: false, error: "Not connected" }) }] };
        }

        let pagePath = "unknown";
        let pageReady = false;
        let compilationStatus = "unknown";
        try {
          const page = await withTimeout(miniProgram.currentPage(), AUTOMATOR_TIMEOUT, "currentPage() timed out");
          pagePath = page ? page.path : "no_page_found";
          pageReady = !!page;
          if (pageReady) compilationStatus = "ready";
          else compilationStatus = "no_page";
        } catch (e) {
          pagePath = `unavailable: ${e.message}`;
          compilationStatus = "compiling";
        }

        const recentErrors = consoleLogs
          .filter(log => log.level === 'error' || log.type === 'exception')
          .slice(-5)
          .map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            return `[${time}] ${log.text}`;
          });

        let networkType = "unknown";
        if (pageReady) {
          try {
            const netRes = await withTimeout(miniProgram.evaluate(() => new Promise(resolve => {
              wx.getNetworkType({ success: resolve, fail: () => resolve({ networkType: 'fail' }) });
            })), AUTOMATOR_TIMEOUT, "getNetworkType timed out");
            if (netRes) networkType = netRes.networkType;
          } catch (e) {
            networkType = `check_failed: ${e.message}`;
          }
        }

        let tips = "Connected, waiting for compilation...";
        if (pageReady && networkType !== "unknown") tips = "Mini-program is running normally";
        else if (pageReady) tips = "Mini-program loaded, but network check failed";

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              connected: true,
              pagePath,
              pageReady,
              compilationStatus,
              networkType,
              tips,
              recentConsoleErrors: recentErrors.length > 0 ? recentErrors : ["No recent errors"],
            }, null, 2)
          }]
        };
      }

      case TOOLS.DISCONNECT: {
        if (!miniProgram) {
          return { content: [{ type: "text", text: "Not connected." }] };
        }
        miniProgram.disconnect();
        miniProgram = null;
        connectedProjectPath = null;
        consoleLogs.length = 0;
        return { content: [{ type: "text", text: "Disconnected and session cleared." }] };
      }

      default: {
        await ensureConnected();

        switch (name) {
          case TOOLS.NAVIGATE_TO: {
            const { url, method } = args;
            let page;
            switch (method) {
              case "navigateTo":
                page = await callWithTimeout(() => miniProgram.navigateTo(url));
                break;
              case "redirectTo":
                page = await callWithTimeout(() => miniProgram.redirectTo(url));
                break;
              case "switchTab":
                page = await callWithTimeout(() => miniProgram.switchTab(url));
                break;
              default:
                page = await callWithTimeout(() => miniProgram.reLaunch(url));
            }
            const pagePath = page ? page.path : url;
            return { content: [{ type: "text", text: `Navigated to ${url} via ${method}. Current page: ${pagePath}` }] };
          }

          case TOOLS.NAVIGATE_BACK: {
            const { delta } = args;
            const page = await callWithTimeout(() => miniProgram.navigateBack(delta));
            const pagePath = page ? page.path : "unknown";
            return { content: [{ type: "text", text: `Navigated back (delta=${delta}). Current page: ${pagePath}` }] };
          }

          case TOOLS.GET_PAGE_STACK: {
            const stack = await callWithTimeout(() => miniProgram.pageStack());
            const pages = stack.map(p => ({ path: p.path, query: p.query }));
            return { content: [{ type: "text", text: JSON.stringify(pages, null, 2) }] };
          }

          case TOOLS.GET_PAGE_DATA: {
            const page = await getCurrentPage();
            const { path: dataPath } = args;
            const data = dataPath ? await callWithTimeout(() => page.data(dataPath)) : await callWithTimeout(() => page.data());
            return { content: [{ type: "text", text: stringifyResult(data) }] };
          }

          case TOOLS.SET_PAGE_DATA: {
            const page = await getCurrentPage();
            const { data } = args;
            await callWithTimeout(() => page.setData(data));
            return { content: [{ type: "text", text: "Page data set successfully." }] };
          }

          case TOOLS.GET_ELEMENT: {
            const element = await queryElement(args.selector);
            const { action, attributeName, styleName, propertyName } = args;

            let result;
            switch (action) {
              case "text": result = await callWithTimeout(() => element.text()); break;
              case "wxml": result = await callWithTimeout(() => element.wxml()); break;
              case "outerWxml": result = await callWithTimeout(() => element.outerWxml()); break;
              case "attribute": result = await callWithTimeout(() => element.attribute(attributeName)); break;
              case "style": result = await callWithTimeout(() => element.style(styleName)); break;
              case "value": result = await callWithTimeout(() => element.value()); break;
              case "property": result = await callWithTimeout(() => element.property(propertyName)); break;
              default:
                return { isError: true, content: [{ type: "text", text: `Unknown action: ${action}` }] };
            }

            return { content: [{ type: "text", text: stringifyResult(result) }] };
          }

          case TOOLS.GET_ELEMENT_SIZE: {
            const element = await queryElement(args.selector);
            const size = await callWithTimeout(() => element.size());
            return { content: [{ type: "text", text: JSON.stringify(size, null, 2) }] };
          }

          case TOOLS.GET_ELEMENT_OFFSET: {
            const element = await queryElement(args.selector);
            const offset = await callWithTimeout(() => element.offset());
            return { content: [{ type: "text", text: JSON.stringify(offset, null, 2) }] };
          }

          case TOOLS.TAP_ELEMENT: {
            const element = await queryElement(args.selector);
            await callWithTimeout(() => element.tap());
            return { content: [{ type: "text", text: `Tapped: ${args.selector}` }] };
          }

          case TOOLS.LONGPRESS_ELEMENT: {
            const element = await queryElement(args.selector);
            await callWithTimeout(() => element.longpress());
            return { content: [{ type: "text", text: `Long-pressed: ${args.selector}` }] };
          }

          case TOOLS.INPUT_TEXT: {
            const element = await queryElement(args.selector);
            await callWithTimeout(() => element.input(args.value || ""));
            return { content: [{ type: "text", text: `Input "${args.value}" into ${args.selector}` }] };
          }

          case TOOLS.TRIGGER_EVENT: {
            const element = await queryElement(args.selector);
            await callWithTimeout(() => element.trigger(args.eventName, args.detail || {}));
            return { content: [{ type: "text", text: `Triggered "${args.eventName}" on ${args.selector}` }] };
          }

          case TOOLS.CALL_METHOD: {
            const page = await getCurrentPage();
            const { method, args: methodArgs } = args;
            const result = await callWithTimeout(() => page.callMethod(method, ...(methodArgs || [])));
            return { content: [{ type: "text", text: stringifyResult(result) }] };
          }

          case TOOLS.EVALUATE: {
            const { script, args: scriptArgs } = args;
            const fn = new Function(...(scriptArgs || []).map((_, i) => `arg${i}`), script);
            const result = await callWithTimeout(() => miniProgram.evaluate(fn, ...(scriptArgs || [])));
            return { content: [{ type: "text", text: stringifyResult(result) }] };
          }

          case TOOLS.CALL_CLOUD_FUNCTION: {
            const { name: funcName, data, config } = args;
            const result = await callWithTimeout(() => miniProgram.evaluate((n, d, c) => {
              return wx.cloud.callFunction({ name: n, data: d, config: c })
                .catch(err => ({ _isError: true, message: err.message, err }));
            }, funcName, data, config), 30000);

            if (result && result._isError) {
              return { isError: true, content: [{ type: "text", text: `Cloud function failed: ${result.message}` }] };
            }
            return { content: [{ type: "text", text: stringifyResult(result) }] };
          }

          case TOOLS.CALL_WX_METHOD: {
            const { method, args: wxArgs } = args;
            const result = await callWithTimeout(() => miniProgram.callWxMethod(method, ...(wxArgs || [])));
            return { content: [{ type: "text", text: stringifyResult(result) }] };
          }

          case TOOLS.MOCK_WX_METHOD: {
            const { method, result: mockResult } = args;
            await callWithTimeout(() => miniProgram.mockWxMethod(method, mockResult));
            return { content: [{ type: "text", text: `Mocked wx.${method}()` }] };
          }

          case TOOLS.RESTORE_WX_METHOD: {
            const { method } = args;
            await callWithTimeout(() => miniProgram.restoreWxMethod(method));
            return { content: [{ type: "text", text: `Restored wx.${method}() to original.` }] };
          }

          case TOOLS.GET_SYSTEM_INFO: {
            const info = await callWithTimeout(() => miniProgram.systemInfo(), 15000);
            return { content: [{ type: "text", text: stringifyResult(info) }] };
          }

          case TOOLS.SCREENSHOT: {
            const { path: screenshotPath } = args;
            const options = screenshotPath ? { path: screenshotPath } : {};
            const result = await callWithTimeout(() => miniProgram.screenshot(options), 30000);
            return {
              content: [{
                type: "text",
                text: screenshotPath
                  ? `Screenshot saved to: ${screenshotPath}`
                  : `Screenshot (base64, ${result.length} chars)`
              }]
            };
          }

          case TOOLS.PAGE_SCROLL_TO: {
            const { scrollTop, duration } = args;
            if (duration) {
              await callWithTimeout(() => miniProgram.evaluate((top, dur) => {
                wx.pageScrollTo({ scrollTop: top, duration: dur });
              }, scrollTop, duration));
            } else {
              await callWithTimeout(() => miniProgram.pageScrollTo(scrollTop));
            }
            return { content: [{ type: "text", text: `Scrolled to ${scrollTop}px` }] };
          }

          case TOOLS.WAIT_FOR: {
            const page = await getCurrentPage();
            const { selector, timeout } = args;
            if (selector) {
              await callWithTimeout(() => page.waitFor(selector, timeout), (timeout || 5000) + 2000);
              return { content: [{ type: "text", text: `Waited for: ${selector}` }] };
            }
            return { isError: true, content: [{ type: "text", text: "'selector' is required for wait_for." }] };
          }

          case TOOLS.WAIT_READY: {
            const { timeout } = args;
            const page = await waitMiniProgramReady(miniProgram, timeout || 60000);
            if (page) {
              return { content: [{ type: "text", text: `Mini-program is ready, current page: ${page.path}` }] };
            }
            return { isError: true, content: [{ type: "text", text: `Mini-program not ready after ${timeout || 60000}ms. Check DevTools for compilation errors.` }] };
          }

          case TOOLS.GET_CONSOLE_LOGS: {
            let { level, limit } = args;
            if (!limit || limit > MAX_LOG_ENTRIES) limit = MAX_LOG_ENTRIES;
            let filtered = consoleLogs;
            if (level && level !== 'all') {
              filtered = filtered.filter(log => log.level === level);
            }
            const logs = filtered.slice(-limit).map(log => {
              const time = new Date(log.timestamp).toLocaleTimeString();
              const prefix = log.type === 'exception' ? '[EXCEPTION]' : `[${log.level.toUpperCase()}]`;
              return `${prefix} [${time}] ${log.text}`;
            });
            return { content: [{ type: "text", text: logs.length > 0 ? logs.join('\n') : "No console logs." }] };
          }

          case TOOLS.BUILD_NPM: {
            const { projectPath, cliPath } = args;
            const targetProject = projectPath || connectedProjectPath;
            if (!targetProject) {
              return { isError: true, content: [{ type: "text", text: "Project path required. Connect first or provide projectPath." }] };
            }
            const output = await executeCli(['build-npm', '--project', targetProject], cliPath);
            return { content: [{ type: "text", text: `NPM build successful:\n${output}` }] };
          }

          case TOOLS.CLOUD_FUNCTIONS_DEPLOY: {
            const { env, names, remoteNpmInstall, projectPath, cliPath } = args;
            const targetProject = projectPath || connectedProjectPath;
            if (!targetProject) {
              return { isError: true, content: [{ type: "text", text: "Project path required. Connect first or provide projectPath." }] };
            }
            const cliArgs = ['cloud', 'functions', 'deploy', '--project', targetProject, '--env', env, '--names', ...names];
            if (remoteNpmInstall) cliArgs.push('--remote-npm-install');
            const output = await executeCli(cliArgs, cliPath);
            return { content: [{ type: "text", text: `Cloud functions deployed:\n${output}` }] };
          }

          case TOOLS.CLOUD_FUNCTIONS_LIST: {
            const { env, projectPath, cliPath } = args;
            const targetProject = projectPath || connectedProjectPath;
            if (!targetProject) {
              return { isError: true, content: [{ type: "text", text: "Project path required. Connect first or provide projectPath." }] };
            }
            const output = await executeCli(['cloud', 'functions', 'list', '--project', targetProject, '--env', env], cliPath);
            return { content: [{ type: "text", text: output }] };
          }

          default:
            return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
        }
      }
    }
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error.message }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("WeChat DevTools MCP Server v1.1.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
