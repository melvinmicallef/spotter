import type { DayOfWeek, WorkoutTemplateInput } from '@spotter/shared';

export function swapTemplateDays(
  draft: WorkoutTemplateInput,
  firstDay: DayOfWeek,
  secondDay: DayOfWeek,
): WorkoutTemplateInput {
  if (firstDay === secondDay) return draft;

  function swap(day: DayOfWeek): DayOfWeek {
    if (day === firstDay) return secondDay;
    if (day === secondDay) return firstDay;
    return day;
  }

  return {
    ...draft,
    dayNames: (draft.dayNames ?? []).map((dayName) => ({
      ...dayName,
      dayOfWeek: swap(dayName.dayOfWeek),
    })),
    exercises: draft.exercises.map((entry) => ({
      ...entry,
      dayOfWeek: swap(entry.dayOfWeek),
    })),
  };
}
