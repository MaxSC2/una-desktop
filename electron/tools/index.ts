/**
 * U.N.A. Tools - central tool registration and dispatch.
 */
import { dispatch, getAll, getHandler, register } from './registry';
import { ToolContext, ToolResult } from './helpers';
import { mcpAdapter } from '../ai/mcp-adapter';

import * as listFiles from './definitions/list-files';
import * as readFile from './definitions/read-file';
import * as writeFile from './definitions/write-file';
import * as findFiles from './definitions/find-files';
import * as executeCommand from './definitions/execute-command';
import * as takeScreenshot from './definitions/take-screenshot';
import * as analyzeScreen from './definitions/analyze-screen';
import * as systemInfo from './definitions/system-info';
import * as memorySave from './definitions/memory-save';
import * as memoryRecall from './definitions/memory-recall';
import * as requestConfirmation from './definitions/request-confirmation';
import * as askClarification from './definitions/ask-clarification';
import * as webSearch from './definitions/web-search';
import * as webFetch from './definitions/web-fetch';
import * as webDownload from './definitions/web-download';
import * as editFile from './definitions/edit-file';
import * as grep from './definitions/grep';
import * as applyPatch from './definitions/apply-patch';
import * as runCode from './definitions/run-code';
import * as openApp from './definitions/open-app';
import * as typeText from './definitions/type-text';
import * as click from './definitions/click';
import * as keyPress from './definitions/key-press';
import * as listWindows from './definitions/list-windows';
import * as createReminder from './definitions/create-reminder';

register('list_files', listFiles.definition, listFiles.handler);
register('read_file', readFile.definition, readFile.handler);
register('write_file', writeFile.definition, writeFile.handler);
register('find_files', findFiles.definition, findFiles.handler);
register('execute_command', executeCommand.definition, executeCommand.handler);
register('take_screenshot', takeScreenshot.definition, takeScreenshot.handler);
register('analyze_screen', analyzeScreen.definition, analyzeScreen.handler);
register('system_info', systemInfo.definition, systemInfo.handler);
register('memory_save', memorySave.definition, memorySave.handler);
register('memory_recall', memoryRecall.definition, memoryRecall.handler);
register('request_confirmation', requestConfirmation.definition, requestConfirmation.handler);
register('ask_clarification', askClarification.definition, askClarification.handler);
register('web_search', webSearch.definition, webSearch.handler);
register('web_fetch', webFetch.definition, webFetch.handler);
register('web_download', webDownload.definition, webDownload.handler);
register('edit_file', editFile.definition, editFile.handler);
register('grep', grep.definition, grep.handler);
register('apply_patch', applyPatch.definition, applyPatch.handler);
register('run_code', runCode.definition, runCode.handler);
register('open_app', openApp.definition, openApp.handler);
register('type_text', typeText.definition, typeText.handler);
register('click', click.definition, click.handler);
register('key_press', keyPress.definition, keyPress.handler);
register('list_windows', listWindows.definition, listWindows.handler);
register('create_reminder', createReminder.definition, createReminder.handler);

/**
 * Local tool definitions (static, for backward compat).
 */
export const TOOL_DEFINITIONS = getAll();

/**
 * Get all tool definitions (local + MCP).
 */
export function getToolDefinitions() {
  return [...getAll(), ...mcpAdapter.getToolDefinitions()];
}

/**
 * Dispatch tool with MCP fallback.
 */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  if (getHandler(name)) {
    return dispatch(name, args, ctx);
  }
  try {
    return await mcpAdapter.callTool(name, args, ctx);
  } catch (e) {
    return { success: false, error: 'Tool not found locally or via MCP: ' + name + '. ' + (e as Error).message };
  }
}

export type { ToolContext, ToolResult };