import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../../src/client/base.js';
import { AuthError, MonobankError, RateLimitError } from '../../src/errors/index.js';

function mockFetch(response: { ok?: boolean; status?: number; headers?: Record<string, string>; body?: string }) {
  const fn = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    headers: new Headers(response.headers ?? {}),
    text: vi.fn().mockResolvedValue(response.body ?? ''),
  } as unknown as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('apiFetch', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on success', async () => {
    mockFetch({ ok: true, body: '{"name":"test"}' });
    const result = await apiFetch<{ name: string }>('/test');
    expect(result).toEqual({ name: 'test' });
  });

  it('sends correct headers and method', async () => {
    const fetchFn = mockFetch({ ok: true, body: '{}' });
    await apiFetch('/test', {
      method: 'POST',
      headers: { 'X-Token': 'abc' },
      body: { key: 'value' },
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.monobank.ua/test',
      expect.objectContaining({
        method: 'POST',
        body: '{"key":"value"}',
        headers: expect.objectContaining({
          'X-Token': 'abc',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('handles empty response body', async () => {
    mockFetch({ ok: true, body: '' });
    const result = await apiFetch<void>('/test');
    expect(result).toBeUndefined();
  });

  it('throws AuthError on 401', async () => {
    mockFetch({ ok: false, status: 401 });
    await expect(apiFetch('/test')).rejects.toThrow(AuthError);
  });

  it('throws AuthError on 403', async () => {
    mockFetch({ ok: false, status: 403 });
    await expect(apiFetch('/test')).rejects.toThrow(AuthError);
    await expect(apiFetch('/test')).rejects.toThrow('Access denied');
  });

  it('throws RateLimitError on 429 with Retry-After', async () => {
    mockFetch({
      ok: false,
      status: 429,
      headers: { 'Retry-After': '45' } as unknown as Headers,
    });
    try {
      await apiFetch('/test');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfterSeconds).toBe(45);
    }
  });

  it('throws MonobankError on 500 with error body', async () => {
    mockFetch({ ok: false, status: 500, body: 'Internal Server Error' });
    try {
      await apiFetch('/test');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MonobankError);
      expect((err as MonobankError).statusCode).toBe(500);
      expect((err as MonobankError).message).toBe('Internal Server Error');
    }
  });

  it('defaults to GET method', async () => {
    const fetchFn = mockFetch({ ok: true, body: '{}' });
    await apiFetch('/test');
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
