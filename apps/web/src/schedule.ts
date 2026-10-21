import type { DayOfWeek } from '@spotter/shared';

export type WeekSchedule = Partial<Record<DayOfWeek, DayOfWeek>>;

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

export function scheduledTemplateDay(
  actualDay: DayOfWeek,
  schedule: WeekSchedule,
): DayOfWeek {
  return schedule[actualDay] ?? actualDay;
}

export function swapWeekDays(
  schedule: WeekSchedule,
  first: DayOfWeek,
  second: DayOfWeek,
): WeekSchedule {
  if (first === second) return schedule;
  const next: WeekSchedule = {
    ...schedule,
    [first]: scheduledTemplateDay(second, schedule),
    [second]: scheduledTemplateDay(first, schedule),
  };
  for (const day of [first, second]) {
    if (next[day] === day) delete next[day];
  }
  return next;
}

export function parseWeekSchedule(
  value: string | number | undefined,
): WeekSchedule {
  if (typeof value !== 'string') return {};
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return {};
    const schedule: WeekSchedule = {};
    for (let day = 1; day <= 7; day += 1) {
      const source = (candidate as Record<string, unknown>)[String(day)];
      if (
        typeof source === 'number' &&
        Number.isInteger(source) &&
        source >= 1 &&
        source <= 7
      )
        schedule[day as DayOfWeek] = source as DayOfWeek;
    }
    return schedule;
  } catch {
    return {};
  }
}
