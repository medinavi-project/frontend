import { useEffect, useRef, useState } from 'react';
import type { Hospital } from '../api/types';
import type { Coords } from '../hooks/useGeolocation';
import { hasMapKey, loadNaverMaps, onMapAuthFailure, type NaverNS } from '../utils/naverMaps';
import { formatDistance } from '../utils/hours';
import Icon from './Icon';

/** me: 내 위치 · default: 위치 권한이 없어 쓰는 기본 위치 · custom: 사용자가 주소로 고른 위치 */
export type CenterKind = 'me' | 'default' | 'custom';

const CENTER_LABEL: Record<CenterKind, string> = { me: '내 위치', default: '기본 위치', custom: '선택한 위치' };
/** 병원이 없을 때 검색 반경(km)에 맞춰 보여 줄 확대 단계 */
const ZOOM_BY_RADIUS: Record<number, number> = { 1: 15, 3: 14, 5: 13 };
const MAX_FIT_ZOOM = 16;

interface Props {
  center: Coords;
  centerKind: CenterKind;
  radiusKm: number;
  hospitals: Hospital[];
  selectedId?: string;
  onSelect?: (hospitalId: string) => void;
}

type FailReason = 'auth' | 'load';

const FAIL_NOTE: Record<FailReason | 'nokey', string> = {
  nokey: '지도를 쓸 수 없어 간단한 약도로 보여 드려요.',
  auth: '지도를 불러오지 못해 간단한 약도로 보여 드려요.',
  load: '지도를 불러오지 못해 간단한 약도로 보여 드려요. 인터넷 연결을 확인해 주세요.',
};

/** 지도 위 범례: 핀 색과 점선 원이 무엇인지 */
function Legend({ radiusKm }: { radiusKm?: number }) {
  return (
    <ul className="map__legend" aria-label="지도 표시 안내">
      <li>
        <span className="map__key" aria-hidden="true" />
        진료 중
      </li>
      <li>
        <span className="map__key map__key--closed" aria-hidden="true" />
        진료 시간 아님
      </li>
      {radiusKm !== undefined && (
        <li>
          <span className="map__key map__key--ring" aria-hidden="true" />
          {formatDistance(radiusKm)} 안
        </li>
      )}
    </ul>
  );
}

export default function NaverMap(props: Props) {
  const [failed, setFailed] = useState<FailReason | null>(null);
  if (!hasMapKey) return <FallbackMap {...props} note={FAIL_NOTE.nokey} />;
  if (failed) return <FallbackMap {...props} note={FAIL_NOTE[failed]} />;
  return <DynamicMap {...props} onFail={setFailed} />;
}

interface MarkerEntry {
  marker: NaverNS;
  node: HTMLElement;
}

function applySelection(entries: Map<string, MarkerEntry>, selectedId?: string) {
  entries.forEach(({ marker, node }, id) => {
    const on = id === selectedId;
    node.classList.toggle('is-selected', on);
    marker.setZIndex(on ? 100 : 1);
  });
}

/** 마커 내용은 문자열 HTML 대신 DOM 으로 만든다. 병원 이름은 textContent 로만 넣는다 */
function pinNode(num: number, name: string, closed: boolean): HTMLElement {
  const node = document.createElement('div');
  node.className = closed ? 'nmark nmark--closed' : 'nmark';
  const n = document.createElement('span');
  n.textContent = String(num);
  const label = document.createElement('span');
  label.className = 'nmark__name';
  label.textContent = name;
  node.append(n, label);
  return node;
}

function meNode(text: string): HTMLElement {
  const node = document.createElement('div');
  node.className = 'nme';
  const label = document.createElement('span');
  label.className = 'nme__label';
  label.textContent = text;
  node.append(label);
  return node;
}

