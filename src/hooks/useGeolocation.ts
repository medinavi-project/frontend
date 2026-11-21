import { useCallback, useState } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

/** 서울시청 — 위치 권한이 없을 때의 기본값 */
export const DEFAULT_COORDS: Coords = { lat: 37.5665, lng: 126.978 };

type Status = 'idle' | 'pending' | 'granted' | 'denied';
/** denied: 권한 꺼짐 · unavailable: 위치를 알 수 없음 · timeout: 시간 초과 · unsupported: 기기·주소(HTTPS 아님)에서 사용 불가 */
export type GeoError = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export function useGeolocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<GeoError | null>(null);

  const fail = useCallback((e: GeoError) => {
    setError(e);
    setStatus('denied');
  }, []);

  const request = useCallback(
    () =>
      new Promise<Coords | null>((resolve) => {
        if (!('geolocation' in navigator) || !window.isSecureContext) {
          fail('unsupported');
          return resolve(null);
        }
        setStatus('pending');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCoords(c);
            setError(null);
            setStatus('granted');
            resolve(c);
          },
          (err) => {
            fail(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable');
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
        );
      }),
    [fail],
  );

  return { coords, status, error, request };
}
