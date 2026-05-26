import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../src/client/retry.js';
import { AuthError, MonobankError, RateLimitError } from '../../src/errors/index.js';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on server error and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new MonobankError('server', 'fail', undefined, 500))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, 2);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry AuthError', async () => {
    const fn = vi.fn().mockRejectedValue(new AuthError());
    await expect(withRetry(fn, 3)).rejects.toThrow(AuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry validation errors', async () => {
    const fn = vi.fn().mockRejectedValue(new MonobankError('validation', 'bad input'));
    await expect(withRetry(fn, 3)).rejects.toThrow('bad input');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on RateLimitError', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new RateLimitError(1))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, 2);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new MonobankError('server', 'down', undefined, 500));
    await expect(withRetry(fn, 2)).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
