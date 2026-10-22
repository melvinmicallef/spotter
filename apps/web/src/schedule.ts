import type { DayOfWeek } from '@spotter/shared';

export interface WeekProgress {
  completedDays: DayOfWeek[];
}

export function isoWeekKey(date = new Date()): string {
  const current = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const weekday = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - weekday);
  const isoYear = current.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((current.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function completeWeekDay(
  progress: WeekProgress,
  day: DayOfWeek,
): WeekProgress {
  return progress.completedDays.includes(day)
    ? progress
    : { completedDays: [...progress.completedDays, day].sort() };
}

export function nextAvailableDay(
  startDay: DayOfWeek,
  completedDays: DayOfWeek[],
): DayOfWeek {
  for (let offset = 0; offset < 7; offset += 1) {
    const day = (((startDay - 1 + offset) % 7) + 1) as DayOfWeek;
    if (!completedDays.includes(day)) return day;
  }
  return startDay;
}

export function parseWeekProgress(
  value: string | number | undefined,
): WeekProgress {
  if (typeof value !== 'string') return { completedDays: [] };
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return { completedDays: [] };
    const days = (candidate as Record<string, unknown>).completedDays;
    if (!Array.isArray(days)) return { completedDays: [] };
    const completedDays = [...new Set(days)].filter(
      (day): day is DayOfWeek =>
        typeof day === 'number' &&
        Number.isInteger(day) &&
        day >= 1 &&
        day <= 7,
    );
    return { completedDays: completedDays.sort() };
  } catch {
    return { completedDays: [] };
  }
}

export function weekProgressMetadataKey(
  templateId: string,
  weekKey: string,
): string {
  return `weekProgress:${templateId}:${weekKey}`;
}
