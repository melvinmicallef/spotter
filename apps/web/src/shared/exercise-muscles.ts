import type { Exercise, Muscle } from '@spotter/shared';

export function muscleDisplayName(
  muscle: Pick<Muscle, 'group' | 'subgroup' | 'name'>,
) {
  return [muscle.group, muscle.subgroup, muscle.name]
    .filter(Boolean)
    .join(' › ');
}

export function exerciseMuscleSummary(exercise: Pick<Exercise, 'muscles'>) {
  return (
    exercise.muscles
      .filter((muscle) => muscle.role === 'primary')
      .map(muscleDisplayName)
      .join(' · ') || 'No target muscles'
  );
}
