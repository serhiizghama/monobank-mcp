import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TtlCache } from '../../src/cache/ttl-cache.js';

describe('TtlCache', () => {
  let cache: TtlCache;

  beforeEach(() => {
    cache = new TtlCache();
  });

  it('returns undefined for missing key', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('returns data within TTL', () => {
    cache.set('key', { value: 42 }, 60);
    expect(cache.get<{ value: number }>('key')).toEqual({ value: 42 });
  });

  it('returns undefined after TTL expires', () => {
    vi.useFakeTimers();
    cache.set('key', 'data', 5);

    vi.advanceTimersByTime(4999);
    expect(cache.get('key')).toBe('data');

    vi.advanceTimersByTime(2);
    expect(cache.get('key')).toBeUndefined();

    vi.useRealTimers();
  });

  it('overwrites existing key', () => {
    cache.set('key', 'first', 60);
    cache.set('key', 'second', 60);
    expect(cache.get('key')).toBe('second');
  });

  it('invalidate removes key', () => {
    cache.set('key', 'data', 60);
    cache.invalidate('key');
    expect(cache.get('key')).toBeUndefined();
  });

  it('handles multiple keys independently', () => {
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);
    cache.invalidate('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });
});
