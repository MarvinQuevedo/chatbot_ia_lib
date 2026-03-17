import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../../../src/core/orchestrator.js';
import { SessionManager } from '../../../src/core/session-manager.js';
import { ResponseFormatter } from '../../../src/core/response-formatter.js';

// ── Mock dependencies ─────────────────────────────────────────

const makeBackend = (response) => ({
  chat: vi.fn().mockResolvedValue(response),
  healthCheck: vi.fn().mockResolvedValue(true),
});

const makePromptBuilder = () => ({
  buildMessages: vi.fn().mockReturnValue([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello' },
  ]),
  variables: { botName: 'TestBot', companyName: 'TestCo' },
  _renderTemplate: vi.fn().mockReturnValue('Hello! How can I help?'),
});

const makeToolExecutor = (result = 'Tool result') => ({
  execute: vi.fn().mockResolvedValue(result),
});

// ── Helper ────────────────────────────────────────────────────

function makeOrchestrator(backendResponse, toolResult = 'Tool result') {
  const sessionManager = new SessionManager({ cleanupIntervalMs: 99999 });
  const promptBuilder = makePromptBuilder();
  const toolExecutor = makeToolExecutor(toolResult);
  const responseFormatter = new ResponseFormatter();
  const backend = makeBackend(backendResponse);

  const orchestrator = new Orchestrator(
    { sessionManager, promptBuilder, toolExecutor, responseFormatter, backend },
    { maxToolCallsPerTurn: 3, tools: [] },
  );

  return { orchestrator, sessionManager, promptBuilder, toolExecutor, backend };
}

// ── Tests ─────────────────────────────────────────────────────

describe('Orchestrator', () => {
  describe('chat() — text response', () => {
    it('returns formatted response for a simple text reply', async () => {
      const { orchestrator } = makeOrchestrator({
        content: 'Hello! How can I help you?',
        toolCalls: null,
        finishReason: 'stop',
        usage: { promptTokens: 50, completionTokens: 15 },
      });

      const result = await orchestrator.chat({ message: 'Hello', sessionId: null });

      expect(result.response).toBe('Hello! How can I help you?');
      expect(result.sessionId).toBeTruthy();
      expect(result.metadata.toolCallsThisTurn).toBe(0);
    });

    it('creates a new session when sessionId is null', async () => {
      const { orchestrator, sessionManager } = makeOrchestrator({
        content: 'Hi!',
        toolCalls: null,
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      const result = await orchestrator.chat({ message: 'Hey', sessionId: null });

      expect(sessionManager.activeSessionCount).toBe(1);
      expect(result.sessionId).toBeTruthy();
    });

    it('reuses an existing session when sessionId is provided', async () => {
      const { orchestrator, sessionManager } = makeOrchestrator({
        content: 'Sure!',
        toolCalls: null,
        finishReason: 'stop',
        usage: { promptTokens: 20, completionTokens: 10 },
      });

      const first = await orchestrator.chat({ message: 'First message', sessionId: null });
      const second = await orchestrator.chat({ message: 'Second', sessionId: first.sessionId });

      expect(second.sessionId).toBe(first.sessionId);
      expect(sessionManager.activeSessionCount).toBe(1);
    });
  });

  describe('chat() — tool calls', () => {
    it('executes a tool call and feeds result back to AI', async () => {
      // First call returns tool request, second returns text
      const backend = {
        chat: vi.fn()
          .mockResolvedValueOnce({
            content: null,
            toolCalls: [{ id: 'call_1', name: 'check_order', arguments: { order_id: '123' } }],
            finishReason: 'tool_calls',
            usage: { promptTokens: 100, completionTokens: 20 },
          })
          .mockResolvedValueOnce({
            content: 'Your order is on the way!',
            toolCalls: null,
            finishReason: 'stop',
            usage: { promptTokens: 150, completionTokens: 25 },
          }),
      };

      const sessionManager = new SessionManager({ cleanupIntervalMs: 99999 });
      const orchestrator = new Orchestrator(
        {
          sessionManager,
          promptBuilder: makePromptBuilder(),
          toolExecutor: makeToolExecutor('Order 123: Shipped, arriving tomorrow.'),
          responseFormatter: new ResponseFormatter(),
          backend,
        },
        { maxToolCallsPerTurn: 3, tools: [] },
      );

      const result = await orchestrator.chat({ message: 'Where is my order?', sessionId: null });

      expect(backend.chat).toHaveBeenCalledTimes(2);
      expect(result.response).toBe('Your order is on the way!');
      expect(result.metadata.toolCallsThisTurn).toBe(1);
    });

    it('stops after maxToolCallsPerTurn and returns limit message', async () => {
      // Backend always requests tool calls — should stop at limit
      const backend = {
        chat: vi.fn().mockResolvedValue({
          content: null,
          toolCalls: [
            { id: 'call_a', name: 'tool_a', arguments: {} },
            { id: 'call_b', name: 'tool_b', arguments: {} },
          ],
          finishReason: 'tool_calls',
          usage: { promptTokens: 100, completionTokens: 20 },
        }),
      };

      const sessionManager = new SessionManager({ cleanupIntervalMs: 99999 });
      const orchestrator = new Orchestrator(
        {
          sessionManager,
          promptBuilder: makePromptBuilder(),
          toolExecutor: makeToolExecutor('result'),
          responseFormatter: new ResponseFormatter(),
          backend,
        },
        { maxToolCallsPerTurn: 3, tools: [] },
      );

      const result = await orchestrator.chat({ message: 'Do many things', sessionId: null });

      expect(result.response).toContain('limit');
    });
  });

  describe('backend fallback', () => {
    it('uses fallback backend when primary fails', async () => {
      const primaryBackend = {
        chat: vi.fn().mockRejectedValue(new Error('Primary is down')),
      };
      const fallbackBackend = {
        chat: vi.fn().mockResolvedValue({
          content: 'Fallback response',
          toolCalls: null,
          finishReason: 'stop',
          usage: { promptTokens: 30, completionTokens: 10 },
        }),
      };

      const sessionManager = new SessionManager({ cleanupIntervalMs: 99999 });
      const orchestrator = new Orchestrator(
        {
          sessionManager,
          promptBuilder: makePromptBuilder(),
          toolExecutor: makeToolExecutor(),
          responseFormatter: new ResponseFormatter(),
          backend: primaryBackend,
          fallbackBackend,
        },
        { maxToolCallsPerTurn: 3, tools: [] },
      );

      const result = await orchestrator.chat({ message: 'Hello', sessionId: null });

      expect(fallbackBackend.chat).toHaveBeenCalled();
      expect(result.response).toBe('Fallback response');
    });

    it('throws when both primary and fallback fail', async () => {
      const primaryBackend = { chat: vi.fn().mockRejectedValue(new Error('Primary down')) };
      const fallbackBackend = { chat: vi.fn().mockRejectedValue(new Error('Fallback down')) };

      const sessionManager = new SessionManager({ cleanupIntervalMs: 99999 });
      const orchestrator = new Orchestrator(
        {
          sessionManager,
          promptBuilder: makePromptBuilder(),
          toolExecutor: makeToolExecutor(),
          responseFormatter: new ResponseFormatter(),
          backend: primaryBackend,
          fallbackBackend,
        },
        { maxToolCallsPerTurn: 3, tools: [] },
      );

      await expect(orchestrator.chat({ message: 'Hello', sessionId: null })).rejects.toThrow(
        'Both primary and fallback backends failed',
      );
    });
  });
});
