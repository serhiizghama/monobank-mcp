import { describe, it, expect, vi } from 'vitest';
import { dedup } from '../../src/cache/dedup.js';

describe('dedup', () => {
  it('calls the function once for concurrent identical requests', async () => {
    const fn = vi.fn().mockResolvedValue('result');

    const [a, b, c] = await Promise.all([
      dedup('key', fn),
      dedup('key', fn),
      dedup('key', fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toBe('result');
    expect(b).toBe('result');
    expect(c).toBe('result');
  });

  it('allows new call after previous resolves', async () => {
    let callCount = 0;
    const fn = () => Promise.resolve(++callCount);

    const first = await dedup('key', fn);
    const second = await dedup('key', fn);

    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it('cleans up after rejection', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok');

    await expect(dedup('key', fn)).rejects.toThrow('fail');
    const result = await dedup('key', fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('isolates different keys', async () => {
    const fnA = vi.fn().mockResolvedValue('a');
    const fnB = vi.fn().mockResolvedValue('b');

    const [a, b] = await Promise.all([
      dedup('keyA', fnA),
      dedup('keyB', fnB),
    ]);

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    expect(a).toBe('a');
    expect(b).toBe('b');
  });
});
