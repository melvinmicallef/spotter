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
const exercise: Exercise = {
  id: crypto.randomUUID(),
  name: 'Deadlift',
  instructions: null,
  muscles: [],
  media: null,
  source: null,
  createdAt: now,
  updatedAt: now,
};

describe('local workout commands', () => {
  it('creates an independent snapshot from a template', () => {
    const template: WorkoutTemplate = {
      id: crypto.randomUUID(),
      name: 'Pull day',
      notes: null,
      exercises: [
        {
          id: crypto.randomUUID(),
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          position: 0,
          notes: null,
          targetSets: 3,
          targetReps: 5,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    const workout = createWorkout(template);
    expect(workout.templateId).toBe(template.id);
    expect(workout.exercises[0]?.exerciseName).toBe('Deadlift');
    expect(workout.exercises[0]?.sets).toHaveLength(3);
  });

  it('keeps rapid mutations monotonic so later edits cannot be stale', () => {
    const initial = createWorkout();
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

  it('adds and updates sets before completing the workout', () => {
    let workout = addExercise(createWorkout(), exercise);
    const workoutExercise = workout.exercises[0]!;
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
    expect(workout.exercises[0]?.sets).toHaveLength(2);
    expect(workout.exercises[0]?.sets[0]?.weight).toBe(100);
    expect(workout.status).toBe('completed');
    expect(workout.completedAt).not.toBeNull();
  });
});
