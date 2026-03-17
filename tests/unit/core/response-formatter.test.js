import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseFormatter } from '../../../src/core/response-formatter.js';

describe('ResponseFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new ResponseFormatter({ maxLength: 500 });
  });

  it('returns clean text unchanged', () => {
    const result = formatter.format('Hello, how can I help you today?');
    expect(result).toBe('Hello, how can I help you today?');
  });

  it('strips <think>...</think> tags', () => {
    const raw = '<think>Internal reasoning here</think>Final response to user.';
    expect(formatter.format(raw)).toBe('Final response to user.');
  });

  it('strips <reasoning>...</reasoning> tags', () => {
    const raw = '<reasoning>Step 1: analyze...\nStep 2: respond</reasoning>Here is your answer.';
    expect(formatter.format(raw)).toBe('Here is your answer.');
  });

  it('handles null input with fallback message', () => {
    const result = formatter.format(null);
    expect(result).toContain("wasn't able");
  });

  it('handles empty string with fallback message', () => {
    expect(formatter.format('')).toContain("wasn't able");
  });

  it('truncates responses exceeding maxLength', () => {
    const longText = 'A'.repeat(600);
    const result = formatter.format(longText);
    expect(result.length).toBeLessThan(600);
    expect(result).toContain('truncated');
  });

  it('applies blocked phrases filter', () => {
    const strictFormatter = new ResponseFormatter({
      blockedPhrases: ['confidential info'],
    });
    const result = strictFormatter.format('Here is the confidential info you asked for.');
    expect(result).not.toContain('confidential info');
    expect(result).toContain('[removed]');
  });

  it('trims leading and trailing whitespace', () => {
    const result = formatter.format('  Hello!  \n\n');
    expect(result).toBe('Hello!');
  });

  it('formatToolError returns user-friendly message for unavailable service', () => {
    const msg = formatter.formatToolError('check_order', 'service unavailable');
    expect(msg).toContain('temporarily unavailable');
  });

  it('formatToolError returns user-friendly message for data errors', () => {
    const msg = formatter.formatToolError('check_order', 'Resource not found');
    expect(msg).toContain('check your information');
  });
});
