import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreelyCodexTool } from '../codex/freely-codex-tool.js';
import {
  LocalStorageTasksService,
  LocalStorageSessionsRepository,
  setProviderVariable,
} from '../storage-adapter.js';
import { generateId, toSessionID, toTaskID } from '../types.js';
import type { StreamingCallbacks } from '../types.js';

function makeTool() {
  return new FreelyCodexTool(
    new LocalStorageTasksService(),
    new LocalStorageSessionsRepository()
  );
}

function makeCallbacks(): StreamingCallbacks & {
  onStreamStart: ReturnType<typeof vi.fn>;
  onStreamChunk: ReturnType<typeof vi.fn>;
  onStreamEnd: ReturnType<typeof vi.fn>;
  onStreamError: ReturnType<typeof vi.fn>;
} {
  return {
    onStreamStart: vi.fn().mockResolvedValue(undefined),
    onStreamChunk: vi.fn().mockResolvedValue(undefined),
    onStreamEnd: vi.fn().mockResolvedValue(undefined),
    onStreamError: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// Properties & capabilities
// ============================================================================

describe('FreelyCodexTool — properties', () => {
  it('has correct toolType', () => {
    expect(makeTool().toolType).toBe('codex');
  });

  it('has correct name', () => {
    expect(makeTool().name).toBe('OpenAI Codex');
  });
});

describe('FreelyCodexTool.getCapabilities', () => {
  it('reports streaming as supported', () => {
    expect(makeTool().getCapabilities().supportsStreaming).toBe(true);
  });

  it('reports liveExecution as supported', () => {
    expect(makeTool().getCapabilities().supportsLiveExecution).toBe(true);
  });

  it('reports sessionImport as not supported', () => {
    expect(makeTool().getCapabilities().supportsSessionImport).toBe(false);
  });

  it('reports sessionCreate as not supported', () => {
    expect(makeTool().getCapabilities().supportsSessionCreate).toBe(false);
  });
});

describe('FreelyCodexTool.checkInstalled', () => {
  beforeEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('returns false in non-Tauri context', async () => {
    expect(await makeTool().checkInstalled()).toBe(false);
  });

  it('returns true when Tauri reports codex as installed', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue({ installed: true }),
    };
    expect(await makeTool().checkInstalled()).toBe(true);
  });

  it('returns false when Tauri invoke throws', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockRejectedValue(new Error('not found')),
    };
    expect(await makeTool().checkInstalled()).toBe(false);
  });
});

describe('FreelyCodexTool.normalizedSdkResponse', () => {
  it('throws deprecated error', () => {
    expect(() => makeTool().normalizedSdkResponse({})).toThrow('deprecated');
  });
});

// ============================================================================
// executePromptWithStreaming — missing API key
// ============================================================================

describe('FreelyCodexTool.executePromptWithStreaming — missing API key', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('returns error result when OPENAI_API_KEY is not set', async () => {
    const result = await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello'
    );
    expect(result.error).toContain('OPENAI_API_KEY not found');
    expect(result.toolType).toBe('codex');
    expect(result.assistantMessageIds).toEqual([]);
  });

  it('does NOT invoke streaming callbacks when API key is missing', async () => {
    const cbs = makeCallbacks();
    await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello',
      undefined,
      undefined,
      cbs
    );
    expect(cbs.onStreamStart).not.toHaveBeenCalled();
    expect(cbs.onStreamChunk).not.toHaveBeenCalled();
  });
});

// ============================================================================
// executePromptWithStreaming — non-Tauri context (with API key)
// ============================================================================

describe('FreelyCodexTool.executePromptWithStreaming — non-Tauri context', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).__TAURI_INTERNALS__;
    setProviderVariable('OPENAI_API_KEY', 'sk-test-key');
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('returns Tauri placeholder result', async () => {
    const result = await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello'
    );
    expect(result.responseText).toContain('Tauri context');
    expect(result.toolType).toBe('codex');
    expect(result.error).toBeUndefined();
  });

  it('does NOT call streaming callbacks in non-Tauri context', async () => {
    const cbs = makeCallbacks();
    await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello',
      undefined,
      undefined,
      cbs
    );
    expect(cbs.onStreamStart).not.toHaveBeenCalled();
    expect(cbs.onStreamChunk).not.toHaveBeenCalled();
  });
});

