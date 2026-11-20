import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage, getOpenHospitals, type Hospital } from '../api';
import Icon from '../components/Icon';
import NaverMap from '../components/NaverMap';
import { DEFAULT_COORDS, useGeolocation, type Coords } from '../hooks/useGeolocation';
import { formatDateTime, formatDistance, todayHours } from '../utils/hours';

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

export default function Hospitals() {
  const [params, setParams] = useSearchParams();
  // ?dept=내과&dept=외과 처럼 여러 개. 문진 결과에서 넘어온 진료과가 첫 번째(기본)다.
  const depts = useMemo(() => [...new Set(params.getAll('dept').filter(Boolean))], [params]);
  const radiusParam = Number(params.get('radius_km'));
  const radius = RADII_KM.includes(radiusParam) ? radiusParam : 3;
  const paramCoords: Coords | null =
    params.get('lat') && params.get('lng') ? { lat: Number(params.get('lat')), lng: Number(params.get('lng')) } : null;

  const geo = useGeolocation();
  // 위치 권한이 없으면 서울시청 기준으로 보여 주고 그 사실을 알린다 (PRD 7-2)
  const center: Coords | null = paramCoords ?? geo.coords ?? (geo.status === 'denied' ? DEFAULT_COORDS : null);

  const [data, setData] = useState<Merged | null>(null);
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

  const deptKey = depts.join(',');
  useEffect(() => {
    if (depts.length === 0 || !center) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // API 는 진료과를 하나씩 받으므로 진료과마다 요청해서 합친다
    Promise.allSettled(
      depts.map((department) =>
        getOpenHospitals({ department, latitude: center.lat, longitude: center.lng, radius_km: radius, open_now: true }),
      ),
    )
      .then((results) => {
        if (cancelled) return;
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
        setData({ asOf, hospitals: [...byId.values()], failed, failMessage });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptKey, radius, center?.lat, center?.lng, reload]);

  const onSelect = useCallback((id: string) => {
    setSelected(id);
    document.getElementById(`h-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const sorted = useMemo(
    () => [...(data?.hospitals ?? [])].sort((a, b) => a.distance_km - b.distance_km),
    [data],
  );
  const allFailed = !!data && data.failed.length === depts.length;

  const locate = async () => {
    const c = await geo.request();
    if (c && paramCoords) {
      const next = new URLSearchParams(params);
      next.delete('lat');
      next.delete('lng');
      setParams(next, { replace: true });
    }
  };

  return (
    <div className="container hospitals">
      <div className="hospitals__head">
        <h1>지금 문 연 병원</h1>
        <p className="muted">
          {data?.asOf
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
      </div>
      {!paramCoords && !geo.coords && geo.status === 'denied' && (
        <p className="muted">위치 권한이 꺼져 있어 기본 위치(서울시청) 기준으로 보여 드려요.</p>
      )}

      <div className="hospitals__body">
        {center ? (
          <NaverMap center={center} hospitals={sorted} selectedId={selected} onSelect={onSelect} />
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
            <p className="muted">지금 진료 중인 {depts.join(', ')} 병원이 없어요. 거리를 넓히거나 다른 진료과도 골라 보세요.</p>
          )}
          <ul>
            {sorted.map((h, i) => {
              const hours = todayHours(h);
              return (
                <li key={h.hospital_id} id={`h-${h.hospital_id}`} className={`hcard ${h.hospital_id === selected ? 'is-selected' : ''}`}>
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
                      <span className="muted">{h.departments.join(', ')}</span>
                    </span>
                    <span className="muted hcard__addr">{h.address}</span>
                  </button>
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
