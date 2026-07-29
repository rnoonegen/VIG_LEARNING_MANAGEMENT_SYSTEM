import axios, { AxiosError, type AxiosInstance } from 'axios';
import type { ApiError } from '@vig/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

const ACCESS_KEY = 'vig.accessToken';
const REFRESH_KEY = 'vig.refreshToken';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string | null) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api: AxiosInstance = axios.create({ baseURL: BASE_URL, timeout: 20_000 });

api.interceptors.request.use((config) => {
  const token = tokens.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * One refresh attempt per expired token, shared across concurrent requests so a
 * page issuing five queries does not fire five refreshes.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokens.refresh;
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
    tokens.set(data.data.accessToken, data.data.refreshToken);
    return data.data.accessToken as string;
  } catch {
    tokens.clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;

    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
      const fresh = await refreshInFlight;

      if (fresh) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${fresh}`;
        return api.request(original);
      }

      // Refresh failed — the session is genuinely over.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);

/** Unwraps the `{ data }` envelope so callers work with the payload directly. */
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get(url, { params });
  return data.data as T;
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.post(url, body);
  return data.data as T;
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.patch(url, body);
  return data.data as T;
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.put(url, body);
  return data.data as T;
}

export async function del<T>(url: string): Promise<T> {
  const { data } = await api.delete(url);
  return data.data as T;
}

/** Turns any thrown error into something safe to show a user. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError<ApiError>(error)) {
    return error.response?.data?.error?.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
