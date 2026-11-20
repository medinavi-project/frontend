import type { Hospital, OpenHours, Weekday } from '../api/types';

const DAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function todayKey(d = new Date()): Weekday {
  return DAYS[d.getDay()];
}

export function todayHours(h: Hospital, d = new Date()): OpenHours | undefined {
  return h.open_hours[todayKey(d)];
}

const toMin = (t: string) => {
  const [hh, mm] = t.split(':').map(Number);
  return hh * 60 + mm;
};

/** 서버에서 이미 필터링하지만, 화면에서 남은 시간을 보여 주기 위해 사용 */
export function isOpenNow(h: Hospital, d = new Date()): boolean {
  const hours = todayHours(h, d);
  if (!hours) return false;
  const now = d.getHours() * 60 + d.getMinutes();
  return now >= toMin(hours.start) && now < toMin(hours.end);
}

export function formatDistance(m?: number): string {
  if (m == null) return '';
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}
