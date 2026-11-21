import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage, getOpenHospitals, type Hospital } from '../api';
import AddressPicker from '../components/AddressPicker';
import Icon from '../components/Icon';
import NaverMap, { type CenterKind } from '../components/NaverMap';
import { DEFAULT_COORDS, useGeolocation, type Coords, type GeoError } from '../hooks/useGeolocation';
import { DAY_LABEL, WEEK, formatDateTime, formatDistance, formatHours, todayHours, todayKey } from '../utils/hours';
import { hasMapKey, reverseGeocode, searchAddress } from '../utils/naverMaps';

/** 위치를 못 받은 이유와 해결 방법 */
const GEO_ERROR_TEXT: Record<GeoError, string> = {
  denied: '위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용하거나 "주소로 찾기"를 눌러 동네를 골라 주세요.',
  timeout: '내 위치를 확인하는 데 시간이 걸려 멈췄어요. 다시 눌러 보거나 "주소로 찾기"를 눌러 동네를 골라 주세요.',
  unavailable: '지금은 내 위치를 알 수 없어요. 잠시 뒤 다시 눌러 보거나 "주소로 찾기"를 눌러 동네를 골라 주세요.',
  unsupported: '이 기기나 주소에서는 내 위치를 쓸 수 없어요. "주소로 찾기"를 눌러 동네를 골라 주세요.',
};

const DEPTS = ['내과', '외과', '가정의학과', '소아청소년과', '이비인후과', '정형외과', '피부과', '안과', '산부인과', '응급의학과'];
const RADII_KM = [1, 3, 5];

/** 여러 진료과 결과를 합친 병원. 같은 병원이 여러 진료과에서 나오면 하나로 묶는다 */
type MergedHospital = Hospital & { departments: string[] };

interface Merged {
  asOf: string | null;
  hospitals: MergedHospital[];
  failed: string[]; // 검색에 실패한 진료과
  failMessage: string | null;
}

/** API 는 진료과를 하나씩 받으므로 진료과마다 요청해서 합친다 */
async function searchMerged(depts: string[], center: Coords, radius: number, openNow: boolean): Promise<Merged> {
  const results = await Promise.allSettled(
    depts.map((department) =>
      getOpenHospitals({ department, latitude: center.lat, longitude: center.lng, radius_km: radius, open_now: openNow }),
    ),
  );
  const byId = new Map<string, MergedHospital>();
  const failed: string[] = [];
  let failMessage: string | null = null;
  let asOf: string | null = null;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed.push(depts[i]);
      failMessage ??= errorMessage(r.reason, '병원 정보를 불러오지 못했어요.');
      return;
    }
    asOf ??= r.value.as_of;
    for (const h of r.value.hospitals) {
      const prev = byId.get(h.hospital_id);
      if (prev) {
        if (!prev.departments.includes(h.department)) prev.departments.push(h.department);
      } else {
        byId.set(h.hospital_id, { ...h, departments: [h.department] });
      }
    }
  });
  return { asOf, hospitals: [...byId.values()], failed, failMessage };
}

const byDistance = (list: MergedHospital[]) => [...list].sort((a, b) => a.distance_km - b.distance_km);

