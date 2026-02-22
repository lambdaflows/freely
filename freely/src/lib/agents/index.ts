/**
 * Freely Agents — Barrel Exports
 *
 * Public API for the agent integration layer.
 * Import from this file in Freely's UI and hooks.
 *
 * Usage:
 * ```typescript
 * import { freelyAgentOrchestrator, AGENT_PROVIDER_IDS } from '@/lib/agents';
 *
 * const stream = freelyAgentOrchestrator.execute({
 *   toolType: 'claude-code',
 *   userMessage: 'Help me debug this',
 * });
 * for await (const chunk of stream) {
 *   appendText(chunk);
 * }
 * ```
 */

// Orchestrator (primary entry point)
export {
  FreelyAgentOrchestrator,
  freelyAgentOrchestrator,
  AGENT_PROVIDER_IDS,
  type AgentProviderId,
  type AgentExecuteParams,
} from './orchestrator.js';

// Types
export type {
  MessageID,
  SessionID,
  TaskID,
  Message,
  MessageContentBlock,
  MessageRole,
  MessageSource,
  PermissionMode,
  ClaudeCodePermissionMode,
  GeminiPermissionMode,
  CodexPermissionMode,
  CodexSandboxMode,
  CodexApprovalPolicy,
  ToolType,
  AgenticToolName,
  StreamingCallbacks,
  ToolCapabilities,
  ImportOptions,
  CreateSessionConfig,
  SessionHandle,
  SessionData,
  SessionMetadata,
  TaskResult,
  MessageRange,
  FreelyExecutionResult,
  ISessionsRepository,
  TaskStatus,
} from './types.js';

export {
  generateId,
  toMessageID,
  toSessionID,
  toTaskID,
  MessageRole as MessageRoleEnum,
  TaskStatus as TaskStatusEnum,
} from './types.js';

// Storage Adapter
export {
  createStorageAdapter,
  LocalStorageTasksService,
  LocalStorageSessionsService,
  LocalStorageSessionsRepository,
  getProviderVariable,
  setProviderVariable,
  type TasksService,
  type SessionsService,
  type StoredTask,
  type StoredSession,
  type FreelyStorageAdapter,
} from './storage-adapter.js';

// Tool Adapters (for direct use or subclassing)
export { FreelyClaudeTool } from './claude/freely-claude-tool.js';
export { FreelyCodexTool } from './codex/freely-codex-tool.js';
export { FreelyGeminiTool } from './gemini/freely-gemini-tool.js';
