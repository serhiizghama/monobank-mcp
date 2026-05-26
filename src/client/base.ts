import { AuthError, MonobankError, RateLimitError } from '../errors/index.js';

const BASE_URL = 'https://api.monobank.ua';

export async function apiFetch<T>(
  path: string,
  options: {
    headers?: Record<string, string>;
    method?: string;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.ok) {
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }

  if (response.status === 401) throw new AuthError();
  if (response.status === 403) throw new AuthError('Access denied. Token may lack required permissions.');

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10);
    throw new RateLimitError(retryAfter);
  }

  const errorBody = await response.text().catch(() => '');
  const message = errorBody || `HTTP ${response.status}`;
  throw new MonobankError('server', message, undefined, response.status);
}