export default function Hospitals() {
  const [params, setParams] = useSearchParams();
  // ?dept=내과&dept=외과 처럼 여러 개. 문진 결과에서 넘어온 진료과가 첫 번째(기본)다.
  const depts = useMemo(() => [...new Set(params.getAll('dept').filter(Boolean))], [params]);
  const radiusParam = Number(params.get('radius_km'));
  const radius = RADII_KM.includes(radiusParam) ? radiusParam : 3;
  const latParam = Number(params.get('lat'));
  const lngParam = Number(params.get('lng'));
  const paramCoords: Coords | null =
    params.get('lat') && params.get('lng') && Number.isFinite(latParam) && Number.isFinite(lngParam)
      ? { lat: latParam, lng: lngParam }
      : null;

  const geo = useGeolocation();
  // 위치 권한이 없으면 서울시청 기준으로 보여 주고 그 사실을 알린다 (PRD 7-2)
  const center: Coords | null = paramCoords ?? geo.coords ?? (geo.status === 'denied' ? DEFAULT_COORDS : null);
  const centerKind: CenterKind = paramCoords ? 'custom' : geo.coords ? 'me' : 'default';

  // 주소로 위치 정하기. 입력한 주소는 저장하지 않고 이 화면에서만 쓴다
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrLabel, setAddrLabel] = useState<string | null>(null);
  const [addrError, setAddrError] = useState<string | null>(null);
  const [addrSearching, setAddrSearching] = useState(false);
  // 내 위치의 동네 이름 (확인되면 안내 문구에만 사용)
  const [area, setArea] = useState<string | null>(null);

  const [data, setData] = useState<Merged | null>(null);
  // 진료 중 0건일 때만 채우는, 진료 시간이 아닌 병원 목록
  const [closedData, setClosedData] = useState<Merged | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [reload, setReload] = useState(0);

  const setDepts = (next: string[]) => {
    const p = new URLSearchParams(params);
    p.delete('dept');
    next.forEach((d) => p.append('dept', d));
    setParams(p, { replace: true });
  };
  const toggleDept = (d: string) => setDepts(depts.includes(d) ? depts.filter((x) => x !== d) : [...depts, d]);

  const setRadius = (r: number) => {
    const p = new URLSearchParams(params);
    p.set('radius_km', String(r));
    setParams(p, { replace: true });
  };

  // 처음 들어오면 위치를 한 번 묻는다
  useEffect(() => {
    if (!paramCoords && geo.status === 'idle') void geo.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meLat = !paramCoords ? geo.coords?.lat : undefined;
  const meLng = !paramCoords ? geo.coords?.lng : undefined;
  useEffect(() => {
    setArea(null);
    if (!hasMapKey || meLat === undefined || meLng === undefined) return;
    let cancelled = false;
    void reverseGeocode(meLat, meLng).then((a) => !cancelled && setArea(a));
    return () => {
      cancelled = true;
    };
  }, [meLat, meLng]);

  const deptKey = depts.join(',');
  useEffect(() => {
    if (depts.length === 0 || !center) {
      setData(null);
      setClosedData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const open = await searchMerged(depts, center, radius, true);
      // 진료 중인 곳이 0건이면(오류 아님) 같은 조건으로 진료 시간 아닌 곳까지 다시 찾아 진료 시간을 안내한다.
      // 서버가 대신 넓혀 주지 않으므로 프론트가 open_now=false 로 명시해서 요청한다 (PRD F2)
      let closed: Merged | null = null;
      if (open.hospitals.length === 0 && open.failed.length < depts.length) {
        closed = await searchMerged(depts, center, radius, false);
      }
      if (cancelled) return;
      setData(open);
      setClosedData(closed);
    })().finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptKey, radius, center?.lat, center?.lng, reload]);

  const onSelect = useCallback((id: string) => {
    setSelected(id);
    document.getElementById(`h-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const openSorted = useMemo(() => byDistance(data?.hospitals ?? []), [data]);
  const closedSorted = useMemo(() => byDistance(closedData?.hospitals ?? []), [closedData]);
  // 진료 중인 곳이 없으면 진료 시간이 아닌 곳을 대신 보여 준다 (지도·목록 모두)
  const showingClosed = openSorted.length === 0 && closedSorted.length > 0;
  const sorted = showingClosed ? closedSorted : openSorted;
  const allFailed = !!data && data.failed.length === depts.length;

  const locate = async () => {
    const c = await geo.request();
    if (c && paramCoords) {
      const next = new URLSearchParams(params);
      next.delete('lat');
      next.delete('lng');
      setParams(next, { replace: true });
      setAddrLabel(null);
    }
  };

  // 고른 주소(글자)를 좌표로 바꿔 기준 위치로 쓴다
  const onAddressPick = async (address: string) => {
    setAddrOpen(false);
    setAddrSearching(true);
    setAddrError(null);
    try {
      const found = await searchAddress(address);
      if (found.length === 0) {
        setAddrError('이 주소의 위치를 찾지 못했어요. 다른 주소로 다시 찾아 주세요.');
        return;
      }
      const next = new URLSearchParams(params);
      next.set('lat', found[0].lat.toFixed(6));
      next.set('lng', found[0].lng.toFixed(6));
      setParams(next, { replace: true });
      setAddrLabel(address);
      setSelected(undefined);
    } catch {
      setAddrError('위치를 확인하지 못했어요. 잠시 뒤 다시 해 보세요.');
    } finally {
      setAddrSearching(false);
    }
  };

  const locationNote =
    centerKind === 'custom'
      ? `${addrLabel ?? '선택한 위치'} 기준으로 찾아요.`
      : centerKind === 'me'
        ? `내 위치${area ? `(${area} 근처)` : ''} 기준으로 찾아요.`
        : geo.status === 'denied'
          ? `${geo.error ? GEO_ERROR_TEXT[geo.error] : ''} 지금은 기본 위치(서울시청) 기준이에요.`
          : null;

  return (
    <div className="container hospitals">
      <div className="hospitals__head">
        <h1>지금 문 연 병원</h1>
        <p className="muted">
          {showingClosed && closedData?.asOf
            ? `${formatDateTime(closedData.asOf)} 기준으로 진료 중인 곳이 없어 진료 시간을 보여 드려요.`
            : data?.asOf
              ? `${formatDateTime(data.asOf)} 기준으로 진료 중인 곳만 보여 드려요.`
              : '진료과와 내 위치를 기준으로 지금 진료 중인 곳을 찾아 드려요.'}
        </p>
      </div>

      <div className="filters">
        <fieldset className="filters__field filters__radius filters__depts">
          <legend>진료과 (여러 개 고를 수 있어요)</legend>
          {DEPTS.map((d) => {
            const on = depts.includes(d);
            return (
              <label key={d}>
                <input type="checkbox" checked={on} onChange={() => toggleDept(d)} />
                <span>
                  {on && <Icon name="check" size="0.9em" />}
                  {d}
                </span>
              </label>
            );
          })}
        </fieldset>
        <fieldset className="filters__field filters__radius">
          <legend>거리</legend>
          {RADII_KM.map((r) => (
            <label key={r}>
              <input type="radio" name="radius" checked={radius === r} onChange={() => setRadius(r)} />
              <span>{formatDistance(r)} 안</span>
            </label>
          ))}
        </fieldset>
        <button type="button" className="btn btn--ghost" onClick={locate} disabled={geo.status === 'pending'}>
          <Icon name="locate" />
          {geo.status === 'pending' ? '위치 확인 중' : '내 위치로 찾기'}
        </button>
        {hasMapKey && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setAddrError(null);
              setAddrOpen((v) => !v);
            }}
            disabled={addrSearching}
            aria-expanded={addrOpen}
          >
            <Icon name="search" />
            {addrSearching ? '위치 찾는 중' : '주소로 찾기'}
          </button>
        )}
      </div>
      {addrOpen && <AddressPicker onPick={onAddressPick} onClose={() => setAddrOpen(false)} />}
      {addrError && (
        <div className="error" role="alert">
          <Icon name="alert" />
          <span>{addrError}</span>
        </div>
      )}
      {locationNote && <p className="muted">{locationNote}</p>}

      <div className="hospitals__body">
        {center ? (
          <NaverMap
            center={center}
            centerKind={centerKind}
            radiusKm={radius}
            hospitals={sorted}
            selectedId={selected}
            onSelect={onSelect}
          />
        ) : (
          <div className="map map--fallback" role="region" aria-label="병원 위치 지도">
            <p className="map__note">내 위치를 확인하고 있어요.</p>
          </div>
        )}

        <div className="hlist" aria-busy={loading}>
          {!center && (
            <p className="muted">
              <span className="spinner" /> 내 위치를 확인하고 있어요
            </p>
          )}
          {center && depts.length === 0 && <p className="muted">위에서 진료과를 하나 이상 골라 주세요.</p>}
          {loading && (
            <p className="muted">
              <span className="spinner" /> 진료 중인 병원을 찾고 있어요
            </p>
          )}
          {!loading && data && data.failed.length > 0 && (
            <div className="error" role="alert">
              <Icon name="alert" />
              <span>
                {allFailed ? data.failMessage : `${data.failed.join(', ')} 병원은 불러오지 못했어요. ${data.failMessage ?? ''}`}
              </span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReload((n) => n + 1)}>
                <Icon name="restart" />
                다시 찾기
              </button>
            </div>
          )}
          {!loading && data && !allFailed && sorted.length === 0 && (
            <p className="muted">
              {formatDistance(radius)} 안에 지금 진료 중인 {depts.join(', ')} 병원이 없어요. 거리를 넓히거나 다른 진료과도 골라
              보세요.
            </p>
          )}
          {!loading && showingClosed && (
            <p className="hlist__notice">
              {formatDistance(radius)} 안에 지금 진료 중인 {depts.join(', ')} 병원이 없어요. 가까운 병원의 진료 시간을 대신 보여
              드려요. 가기 전에 전화로 진료 여부를 확인해 주세요.
            </p>
          )}
          <ul>
            {sorted.map((h, i) => {
              const hours = todayHours(h);
              const todayRaw = h.open_hours.find((o) => o.day_of_week === todayKey());
              return (
                <li key={h.hospital_id} id={`h-${h.hospital_id}`} className={['hcard', !h.is_open && 'is-closed', h.hospital_id === selected && 'is-selected'].filter(Boolean).join(' ')}>
                  <button type="button" className="hcard__main" onClick={() => setSelected(h.hospital_id)}>
                    <span className="hcard__top">
                      <strong>
                        <span className="hcard__num" aria-hidden="true">
                          {i + 1}
                        </span>
                        {h.name}
                      </strong>
                      <span className="muted">{formatDistance(h.distance_km)}</span>
                    </span>
                    <span className="hcard__meta">
                      {h.is_open ? (
                        <span className="badge badge--open">
                          진료 중{hours?.close_time && `, ${hours.close_time}까지`}
                        </span>
                      ) : (
                        <span className="badge badge--muted">진료 시간 아님</span>
                      )}
                      {!h.is_open && (
                        <span className="muted">
                          {h.open_hours.length ? `오늘 ${formatHours(todayRaw)}` : '진료 시간 정보가 없어요'}
                        </span>
                      )}
                      <span className="muted">{h.departments.join(', ')}</span>
                    </span>
                    <span className="muted hcard__addr">{h.address}</span>
                  </button>
                  {h.open_hours.length > 0 && (
                    <details className="hcard__week">
                      <summary>요일별 진료 시간</summary>
                      <dl>
                        {WEEK.map((day) => {
                          const o = h.open_hours.find((x) => x.day_of_week === day);
                          return (
                            <div key={day} className={day === todayKey() ? 'is-today' : undefined}>
                              <dt>{DAY_LABEL[day]}</dt>
                              <dd>{o ? formatHours(o) : '정보 없음'}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    </details>
                  )}
                  {h.phone ? (
                    <a className="btn btn--ghost btn--sm hcard__call" href={`tel:${h.phone}`}>
                      <Icon name="phone" />
                      전화 걸기 {h.phone}
                    </a>
                  ) : (
                    <span className="muted hcard__call">전화번호 정보가 없어요</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
