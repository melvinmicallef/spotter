import type {
  DayOfWeek,
  Exercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutTemplate,
} from '@spotter/shared';

import { weekdayName } from '../../shared/weekdays.js';

export function createWorkout(
  template: WorkoutTemplate,
  dayOfWeek: DayOfWeek,
  previousWorkouts: Workout[] = [],
): Workout {
  const now = new Date().toISOString();
  const entries = template.exercises.filter(
    (entry) => entry.dayOfWeek === dayOfWeek,
  );
  const templateDayName =
    template.dayNames?.find((dayName) => dayName.dayOfWeek === dayOfWeek)
      ?.name ?? null;
  return {
    id: crypto.randomUUID(),
    templateId: template.id,
    templateDay: dayOfWeek,
    templateDayName,
    name: `${template.name} · ${weekdayName(dayOfWeek)}`.slice(0, 100),
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    notes: null,
    updatedAt: now,
    exercises: entries.map((entry, position) => {
      const cardioMode = entry.cardioMode ?? 'duration';
      const previousInterval =
        entry.exerciseType === 'cardio' && cardioMode === 'interval'
          ? previousIntervalExecution(entry, previousWorkouts)
          : undefined;
      return {
        id: crypto.randomUUID(),
        exerciseId: entry.exerciseId,
        exerciseName: entry.exerciseName,
        exerciseType: entry.exerciseType,
        referenceUrl: entry.referenceUrl,
        position,
        notes: null,
        targetSets: entry.targetSets,
        targetReps: entry.targetReps,
        targetDurationSeconds: entry.targetDurationSeconds,
        cardioMode,
        intervalPrepSeconds:
          cardioMode === 'interval'
            ? (previousInterval?.intervalPrepSeconds ?? 0)
            : null,
        intervalWorkSeconds:
          cardioMode === 'interval'
            ? (previousInterval?.intervalWorkSeconds ?? 30)
            : null,
        intervalRestSeconds:
          cardioMode === 'interval'
            ? (previousInterval?.intervalRestSeconds ?? 30)
            : null,
        intervalIterations:
          cardioMode === 'interval'
            ? (previousInterval?.intervalIterations ?? 8)
            : null,
        targetDistance: cardioMode === 'interval' ? null : entry.targetDistance,
        targetDistanceUnit: entry.targetDistanceUnit,
        completed: false,
        sets: Array.from(
          {
            length:
              entry.exerciseType !== 'cardio' ? (entry.targetSets ?? 1) : 1,
          },
          (_, setPosition) => createSet(setPosition),
        ),
      };
    }),
  };
}

function previousIntervalExecution(
  entry: WorkoutTemplate['exercises'][number],
  previousWorkouts: Workout[],
): WorkoutExercise | undefined {
  const previousEntries = previousWorkouts
    .filter((workout) => workout.status === 'completed')
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .flatMap((workout) => workout.exercises)
    .filter(
      (exercise) =>
        exercise.exerciseType === 'cardio' &&
        exercise.cardioMode === 'interval',
    );

  const byId = entry.exerciseId
    ? previousEntries.find(
        (exercise) => exercise.exerciseId === entry.exerciseId,
      )
    : undefined;
  return (
    byId ??
    previousEntries.find(
      (exercise) =>
        exercise.exerciseName === entry.exerciseName &&
        exercise.exerciseType === entry.exerciseType,
    )
  );
}

export function updateIntervalSettings(
  workout: Workout,
  workoutExerciseId: string,
  patch: Partial<
    Pick<
      WorkoutExercise,
      | 'intervalPrepSeconds'
      | 'intervalWorkSeconds'
      | 'intervalRestSeconds'
      | 'intervalIterations'
    >
  >,
): Workout {
  return updateExercise(workout, workoutExerciseId, (exercise) => ({
    ...exercise,
    ...patch,
  }));
}

export function addExercise(workout: Workout, exercise: Exercise): Workout {
  const entry: WorkoutExercise = {
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    exerciseType: exercise.exerciseType,
    referenceUrl: exercise.referenceUrl,
    position: workout.exercises.length,
    notes: null,
    targetSets: null,
    targetReps: null,
    targetDurationSeconds: null,
    cardioMode: 'duration',
    intervalPrepSeconds: null,
    intervalWorkSeconds: null,
    intervalRestSeconds: null,
    intervalIterations: null,
    targetDistance: null,
    targetDistanceUnit: 'km',
    completed: false,
    sets: [createSet(0)],
  };
  return touch({ ...workout, exercises: [...workout.exercises, entry] });
}

