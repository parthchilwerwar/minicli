import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolSchema } from '../llm.js';

import { runShellTool } from './shell.js';
import { readFileTool, writeFileTool, listDirTool } from './files.js';
import { gitStatusTool, gitLogTool, gitDiffTool, gitStatsTool } from './git.js';
import { webSearchTool } from './search.js';
import { saveNoteTool, listNotesTool, searchNotesTool, deleteNoteTool } from './notes.js';

import {
  githubListPRsTool, githubCreatePRTool, githubListIssuesTool,
  githubCreateIssueTool, githubWorkflowRunsTool, githubMergePRTool,
} from './github.js';
import {
  ticktickGetTodayTool, ticktickGetAllTool, ticktickCreateTaskTool,
  ticktickCompleteTaskTool, ticktickGetProjectsTool,
} from './ticktick.js';
import {
  calendarGetTodayTool, calendarGetWeekTool,
  calendarCreateEventTool, calendarFreeSlotsTool,
} from './calendar.js';
import {
  obsidianSearchTool, obsidianReadNoteTool, obsidianCreateNoteTool,
  obsidianListRecentTool, obsidianAppendNoteTool,
} from './obsidian.js';
import {
  newsFetchRssTool, newsSummariseTodayTool, newsSearchHeadlinesTool,
} from './news.js';
import {
  fsListDirTool, fsReadFileTool, fsFindTool, fsGetStructureTool,
  vaultListTool, vaultReadTool, vaultSearchTool,
} from './filesystem.js';
import {
  gmailListTool, gmailReadTool, gmailSendTool,
  gmailSearchTool, gmailUnreadCountTool,
} from '../gmail-mcp.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<z.ZodRawShape>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export function toSchema(tool: ToolDefinition): ToolSchema {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters) as Record<string, unknown>,
    },
  };
}

export const ALL_TOOLS: ToolDefinition[] = [
  // Core
  runShellTool, readFileTool, writeFileTool, listDirTool,
  gitStatusTool, gitLogTool, gitDiffTool, gitStatsTool,
  webSearchTool,
  saveNoteTool, listNotesTool, searchNotesTool, deleteNoteTool,
  // GitHub
  githubListPRsTool, githubCreatePRTool, githubListIssuesTool,
  githubCreateIssueTool, githubWorkflowRunsTool, githubMergePRTool,
  // TickTick
  ticktickGetTodayTool, ticktickGetAllTool, ticktickCreateTaskTool,
  ticktickCompleteTaskTool, ticktickGetProjectsTool,
  // Calendar
  calendarGetTodayTool, calendarGetWeekTool,
  calendarCreateEventTool, calendarFreeSlotsTool,
  // Obsidian
  obsidianSearchTool, obsidianReadNoteTool, obsidianCreateNoteTool,
  obsidianListRecentTool, obsidianAppendNoteTool,
  // News
  newsFetchRssTool, newsSummariseTodayTool, newsSearchHeadlinesTool,
  // Filesystem (sandboxed)
  fsListDirTool, fsReadFileTool, fsFindTool, fsGetStructureTool,
  vaultListTool, vaultReadTool, vaultSearchTool,
  // Gmail
  gmailListTool, gmailReadTool, gmailSendTool,
  gmailSearchTool, gmailUnreadCountTool,
];


