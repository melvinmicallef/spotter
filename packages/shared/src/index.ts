import { z } from 'zod';

export { BUILT_IN_MUSCLES } from './muscles.js';

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();
export const nameSchema = z.string().trim().min(1).max(100);
export const nullableNoteSchema = z
  .string()
  .trim()
  .max(2_000)
  .nullable()
  .default(null);
export const httpUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'Only HTTP and HTTPS URLs are supported',
  });

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
  group: nameSchema.default('Legacy'),
  subgroup: nameSchema.nullable().default(null),
  referenceUrl: httpUrlSchema.nullable().default(null),
  isBuiltin: z.boolean().default(false),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const muscleRoleSchema = z.enum(['primary', 'secondary']);
export const exerciseTypeSchema = z.enum([
  'strength',
  'calisthenics',
  'cardio',
]);
export const distanceUnitSchema = z.enum(['km', 'mi']);
export const dayOfWeekSchema = z.number().int().min(1).max(7);
export const templateDayNameSchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  name: nameSchema,
});
export const templateDayNamesSchema = z
  .array(templateDayNameSchema)
  .max(7)
  .refine(
    (dayNames) =>
      new Set(dayNames.map((dayName) => dayName.dayOfWeek)).size ===
      dayNames.length,
    'A template can only have one name per day',
  );

export const exerciseMuscleSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  group: nameSchema.default('Legacy'),
  subgroup: nameSchema.nullable().default(null),
  role: muscleRoleSchema,
});

export const exerciseMediaSchema = z.object({
  id: uuidSchema,
  kind: z.literal('image'),
  url: z.string().startsWith('/api/media/'),
  mimeType: z.enum(['image/gif', 'image/png', 'image/jpeg']),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
  originalName: z.string().trim().min(1).max(255),
  createdAt: isoDateTimeSchema,
});

export const appSettingsSchema = z.object({
  stretchingPoster: exerciseMediaSchema.nullable(),
});

export const appSettingsInputSchema = z.object({
  stretchingPosterId: uuidSchema.nullable(),
});

export const exerciseSourceSchema = z.object({
  url: httpUrlSchema,
  title: z.string().trim().max(300).nullable(),
  mediaUrl: httpUrlSchema.nullable(),
  importedAt: isoDateTimeSchema,
});

export const exerciseSourceInputSchema = exerciseSourceSchema.omit({
  importedAt: true,
});

export const exerciseSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  exerciseType: exerciseTypeSchema.default('strength'),
  preparation: nullableNoteSchema,
  execution: nullableNoteSchema,
  comments: nullableNoteSchema,
  referenceUrl: httpUrlSchema.nullable().default(null),
  muscles: z.array(exerciseMuscleSchema),
  media: exerciseMediaSchema.nullable(),
  source: exerciseSourceSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const exerciseInputSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
  exerciseType: exerciseTypeSchema.default('strength'),
  preparation: nullableNoteSchema,
  execution: nullableNoteSchema,
  comments: nullableNoteSchema,
  referenceUrl: httpUrlSchema.nullable().default(null),
  mediaId: uuidSchema.nullable().default(null),
  source: exerciseSourceInputSchema.nullable().default(null),
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

export const templateExerciseSchema = z
  .object({
    id: uuidSchema,
    exerciseId: uuidSchema,
    exerciseName: nameSchema,
    exerciseType: exerciseTypeSchema.default('strength'),
    referenceUrl: httpUrlSchema.nullable().default(null),
    dayOfWeek: dayOfWeekSchema.default(1),
    position: z.number().int().nonnegative(),
    targetSets: z.number().int().positive().max(99).nullable(),
    targetReps: z.number().int().positive().max(999).nullable(),
    targetDurationSeconds: z
      .number()
      .int()
      .positive()
      .max(7 * 24 * 60 * 60)
      .nullable()
      .default(null),
    targetDistance: z.number().positive().max(100_000).nullable().default(null),
    targetDistanceUnit: distanceUnitSchema.default('km'),
  })
  .superRefine((exercise, context) => {
    validateTargetMetrics(exercise, context);
  });