export function updateWorkoutNotes(
  workout: Workout,
  notes: string | null,
): Workout {
  return touch({ ...workout, notes });
}

export function updateExerciseNotes(
  workout: Workout,
  workoutExerciseId: string,
  notes: string | null,
): Workout {
  return updateExercise(workout, workoutExerciseId, (exercise) => ({
    ...exercise,
    notes,
  }));
}

export function setExerciseCompleted(
  workout: Workout,
  workoutExerciseId: string,
  completed: boolean,
): Workout {
  return updateExercise(workout, workoutExerciseId, (exercise) => ({
    ...exercise,
    completed,
  }));
}

export function removeExercise(workout: Workout, exerciseId: string): Workout {
  return touch({
    ...workout,
    exercises: workout.exercises
      .filter((entry) => entry.id !== exerciseId)
      .map((entry, position) => ({ ...entry, position })),
  });
}

export function moveExercise(
  workout: Workout,
  index: number,
  direction: -1 | 1,
): Workout {
  const destination = index + direction;
  if (destination < 0 || destination >= workout.exercises.length)
    return workout;
  const exercises = [...workout.exercises];
  [exercises[index], exercises[destination]] = [
    exercises[destination]!,
    exercises[index]!,
  ];
  return touch({
    ...workout,
    exercises: exercises.map((entry, position) => ({ ...entry, position })),
  });
}

export function addSet(workout: Workout, workoutExerciseId: string): Workout {
  return updateExercise(workout, workoutExerciseId, (exercise) => ({
    ...exercise,
    sets: [...exercise.sets, createSet(exercise.sets.length)],
  }));
}

export function updateSet(
  workout: Workout,
  workoutExerciseId: string,
  setId: string,
  patch: Partial<WorkoutSet>,
): Workout {
  return updateExercise(workout, workoutExerciseId, (exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) =>
      set.id === setId ? { ...set, ...patch } : set,
    ),
  }));
}

export function removeSet(
  workout: Workout,
  workoutExerciseId: string,
  setId: string,
): Workout {
  return updateExercise(workout, workoutExerciseId, (exercise) => ({
    ...exercise,
    sets: exercise.sets
      .filter((set) => set.id !== setId)
      .map((set, position) => ({ ...set, position })),
  }));
}

export function isStrengthSetPartiallyEntered(
  set: Pick<WorkoutSet, 'reps' | 'weight'>,
): boolean {
  const hasReps = set.reps != null && set.reps > 0;
  const hasWeight = set.weight != null && set.weight > 0;
  return hasReps !== hasWeight;
}

export function hasPartiallyFilledStrengthSet(workout: Workout): boolean {
  return workout.exercises.some(
    (exercise) =>
      exercise.exerciseType === 'strength' &&
      exercise.sets.some(isStrengthSetPartiallyEntered),
  );
}

export function finishWorkout(workout: Workout): Workout {
  if (hasPartiallyFilledStrengthSet(workout))
    throw new Error('A strength set needs both weight and reps, or neither.');

  const now = new Date().toISOString();
  const exercises = workout.exercises.map((exercise) => {
    if (
      exercise.exerciseType === 'strength' ||
      exercise.exerciseType === 'calisthenics'
    ) {
      return {
        ...exercise,
        sets: exercise.sets
          .filter((set) => set.reps != null && set.reps > 0)
          .map((set, position) => ({ ...set, position })),
      };
    }
    return exercise;
  });
  return {
    ...workout,
    exercises,
    status: 'completed',
    completedAt: now,
    updatedAt: now,
  };
}

function createSet(position: number): WorkoutSet {
  return {
    id: crypto.randomUUID(),
    position,
    reps: null,
    weight: null,
    weightUnit: 'kg',
    durationSeconds: null,
    distance: null,
    distanceUnit: 'km',
    notes: null,
    completed: false,
  };
}

function updateExercise(
  workout: Workout,
  exerciseId: string,
  update: (exercise: WorkoutExercise) => WorkoutExercise,
): Workout {
  return touch({
    ...workout,
    exercises: workout.exercises.map((exercise) =>
      exercise.id === exerciseId ? update(exercise) : exercise,
    ),
  });
}

function touch(workout: Workout): Workout {
  const now = Date.now();
  const previous = Date.parse(workout.updatedAt);
  return {
    ...workout,
    updatedAt: new Date(Math.max(now, previous + 1)).toISOString(),
  };
}