function DynamicMap({
  center,
  centerKind,
  radiusKm,
  hospitals,
  selectedId,
  onSelect,
  onFail,
}: Props & { onFail: (reason: FailReason) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<NaverNS>(null);
  const markers = useRef(new Map<string, MarkerEntry>());
  const meMarker = useRef<NaverNS>(null);
  const ring = useRef<NaverNS>(null);
  const [ready, setReady] = useState(false);

  // 마커 클릭·초기 선택 표시에서 최신 값을 쓰되, 지도와 마커를 다시 만들지는 않는다
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 지도는 한 번만 만들고, 화면을 떠날 때 정리한다
  useEffect(() => {
    let cancelled = false;
    const off = onMapAuthFailure(() => onFail('auth'));
    loadNaverMaps()
      .then((naver) => {
        if (cancelled || !el.current) return;
        map.current = new naver.maps.Map(el.current, {
          center: new naver.maps.LatLng(center.lat, center.lng),
          zoom: ZOOM_BY_RADIUS[radiusKm] ?? 14,
          zoomControl: false, // 터치하기 쉬운 크기의 버튼을 아래에서 직접 둔다
          mapDataControl: false,
          scaleControl: false,
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) onFail('load');
      });
    const entries = markers.current;
    return () => {
      cancelled = true;
      off();
      entries.forEach(({ marker }) => marker.setMap(null));
      entries.clear();
      meMarker.current?.setMap(null);
      meMarker.current = null;
      ring.current?.setMap(null);
      ring.current = null;
      map.current?.destroy();
      map.current = null;
    };
    // 지도 생성은 처음 한 번. 위치·병원 변화는 아래 효과들이 반영한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 병원 마커: 목록 순서와 같은 번호
  useEffect(() => {
    if (!ready) return;
    const naver = window.naver;
    markers.current.forEach(({ marker }) => marker.setMap(null));
    markers.current.clear();
    hospitals.forEach((h, i) => {
      const node = pinNode(i + 1, h.name, !h.is_open);
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(h.latitude, h.longitude),
        map: map.current,
        title: h.name,
        icon: { content: node, anchor: new naver.maps.Point(22, 22) },
      });
      naver.maps.Event.addListener(marker, 'click', () => onSelectRef.current?.(h.hospital_id));
      markers.current.set(h.hospital_id, { marker, node });
    });
    applySelection(markers.current, selectedRef.current);
  }, [ready, hospitals]);

  // 선택 표시만 바꾼다. 마커를 다시 만들지 않는다
  useEffect(() => {
    if (!ready) return;
    applySelection(markers.current, selectedId);
    const entry = selectedId ? markers.current.get(selectedId) : undefined;
    if (entry) map.current.panTo(entry.marker.getPosition());
  }, [ready, selectedId]);

  // 내 위치(또는 기본·선택 위치) 표시
  useEffect(() => {
    if (!ready) return;
    const naver = window.naver;
    meMarker.current?.setMap(null);
    meMarker.current = new naver.maps.Marker({
      position: new naver.maps.LatLng(center.lat, center.lng),
      map: map.current,
      title: CENTER_LABEL[centerKind],
      icon: { content: meNode(CENTER_LABEL[centerKind]), anchor: new naver.maps.Point(9, 9) },
      zIndex: 50,
      clickable: false,
    });
  }, [ready, center.lat, center.lng, centerKind]);

  // 검색 반경을 점선 원으로 (범례의 "○km 안")
  useEffect(() => {
    if (!ready) return;
    const naver = window.naver;
    ring.current?.setMap(null);
    ring.current = new naver.maps.Circle({
      map: map.current,
      center: new naver.maps.LatLng(center.lat, center.lng),
      radius: radiusKm * 1000,
      strokeColor: '#2251b3', // --rx (지도 SDK 는 CSS 변수를 못 읽는다)
      strokeOpacity: 0.5,
      strokeWeight: 2,
      strokeStyle: 'shortdash',
      fillOpacity: 0,
      clickable: false,
    });
  }, [ready, center.lat, center.lng, radiusKm]);

  // 내 위치와 병원이 모두 보이도록 범위를 맞춘다. 병원이 없으면 검색 반경에 맞춘다
  const fitRef = useRef<() => void>(() => {});
  fitRef.current = () => {
    if (!map.current) return;
    const naver = window.naver;
    const me = new naver.maps.LatLng(center.lat, center.lng);
    if (hospitals.length === 0) {
      map.current.setCenter(me);
      map.current.setZoom(ZOOM_BY_RADIUS[radiusKm] ?? 14);
      return;
    }
    const bounds = new naver.maps.LatLngBounds(me, me);
    hospitals.forEach((h) => bounds.extend(new naver.maps.LatLng(h.latitude, h.longitude)));
    map.current.fitBounds(bounds, { top: 80, right: 70, bottom: 80, left: 50 });
    if (map.current.getZoom() > MAX_FIT_ZOOM) map.current.setZoom(MAX_FIT_ZOOM);
  };
  useEffect(() => {
    if (ready) fitRef.current();
  }, [ready, hospitals, center.lat, center.lng, radiusKm]);

  const zoomBy = (delta: number) => map.current?.setZoom(map.current.getZoom() + delta, true);

  return (
    <div className="map" role="region" aria-label="병원 위치 지도">
      <div ref={el} className="map__canvas" />
      <Legend radiusKm={radiusKm} />
      <div className="map__zoom">
        <button type="button" onClick={() => zoomBy(1)} aria-label="지도 확대">
          <Icon name="plus" />
        </button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="지도 축소">
          <Icon name="minus" />
        </button>
      </div>
      {ready && (
        <button type="button" className="btn btn--ghost btn--sm map__recenter" onClick={() => fitRef.current()}>
          <Icon name="locate" />
          {centerKind === 'me' ? '내 위치로 지도 맞추기' : '기준 위치로 지도 맞추기'}
        </button>
      )}
    </div>
  );
}

/** 지도를 쓸 수 없을 때: 병원 위치에 맞춰 범위를 잡은 약도. 번호는 목록 순서와 같다. */
function FallbackMap({ center, centerKind, hospitals, selectedId, onSelect, note }: Props & { note: string }) {
  // 모든 병원이 들어오도록 중심 기준 최대 거리로 범위 계산 (최소 ±0.004 ≈ 400m)
  const span =
    Math.max(
      0.004,
      ...hospitals.map((h) => Math.max(Math.abs(h.latitude - center.lat), Math.abs(h.longitude - center.lng))),
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
        {CENTER_LABEL[centerKind]}
      </span>
      {hospitals.map((h, i) => {
        const { x, y } = toXY(h.latitude, h.longitude);
        const selected = h.hospital_id === selectedId;
        const cls = ['map__pin', !h.is_open && 'is-closed', selected && 'is-selected'].filter(Boolean).join(' ');
        return (
          <button
            key={h.hospital_id}
            type="button"
            className={cls}
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => onSelect?.(h.hospital_id)}
            aria-label={`${i + 1}번 ${h.name}`}
            aria-pressed={selected}
          >
            {i + 1}
            {selected && <span className="map__pin-name">{h.name}</span>}
          </button>
        );
      })}
      {/* 약도의 원은 실제 거리와 맞지 않아 범례에 넣지 않는다 */}
      <Legend />
      <p className="map__note">{note}</p>
    </div>
  );
}
