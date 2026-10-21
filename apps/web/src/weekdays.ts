import type { DayOfWeek } from '@spotter/shared';

export const WEEKDAYS: ReadonlyArray<{ value: DayOfWeek; label: string }> = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

export function weekdayName(day: DayOfWeek): string {
  return WEEKDAYS.find((entry) => entry.value === day)?.label ?? `Day ${day}`;
}

export function todayDayOfWeek(date = new Date()): DayOfWeek {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as DayOfWeek;
}
