import type {
  Exercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutTemplate,
} from '@spotter/shared';

export function createWorkout(template?: WorkoutTemplate): Workout {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    templateId: template?.id ?? null,
    name: template?.name ?? 'Open workout',
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    notes: template?.notes ?? null,
    updatedAt: now,
    exercises:
      template?.exercises.map((entry, position) => ({
        id: crypto.randomUUID(),
        exerciseId: entry.exerciseId,
        exerciseName: entry.exerciseName,
        position,
        notes: entry.notes,
        targetSets: entry.targetSets,
        targetReps: entry.targetReps,
        sets: Array.from({ length: entry.targetSets ?? 1 }, (_, setPosition) =>
          createSet(setPosition),
        ),
      })) ?? [],
  };
}

export function addExercise(workout: Workout, exercise: Exercise): Workout {
  const entry: WorkoutExercise = {
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    position: workout.exercises.length,
    notes: null,
    targetSets: null,
    targetReps: null,
    sets: [createSet(0)],
  };
  return touch({ ...workout, exercises: [...workout.exercises, entry] });
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
  return { ...workout, updatedAt: new Date().toISOString() };
}
