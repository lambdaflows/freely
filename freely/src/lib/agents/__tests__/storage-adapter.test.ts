import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalStorageTasksService,
  LocalStorageSessionsService,
  LocalStorageSessionsRepository,
  createStorageAdapter,
  getProviderVariable,
  setProviderVariable,
} from '../storage-adapter.js';
import { generateId, toSessionID, toTaskID } from '../types.js';

// ============================================================================
// LocalStorageTasksService
// ============================================================================

describe('LocalStorageTasksService', () => {
  let service: LocalStorageTasksService;

  beforeEach(() => {
    localStorage.clear();
    service = new LocalStorageTasksService();
  });

  it('throws when getting a non-existent task', async () => {
    await expect(service.get('missing-task')).rejects.toThrow(
      'task "missing-task" not found'
    );
  });

  it('patch creates a new task record', async () => {
    const result = await service.patch('task-1', { status: 'active', session_id: 'sess-1' });
    expect(result.task_id).toBe('task-1');
    expect(result.session_id).toBe('sess-1');
    expect(result.updated_at).toBeTruthy();
  });

  it('patch updates an existing task (merges fields)', async () => {
    await service.patch('task-1', { session_id: 'sess-1' });
    const updated = await service.patch('task-1', { model: 'claude-sonnet' });
    expect(updated.model).toBe('claude-sonnet');
    expect(updated.session_id).toBe('sess-1'); // preserved
  });

  it('patch dispatches freely:task:updated CustomEvent', async () => {
    const handler = vi.fn();
    window.addEventListener('freely:task:updated', handler);
    await service.patch('task-1', {});
    window.removeEventListener('freely:task:updated', handler);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('get returns a previously patched task', async () => {
    await service.patch('task-2', { status: 'completed', session_id: 'sess-2' });
    const task = await service.get('task-2');
    expect(task.status).toBe('completed');
    expect(task.task_id).toBe('task-2');
  });

  it('ensureTask creates a task on first call', async () => {
    const taskId = toTaskID('task-new');
    const sessionId = toSessionID('sess-new');
    const task = await service.ensureTask(taskId, sessionId);
    expect(task.task_id).toBe(taskId);
    expect(task.session_id).toBe(sessionId);
    expect(task.status).toBe('active');
  });

  it('ensureTask returns existing task on subsequent calls', async () => {
    const taskId = toTaskID('task-exist');
    const sessionId = toSessionID('sess-exist');
    const first = await service.ensureTask(taskId, sessionId);
    const second = await service.ensureTask(taskId, sessionId);
    expect(second.created_at).toBe(first.created_at); // unchanged
  });
});

// ============================================================================
// LocalStorageSessionsService
// ============================================================================

describe('LocalStorageSessionsService', () => {
  let service: LocalStorageSessionsService;

  beforeEach(() => {
    localStorage.clear();
    service = new LocalStorageSessionsService();
  });

  it('patch creates a new session record', async () => {
    const result = await service.patch('sess-1', { tool_type: 'claude-code' });
    expect(result.session_id).toBe('sess-1');
    expect(result.tool_type).toBe('claude-code');
    expect(result.updated_at).toBeTruthy();
  });

  it('patch updates and merges an existing session', async () => {
    await service.patch('sess-1', { tool_type: 'claude-code' });
    const updated = await service.patch('sess-1', { sdk_session_id: 'sdk-abc' });
    expect(updated.sdk_session_id).toBe('sdk-abc');
    expect(updated.tool_type).toBe('claude-code'); // preserved
  });

  it('patch dispatches freely:session:updated CustomEvent', async () => {
    const handler = vi.fn();
    window.addEventListener('freely:session:updated', handler);
    await service.patch('sess-1', {});
    window.removeEventListener('freely:session:updated', handler);
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// LocalStorageSessionsRepository
// ============================================================================

describe('LocalStorageSessionsRepository', () => {
  let repo: LocalStorageSessionsRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageSessionsRepository();
  });

  it('findById returns null for unknown session', async () => {
    const result = await repo.findById(toSessionID('nonexistent'));
    expect(result).toBeNull();
  });

  it('ensureSession creates session on first call', async () => {
    const sessionId = toSessionID(generateId());
    const session = await repo.ensureSession(sessionId, 'claude-code');
    expect(session.session_id).toBe(sessionId);
    expect(session.tool_type).toBe('claude-code');
    expect(session.created_at).toBeTruthy();
  });

  it('ensureSession returns existing session on subsequent calls (no override)', async () => {
    const sessionId = toSessionID(generateId());
    const first = await repo.ensureSession(sessionId, 'claude-code');
    const second = await repo.ensureSession(sessionId, 'codex'); // different tool type
    expect(second.tool_type).toBe('claude-code'); // unchanged
    expect(second.created_at).toBe(first.created_at);
  });

  it('findById returns session after ensureSession', async () => {
    const sessionId = toSessionID(generateId());
    await repo.ensureSession(sessionId, 'gemini');
    const found = await repo.findById(sessionId);
    expect(found).not.toBeNull();
    expect(found!.session_id).toBe(sessionId);
  });

  it('update patches fields on existing session', async () => {
    const sessionId = toSessionID(generateId());
    await repo.ensureSession(sessionId, 'claude-code');
    const updated = await repo.update(sessionId, { sdk_session_id: 'sdk-xyz' });
    expect(updated.sdk_session_id).toBe('sdk-xyz');
    expect(updated.session_id).toBe(sessionId);
  });

  it('update creates a session record if absent', async () => {
    const sessionId = toSessionID(generateId());
    const updated = await repo.update(sessionId, { sdk_session_id: 'sdk-new' });
    expect(updated.sdk_session_id).toBe('sdk-new');
  });
});

// ============================================================================
// getProviderVariable / setProviderVariable
// ============================================================================

describe('getProviderVariable / setProviderVariable', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null for unknown variable', () => {
    expect(getProviderVariable('UNKNOWN_KEY')).toBeNull();
  });

  it('set and get round-trip with direct key', () => {
    setProviderVariable('OPENAI_API_KEY', 'sk-test-123');
    expect(getProviderVariable('OPENAI_API_KEY')).toBe('sk-test-123');
  });

  it('falls back to scanning custom providers for variable', () => {
    const providers = [{ variables: { GOOGLE_API_KEY: 'gapi-abc' } }];
    localStorage.setItem('curl_custom_ai_providers', JSON.stringify(providers));
    expect(getProviderVariable('GOOGLE_API_KEY')).toBe('gapi-abc');
  });

  it('direct key takes precedence over provider scan', () => {
    setProviderVariable('OPENAI_API_KEY', 'direct-key');
    const providers = [{ variables: { OPENAI_API_KEY: 'provider-key' } }];
    localStorage.setItem('curl_custom_ai_providers', JSON.stringify(providers));
    expect(getProviderVariable('OPENAI_API_KEY')).toBe('direct-key');
  });

  it('returns null when providers JSON is malformed', () => {
    localStorage.setItem('curl_custom_ai_providers', 'not-json');
    expect(getProviderVariable('ANY_KEY')).toBeNull();
  });
});

// ============================================================================
// createStorageAdapter
// ============================================================================

describe('createStorageAdapter', () => {
  it('returns all service and repository instances', () => {
    const adapter = createStorageAdapter();
    expect(adapter.tasksService).toBeInstanceOf(LocalStorageTasksService);
    expect(adapter.sessionsService).toBeInstanceOf(LocalStorageSessionsService);
    expect(adapter.sessionsRepository).toBeInstanceOf(LocalStorageSessionsRepository);
  });
});