// ============================================================================
// executePromptWithStreaming — Tauri context
// ============================================================================

describe('FreelyCodexTool.executePromptWithStreaming — Tauri context', () => {
  beforeEach(() => {
    localStorage.clear();
    setProviderVariable('OPENAI_API_KEY', 'sk-test-key');
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('calls onStreamStart → onStreamChunk (×n) → onStreamEnd in order', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Hello' },
        { type: 'partial', textChunk: ' Codex' },
        { type: 'complete' },
      ]),
    };

    const order: string[] = [];
    const chunks: string[] = [];
    const cbs: StreamingCallbacks = {
      onStreamStart: vi.fn().mockImplementation(async () => order.push('start')),
      onStreamChunk: vi.fn().mockImplementation(async (_id, chunk) => {
        order.push('chunk');
        chunks.push(chunk);
      }),
      onStreamEnd: vi.fn().mockImplementation(async () => order.push('end')),
      onStreamError: vi.fn().mockResolvedValue(undefined),
    };

    await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello',
      undefined,
      undefined,
      cbs
    );

    expect(order).toEqual(['start', 'chunk', 'chunk', 'end']);
    expect(chunks).toEqual(['Hello', ' Codex']);
    expect(cbs.onStreamError).not.toHaveBeenCalled();
  });

  it('captures threadId and persists as sdk_session_id', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Hi', threadId: 'thread-abc-123' },
        { type: 'complete' },
      ]),
    };

    const sessionId = toSessionID(generateId());
    await makeTool().executePromptWithStreaming(sessionId, 'Hello');

    const sessKey = `freely_agents_session_${sessionId}`;
    const session = JSON.parse(localStorage.getItem(sessKey)!);
    expect(session.sdk_session_id).toBe('thread-abc-123');
  });

  it('only captures threadId from the first event that provides it', async () => {
    const mockInvoke = vi.fn().mockResolvedValue([
      { type: 'partial', textChunk: 'A', threadId: 'first-thread' },
      { type: 'partial', textChunk: 'B', threadId: 'second-thread' },
    ]);
    (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

    const sessionId = toSessionID(generateId());
    await makeTool().executePromptWithStreaming(sessionId, 'Hello');

    const sessKey = `freely_agents_session_${sessionId}`;
    const session = JSON.parse(localStorage.getItem(sessKey)!);
    expect(session.sdk_session_id).toBe('first-thread');
  });

  it('calls onStreamError and sets wasStopped on "stopped" event', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'partial' },
        { type: 'stopped' },
      ]),
    };

    const cbs = makeCallbacks();
    const result = await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello',
      undefined,
      undefined,
      cbs
    );

    expect(result.wasStopped).toBe(true);
    expect(cbs.onStreamError).toHaveBeenCalledOnce();
    expect(cbs.onStreamEnd).not.toHaveBeenCalled();
  });

  it('passes API key in the Tauri invoke payload', async () => {
    const mockInvoke = vi.fn().mockResolvedValue([]);
    (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

    await makeTool().executePromptWithStreaming(toSessionID(generateId()), 'Hello');

    expect(mockInvoke).toHaveBeenCalledWith(
      'run_codex',
      expect.objectContaining({
        payload: expect.objectContaining({ apiKey: 'sk-test-key' }),
      })
    );
  });

  it('updates task model when taskId and resolvedModel are provided', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Hi', resolvedModel: 'gpt-4o' },
        { type: 'complete' },
      ]),
    };

    const sessionId = toSessionID(generateId());
    const taskId = toTaskID(generateId());

    // Pre-create the task so patch can find it
    const tasksService = new LocalStorageTasksService();
    await tasksService.ensureTask(taskId, sessionId);

    const result = await makeTool().executePromptWithStreaming(sessionId, 'Hello', taskId);
    expect(result.model).toBe('gpt-4o');

    const task = await tasksService.get(taskId);
    expect(task.model).toBe('gpt-4o');
  });

  it('returns error in result when Tauri invoke rejects', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockRejectedValue(new Error('Codex invoke failed')),
    };

    const result = await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello'
    );

    expect(result.error).toBe('Codex invoke failed');
    expect(result.assistantMessageIds).toEqual([]);
  });
});