export const workoutTemplateSchema = z.object({
  id: uuidSchema,
  name: nameSchema,
  isActive: z.boolean(),
  notes: nullableNoteSchema,
  dayNames: templateDayNamesSchema.optional(),
  exercises: z.array(templateExerciseSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const workoutTemplateInputSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
  isActive: z.boolean().default(false),
  notes: nullableNoteSchema,
  dayNames: templateDayNamesSchema.optional(),
  exercises: z
    .array(
      z.object({
        id: uuidSchema.optional(),
        exerciseId: uuidSchema,
        dayOfWeek: dayOfWeekSchema.default(1),
        notes: nullableNoteSchema.optional(),
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
        targetDurationSeconds: z
          .number()
          .int()
          .positive()
          .max(7 * 24 * 60 * 60)
          .nullable()
          .default(null),
        targetDistance: z
          .number()
          .positive()
          .max(100_000)
          .nullable()
          .default(null),
        targetDistanceUnit: distanceUnitSchema.default('km'),
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
  durationSeconds: z
    .number()
    .int()
    .nonnegative()
    .max(7 * 24 * 60 * 60)
    .nullable()
    .default(null),
  distance: z.number().nonnegative().max(100_000).nullable().default(null),
  distanceUnit: distanceUnitSchema.default('km'),
  notes: nullableNoteSchema,
  completed: z.boolean(),
});

export const workoutExerciseSchema = z
  .object({
    id: uuidSchema,
    exerciseId: uuidSchema.nullable(),
    exerciseName: nameSchema,
    exerciseType: exerciseTypeSchema.default('strength'),
    referenceUrl: httpUrlSchema.nullable().default(null),
    position: z.number().int().nonnegative(),
    notes: nullableNoteSchema,
    targetSets: z.number().int().positive().max(99).nullable(),
    targetReps: z.number().int().positive().max(999).nullable(),
    targetDurationSeconds: z
      .number()
      .int()
      .positive()
      .max(7 * 24 * 60 * 60)
      .nullable()
      .default(null),
    targetDistance: z.number().positive().max(100_000).nullable().default(null),
    targetDistanceUnit: distanceUnitSchema.default('km'),
    completed: z.boolean().optional(),
    sets: z.array(workoutSetSchema).max(200),
  })
  .superRefine((exercise, context) => {
    validateTargetMetrics(exercise, context);
    exercise.sets.forEach((set, index) => {
      if (
        exercise.exerciseType !== 'cardio' &&
        (set.durationSeconds !== null || set.distance !== null)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['sets', index],
          message: 'Strength sets cannot contain duration or distance',
        });
      }
      if (
        exercise.exerciseType === 'cardio' &&
        (set.reps !== null || set.weight !== null)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['sets', index],
          message: 'Cardio sets cannot contain reps or weight',
        });
      }
      if (exercise.exerciseType === 'calisthenics' && set.weight !== null) {
        context.addIssue({
          code: 'custom',
          path: ['sets', index, 'weight'],
          message: 'Calisthenics sets cannot contain weight',
        });
      }
    });
  });

function validateTargetMetrics(
  exercise: {
    exerciseType: z.infer<typeof exerciseTypeSchema>;
    targetSets: number | null;
    targetReps: number | null;
    targetDurationSeconds: number | null;
    targetDistance: number | null;
  },
  context: z.RefinementCtx,
) {
  if (
    exercise.exerciseType !== 'cardio' &&
    (exercise.targetDurationSeconds !== null ||
      exercise.targetDistance !== null)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['exerciseType'],
      message:
        exercise.exerciseType === 'calisthenics'
          ? 'Calisthenics exercises cannot contain duration or distance targets'
          : 'Strength exercises cannot contain duration or distance targets',
    });
  }
  if (
    exercise.exerciseType === 'cardio' &&
    (exercise.targetSets !== null || exercise.targetReps !== null)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['exerciseType'],
      message: 'Cardio exercises cannot contain set or rep targets',
    });
  }
}

export const workoutStatusSchema = z.enum(['in_progress', 'completed']);
export const workoutSchema = z.object({
  id: uuidSchema,
  templateId: uuidSchema.nullable(),
  templateDay: dayOfWeekSchema.nullable().default(null),
  templateDayName: nameSchema.nullable().optional(),
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
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseInput = z.infer<typeof exerciseInputSchema>;
export type ExerciseType = z.infer<typeof exerciseTypeSchema>;
export type DistanceUnit = z.infer<typeof distanceUnitSchema>;
export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;
export type ExerciseMedia = z.infer<typeof exerciseMediaSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type AppSettingsInput = z.infer<typeof appSettingsInputSchema>;
export type ExerciseSource = z.infer<typeof exerciseSourceSchema>;
export type WorkoutTemplate = z.infer<typeof workoutTemplateSchema>;
export type WorkoutTemplateInput = z.infer<typeof workoutTemplateInputSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type WorkoutSet = z.infer<typeof workoutSetSchema>;
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncBatch = z.infer<typeof syncBatchSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type ReferenceData = z.infer<typeof referenceDataSchema>;
