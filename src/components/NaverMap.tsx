import { useEffect, useRef, useState } from 'react';
import type { Hospital } from '../api/types';
import type { Coords } from '../hooks/useGeolocation';

/* NCP Maps Web Dynamic Map JS v3. 지도 타일은 브라우저에서 직접 불러온다 (기술문서 2-1). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NaverNS = any;
declare global {
  interface Window {
    naver?: NaverNS;
  }
}

const CLIENT_ID = import.meta.env.VITE_NCP_MAP_CLIENT_ID;
let loader: Promise<NaverNS> | null = null;

function loadNaverMaps(): Promise<NaverNS> {
  if (window.naver?.maps) return Promise.resolve(window.naver);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`;
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

interface Props {
  center: Coords;
  hospitals: Hospital[];
  selectedId?: string;
  onSelect?: (hpid: string) => void;
}

export default function NaverMap(props: Props) {
  if (!CLIENT_ID) return <FallbackMap {...props} />;
  return <DynamicMap {...props} />;
}

function DynamicMap({ center, hospitals, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<NaverNS>(null);
  const markers = useRef<NaverNS[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadNaverMaps()
      .then((naver) => {
        if (cancelled || !el.current) return;
        const pos = new naver.maps.LatLng(center.lat, center.lng);
        if (!map.current) {
          map.current = new naver.maps.Map(el.current, { center: pos, zoom: 15 });
        } else {
          map.current.setCenter(pos);
        }
        markers.current.forEach((m) => m.setMap(null));
        markers.current = hospitals.map((h) => {
          const selected = h.hpid === selectedId;
          const color = h.is_emergency ? '#c4281c' : selected ? '#172f6e' : '#2346a0';
          const m = new naver.maps.Marker({
            position: new naver.maps.LatLng(h.lat, h.lng),
            map: map.current,
            title: h.name,
            icon: {
              content: `<div style="background:${color};color:#fff;padding:4px 10px;border-radius:999px;font:600 13px/1.4 'IBM Plex Sans KR',sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(23,36,43,.3)">${h.name}</div>`,
              anchor: new naver.maps.Point(12, 12),
            },
            zIndex: selected ? 100 : 1,
          });
          naver.maps.Event.addListener(m, 'click', () => onSelect?.(h.hpid));
          return m;
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng, hospitals, selectedId, onSelect]);

  if (failed) return <FallbackMap center={center} hospitals={hospitals} selectedId={selectedId} onSelect={onSelect} />;
  return <div ref={el} className="map" role="region" aria-label="병원 위치 지도" />;
}

/** Client ID가 없거나 로드 실패 시: 병원 위치에 맞춰 범위를 잡은 약도. 번호는 목록 순서와 같다. */
function FallbackMap({ center, hospitals, selectedId, onSelect }: Props) {
  // 모든 병원이 들어오도록 중심 기준 최대 거리로 범위 계산 (최소 ±0.004 ≈ 400m)
  const span =
    Math.max(
      0.004,
      ...hospitals.map((h) => Math.max(Math.abs(h.lat - center.lat), Math.abs(h.lng - center.lng))),
    ) * 1.2;
  const toXY = (lat: number, lng: number) => ({
    x: 50 + ((lng - center.lng) / span) * 45,
    y: 50 - ((lat - center.lat) / span) * 45,
  });
  return (
    <div className="map map--fallback" role="region" aria-label="병원 위치 약도">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <circle cx="50" cy="50" r="22" className="map__ring" />
        <circle cx="50" cy="50" r="44" className="map__ring" />
      </svg>
      <span className="map__me" style={{ left: '50%', top: '50%' }}>
        내 위치
      </span>
      {hospitals.map((h, i) => {
        const { x, y } = toXY(h.lat, h.lng);
        const selected = h.hpid === selectedId;
        const cls = ['map__pin', h.is_emergency && 'is-er', selected && 'is-selected'].filter(Boolean).join(' ');
        return (
          <button
            key={h.hpid}
            type="button"
            className={cls}
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => onSelect?.(h.hpid)}
            aria-label={`${i + 1}번 ${h.name}`}
            aria-pressed={selected}
          >
            {i + 1}
            {selected && <span className="map__pin-name">{h.name}</span>}
          </button>
        );
      })}
      <p className="map__note">지도 키(VITE_NCP_MAP_CLIENT_ID)를 넣으면 실제 지도가 표시돼요.</p>
    </div>
  );
}
