import { ApiErrorPayload, AuthSessionResponse } from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private onUnauthorizedCallback: (() => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('pd_admin_access_token');
    }
  }

  public setAccessToken(token: string | null) {
    this.accessToken = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('pd_admin_access_token', token);
      } else {
        localStorage.removeItem('pd_admin_access_token');
      }
    }
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public setOnUnauthorized(cb: () => void) {
    this.onUnauthorizedCallback = cb;
  }

  public async fetchRaw(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers = new Headers(options.headers || {});
    if (this.accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    // Always ensure credentials: 'include' for the httpOnly refresh cookie
    const init: RequestInit = {
      ...options,
      headers,
      credentials: 'include',
    };

    let res = await fetch(url, init);

    // If 401 and not an auth route, try to refresh token once
    if (
      res.status === 401 &&
      !endpoint.includes('/admin/auth/login') &&
      !endpoint.includes('/admin/auth/refresh')
    ) {
      const newToken = await this.refreshToken();
      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`);
        res = await fetch(url, { ...init, headers });
      } else {
        if (this.onUnauthorizedCallback) {
          this.onUnauthorizedCallback();
        }
      }
    }

    return res;
  }

  public async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await this.fetchRaw(endpoint, options);

    if (res.status === 204) {
      return {} as T;
    }

    const contentType = res.headers.get('content-type');
    let data: unknown;
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const errorPayload = data as ApiErrorPayload;
      const error = new Error(
        errorPayload?.message || `Request failed with status ${res.status}`
      ) as Error & { payload?: ApiErrorPayload; status: number };
      error.payload = errorPayload;
      error.status = res.status;
      throw error;
    }

    return data as T;
  }

  public async refreshToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          this.setAccessToken(null);
          return null;
        }

        const data: AuthSessionResponse = await res.json();
        this.setAccessToken(data.accessToken);
        return data.accessToken;
      } catch {
        this.setAccessToken(null);
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }
}

export const api = new ApiClient();
export { API_BASE_URL };
