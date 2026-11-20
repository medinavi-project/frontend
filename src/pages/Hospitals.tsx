import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getOpenHospitals, type Hospital } from '../api';
import Icon from '../components/Icon';
import NaverMap from '../components/NaverMap';
import { DEFAULT_COORDS, useGeolocation, type Coords } from '../hooks/useGeolocation';
import { formatDistance, todayHours } from '../utils/hours';

const DEPTS = ['내과', '외과', '가정의학과', '소아청소년과', '이비인후과', '정형외과', '피부과', '안과', '산부인과', '응급의학과'];
const RADII = [1000, 3000, 5000];

export default function Hospitals() {
  const [params, setParams] = useSearchParams();
  const dept = params.get('dept') ?? '';
  const radius = Number(params.get('radius') ?? 3000);
  const paramCoords: Coords | null =
    params.get('lat') && params.get('lng') ? { lat: Number(params.get('lat')), lng: Number(params.get('lng')) } : null;

  const geo = useGeolocation();
  const center = paramCoords ?? geo.coords ?? DEFAULT_COORDS;

  const [list, setList] = useState<Hospital[]>([]);
  const [widened, setWidened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | undefined>();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOpenHospitals({ dept: dept || undefined, lat: center.lat, lng: center.lng, radius })
      .then((res) => {
        if (cancelled) return;
        setList(res.hospitals);
        setWidened(res.widened);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : '병원 목록을 불러오지 못했습니다.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dept, radius, center.lat, center.lng]);

  const onSelect = useCallback((id: string) => {
    setSelected(id);
    document.getElementById(`h-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const sorted = useMemo(() => [...list].sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0)), [list]);

  return (
    <div className="container hospitals">
      <div className="hospitals__head">
        <h1>지금 문 연 병원</h1>
        <p className="muted">
          {new Date().toLocaleString('ko-KR', { weekday: 'long', hour: 'numeric', minute: '2-digit' })} 기준으로 진료 중인
          곳만 보여 드려요.
        </p>
      </div>

      <div className="filters">
        <label className="filters__field">
          <span>진료과</span>
          <select value={dept} onChange={(e) => update('dept', e.target.value)}>
            <option value="">전체</option>
            {DEPTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="filters__field filters__radius">
          <legend>거리</legend>
          {RADII.map((r) => (
            <label key={r}>
              <input type="radio" name="radius" checked={radius === r} onChange={() => update('radius', String(r))} />
              <span>{formatDistance(r)} 안</span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={async () => {
            const c = await geo.request();
            if (c) {
              const next = new URLSearchParams(params);
              next.delete('lat');
              next.delete('lng');
              setParams(next, { replace: true });
            }
          }}
          disabled={geo.status === 'pending'}
        >
          <Icon name="locate" />
          {geo.status === 'pending' ? '위치 확인 중' : '내 위치로 찾기'}
        </button>
      </div>
      {geo.status === 'denied' && (
        <p className="muted">위치 권한이 꺼져 있어 기본 위치(서울시청) 기준으로 보여 드려요.</p>
      )}

      <div className="hospitals__body">
        <NaverMap center={center} hospitals={sorted} selectedId={selected} onSelect={onSelect} />

        <div className="hlist" aria-busy={loading}>
          {loading && (
            <p className="muted">
              <span className="spinner" /> 진료 중인 병원을 찾고 있어요
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              <Icon name="alert" />
              {error}
            </p>
          )}
          {widened && (
            <p className="hlist__notice">
              조건에 맞는 병원이 없어 가까운 응급실과 가정의학과까지 넓혀서 찾았어요.
            </p>
          )}
          {!loading && !error && sorted.length === 0 && (
            <p className="muted">지금 진료 중인 병원이 없어요. 거리를 넓히거나 진료과를 바꿔 보세요.</p>
          )}
          <ul>
            {sorted.map((h, i) => {
              const hours = todayHours(h);
              return (
                <li
                  key={h.hpid}
                  id={`h-${h.hpid}`}
                  className={`hcard ${h.hpid === selected ? 'is-selected' : ''} ${h.is_emergency ? 'is-er' : ''}`}
                >
                  <button type="button" className="hcard__main" onClick={() => setSelected(h.hpid)}>
                    <span className="hcard__top">
                      <strong>
                        <span className="hcard__num" aria-hidden="true">
                          {i + 1}
                        </span>
                        {h.name}
                      </strong>
                      <span className="muted">{formatDistance(h.distance_m)}</span>
                    </span>
                    <span className="hcard__meta">
                      {h.is_emergency ? (
                        <span className="badge badge--er">24시간 응급실</span>
                      ) : (
                        <span className="badge badge--open">진료 중{hours && `, ${hours.end}까지`}</span>
                      )}
                      <span className="muted">{h.departments.join(', ')}</span>
                    </span>
                    <span className="muted hcard__addr">{h.address}</span>
                  </button>
                  <a className="btn btn--ghost btn--sm hcard__call" href={`tel:${h.tel}`}>
                    <Icon name="phone" />
                    전화 걸기 {h.tel}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
