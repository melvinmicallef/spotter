import { z } from 'zod';

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();
export const nameSchema = z.string().trim().min(1).max(100);
export const nullableNoteSchema = z
  .string()
  .trim()
  .max(2_000)
  .nullable()
  .default(null);

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ready'),
  timestamp: isoDateTimeSchema,
});

export const versionResponseSchema = z.object({
  name: z.literal('spotter'),
  version: z.string().min(1),
  commit: z.string().min(1),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

export const muscleSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const muscleInputSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
});
export const muscleRoleSchema = z.enum(['primary', 'secondary']);

export const exerciseMuscleSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  role: muscleRoleSchema,
});

export const exerciseSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  instructions: nullableNoteSchema,
  muscles: z.array(exerciseMuscleSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const exerciseInputSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
  instructions: nullableNoteSchema,
  muscles: z
    .array(z.object({ muscleId: uuidSchema, role: muscleRoleSchema }))
    .max(30)
    .default([])
    .refine(
      (links) =>
        new Set(links.map((link) => link.muscleId)).size === links.length,
      'A muscle can only be linked once',
    ),
});

export const templateExerciseSchema = z.object({
  id: uuidSchema,
  exerciseId: uuidSchema,
  exerciseName: nameSchema,
  position: z.number().int().nonnegative(),
  notes: nullableNoteSchema,
  targetSets: z.number().int().positive().max(99).nullable(),
  targetReps: z.number().int().positive().max(999).nullable(),
});

export const workoutTemplateSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  notes: nullableNoteSchema,
  exercises: z.array(templateExerciseSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const workoutTemplateInputSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
  notes: nullableNoteSchema,
  exercises: z
    .array(
      z.object({
        id: uuidSchema.optional(),
        exerciseId: uuidSchema,
        notes: nullableNoteSchema,
        targetSets: z
          .number()
          .int()
          .positive()
          .max(99)
          .nullable()
          .default(null),
        targetReps: z
          .number()
          .int()
          .positive()
          .max(999)
          .nullable()
          .default(null),
      }),
    )
    .max(100)
    .default([]),
});

export const weightUnitSchema = z.enum(['kg', 'lb']);
export const workoutSetSchema = z.object({
  id: uuidSchema,
  position: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative().max(9_999).nullable(),
  weight: z.number().nonnegative().max(100_000).nullable(),
  weightUnit: weightUnitSchema,
  notes: nullableNoteSchema,
  completed: z.boolean(),
});

export const workoutExerciseSchema = z.object({
  id: uuidSchema,
  exerciseId: uuidSchema.nullable(),
  exerciseName: nameSchema,
  position: z.number().int().nonnegative(),
  notes: nullableNoteSchema,
  targetSets: z.number().int().positive().max(99).nullable(),
  targetReps: z.number().int().positive().max(999).nullable(),
  sets: z.array(workoutSetSchema).max(200),
});

export const workoutStatusSchema = z.enum(['in_progress', 'completed']);
export const workoutSchema = z.object({
  id: uuidSchema,
  templateId: uuidSchema.nullable(),
  name: nameSchema,
  status: workoutStatusSchema,
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  notes: nullableNoteSchema,
  updatedAt: isoDateTimeSchema,
  exercises: z.array(workoutExerciseSchema).max(200),
});

export const syncOperationSchema = z.object({
  operationId: uuidSchema,
  kind: z.literal('upsert_workout'),
  createdAt: isoDateTimeSchema,
  workout: workoutSchema,
});

export const syncBatchSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(50),
});
export const syncResultSchema = z.object({
  operationId: uuidSchema,
  status: z.enum(['applied', 'duplicate', 'rejected']),
  error: apiErrorSchema.shape.error.optional(),
});
export const syncResponseSchema = z.object({
  results: z.array(syncResultSchema),
});

export const referenceDataSchema = z.object({
  revision: z.number().int().nonnegative(),
  changed: z.boolean(),
  muscles: z.array(muscleSchema),
  exercises: z.array(exerciseSchema),
  templates: z.array(workoutTemplateSchema),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type VersionResponse = z.infer<typeof versionResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type Muscle = z.infer<typeof muscleSchema>;
export type MuscleInput = z.infer<typeof muscleInputSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseInput = z.infer<typeof exerciseInputSchema>;
export type WorkoutTemplate = z.infer<typeof workoutTemplateSchema>;
export type WorkoutTemplateInput = z.infer<typeof workoutTemplateInputSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type WorkoutSet = z.infer<typeof workoutSetSchema>;
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncBatch = z.infer<typeof syncBatchSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type ReferenceData = z.infer<typeof referenceDataSchema>;
