import { describe, expect, it } from 'vitest';

import type { Exercise, WorkoutTemplate } from '@spotter/shared';

import {
  addExercise,
  addSet,
  createWorkout,
  finishWorkout,
  updateSet,
  updateWorkoutNotes,
} from './workout.js';

const now = new Date().toISOString();
const strengthExercise: Exercise = {
  id: crypto.randomUUID(),
  name: 'Deadlift',
  exerciseType: 'strength',
  instructions: null,
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
    expect(workout.exercises[1]?.sets).toHaveLength(2);
    expect(workout.exercises[1]?.sets[0]?.weight).toBe(100);
    expect(workout.status).toBe('completed');
    expect(workout.completedAt).not.toBeNull();
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
    dayOfWeek,
    position,
    notes: null,
    targetSets: null,
    targetReps: null,
    targetDurationSeconds: null,
    targetDistance: null,
    targetDistanceUnit: 'km',
    ...targets,
  };
}
