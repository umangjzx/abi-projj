/**
 * Typed API client.
 *
 * Responsibilities:
 *   * one place that knows the base URL and the response envelope
 *   * attaches the in-memory access token to every request
 *   * transparently refreshes an expired access token once, then replays the
 *     original request -- so a 15-minute token expiry is invisible to the UI
 *   * turns the server's error envelope into a typed ApiError the UI can render
 */

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: ApiMeta;
  error?: { code: string; message: string; details?: unknown };
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldError[];

  constructor(status: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = Array.isArray(details) ? (details as FieldError[]) : [];
  }

  /** Message for a specific form field, if the server rejected that field. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors.find((e) => e.field === field)?.message;
  }
}

// ------------------------------------------------------------- token handling ---

/**
 * The access token is held in memory only. Persisting it in localStorage would
 * expose it to any XSS payload; the long-lived refresh token lives in an
 * httpOnly cookie the page's JavaScript cannot read.
 */
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

const readCookie = (name: string): string | null => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

// A single in-flight refresh shared by every concurrent 401, so a page with six
// parallel queries triggers one refresh rather than six.
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const csrf = readCookie('csrfToken');
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
        });
        if (!response.ok) return false;
        const body = (await response.json()) as ApiEnvelope<{ accessToken: string }>;
        accessToken = body.data.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        // Cleared on the next tick so callers awaiting this promise all observe
        // the same result before a new refresh can begin.
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      }
    })();
  }
  return refreshPromise;
}

// ---------------------------------------------------------------- core request ---

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Set internally to stop an infinite refresh loop. */
  _isRetry?: boolean;
  /** Skip the automatic refresh (used by the auth endpoints themselves). */
  skipRefresh?: boolean;
}

const TRANSIENT_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { body, _isRetry, skipRefresh, headers, ...rest } = options;

  const isFormData = body instanceof FormData;
  const csrf = readCookie('csrfToken');
  const method = (rest.method ?? 'GET').toUpperCase();
  const idempotent = method === 'GET' || method === 'HEAD';

  const init: RequestInit = {
    ...rest,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  };

  // Free-tier hosting (Render + Neon) scales to zero when idle; the first
  // request after a nap can fail outright or return a 5xx from the gateway
  // while things spin up. Retry a couple of times with a short backoff so the
  // UI shows a brief pause instead of a hard error. Non-idempotent methods are
  // only retried on a genuine network failure (the request never landed), not
  // on a 5xx (which might have been processed).
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1200 * attempt);
    try {
      response = await fetch(`${BASE_URL}${path}`, init);
    } catch {
      response = undefined;
      continue;
    }
    if (attempt < 2 && idempotent && TRANSIENT_STATUS.has(response.status)) continue;
    break;
  }

  if (!response) {
    throw new ApiError(0, 'Could not reach the server. It may be waking up — try again in a moment.', 'NETWORK');
  }

  // 204 has no body to parse.
  if (response.status === 204) return { success: true, data: undefined as T };

  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(response.status, `Unexpected response from the server (${response.status})`);
  }

  if (response.ok) return payload;

  const error = payload.error ?? { code: 'ERROR', message: 'Request failed' };

  // An expired access token is recoverable: refresh once and replay.
  if (response.status === 401 && !_isRetry && !skipRefresh && error.code !== 'EMAIL_NOT_VERIFIED') {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, { ...options, _isRetry: true });

    accessToken = null;
    onUnauthorized?.();
  }

  throw new ApiError(response.status, error.message, error.code, error.details);
}

/** Unwraps the envelope for the common case where only `data` is needed. */
async function unwrap<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await request<T>(path, options)).data;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => unwrap<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => unwrap<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => unwrap<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => unwrap<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) => unwrap<T>(path, { ...options, method: 'DELETE', body }),

  /** Same as `get` but keeps `meta` -- needed for paginated lists. */
  list: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),

  refresh: refreshSession,

  /**
   * Triggers a browser download for report/invoice endpoints. Reads the
   * filename from Content-Disposition so exports keep the server's naming.
   */
  async download(path: string, fallbackName: string): Promise<void> {
    const csrf = readCookie('csrfToken');
    let response = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
    });

    if (response.status === 401 && (await refreshSession())) {
      response = await fetch(`${BASE_URL}${path}`, {
        credentials: 'include',
        headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      });
    }

    if (!response.ok) {
      let message = `Download failed (${response.status})`;
      try {
        const body = (await response.json()) as ApiEnvelope<unknown>;
        message = body.error?.message ?? message;
      } catch {
        /* a non-JSON error body is fine to ignore here */
      }
      throw new ApiError(response.status, message);
    }

    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const filename = match?.[1] ?? fallbackName;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke on the next tick; revoking synchronously can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
