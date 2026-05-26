export class MonobankError extends Error {
  constructor(
    public readonly category: 'auth' | 'rate_limit' | 'validation' | 'not_found' | 'server',
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'MonobankError';
  }
}

export class RateLimitError extends MonobankError {
  constructor(retryAfterSeconds: number) {
    super(
      'rate_limit',
      `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`,
      retryAfterSeconds,
    );
    this.name = 'RateLimitError';
  }
}

export class AuthError extends MonobankError {
  constructor(message = 'Invalid or missing token. Get your token at https://api.monobank.ua/') {
    super('auth', message, undefined, 401);
    this.name = 'AuthError';
  }
}
