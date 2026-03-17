import { randomUUID } from 'crypto';

/**
 * Session Manager — Manages per-user conversation state.
 *
 * Currently uses an in-memory store (Map). For production deployments
 * that require persistence across restarts, a SQLite backend is available
 * via `SqliteSessionManager` (coming in V1).
 *
 * Sessions expire after a configurable idle period.
 */
export class SessionManager {
  /**
   * @param {object} [options={}]
   * @param {number} [options.sessionTtlMs=1800000] - Session idle TTL (default: 30 min)
   * @param {number} [options.maxHistoryMessages=100] - Max messages per session before pruning
   * @param {number} [options.cleanupIntervalMs=60000] - How often to run expired session cleanup
   */
  constructor(options = {}) {
    this.sessionTtlMs = options.sessionTtlMs ?? 30 * 60 * 1000;   // 30 minutes
    this.maxHistoryMessages = options.maxHistoryMessages ?? 100;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 60 * 1000; // 1 minute

    /** @type {Map<string, import('./types.js').Session>} */
    this._store = new Map();

    // Periodically clean up expired sessions to avoid memory leaks
    this._cleanupTimer = setInterval(() => this._cleanup(), this.cleanupIntervalMs);
    // Don't keep process alive solely for cleanup
    if (this._cleanupTimer.unref) this._cleanupTimer.unref();
  }

  /**
   * Create a new session or retrieve an existing, non-expired one.
   *
   * If the sessionId is provided and exists, returns that session (refreshing expiry).
   * If sessionId is null/undefined or not found, creates a brand-new session.
   *
   * @param {string | null} [sessionId] - Existing session ID to resume
   * @param {string} [userId='anonymous'] - User identifier
   * @returns {import('./types.js').Session}
   */
  getOrCreate(sessionId, userId = 'anonymous') {
    if (sessionId && this._store.has(sessionId)) {
      const session = this._store.get(sessionId);

      // Check expiry
      const idleMs = Date.now() - session.lastActivityAt.getTime();
      if (idleMs < this.sessionTtlMs) {
        return session;
      } else {
        // Expired — remove and create a fresh one
        this._store.delete(sessionId);
      }
    }

    // Create new session
    const newSession = {
      id: randomUUID(),
      userId,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      conversationHistory: [],
      gatheredData: {},
      metadata: {
        tokensUsed: 0,
        toolCallsTotal: 0,
        escalated: false,
      },
    };

    this._store.set(newSession.id, newSession);
    return newSession;
  }

  /**
   * Add a message to a session's history.
   *
   * @param {string} sessionId
   * @param {import('./types.js').Message} message
   * @returns {import('./types.js').Session} The updated session
   */
  addMessage(sessionId, message) {
    const session = this._getOrThrow(sessionId);

    // Ensure timestamp
    if (!message.timestamp) message.timestamp = new Date();

    session.conversationHistory.push(message);
    session.lastActivityAt = new Date();

    // Prune if history exceeds the limit
    if (session.conversationHistory.length > this.maxHistoryMessages) {
      // Keep the system message (if any) and trim the oldest non-system messages
      const systemMessages = session.conversationHistory.filter((m) => m.role === 'system');
      const nonSystemMessages = session.conversationHistory.filter((m) => m.role !== 'system');
      const trimmed = nonSystemMessages.slice(-this.maxHistoryMessages + systemMessages.length);
      session.conversationHistory = [...systemMessages, ...trimmed];
    }

    return session;
  }

  /**
   * Update the gathered data for a session.
   * This is the structured data collected during the conversation (email, orderId, etc.).
   *
   * @param {string} sessionId
   * @param {Record<string, any>} newData - Data to merge (not replace) into gatheredData
   * @returns {import('./types.js').Session}
   */
  updateGatheredData(sessionId, newData) {
    const session = this._getOrThrow(sessionId);
    Object.assign(session.gatheredData, newData);
    session.lastActivityAt = new Date();
    return session;
  }

  /**
   * Record token usage after each AI call.
   *
   * @param {string} sessionId
   * @param {number} tokens - Number of tokens used in this turn
   */
  recordTokenUsage(sessionId, tokens) {
    const session = this._getOrThrow(sessionId);
    session.metadata.tokensUsed += tokens;
  }

  /**
   * Increment the tool call counter for the session.
   *
   * @param {string} sessionId
   * @param {number} [count=1]
   */
  recordToolCalls(sessionId, count = 1) {
    const session = this._getOrThrow(sessionId);
    session.metadata.toolCallsTotal += count;
  }

  /**
   * Mark a session as escalated to a human agent.
   *
   * @param {string} sessionId
   */
  markEscalated(sessionId) {
    const session = this._getOrThrow(sessionId);
    session.metadata.escalated = true;
  }

  /**
   * Get the last N messages from a session's history,
   * excluding system messages (which are rebuilt on every turn).
   *
   * @param {string} sessionId
   * @param {number} [maxMessages=50]
   * @returns {import('./types.js').Message[]}
   */
  getRecentHistory(sessionId, maxMessages = 50) {
    const session = this._getOrThrow(sessionId);
    const nonSystem = session.conversationHistory.filter((m) => m.role !== 'system');
    return nonSystem.slice(-maxMessages);
  }

  /**
   * Delete a session explicitly (e.g., user logout).
   *
   * @param {string} sessionId
   */
  destroy(sessionId) {
    this._store.delete(sessionId);
  }

  /**
   * Return a count of currently active sessions (for monitoring).
   *
   * @returns {number}
   */
  get activeSessionCount() {
    return this._store.size;
  }

  /**
   * Cleanly dispose the session manager and stop the cleanup timer.
   */
  dispose() {
    clearInterval(this._cleanupTimer);
    this._store.clear();
  }

  // ──────────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────────

  _getOrThrow(sessionId) {
    const session = this._store.get(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found`);
    return session;
  }

  _cleanup() {
    const now = Date.now();
    for (const [id, session] of this._store) {
      if (now - session.lastActivityAt.getTime() > this.sessionTtlMs) {
        this._store.delete(id);
      }
    }
  }
}
