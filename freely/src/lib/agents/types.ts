/**
 * Freely Agent Types
 *
 * Standalone type definitions replacing @agor/core dependencies.
 * These mirror the Agor type system but are decoupled for Freely's browser/Tauri context.
 */

// ============================================================================
// Branded ID Types
// ============================================================================

export type MessageID = string & { readonly _brand: 'MessageID' };
export type SessionID = string & { readonly _brand: 'SessionID' };
export type TaskID = string & { readonly _brand: 'TaskID' };

/** Generate a new UUID-based ID */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Cast a plain string to a branded MessageID */
export function toMessageID(id: string): MessageID {
  return id as MessageID;
}

/** Cast a plain string to a branded SessionID */
export function toSessionID(id: string): SessionID {
  return id as SessionID;
}

/** Cast a plain string to a branded TaskID */
export function toTaskID(id: string): TaskID {
  return id as TaskID;
}

// ============================================================================
// Message Role & Status
// ============================================================================

export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const;

export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export const TaskStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export type MessageSource = 'user' | 'api' | 'system' | 'import';

// ============================================================================
// Permission Modes
// ============================================================================

/** Freely unified permission mode (mirrors Agor's PermissionMode) */
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk';

/** Claude Code permission modes (via Claude Agent SDK) */
export type ClaudeCodePermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk';

/** Gemini permission modes */
export type GeminiPermissionMode = 'default' | 'autoEdit' | 'yolo';

/** Codex permission modes */
export type CodexPermissionMode = 'ask' | 'auto' | 'on-failure' | 'allow-all';

/** Codex sandbox mode */
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/** Codex approval policy */
export type CodexApprovalPolicy = 'untrusted' | 'on-request' | 'on-failure' | 'never';

// ============================================================================
// Message Content
// ============================================================================

export interface MessageContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  /** For tool_result blocks */
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface Message {
  message_id: MessageID;
  session_id: SessionID;
  type: string;
  role: MessageRole;
  index: number;
  timestamp: string;
  content_preview: string;
  content: string | MessageContentBlock[];
  tool_uses?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  task_id?: TaskID;
  metadata?: Record<string, unknown>;
  /** Claude Agent SDK session ID for conversation continuity */
  sdk_session_id?: string;
}

// ============================================================================
// Tool Types
// ============================================================================

/** Supported agentic coding tool types */
export type ToolType = 'claude-code' | 'codex' | 'gemini' | 'opencode';

/** Agentic coding tool names (UI display) */
export type AgenticToolName = 'claude-code' | 'codex' | 'gemini' | 'opencode';

// ============================================================================
// Streaming Callbacks
// ============================================================================

/**
 * Streaming callback interface for real-time message updates.
 *
 * Call order:
 * 1. onStreamStart (once per message)
 * 2. onStreamChunk (multiple times)
 * 3. onStreamEnd (once, on success) OR onStreamError (once, on failure)
 */
export interface StreamingCallbacks {
  onStreamStart(
    messageId: MessageID,
    metadata: {
      session_id: SessionID;
      task_id?: TaskID;
      role: string;
      timestamp: string;
    }
  ): Promise<void>;

  onStreamChunk(messageId: MessageID, chunk: string, sequence?: number): Promise<void>;

  onStreamEnd(messageId: MessageID): Promise<void>;

  onStreamError(messageId: MessageID, error: Error): Promise<void>;

  onThinkingStart?(
    messageId: MessageID,
    metadata: { budget?: number }
  ): Promise<void>;

  onThinkingChunk?(messageId: MessageID, chunk: string): Promise<void>;

  onThinkingEnd?(messageId: MessageID): Promise<void>;
}

// ============================================================================
// Tool Capabilities
// ============================================================================

export interface ToolCapabilities {
  supportsSessionImport: boolean;
  supportsSessionCreate: boolean;
  supportsLiveExecution: boolean;
  supportsSessionFork: boolean;
  supportsChildSpawn: boolean;
  supportsGitState: boolean;
  supportsStreaming: boolean;
}

// ============================================================================
// Session & Task Types
// ============================================================================

export interface ImportOptions {
  projectDir?: string;
  [key: string]: unknown;
}

export interface CreateSessionConfig {
  initialPrompt?: string;
  workingDirectory?: string;
  gitRef?: string;
  concepts?: string[];
  [key: string]: unknown;
}

export interface SessionHandle {
  sessionId: string;
  toolType: ToolType;
}

export interface SessionData extends SessionHandle {
  messages: Message[];
  metadata: SessionMetadata;
  workingDirectory?: string;
}

export interface SessionMetadata {
  sessionId: string;
  toolType: ToolType;
  status: 'active' | 'idle' | 'completed' | 'failed';
  createdAt: Date;
  lastUpdatedAt: Date;
  workingDirectory?: string;
  gitState?: {
    ref: string;
    baseSha: string;
    currentSha: string;
  };
  messageCount?: number;
  taskCount?: number;
}

export interface TaskResult {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  messages: Message[];
  error?: Error;
  completedAt: Date;
}

export interface MessageRange {
  startIndex?: number;
  endIndex?: number;
  limit?: number;
}

// ============================================================================
// Execution Result (Freely-specific)
// ============================================================================

export interface FreelyExecutionResult {
  /** ID of the user message created */
  userMessageId: MessageID;
  /** IDs of assistant messages created */
  assistantMessageIds: MessageID[];
  /** Full text of the assistant response */
  responseText: string;
  /** Agent tool type that handled the execution */
  toolType: ToolType;
  /** Resolved model name */
  model?: string;
  /** Token usage */
  tokenUsage?: {
    input: number;
    output: number;
  };
  /** True if execution was stopped early */
  wasStopped?: boolean;
  /** Any error that occurred */
  error?: string;
}

// ============================================================================
// Repository Interfaces (used internally by tool adapters)
// ============================================================================

/** Minimal interface that tool classes use to manage sessions */
export interface ISessionsRepository {
  findById(sessionId: SessionID): Promise<{ session_id: SessionID; sdk_session_id?: string } | null>;
  update(sessionId: SessionID, data: Partial<{ sdk_session_id: string }>): Promise<{ session_id: SessionID; sdk_session_id?: string }>;
}
