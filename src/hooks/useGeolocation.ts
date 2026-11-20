import { useCallback, useState } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

/** 서울시청 — 위치 권한이 없을 때의 기본값 */
export const DEFAULT_COORDS: Coords = { lat: 37.5665, lng: 126.978 };

type Status = 'idle' | 'pending' | 'granted' | 'denied';

export function useGeolocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  const request = useCallback(
    () =>
      new Promise<Coords | null>((resolve) => {
        if (!('geolocation' in navigator)) {
          setStatus('denied');
          return resolve(null);
        }
        setStatus('pending');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCoords(c);
            setStatus('granted');
            resolve(c);
          },
          () => {
            setStatus('denied');
            resolve(null);
          },
          { timeout: 8000, maximumAge: 60_000 },
        );
      }),
    [],
  );

  return { coords, status, request };
}
