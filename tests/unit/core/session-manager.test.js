import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../../../src/core/session-manager.js';

describe('SessionManager', () => {
  let manager;

  beforeEach(() => {
    manager = new SessionManager({
      sessionTtlMs: 5000,      // Short TTL for tests
      maxHistoryMessages: 10,
      cleanupIntervalMs: 99999, // Don't run cleanup during tests
    });
  });

  // ──────────────────────────────────────────────────────────────
  // Session creation
  // ──────────────────────────────────────────────────────────────

  it('creates a new session when no sessionId is provided', () => {
    const session = manager.getOrCreate(null, 'user-1');

    expect(session.id).toBeTruthy();
    expect(session.userId).toBe('user-1');
    expect(session.conversationHistory).toEqual([]);
    expect(session.gatheredData).toEqual({});
    expect(session.metadata.tokensUsed).toBe(0);
  });

  it('creates a new session when sessionId is not found', () => {
    const session = manager.getOrCreate('non-existent-id', 'user-1');

    expect(session.id).not.toBe('non-existent-id');
  });

  it('returns the same session for an existing sessionId', () => {
    const first = manager.getOrCreate(null, 'user-1');
    const second = manager.getOrCreate(first.id, 'user-1');

    expect(second.id).toBe(first.id);
  });

  it('creates a new session when the existing one has expired', async () => {
    const shortManager = new SessionManager({ sessionTtlMs: 10, cleanupIntervalMs: 99999 });
    const first = shortManager.getOrCreate(null, 'user-1');
    const oldId = first.id;

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 20));

    const second = shortManager.getOrCreate(oldId, 'user-1');
    expect(second.id).not.toBe(oldId);
    shortManager.dispose();
  });

  // ──────────────────────────────────────────────────────────────
  // Message management
  // ──────────────────────────────────────────────────────────────

  it('adds messages to session history', () => {
    const session = manager.getOrCreate(null);
    manager.addMessage(session.id, { role: 'user', content: 'Hello' });
    manager.addMessage(session.id, { role: 'assistant', content: 'Hi!' });

    const updated = manager.getOrCreate(session.id);
    expect(updated.conversationHistory).toHaveLength(2);
    expect(updated.conversationHistory[0].role).toBe('user');
    expect(updated.conversationHistory[1].role).toBe('assistant');
  });

  it('auto-sets timestamp if not provided', () => {
    const session = manager.getOrCreate(null);
    manager.addMessage(session.id, { role: 'user', content: 'test' });

    const updated = manager.getOrCreate(session.id);
    expect(updated.conversationHistory[0].timestamp).toBeInstanceOf(Date);
  });

  it('prunes history when maxHistoryMessages is exceeded', () => {
    const session = manager.getOrCreate(null);

    for (let i = 0; i < 15; i++) {
      manager.addMessage(session.id, { role: 'user', content: `Message ${i}` });
    }

    const updated = manager.getOrCreate(session.id);
    expect(updated.conversationHistory.length).toBeLessThanOrEqual(10);
  });

  it('preserves system messages during pruning', () => {
    const session = manager.getOrCreate(null);

    // Add a system message first
    manager.addMessage(session.id, { role: 'system', content: 'System instructions' });

    // Fill up history beyond limit
    for (let i = 0; i < 12; i++) {
      manager.addMessage(session.id, { role: 'user', content: `msg ${i}` });
    }

    const updated = manager.getOrCreate(session.id);
    const systemMsgs = updated.conversationHistory.filter((m) => m.role === 'system');
    expect(systemMsgs).toHaveLength(1);
  });

  it('throws when adding a message to a non-existent session', () => {
    expect(() => {
      manager.addMessage('fake-id', { role: 'user', content: 'hello' });
    }).toThrow("Session 'fake-id' not found");
  });

  // ──────────────────────────────────────────────────────────────
  // Gathered data
  // ──────────────────────────────────────────────────────────────

  it('merges data into gatheredData without overwriting existing keys', () => {
    const session = manager.getOrCreate(null);
    manager.updateGatheredData(session.id, { email: 'a@b.com' });
    manager.updateGatheredData(session.id, { orderId: 'ORD-123' });

    const updated = manager.getOrCreate(session.id);
    expect(updated.gatheredData.email).toBe('a@b.com');
    expect(updated.gatheredData.orderId).toBe('ORD-123');
  });

  // ──────────────────────────────────────────────────────────────
  // Metadata tracking
  // ──────────────────────────────────────────────────────────────

  it('accumulates token usage', () => {
    const session = manager.getOrCreate(null);
    manager.recordTokenUsage(session.id, 100);
    manager.recordTokenUsage(session.id, 50);

    const updated = manager.getOrCreate(session.id);
    expect(updated.metadata.tokensUsed).toBe(150);
  });

  it('counts total tool calls', () => {
    const session = manager.getOrCreate(null);
    manager.recordToolCalls(session.id, 2);
    manager.recordToolCalls(session.id, 1);

    const updated = manager.getOrCreate(session.id);
    expect(updated.metadata.toolCallsTotal).toBe(3);
  });

  it('marks session as escalated', () => {
    const session = manager.getOrCreate(null);
    expect(manager.getOrCreate(session.id).metadata.escalated).toBe(false);
    manager.markEscalated(session.id);
    expect(manager.getOrCreate(session.id).metadata.escalated).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────

  it('reports active session count', () => {
    expect(manager.activeSessionCount).toBe(0);
    manager.getOrCreate(null, 'u1');
    manager.getOrCreate(null, 'u2');
    expect(manager.activeSessionCount).toBe(2);
  });

  it('destroys a session', () => {
    const session = manager.getOrCreate(null);
    manager.destroy(session.id);

    // After destroy, getting the same ID creates a new session
    const renewed = manager.getOrCreate(session.id);
    expect(renewed.id).not.toBe(session.id);
    expect(manager.activeSessionCount).toBe(1);
  });

  it('getRecentHistory excludes system messages', () => {
    const session = manager.getOrCreate(null);
    manager.addMessage(session.id, { role: 'system', content: 'Instructions' });
    manager.addMessage(session.id, { role: 'user', content: 'Hello' });
    manager.addMessage(session.id, { role: 'assistant', content: 'Hi!' });

    const history = manager.getRecentHistory(session.id, 10);
    expect(history.every((m) => m.role !== 'system')).toBe(true);
    expect(history).toHaveLength(2);
  });
});
