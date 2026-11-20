import type { DayOfWeek, Hospital, OpenHours } from '../api/types';

const DAYS: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export function todayKey(d = new Date()): DayOfWeek {
  return DAYS[d.getDay()];
}

/** 오늘 요일의 진료시간. 정보가 없거나 휴진이면 undefined */
export function todayHours(h: Hospital, d = new Date()): OpenHours | undefined {
  const t = h.open_hours.find((o) => o.day_of_week === todayKey(d));
  return t && !t.is_closed ? t : undefined;
}

/** 거리 표시. 서버는 km 로 준다 */
export function formatDistance(km?: number | null): string {
  if (km == null) return '';
  return km < 1 ? `${Math.round(km * 1000)}m` : `${Number(km.toFixed(1))}km`;
}

/** 시각 표시: ISO 8601 → "11월 20일 (금) 오후 5:00" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
