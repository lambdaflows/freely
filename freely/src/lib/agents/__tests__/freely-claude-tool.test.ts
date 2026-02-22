import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreelyClaudeTool } from '../claude/freely-claude-tool.js';
import {
  LocalStorageTasksService,
  LocalStorageSessionsService,
  LocalStorageSessionsRepository,
} from '../storage-adapter.js';
import { generateId, toSessionID } from '../types.js';
import type { StreamingCallbacks } from '../types.js';

function makeTool() {
  return new FreelyClaudeTool(
    new LocalStorageTasksService(),
    new LocalStorageSessionsService(),
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
// FreelyClaudeTool
// ============================================================================

describe('FreelyClaudeTool — properties', () => {
  it('has correct toolType', () => {
    expect(makeTool().toolType).toBe('claude-code');
  });

  it('has correct name', () => {
    expect(makeTool().name).toBe('Claude Code');
  });
});

describe('FreelyClaudeTool.getCapabilities', () => {
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

  it('reports sessionFork as not supported', () => {
    expect(makeTool().getCapabilities().supportsSessionFork).toBe(false);
  });
});

describe('FreelyClaudeTool.checkInstalled', () => {
  beforeEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('returns false in non-Tauri context', async () => {
    expect(await makeTool().checkInstalled()).toBe(false);
  });

  it('returns true when Tauri reports claude as installed', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue({ installed: true }),
    };
    expect(await makeTool().checkInstalled()).toBe(true);
  });

  it('returns false when Tauri reports not installed', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue({ installed: false }),
    };
    expect(await makeTool().checkInstalled()).toBe(false);
  });

  it('returns false when Tauri invoke throws', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockRejectedValue(new Error('command not found')),
    };
    expect(await makeTool().checkInstalled()).toBe(false);
  });
});

describe('FreelyClaudeTool.importSession', () => {
  it('throws not yet implemented error', async () => {
    await expect(makeTool().importSession('session-id')).rejects.toThrow('not yet implemented');
  });
});

describe('FreelyClaudeTool.normalizedSdkResponse', () => {
  it('throws deprecated error', () => {
    expect(() => makeTool().normalizedSdkResponse({})).toThrow('deprecated');
  });
});

// ============================================================================
// executePromptWithStreaming — non-Tauri context
// ============================================================================

describe('FreelyClaudeTool.executePromptWithStreaming — non-Tauri context', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('returns a placeholder result with no assistant messages', async () => {
    const tool = makeTool();
    const result = await tool.executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello'
    );
    expect(result.toolType).toBe('claude-code');
    expect(result.responseText).toContain('Tauri context');
    expect(result.assistantMessageIds).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('does NOT invoke streaming callbacks', async () => {
    const tool = makeTool();
    const cbs = makeCallbacks();
    await tool.executePromptWithStreaming(
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
    const tool = makeTool();
    const sessionId = toSessionID(generateId());
    await tool.executePromptWithStreaming(sessionId, 'Hello');

    const sessKey = `freely_agents_session_${sessionId}`;
    const session = JSON.parse(localStorage.getItem(sessKey)!);
    expect(session).not.toBeNull();
    expect(session.tool_type).toBe('claude-code');
  });
});

// ============================================================================
// executePromptWithStreaming — Tauri context (mocked via window.__TAURI_INTERNALS__)
// ============================================================================

describe('FreelyClaudeTool.executePromptWithStreaming — Tauri context', () => {
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
        { type: 'partial', textChunk: 'chunk1' },
        { type: 'partial', textChunk: 'chunk2' },
        { type: 'complete' },
      ]),
    };

    const tool = makeTool();
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

    await tool.executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello',
      undefined,
      undefined,
      cbs
    );

    expect(order).toEqual(['start', 'chunk', 'chunk', 'end']);
    expect(chunks).toEqual(['chunk1', 'chunk2']);
    expect(cbs.onStreamError).not.toHaveBeenCalled();
  });

  it('accumulates chunks into responseText', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Hello' },
        { type: 'partial', textChunk: ' world' },
        { type: 'complete' },
      ]),
    };

    const tool = makeTool();
    const result = await tool.executePromptWithStreaming(
      toSessionID(generateId()),
      'Prompt'
    );

    expect(result.responseText).toBe('Hello world');
  });

  it('captures resolvedModel from events', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Hi', resolvedModel: 'claude-opus-4' },
        { type: 'complete' },
      ]),
    };

    const tool = makeTool();
    const result = await tool.executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello'
    );

    expect(result.model).toBe('claude-opus-4');
  });

  it('updates sessionsRepo with agentSessionId', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'Hi', agentSessionId: 'agent-sess-abc' },
        { type: 'complete' },
      ]),
    };

    const tool = makeTool();
    const sessionId = toSessionID(generateId());
    await tool.executePromptWithStreaming(sessionId, 'Hello');

    const sessKey = `freely_agents_session_${sessionId}`;
    const session = JSON.parse(localStorage.getItem(sessKey)!);
    expect(session.sdk_session_id).toBe('agent-sess-abc');
  });

  it('calls onStreamError and sets wasStopped when type is "stopped"', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue([
        { type: 'partial', textChunk: 'partial text' },
        { type: 'stopped' },
      ]),
    };

    const tool = makeTool();
    const cbs = makeCallbacks();
    const result = await tool.executePromptWithStreaming(
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

  it('returns error in result when Tauri invoke rejects', async () => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockRejectedValue(new Error('Invoke failed')),
    };

    const tool = makeTool();
    const result = await tool.executePromptWithStreaming(
      toSessionID(generateId()),
      'Hello'
    );

    expect(result.error).toBe('Invoke failed');
    expect(result.assistantMessageIds).toEqual([]);
  });
});

// ============================================================================
// executePrompt (non-streaming wrapper)
// ============================================================================

describe('FreelyClaudeTool.executePrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('delegates to executePromptWithStreaming', async () => {
    const tool = makeTool();
    const sessionId = toSessionID(generateId());
    // In non-Tauri context, returns placeholder
    const result = await tool.executePrompt(sessionId, 'Hello');
    expect(result.toolType).toBe('claude-code');
    expect(result.responseText).toContain('Tauri context');
  });
});
