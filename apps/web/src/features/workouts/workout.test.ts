import { describe, expect, it } from 'vitest';

import type { Exercise, WorkoutTemplate } from '@spotter/shared';

import {
  addExercise,
  addSet,
  createWorkout,
  finishWorkout,
  updateIntervalSettings,
  updateSet,
  updateWorkoutNotes,
} from './workout.js';

const now = new Date().toISOString();
const strengthExercise: Exercise = {
  id: crypto.randomUUID(),
  name: 'Deadlift',
  exerciseType: 'strength',
  preparation: null,
  execution: null,
  comments: null,
  referenceUrl: 'https://exrx.net/example',
  muscles: [],
  media: null,
  source: null,
  createdAt: now,
  updatedAt: now,
};
const cardioExercise: Exercise = {
  ...strengthExercise,
  id: crypto.randomUUID(),
  name: 'Outdoor run',
  exerciseType: 'cardio',
};

const template: WorkoutTemplate = {
  id: crypto.randomUUID(),
  name: 'Weekly plan',
  isActive: true,
  notes: null,
  exercises: [
    templateEntry(strengthExercise, 1, 0, { targetSets: 3, targetReps: 5 }),
    templateEntry(cardioExercise, 2, 0, {
      targetDurationSeconds: 1_800,
      targetDistance: 5,
    }),
  ],
  createdAt: now,
  updatedAt: now,
};

describe('local workout commands', () => {
  it('creates only the selected weekday as an independent snapshot', () => {
    const workout = createWorkout(template, 1);
    expect(workout.templateId).toBe(template.id);
    expect(workout.templateDay).toBe(1);
    expect(workout.name).toContain('Monday');
    expect(workout.exercises).toHaveLength(1);
    expect(workout.exercises[0]?.exerciseName).toBe('Deadlift');
    expect(workout.exercises[0]?.sets).toHaveLength(3);
  });

  it('creates cardio efforts with duration and distance targets', () => {
    const workout = createWorkout(template, 2);
    expect(workout.exercises).toHaveLength(1);
    expect(workout.exercises[0]).toMatchObject({
      exerciseType: 'cardio',
      targetDurationSeconds: 1_800,
      targetDistance: 5,
    });
    expect(workout.exercises[0]?.sets).toHaveLength(1);
  });

  it('starts interval cardio with defaults, then reuses its last execution', () => {
    const intervalTemplate: WorkoutTemplate = {
      ...template,
      exercises: [
        templateEntry(cardioExercise, 1, 0, {
          cardioMode: 'interval',
          intervalPrepSeconds: 120,
          intervalWorkSeconds: 120,
          intervalRestSeconds: 120,
          intervalIterations: 12,
        }),
      ],
    };
    const firstWorkout = createWorkout(intervalTemplate, 1);
    expect(firstWorkout.exercises[0]).toMatchObject({
      intervalPrepSeconds: 0,
      intervalWorkSeconds: 30,
      intervalRestSeconds: 30,
      intervalIterations: 8,
    });

    let completedWorkout = updateIntervalSettings(
      firstWorkout,
      firstWorkout.exercises[0]!.id,
      {
        intervalPrepSeconds: 15,
        intervalWorkSeconds: 45,
        intervalRestSeconds: 20,
        intervalIterations: 6,
      },
    );
    completedWorkout = {
      ...completedWorkout,
      status: 'completed',
      startedAt: '2026-01-01T10:00:00.000Z',
    };
    const latestWorkout = {
      ...completedWorkout,
      id: crypto.randomUUID(),
      startedAt: '2026-02-01T10:00:00.000Z',
      exercises: completedWorkout.exercises.map((exercise) => ({
        ...exercise,
        intervalPrepSeconds: 25,
        intervalWorkSeconds: 60,
        intervalRestSeconds: 15,
        intervalIterations: 5,
      })),
    };
    const nextTemplate: WorkoutTemplate = {
      ...intervalTemplate,
      id: crypto.randomUUID(),
      exercises: [
        templateEntry(cardioExercise, 2, 0, {
          cardioMode: 'interval',
          intervalPrepSeconds: null,
          intervalWorkSeconds: null,
          intervalRestSeconds: null,
          intervalIterations: null,
        }),
      ],
    };

    const nextWorkout = createWorkout(nextTemplate, 2, [
      latestWorkout,
      completedWorkout,
    ]);
    expect(nextWorkout.exercises[0]).toMatchObject({
      intervalPrepSeconds: 25,
      intervalWorkSeconds: 60,
      intervalRestSeconds: 15,
      intervalIterations: 5,
    });
  });

  it('keeps rapid mutations monotonic so later edits cannot be stale', () => {
    const initial = createWorkout(template, 1);
    const first = updateWorkoutNotes(initial, 'first');
    const second = updateWorkoutNotes(first, 'second');

    expect(Date.parse(first.updatedAt)).toBeGreaterThan(
      Date.parse(initial.updatedAt),
    );
    expect(Date.parse(second.updatedAt)).toBeGreaterThan(
      Date.parse(first.updatedAt),
    );
    expect(second.notes).toBe('second');
  });

  it('adds and updates strength sets before completing the workout', () => {
    let workout = addExercise(createWorkout(template, 2), strengthExercise);
    const workoutExercise = workout.exercises[1]!;
    workout = addSet(workout, workoutExercise.id);
    workout = updateSet(
      workout,
      workoutExercise.id,
      workoutExercise.sets[0]!.id,
      {
        reps: 5,
        weight: 100,
        completed: true,
      },
    );
    workout = finishWorkout(workout);
    expect(workout.exercises[1]?.sets).toHaveLength(1);
    expect(workout.exercises[1]?.sets[0]?.weight).toBe(100);
    expect(workout.status).toBe('completed');
    expect(workout.completedAt).not.toBeNull();
  });

  it('removes empty and zeroed strength sets before finishing', () => {
    let workout = createWorkout(template, 1);
    const exercise = workout.exercises[0]!;
    const [recordedSet, zeroedSet, emptySet] = exercise.sets;
    workout = updateSet(workout, exercise.id, recordedSet!.id, {
      reps: 8,
      weight: 60,
    });
    workout = updateSet(workout, exercise.id, zeroedSet!.id, {
      reps: 0,
      weight: 0,
    });

    const finished = finishWorkout(workout);
    expect(finished.exercises[0]?.sets).toHaveLength(1);
    expect(finished.exercises[0]?.sets[0]).toMatchObject({
      id: recordedSet?.id,
      position: 0,
      reps: 8,
      weight: 60,
    });
    expect(finished.exercises[0]?.sets[0]?.id).not.toBe(emptySet?.id);
  });

  it('rejects a strength set that has only weight or reps', () => {
    const initial = createWorkout(template, 1);
    const exercise = initial.exercises[0]!;
    const partial = updateSet(initial, exercise.id, exercise.sets[0]!.id, {
      reps: 8,
    });

    expect(() => finishWorkout(partial)).toThrow(
      'A strength set needs both weight and reps, or neither.',
    );
  });
});

function templateEntry(
  exercise: Exercise,
  dayOfWeek: number,
  position: number,
  targets: Partial<WorkoutTemplate['exercises'][number]>,
): WorkoutTemplate['exercises'][number] {
  return {
    id: crypto.randomUUID(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    exerciseType: exercise.exerciseType,
    referenceUrl: exercise.referenceUrl,
    dayOfWeek,
    position,
    targetSets: null,
    targetReps: null,
    targetDurationSeconds: null,
    targetDistance: null,
    targetDistanceUnit: 'km',
    ...targets,
  };
}
