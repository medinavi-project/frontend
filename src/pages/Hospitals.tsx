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

// 진료과 이름은 백엔드가 받는 값과 글자까지 같아야 검색된다 (백엔드 표준값 확정 전 임시 목록, PRD 8장)
const DEPTS = [
  '내과',
  '외과',
  '가정의학과',
  '소아청소년과',
  '이비인후과',
  '정형외과',
  '피부과',
  '안과',
  '산부인과',
  '신경과',
  '정신건강의학과',
  '비뇨기과',
  '치과',
  '흉부외과',
  '신경외과',
  '성형외과',
  '재활의학과',
  '마취통증의학과',
  '응급의학과',
];
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

/** 진료 시간이 아닌 병원은 가까운 몇 곳만 먼저 보여 주고 "더 보기"로 펼친다. 진료 중인 곳이 없으면 볼 게 이것뿐이라 더 많이 */
const CLOSED_PREVIEW = 5;
const CLOSED_PREVIEW_NO_OPEN = 10;

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

  // 진료 중인 병원(open_now=true)과 반경 안 모든 병원(open_now=false). 항상 둘 다 받는다
  const [data, setData] = useState<Merged | null>(null);
  const [allData, setAllData] = useState<Merged | null>(null);
  const [showAllClosed, setShowAllClosed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | undefined>();
  const [reload, setReload] = useState(0);
  // 모바일에서 접어 둔 찾는 조건을 펼쳤는지
  const [condOpen, setCondOpen] = useState(false);

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
    setShowAllClosed(false);
    if (depts.length === 0 || !center) {
      setData(null);
      setAllData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      // 서버는 가까운 순으로 20곳에서 자르므로, open_now=false 한 번만 받으면 조금 먼 진료 중 병원이 잘릴 수 있다.
      // 그래서 진료 중(true)과 전체(false)를 동시에 받아 합친다 (FRONTEND_OPEN_CLOSED_LIST.md, PRD F2)
      const [open, all] = await Promise.all([
        searchMerged(depts, center, radius, true),
        searchMerged(depts, center, radius, false),
      ]);
      if (cancelled) return;
      setData(open);
      setAllData(all);
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
  // 진료 시간 아님 = 전체 결과에서 진료 중 목록에 있는 곳을 빼고, is_open=false 인 곳만.
  // 두 요청 사이에 진료 시간 경계(예: 18:00)를 넘으면 같은 병원이 양쪽에 들어올 수 있어 둘 다 확인한다
  const closedSorted = useMemo(() => {
    const openIds = new Set(openSorted.map((h) => h.hospital_id));
    return byDistance((allData?.hospitals ?? []).filter((h) => !h.is_open && !openIds.has(h.hospital_id)));
  }, [allData, openSorted]);
  const closedLimit = openSorted.length > 0 ? CLOSED_PREVIEW : CLOSED_PREVIEW_NO_OPEN;
  const visibleClosed = showAllClosed ? closedSorted : closedSorted.slice(0, closedLimit);
  const hiddenClosed = closedSorted.length - visibleClosed.length;
  // 지도에는 목록에 보이는 병원만 찍는다. 번호도 목록과 같게 진료 중 → 진료 시간 아님 순
  const shown = useMemo(() => [...openSorted, ...visibleClosed], [openSorted, visibleClosed]);

  // 오류: 진료과별 실패는 두 요청을 합쳐 안내하고, 둘 다 모든 진료과에서 실패했을 때만 전부 실패로 본다
  const openFailedAll = !!data && data.failed.length === depts.length;
  const allFailed = openFailedAll && !!allData && allData.failed.length === depts.length;
  const failedDepts = [...new Set([...(data?.failed ?? []), ...(allData?.failed ?? [])])];
  const failMessage = data?.failMessage ?? allData?.failMessage ?? null;
  const asOf = data?.asOf ?? allData?.asOf ?? null;
  const nothing = !loading && !!data && !allFailed && shown.length === 0;

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

  // 지금 어느 위치 기준으로 찾는지 (조건 패널 첫 줄)
  const whereText = !center
    ? '내 위치를 확인하고 있어요'
    : centerKind === 'custom'
      ? (addrLabel ?? '선택한 위치')
      : centerKind === 'me'
        ? `내 위치${area ? ` (${area} 근처)` : ''}`
        : '기본 위치 (서울시청)';
  const geoNote = centerKind === 'default' && geo.status === 'denied' && geo.error ? GEO_ERROR_TEXT[geo.error] : null;
  // 거리는 기준 위치에서 잰다: "○○에서 3km 안"으로 한 문장으로 읽히게 한다
  const whereFrom = center ? `${whereText}에서` : whereText;

  // 모바일(720px 이하)에서는 조건이 다 정해지면 패널을 한 줄 요약으로 접어 지도가 먼저 보이게 한다.
  // 안내할 내용(위치 오류·주소 찾기)이 있으면 접지 않는다.
  const collapsible = depts.length > 0 && !!center && !geoNote && !addrError && !addrOpen;
  const folded = collapsible && !condOpen;

  /** 병원 카드. num 은 지도 핀과 같은 번호 */
  const renderCard = (h: MergedHospital, num: number) => {
    const hours = todayHours(h);
    const todayRaw = h.open_hours.find((o) => o.day_of_week === todayKey());
    return (
      <li key={h.hospital_id} id={`h-${h.hospital_id}`} className={['hcard', !h.is_open && 'is-closed', h.hospital_id === selected && 'is-selected'].filter(Boolean).join(' ')}>
        <button type="button" className="hcard__main" onClick={() => setSelected(h.hospital_id)}>
          <span className="hcard__num" aria-hidden="true">
            {num}
          </span>
          <span className="hcard__info">
            <span className="hcard__top">
              <strong className="hcard__name">{h.name}</strong>
              <span className="hcard__dist">{formatDistance(h.distance_km)}</span>
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
              <span className="hcard__depts">{h.departments.join(', ')}</span>
            </span>
            <span className="hcard__addr">{h.address}</span>
          </span>
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
  };

  return (
    <div className="container hospitals">
      <div className="hospitals__head">
        <h1>지금 문 연 병원</h1>
        <p className="muted">
          {!asOf
            ? '진료과와 내 위치를 기준으로 지금 진료 중인 곳을 찾아 드려요.'
            : openSorted.length === 0 && closedSorted.length > 0
              ? `${formatDateTime(asOf)} 기준으로 진료 중인 곳이 없어 진료 시간을 보여 드려요.`
              : `${formatDateTime(asOf)} 기준으로 진료 중인 곳을 먼저 보여 드려요.`}
        </p>
      </div>

      {folded && (
        <div className="hsummary">
          <div className="hsummary__text">
            <p className="hsummary__where">
              <Icon name="pin" />
              <span>
                {whereFrom} {formatDistance(radius)} 안
              </span>
            </p>
            <p className="muted">{depts.join(', ')}</p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={false}
            aria-controls="hsearch"
            onClick={() => setCondOpen(true)}
          >
            조건 바꾸기
          </button>
        </div>
      )}

      <section id="hsearch" className={folded ? 'hsearch hsearch--folded' : 'hsearch'} aria-label="찾는 조건">
        <div className="hsearch__row">
          <span className="hsearch__label">기준 위치</span>
          <div className="hsearch__loc">
            <div className="hsearch__where">
              <Icon name="pin" />
              <span>{whereFrom}</span>
              <span className="seg" role="radiogroup" aria-label="거리">
                {RADII_KM.map((r) => (
                  <label key={r}>
                    <input type="radio" name="radius" checked={radius === r} onChange={() => setRadius(r)} />
                    <span>{formatDistance(r)}</span>
                  </label>
                ))}
              </span>
              <span>안</span>
            </div>
            <div className="hsearch__btns">
              <button type="button" className="btn btn--ghost btn--sm" onClick={locate} disabled={geo.status === 'pending'}>
                <Icon name="locate" />
                {geo.status === 'pending' ? '위치 확인 중' : '내 위치로 찾기'}
              </button>
              {hasMapKey && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
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
            {geoNote && <p className="hsearch__note muted">{geoNote}</p>}
          </div>
        </div>
        {addrOpen && <AddressPicker onPick={onAddressPick} onClose={() => setAddrOpen(false)} />}
        {addrError && (
          <div className="error" role="alert">
            <Icon name="alert" />
            <span>{addrError}</span>
          </div>
        )}

        <div className="hsearch__row" role="group" aria-labelledby="dept-label">
          <span className="hsearch__label" id="dept-label">
            진료과
            <small>여러 개 고를 수 있어요</small>
          </span>
          <div className="optset">
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
          </div>
        </div>

        {collapsible && condOpen && (
          <div className="hsearch__done">
            <button type="button" className="btn" aria-controls="hsearch" onClick={() => setCondOpen(false)}>
              이 조건으로 보기
            </button>
          </div>
        )}
      </section>

      <div className="hospitals__body">
        {center ? (
          <NaverMap
            center={center}
            centerKind={centerKind}
            radiusKm={radius}
            hospitals={shown}
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
              <span className="spinner" /> 병원을 찾고 있어요
            </p>
          )}
          {!loading && data && failedDepts.length > 0 && (
            <div className="error" role="alert">
              <Icon name="alert" />
              <span>
                {allFailed
                  ? failMessage
                  : openFailedAll
                    ? `지금 진료 중인지 확인하지 못했어요. 아래는 진료 시간이 아닌 병원이에요. ${failMessage ?? ''}`
                    : `${failedDepts.join(', ')} 병원은 일부 불러오지 못했어요. ${failMessage ?? ''}`}
              </span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReload((n) => n + 1)}>
                <Icon name="restart" />
                다시 찾기
              </button>
            </div>
          )}
          {nothing && (
            <p className="muted">
              {formatDistance(radius)} 안에 {depts.join(', ')} 병원이 없어요.{' '}
              {radius < RADII_KM[RADII_KM.length - 1] ? '거리를 넓히거나 다른 진료과도 골라 보세요.' : '다른 진료과도 골라 보세요.'}
            </p>
          )}

          {!loading && openSorted.length > 0 && (
            <>
              <div className="hlist__head">
                <h2>
                  지금 진료 중 <span className="hlist__count">{openSorted.length}곳</span>
                </h2>
                <span className="muted">가까운 순</span>
              </div>
              <ul>{openSorted.map((h, i) => renderCard(h, i + 1))}</ul>
            </>
          )}

          {!loading && closedSorted.length > 0 && (
            <>
              {openSorted.length === 0 && !openFailedAll && (
                <p className="hlist__notice">
                  {formatDistance(radius)} 안에 지금 진료 중인 {depts.join(', ')} 병원이 없어요. 가까운 병원의 진료 시간을 대신 보여
                  드려요. 가기 전에 전화로 진료 여부를 확인해 주세요.
                </p>
              )}
              <div className={`hlist__head${openSorted.length > 0 ? ' hlist__head--closed' : ''}`}>
                <h2>
                  진료 시간 아님{' '}
                  <span className="hlist__count--muted">
                    {hiddenClosed > 0 ? `가까운 ${visibleClosed.length}곳` : `${closedSorted.length}곳`}
                  </span>
                </h2>
                <span className="muted">가까운 순</span>
              </div>
              <ul>{visibleClosed.map((h, i) => renderCard(h, openSorted.length + i + 1))}</ul>
              {hiddenClosed > 0 && (
                <button type="button" className="btn btn--ghost hlist__more" onClick={() => setShowAllClosed(true)}>
                  진료 시간 아닌 병원 {hiddenClosed}곳 더 보기
                </button>
              )}
              {showAllClosed && closedSorted.length > closedLimit && (
                <button type="button" className="btn btn--ghost hlist__more" onClick={() => setShowAllClosed(false)}>
                  진료 시간 아닌 병원 접기
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
