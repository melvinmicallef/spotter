import { describe, expect, it } from 'vitest';

import type { Exercise, WorkoutTemplate } from '@spotter/shared';

import {
  addExercise,
  addSet,
  createWorkout,
  finishWorkout,
  updateSet,
} from './workout.js';

const now = new Date().toISOString();
const exercise: Exercise = {
  id: crypto.randomUUID(),
  name: 'Deadlift',
  instructions: null,
  muscles: [],
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
