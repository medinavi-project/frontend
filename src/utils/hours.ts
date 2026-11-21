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

/** 요일별 진료 시간 표시 순서 (월요일부터) */
export const WEEK: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const DAY_LABEL: Record<DayOfWeek, string> = {
  MONDAY: '월',
  TUESDAY: '화',
  WEDNESDAY: '수',
  THURSDAY: '목',
  FRIDAY: '금',
  SATURDAY: '토',
  SUNDAY: '일',
};

/** 한 요일의 진료 시간: "09:00~18:00" 또는 "휴진". 서버 시각 문자열을 그대로 쓴다 (자정은 "24:00") */
export function formatHours(o?: OpenHours): string {
  if (!o || o.is_closed || !o.open_time || !o.close_time) return '휴진';
  return `${o.open_time}~${o.close_time}`;
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
