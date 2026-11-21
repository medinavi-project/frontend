/* NCP Maps Web Dynamic Map JS v3 로더와 주소 검색(geocoder 서브모듈).
 * 모두 브라우저에서 Client ID만으로 동작한다. Client Secret은 프론트에 두지 않는다. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NaverNS = any;
declare global {
  interface Window {
    naver?: NaverNS;
    navermap_authFailure?: () => void;
  }
}

const CLIENT_ID = import.meta.env.VITE_NCP_MAP_CLIENT_ID;
export const hasMapKey = Boolean(CLIENT_ID);

/* 키가 틀리거나 등록되지 않은 주소에서 열면 스크립트는 로드되지만 인증은 실패한다.
 * 이때 네이버가 window.navermap_authFailure 를 부른다. */
let authFailed = false;
const authListeners = new Set<() => void>();

/** 인증 실패를 알려 받는다. 이미 실패했다면 바로 호출한다. 반환값은 구독 해제 함수 */
export function onMapAuthFailure(fn: () => void): () => void {
  if (authFailed) fn();
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

let loader: Promise<NaverNS> | null = null;

export function loadNaverMaps(): Promise<NaverNS> {
  if (authFailed) return Promise.reject(new Error('지도 인증에 실패했습니다'));
  if (window.naver?.maps) return Promise.resolve(window.naver);
  if (loader) return loader;
  window.navermap_authFailure = () => {
    authFailed = true;
    console.error('[지도] 인증 실패: Client ID와 NCP 콘솔의 Web 서비스 URL 등록을 확인하세요.');
    authListeners.forEach((fn) => fn());
  };
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(CLIENT_ID ?? '')}&submodules=geocoder`;
    s.async = true;
    s.onload = () => resolve(window.naver);
    s.onerror = () => {
      loader = null;
      reject(new Error('지도를 불러오지 못했습니다'));
    };
    document.head.appendChild(s);
  });
  return loader;
}

export interface AddressResult {
  label: string;
  lat: number;
  lng: number;
}

/** 주소 → 좌표. 결과가 없으면 빈 배열(정상), 서비스 오류면 throw */
export async function searchAddress(query: string): Promise<AddressResult[]> {
  const naver = await loadNaverMaps();
  const service = naver.maps.Service;
  if (!service) throw new Error('주소 검색을 사용할 수 없습니다');
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service.geocode({ query }, (status: any, response: any) => {
      if (status !== service.Status.OK) return reject(new Error('주소 검색에 실패했습니다'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = response?.v2?.addresses ?? [];
      resolve(
        list
          .slice(0, 5)
          .map((a) => ({ label: a.roadAddress || a.jibunAddress || '', lat: Number(a.y), lng: Number(a.x) }))
          .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng)),
      );
    });
  });
}

/** 좌표 → "서울특별시 중구 태평로1가" 같은 동네 이름. 실패하면 null (안내 문구가 없어도 되는 정보) */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const naver = await loadNaverMaps();
    const service = naver.maps.Service;
    if (!service) return null;
    return await new Promise((resolve) => {
      service.reverseGeocode(
        { coords: new naver.maps.LatLng(lat, lng), orders: 'admcode' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (status: any, response: any) => {
          if (status !== service.Status.OK) return resolve(null);
          const region = response?.v2?.results?.[0]?.region;
          const names = [1, 2, 3].map((i) => region?.[`area${i}`]?.name).filter(Boolean);
          resolve(names.length ? names.join(' ') : null);
        },
      );
    });
  } catch {
    return null;
  }
}
