export type ProviderErrorCode = 'LIARA_AUTH_FAILED' | 'LIARA_FORBIDDEN' | 'LIARA_NOT_FOUND' | 'LIARA_RATE_LIMITED' | 'LIARA_TIMEOUT' | 'LIARA_UNAVAILABLE' | 'LIARA_MALFORMED_RESPONSE' | 'LIARA_CAPABILITY_UNAVAILABLE';
export class LiaraError extends Error {
  constructor(public code: ProviderErrorCode, public statusCode: number, message: string, public retryAfter?: number) { super(message); this.name = 'LiaraError'; }
}
