import type { FieldError } from './types';

// VITE_API_BASE_URL 은 서버 주소(origin)만. 비우면 같은 출처의 /api/v1 → 개발 시 vite 프록시가 localhost:8000 으로 넘긴다.
const BASE = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1`;
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

/** 응답 code 로 분기한다. message 는 사용자에게 보여 주는 용도로만 쓴다. */
export class ApiError extends Error {
  constructor(
    public status: number, // 0 = 네트워크 오류
    public code: string,
    message: string,
    public fieldErrors: FieldError[] = [],
    public data: unknown = null, // 결과 조회 실패(FAILED) 등 일부 오류는 data 에 상태를 담아 준다
    public retryAfter: number | null = null, // 429 Retry-After (초)
  ) {
    super(message);
  }
}

export const NETWORK_ERROR = 'NETWORK_ERROR';

interface Envelope<T> {
  code: string;
  message: string;
  data: T | null;
}

const isEnvelope = (v: unknown): v is Envelope<unknown> =>
  typeof v === 'object' && v !== null && 'code' in v && 'message' in v && 'data' in v;

/** 문제가 생겼을 때 사용자에게 보여 줄 문구. 서버 message 가 있으면 그것을 쓴다. */
export const errorMessage = (e: unknown, fallback: string) => (e instanceof Error && e.message) || fallback;

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const headers: HeadersInit = isForm
    ? { Accept: 'application/json', ...init.headers }
    : { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers };

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, NETWORK_ERROR, '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  }

  const body: unknown = await res.json().catch(() => null);

  if (!isEnvelope(body)) {
    throw new ApiError(
      res.status,
      res.ok ? 'INVALID_RESPONSE' : 'UNKNOWN_ERROR',
      `서버 응답을 읽지 못했어요 (${res.status}). 잠시 뒤 다시 시도해 주세요.`,
    );
  }

  if (!res.ok) {
    const data = body.data as { field_errors?: FieldError[] } | null;
    const retry = Number(res.headers.get('Retry-After'));
    throw new ApiError(
      res.status,
      body.code,
      body.message,
      data?.field_errors ?? [],
      body.data,
      Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }

  return body.data as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
