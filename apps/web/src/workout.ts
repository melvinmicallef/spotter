import type {
  DayOfWeek,
  Exercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutTemplate,
} from '@spotter/shared';

import { weekdayName } from './weekdays.js';

export function createWorkout(
  template: WorkoutTemplate,
  dayOfWeek: DayOfWeek,
): Workout {
  const now = new Date().toISOString();
  const entries = template.exercises.filter(
    (entry) => entry.dayOfWeek === dayOfWeek,
  );
  return {
    id: crypto.randomUUID(),
    templateId: template.id,
    templateDay: dayOfWeek,
    name: `${template.name} · ${weekdayName(dayOfWeek)}`.slice(0, 100),
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    notes: template.notes,
    updatedAt: now,
    exercises: entries.map((entry, position) => ({
      id: crypto.randomUUID(),
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      exerciseType: entry.exerciseType,
      position,
      notes: entry.notes,
      targetSets: entry.targetSets,
      targetReps: entry.targetReps,
      targetDurationSeconds: entry.targetDurationSeconds,
      targetDistance: entry.targetDistance,
      targetDistanceUnit: entry.targetDistanceUnit,
      sets: Array.from(
        {
          length:
            entry.exerciseType === 'strength' ? (entry.targetSets ?? 1) : 1,
        },
        (_, setPosition) => createSet(setPosition),
      ),
    })),
  };
}

export function addExercise(workout: Workout, exercise: Exercise): Workout {
  const entry: WorkoutExercise = {
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    exerciseType: exercise.exerciseType,
    position: workout.exercises.length,
    notes: null,
    targetSets: null,
    targetReps: null,
    targetDurationSeconds: null,
    targetDistance: null,
    targetDistanceUnit: 'km',
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

export function finishWorkout(workout: Workout): Workout {
  const now = new Date().toISOString();
  return { ...workout, status: 'completed', completedAt: now, updatedAt: now };
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
