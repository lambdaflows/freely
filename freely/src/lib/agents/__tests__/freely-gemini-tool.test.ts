import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreelyGeminiTool } from '../gemini/freely-gemini-tool.js';
import {
  LocalStorageTasksService,
  LocalStorageSessionsRepository,
  setProviderVariable,
} from '../storage-adapter.js';
import { generateId, toSessionID, toTaskID } from '../types.js';
import type { StreamingCallbacks } from '../types.js';

function makeTool() {
  return new FreelyGeminiTool(
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

describe('FreelyGeminiTool — properties', () => {
  it('has correct toolType', () => {
    expect(makeTool().toolType).toBe('gemini');
  });

  it('has correct name', () => {
    expect(makeTool().name).toBe('Google Gemini');
  });
});

describe('FreelyGeminiTool.getCapabilities', () => {
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

describe('FreelyGeminiTool.checkInstalled', () => {
  beforeEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('returns false in non-Tauri context', async () => {
    expect(await makeTool().checkInstalled()).toBe(false);
  });

  it('returns true when Tauri reports gemini as installed', async () => {
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

describe('FreelyGeminiTool.normalizedSdkResponse', () => {
  it('throws deprecated error', () => {
    expect(() => makeTool().normalizedSdkResponse({})).toThrow('deprecated');
  });
});

// ============================================================================
// executePromptWithStreaming — non-Tauri context
// ============================================================================

describe('FreelyGeminiTool.executePromptWithStreaming — non-Tauri context', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).__TAURI_INTERNALS__;
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
    expect(result.toolType).toBe('gemini');
    expect(result.assistantMessageIds).toEqual([]);
  });

  it('does NOT return an error (Gemini has OAuth fallback — no API key required)', async () => {
    const result = await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello'
    );
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
    expect(cbs.onStreamEnd).not.toHaveBeenCalled();
    expect(cbs.onStreamError).not.toHaveBeenCalled();
  });

  it('creates session record in sessionsRepo', async () => {
    const sessionId = toSessionID(generateId());
    await makeTool().executePromptWithStreaming(sessionId, 'Hello');

    const sessKey = `freely_agents_session_${sessionId}`;
    const session = JSON.parse(localStorage.getItem(sessKey)!);
    expect(session.tool_type).toBe('gemini');
  });
});

// ============================================================================
// executePromptWithStreaming — Tauri context
// ============================================================================

describe('FreelyGeminiTool.executePromptWithStreaming — Tauri context', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('calls onStreamStart → onStreamChunk (×n) → onStreamEnd in order', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Hello' },
        { type: 'partial', textChunk: ' Gemini' },
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
    expect(chunks).toEqual(['Hello', ' Gemini']);
    expect(cbs.onStreamError).not.toHaveBeenCalled();
  });

  it('accumulates chunks into responseText', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Gemini' },
        { type: 'partial', textChunk: ' rocks' },
        { type: 'complete' },
      ]),
    };

    const result = await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Prompt'
    );
    expect(result.responseText).toBe('Gemini rocks');
  });

  it('captures resolvedModel from events', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Hi', resolvedModel: 'gemini-2.5-pro' },
        { type: 'complete' },
      ]),
    };

    const result = await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello'
    );
    expect(result.model).toBe('gemini-2.5-pro');
  });

  it('passes API key in payload when GOOGLE_API_KEY is set', async () => {
    setProviderVariable('GOOGLE_API_KEY', 'gapi-test-key');
    const mockInvoke = vi.fn().mockResolvedValue([]);
    (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

    await makeTool().executePromptWithStreaming(toSessionID(generateId()), 'Hello');

    expect(mockInvoke).toHaveBeenCalledWith(
      'run_gemini',
      expect.objectContaining({
        payload: expect.objectContaining({ apiKey: 'gapi-test-key' }),
      })
    );
  });

  it('passes null apiKey when no GOOGLE_API_KEY is set (OAuth path)', async () => {
    const mockInvoke = vi.fn().mockResolvedValue([]);
    (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

    await makeTool().executePromptWithStreaming(toSessionID(generateId()), 'Hello');

    expect(mockInvoke).toHaveBeenCalledWith(
      'run_gemini',
      expect.objectContaining({
        payload: expect.objectContaining({ apiKey: null }),
      })
    );
  });

  it('updates task model when taskId and resolvedModel are both available', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Hi', resolvedModel: 'gemini-flash' },
        { type: 'complete' },
      ]),
    };

    const sessionId = toSessionID(generateId());
    const taskId = toTaskID(generateId());
    const tasksService = new LocalStorageTasksService();
    await tasksService.ensureTask(taskId, sessionId);

    const result = await makeTool().executePromptWithStreaming(sessionId, 'Hello', taskId);
    expect(result.model).toBe('gemini-flash');

    const task = await tasksService.get(taskId);
    expect(task.model).toBe('gemini-flash');
  });

  it('returns error in result when Tauri invoke rejects', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockRejectedValue(new Error('Gemini invoke failed')),
    };

    const result = await makeTool().executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello'
    );

    expect(result.error).toBe('Gemini invoke failed');
    expect(result.assistantMessageIds).toEqual([]);
  });
});

// ============================================================================
// executePrompt (non-streaming wrapper)
// ============================================================================

describe('FreelyGeminiTool.executePrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('delegates to executePromptWithStreaming', async () => {
    const result = await makeTool().executePrompt(toSessionID(generateId()), 'Hello');
    expect(result.toolType).toBe('gemini');
    expect(result.responseText).toContain('Tauri context');
  });
});
