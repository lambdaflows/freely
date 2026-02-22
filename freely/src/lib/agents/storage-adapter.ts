/**
 * Freely Storage Adapter
 *
 * localStorage-based implementations of the service interfaces expected by
 * extracted-from-agor tool classes. Replaces Feathers/Drizzle repositories
 * with browser-compatible storage for Freely's Tauri context.
 */

import type {
  ISessionsRepository,
  SessionID,
  TaskID,
} from './types.js';

// ============================================================================
// Storage Key Helpers
// ============================================================================

const AGENTS_STORAGE_PREFIX = 'freely_agents_';

const STORAGE_KEYS = {
  session: (sessionId: string) => `${AGENTS_STORAGE_PREFIX}session_${sessionId}`,
  task: (taskId: string) => `${AGENTS_STORAGE_PREFIX}task_${taskId}`,
} as const;

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[FreelyStorage] Failed to write key "${key}":`, err);
  }
}

// ============================================================================
// TasksService
//
// Service interface matching claude-tool.ts TasksService.
// Stores task records in localStorage.
// ============================================================================

export interface TasksService {
  get(id: string): Promise<StoredTask>;
  patch(id: string, data: Partial<StoredTask>): Promise<StoredTask>;
}

export interface StoredTask {
  task_id: string;
  session_id: string;
  status: string;
  model?: string;
  created_at?: string;
  updated_at?: string;
  normalized_sdk_response?: unknown;
  computed_context_window?: number;
  [key: string]: unknown;
}

export class LocalStorageTasksService implements TasksService {
  async get(id: string): Promise<StoredTask> {
    const key = STORAGE_KEYS.task(id);
    const task = readJson<StoredTask | null>(key, null);
    if (!task) {
      throw new Error(`TasksService.get: task "${id}" not found`);
    }
    return task;
  }

  async patch(id: string, data: Partial<StoredTask>): Promise<StoredTask> {
    const key = STORAGE_KEYS.task(id);
    const existing = readJson<StoredTask | null>(key, null) ?? {
      task_id: id,
      session_id: '',
      status: 'active',
      created_at: new Date().toISOString(),
    };

    const updated: StoredTask = {
      ...existing,
      ...data,
      task_id: id,
      updated_at: new Date().toISOString(),
    };

    writeJson(key, updated);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('freely:task:updated', { detail: updated })
      );
    }

    return updated;
  }

  /** Ensure a task record exists (upsert on creation) */
  async ensureTask(taskId: TaskID, sessionId: SessionID): Promise<StoredTask> {
    const key = STORAGE_KEYS.task(taskId);
    const existing = readJson<StoredTask | null>(key, null);
    if (existing) return existing;

    const task: StoredTask = {
      task_id: taskId,
      session_id: sessionId,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    writeJson(key, task);
    return task;
  }
}

// ============================================================================
// SessionsService
//
// Service interface matching claude-tool.ts SessionsService.
// ============================================================================

export interface SessionsService {
  patch(id: string, data: Partial<StoredSession>): Promise<StoredSession>;
}

export interface StoredSession {
  session_id: string;
  sdk_session_id?: string;
  tool_type?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export class LocalStorageSessionsService implements SessionsService {
  async patch(id: string, data: Partial<StoredSession>): Promise<StoredSession> {
    const key = STORAGE_KEYS.session(id);
    const existing = readJson<StoredSession | null>(key, null) ?? {
      session_id: id,
      created_at: new Date().toISOString(),
    };

    const updated: StoredSession = {
      ...existing,
      ...data,
      session_id: id,
      updated_at: new Date().toISOString(),
    };

    writeJson(key, updated);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('freely:session:updated', { detail: updated })
      );
    }

    return updated;
  }
}

// ============================================================================
// SessionsRepository
//
// Implements ISessionsRepository interface for use inside tool adapters.
// ============================================================================

export class LocalStorageSessionsRepository implements ISessionsRepository {
  async findById(
    sessionId: SessionID
  ): Promise<{ session_id: SessionID; sdk_session_id?: string } | null> {
    const key = STORAGE_KEYS.session(sessionId);
    return readJson<StoredSession | null>(key, null) as {
      session_id: SessionID;
      sdk_session_id?: string;
    } | null;
  }

  async update(
    sessionId: SessionID,
    data: Partial<{ sdk_session_id: string }>
  ): Promise<{ session_id: SessionID; sdk_session_id?: string }> {
    const key = STORAGE_KEYS.session(sessionId);
    const existing = readJson<StoredSession | null>(key, null) ?? {
      session_id: sessionId,
      created_at: new Date().toISOString(),
    };

    const updated: StoredSession = {
      ...existing,
      ...data,
      session_id: sessionId,
      updated_at: new Date().toISOString(),
    };

    writeJson(key, updated);
    return updated as { session_id: SessionID; sdk_session_id?: string };
  }

  /** Upsert a session record (create if absent) */
  async ensureSession(sessionId: SessionID, toolType: string): Promise<StoredSession> {
    const key = STORAGE_KEYS.session(sessionId);
    const existing = readJson<StoredSession | null>(key, null);
    if (existing) return existing;

    const session: StoredSession = {
      session_id: sessionId,
      tool_type: toolType,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    writeJson(key, session);
    return session;
  }
}

// ============================================================================
// Factory
// ============================================================================

export interface FreelyStorageAdapter {
  tasksService: LocalStorageTasksService;
  sessionsService: LocalStorageSessionsService;
  sessionsRepository: LocalStorageSessionsRepository;
}

/** Create a fully wired localStorage storage adapter for Freely agents. */
export function createStorageAdapter(): FreelyStorageAdapter {
  return {
    tasksService: new LocalStorageTasksService(),
    sessionsService: new LocalStorageSessionsService(),
    sessionsRepository: new LocalStorageSessionsRepository(),
  };
}

// ============================================================================
// API Key Helpers (Freely-specific)
// ============================================================================

/** Provider variable storage key prefix (mirrors Freely's curl_ prefix convention) */
const PROVIDER_VAR_PREFIX = 'freely_provider_var_';

/** Read an API key / env variable stored in localStorage under Freely's provider variables */
export function getProviderVariable(name: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    // Check direct key first
    const direct = localStorage.getItem(`${PROVIDER_VAR_PREFIX}${name}`);
    if (direct) return direct;

    // Fall back to scanning all custom AI providers for matching variable
    const providersRaw = localStorage.getItem('curl_custom_ai_providers');
    if (!providersRaw) return null;
    const providers: Array<{ variables?: Record<string, string> }> = JSON.parse(providersRaw);

    for (const p of providers) {
      if (p.variables?.[name]) return p.variables[name];
    }

    return null;
  } catch {
    return null;
  }
}

/** Persist a provider variable (API key) to localStorage */
export function setProviderVariable(name: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`${PROVIDER_VAR_PREFIX}${name}`, value);
  } catch (err) {
    console.error(`[FreelyStorage] Failed to set provider variable "${name}":`, err);
  }
}
