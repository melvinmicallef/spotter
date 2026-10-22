import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  DayOfWeek,
  Exercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutTemplate,
} from '@spotter/shared';

import { weekdayName, WEEKDAYS } from '../weekdays.js';
import { convertDistance, convertWeight } from '../measurement-system.js';
import type { DistanceUnit, WeightUnit } from '../measurement-system.js';
import { ExerciseDetailsModal } from './CatalogueView.js';
import { ExercisePicker } from './ExercisePicker.js';

interface WorkoutViewProps {
  workout?: Workout;
  previousWorkouts: Workout[];
  exercises: Exercise[];
  activeTemplate?: WorkoutTemplate;
  today: DayOfWeek;
  scheduledDay: DayOfWeek;
  weekKey: string;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  onStart: (template: WorkoutTemplate, dayOfWeek: DayOfWeek) => void;
  onSwapToday: (dayOfWeek: DayOfWeek) => void;
  onResetWeek: () => void;
  onShowStretching: () => void;
  onChange: (update: (workout: Workout) => Workout) => void;
  actions: {
    addExercise: (workout: Workout, exercise: Exercise) => Workout;
    removeExercise: (workout: Workout, id: string) => Workout;
    moveExercise: (
      workout: Workout,
      index: number,
      direction: -1 | 1,
    ) => Workout;
    addSet: (workout: Workout, id: string) => Workout;
    removeSet: (workout: Workout, exerciseId: string, setId: string) => Workout;
    updateSet: (
      workout: Workout,
      exerciseId: string,
      setId: string,
      patch: Partial<WorkoutSet>,
    ) => Workout;
    setExerciseCompleted: (
      workout: Workout,
      exerciseId: string,
      completed: boolean,
    ) => Workout;
    finish: (workout: Workout) => Workout;
  };
}

export function WorkoutView({
  workout,
  previousWorkouts,
  exercises,
  activeTemplate,
  today,
  scheduledDay,
  weekKey,
  weightUnit,
  distanceUnit,
  onStart,
  onSwapToday,
  onResetWeek,
  onShowStretching,
  onChange,
  actions,
}: WorkoutViewProps) {
  const [exerciseDetailsId, setExerciseDetailsId] = useState<string | null>(
    null,
  );
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const exerciseDetails = exercises.find(
    (exercise) => exercise.id === exerciseDetailsId,
  );
  const previousSetsByExercise = useMemo(() => {
    const entriesById = new Map<string, WorkoutExercise[]>();
    const entriesByName = new Map<string, WorkoutExercise[]>();
    const sortedWorkouts = [...previousWorkouts]
      .filter((item) => item.status === 'completed')
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));

    for (const previousWorkout of sortedWorkouts) {
      for (const previousExercise of previousWorkout.exercises) {
        if (
          previousExercise.exerciseType !== 'strength' &&
          previousExercise.exerciseType !== 'calisthenics'
        )
          continue;

        const idKey = previousExercise.exerciseId
          ? exerciseIdKey(
              previousExercise.exerciseId,
              previousExercise.exerciseType,
            )
          : null;
        const nameKey = exerciseNameKey(
          previousExercise.exerciseName,
          previousExercise.exerciseType,
        );
        if (idKey) addExerciseHistory(entriesById, idKey, previousExercise);
        addExerciseHistory(entriesByName, nameKey, previousExercise);
      }
    }

    return {
      byId: latestRecordedSets(entriesById),
      byName: latestRecordedSets(entriesByName),
    };
  }, [previousWorkouts]);
  const scheduledDayName = activeTemplate?.dayNames?.find(
    (dayName) => dayName.dayOfWeek === scheduledDay,
  )?.name;
  if (!workout) {
    const scheduledExercises =
      activeTemplate?.exercises.filter(
        (exercise) => exercise.dayOfWeek === scheduledDay,
      ) ?? [];
    return (
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TODAY · {weekdayName(today)}</span>
            <h2>Today&apos;s workout</h2>
          </div>
          <button
            className="secondary"
            type="button"
            onClick={onShowStretching}
          >
            Show stretching
          </button>
        </div>
        {!activeTemplate ? (
          <p className="empty-state">
            Create a weekly template and set it active before starting a
            workout.
          </p>
        ) : (
          <article className="card today-workout-card">
            <div>
              <span className="active-badge">Active plan</span>
              <h3>{activeTemplate.name}</h3>
              {scheduledDayName && (
                <p className="target-summary">{scheduledDayName}</p>
              )}
              {scheduledDay !== today && (
                <p className="notice compact-notice">
                  Using {weekdayName(scheduledDay)}&apos;s workout today for{' '}
                  {weekKey}.
                </p>
              )}
              <p>
                {scheduledExercises.length === 0
                  ? `${weekdayName(scheduledDay)} is a rest day.`
                  : `${scheduledExercises.length} exercise${scheduledExercises.length === 1 ? '' : 's'} scheduled from ${weekdayName(scheduledDay)}.`}
              </p>
              {scheduledExercises.length > 0 && (
                <ol className="scheduled-exercise-list">
                  {scheduledExercises.map((entry) => (
                    <li key={entry.id}>{entry.exerciseName}</li>
                  ))}
                </ol>
              )}
            </div>
            <button
              type="button"
              disabled={scheduledExercises.length === 0}
              onClick={() => onStart(activeTemplate, scheduledDay)}
            >
              Start today&apos;s workout
            </button>
            <div className="week-swap-panel">
              <strong>Swap today for this week</strong>
              <p>
                Choose another day&apos;s plan. The reusable template will not
                be changed.
              </p>
              <div className="day-swap-actions">
                {WEEKDAYS.filter((day) => day.value !== today).map((day) => {
                  const count = activeTemplate.exercises.filter(
                    (entry) => entry.dayOfWeek === day.value,
                  ).length;
                  return (
                    <button
                      className="secondary"
                      type="button"
                      key={day.value}
                      onClick={() => onSwapToday(day.value)}
                    >
                      {day.label} ({count})
                    </button>
                  );
                })}
              </div>
              {scheduledDay !== today && (
                <button
                  className="secondary danger-text"
                  type="button"
                  onClick={onResetWeek}
                >
                  Reset this week&apos;s swaps
                </button>
              )}
            </div>
          </article>
        )}
      </section>
    );
  }

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">IN PROGRESS</span>
          <h2>{workout.name}</h2>
          {workout.templateDayName && (
            <p className="target-summary">{workout.templateDayName}</p>
          )}
        </div>
        <div className="inline-actions">
          <button
            className="secondary"
            type="button"
            onClick={onShowStretching}
          >
            Show stretching
          </button>
          <button
            className="danger"
            type="button"
            onClick={() => onChange(actions.finish)}
          >
            Finish
          </button>
        </div>
      </div>

      <div className="stack">
        {workout.exercises.map((entry, exerciseIndex) => (
          <article
            className={`workout-card${entry.exerciseType !== 'cardio' ? ' workout-strength-card' : ''}${entry.completed ? ' workout-card-completed' : ''}`}
            key={entry.id}
          >
            {entry.completed ? (
              <div className="workout-completed-summary">
                <div className="workout-completed-info">
                  <span className="exercise-index">{exerciseIndex + 1}</span>
                  <WorkoutExerciseTitle
                    name={entry.exerciseName}
                    exerciseId={entry.exerciseId}
                    canOpenGuide={exercises.some(
                      (exercise) => exercise.id === entry.exerciseId,
                    )}
                    onOpen={(exerciseId) => setExerciseDetailsId(exerciseId)}
                  />
                  {entry.exerciseType !== 'strength' && (
                    <small className="type-badge">{entry.exerciseType}</small>
                  )}
                  <span className="workout-completed-badge">Completed</span>
                  <span className="workout-completed-count">
                    {entry.exerciseType === 'cardio'
                      ? '1 result'
                      : `${entry.sets.length} ${entry.sets.length === 1 ? 'set' : 'sets'}`}
                  </span>
                </div>
                <button
                  className="secondary workout-reopen-button"
                  type="button"
                  onClick={() =>
                    onChange((current) =>
                      actions.setExerciseCompleted(current, entry.id, false),
                    )
                  }
                  aria-label={`Reopen ${entry.exerciseName}`}
                >
                  Reopen
                </button>
              </div>
            ) : (
              <>
                <div
                  className={
                    entry.exerciseType !== 'cardio'
                      ? 'workout-strength-info'
                      : 'workout-card-main'
                  }
                >
                  <header>
                    <div>
                      <span className="exercise-index">
                        {exerciseIndex + 1}
                      </span>
                      <WorkoutExerciseTitle
                        name={entry.exerciseName}
                        exerciseId={entry.exerciseId}
                        canOpenGuide={exercises.some(
                          (exercise) => exercise.id === entry.exerciseId,
                        )}
                        onOpen={(exerciseId) =>
                          setExerciseDetailsId(exerciseId)
                        }
                      />
                      {entry.exerciseType !== 'strength' && (
                        <small className="type-badge">
                          {entry.exerciseType}
                        </small>
                      )}
                      {entry.referenceUrl && (
                        <a
                          className="workout-reference-link"
                          href={entry.referenceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Reference ↗
                        </a>
                      )}
                    </div>
                    <div className="inline-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Move ${entry.exerciseName} up`}
                        onClick={() =>
                          onChange((current) =>
                            actions.moveExercise(current, exerciseIndex, -1),
                          )
                        }
                      >
                        ↑
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Move ${entry.exerciseName} down`}
                        onClick={() =>
                          onChange((current) =>
                            actions.moveExercise(current, exerciseIndex, 1),
                          )
                        }
                      >
                        ↓
                      </button>
                      <button
                        className="icon-button danger-text"
                        type="button"
                        aria-label={`Remove ${entry.exerciseName}`}
                        onClick={() =>
                          onChange((current) =>
                            actions.removeExercise(current, entry.id),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  </header>
                  <TargetSummary exercise={entry} distanceUnit={distanceUnit} />
                </div>

                {entry.exerciseType === 'cardio' ? (
                  <CardioWorkout
                    entry={entry}
                    distanceUnit={distanceUnit}
                    onChange={onChange}
                    actions={actions}
                  />
                ) : entry.exerciseType === 'calisthenics' ? (
                  <CalisthenicsSets
                    entry={entry}
                    previousSets={findPreviousSets(
                      previousSetsByExercise,
                      entry,
                    )}
                    onChange={onChange}
                    actions={actions}
                  />
                ) : (
                  <StrengthSets
                    entry={entry}
                    previousSets={findPreviousSets(
                      previousSetsByExercise,
                      entry,
                    )}
                    weightUnit={weightUnit}
                    onChange={onChange}
                    actions={actions}
                  />
                )}
                <button
                  className="secondary workout-complete-button"
                  type="button"
                  onClick={() =>
                    onChange((current) =>
                      actions.setExerciseCompleted(current, entry.id, true),
                    )
                  }
                  aria-label={`Mark ${entry.exerciseName} as completed`}
                >
                  ✓ Mark complete
                </button>
              </>
            )}
          </article>
        ))}
      </div>
      <button
        className="secondary full workout-add-exercise"
        type="button"
        onClick={() => setExercisePickerOpen(true)}
      >
        + Add exercise
      </button>
      {exerciseDetails && (
        <ExerciseDetailsModal
          exercise={exerciseDetails}
          onClose={() => setExerciseDetailsId(null)}
        />
      )}
      {exercisePickerOpen && (
        <ExercisePicker
          contextLabel="workout"
          exercises={exercises}
          getAddedCount={(exerciseId) =>
            workout.exercises.filter((entry) => entry.exerciseId === exerciseId)
              .length
          }
          onAdd={(exercise) =>
            onChange((current) => actions.addExercise(current, exercise))
          }
          onClose={() => setExercisePickerOpen(false)}
        />
      )}
    </section>
  );
}

type WorkoutEntry = Workout['exercises'][number];
type WorkoutActions = WorkoutViewProps['actions'];

function WorkoutExerciseTitle({
  name,
  exerciseId,
  canOpenGuide,
  onOpen,
}: {
  name: string;
  exerciseId: string | null;
  canOpenGuide: boolean;
  onOpen: (exerciseId: string) => void;
}) {
  return canOpenGuide && exerciseId ? (
    <button
      className="workout-exercise-title"
      type="button"
      aria-label={`How to do ${name}`}
      onClick={() => onOpen(exerciseId)}
    >
      {name}
    </button>
  ) : (
    <strong className="workout-exercise-title-static">{name}</strong>
  );
}

function TargetSummary({
  exercise,
  distanceUnit,
}: {
  exercise: WorkoutEntry;
  distanceUnit: DistanceUnit;
}) {
  if (exercise.exerciseType === 'cardio') {
    const target =
      exercise.cardioMode === 'interval'
        ? `Interval · Prep ${formatClock(exercise.intervalPrepSeconds ?? 0)} · Work ${formatClock(exercise.intervalWorkSeconds ?? 0)} · Rest ${formatClock(exercise.intervalRestSeconds ?? 0)} × ${exercise.intervalIterations ?? 0}`
        : exercise.targetDurationSeconds == null
          ? null
          : formatClock(exercise.targetDurationSeconds);
    if (target == null && exercise.targetDistance == null) return null;
    return (
      <p className="target-summary">
        Target:{' '}
        {[
          target,
          exercise.targetDistance == null
            ? null
            : `${convertDistance(exercise.targetDistance, exercise.targetDistanceUnit, distanceUnit)} ${distanceUnit}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    );
  }
  if (exercise.targetSets == null && exercise.targetReps == null) return null;
  return (
    <p className="target-summary">
      Target: {exercise.targetSets ?? '—'} sets × {exercise.targetReps ?? '—'}{' '}
      reps
    </p>
  );
}

function StrengthSets({
  entry,
  previousSets,
  weightUnit,
  onChange,
  actions,
}: {
  entry: WorkoutEntry;
  previousSets: WorkoutSet[];
  weightUnit: WeightUnit;
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  return (
    <div className="workout-strength-sets">
      <div className="strength-workout-grid-scroll">
        <div className="strength-workout-grid">
          {entry.sets.map((set, setIndex) => {
            const previousSet = previousSets[setIndex];
            return (
              <div className="strength-grid-set" key={set.id}>
                <div className="strength-grid-set-heading">
                  <span>Set {setIndex + 1}</span>
                  <RemoveEffort
                    label={`Remove ${entry.exerciseName} set ${setIndex + 1}`}
                    onClick={() =>
                      onChange((current) =>
                        actions.removeSet(current, entry.id, set.id),
                      )
                    }
                  />
                </div>
                <div className="strength-grid-cell strength-grid-weight">
                  <div className="strength-grid-number-unit">
                    <input
                      aria-label={`${entry.exerciseName} weight set ${setIndex + 1}`}
                      placeholder={
                        previousSet?.weight == null
                          ? 'Wt'
                          : String(
                              displayWeight(
                                previousSet.weight,
                                previousSet.weightUnit,
                                weightUnit,
                              ),
                            )
                      }
                      inputMode="decimal"
                      type="number"
                      min="0"
                      value={displayWeight(
                        set.weight,
                        set.weightUnit,
                        weightUnit,
                      )}
                      onChange={(event) =>
                        updateEffort(onChange, actions, entry.id, set.id, {
                          weight:
                            event.target.value === ''
                              ? null
                              : Number(event.target.value),
                          weightUnit,
                        })
                      }
                    />
                    <span className="unit-label">{weightUnit}</span>
                  </div>
                </div>
                <div className="strength-grid-cell strength-grid-reps">
                  <input
                    aria-label={`${entry.exerciseName} repetitions set ${setIndex + 1}`}
                    placeholder={
                      previousSet?.reps == null
                        ? 'Reps'
                        : String(previousSet.reps)
                    }
                    inputMode="numeric"
                    type="number"
                    min="0"
                    value={set.reps ?? ''}
                    onChange={(event) =>
                      updateEffort(onChange, actions, entry.id, set.id, {
                        reps:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
          <div className="strength-grid-add">
            <span className="strength-grid-set-heading">Sets</span>
            <button
              className="secondary"
              type="button"
              onClick={() =>
                onChange((current) => actions.addSet(current, entry.id))
              }
            >
              + Add set
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalisthenicsSets({
  entry,
  previousSets,
  onChange,
  actions,
}: {
  entry: WorkoutEntry;
  previousSets: WorkoutSet[];
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  return (
    <div className="workout-strength-sets">
      <div className="strength-workout-grid-scroll">
        <div className="strength-workout-grid">
          {entry.sets.map((set, setIndex) => {
            const previousSet = previousSets[setIndex];
            return (
              <div
                className="strength-grid-set calisthenics-grid-set"
                key={set.id}
              >
                <div className="strength-grid-set-heading">
                  <span>Set {setIndex + 1}</span>
                  <RemoveEffort
                    label={`Remove ${entry.exerciseName} set ${setIndex + 1}`}
                    onClick={() =>
                      onChange((current) =>
                        actions.removeSet(current, entry.id, set.id),
                      )
                    }
                  />
                </div>
                <div className="strength-grid-cell strength-grid-reps">
                  <input
                    aria-label={`${entry.exerciseName} repetitions set ${setIndex + 1}`}
                    placeholder={
                      previousSet?.reps == null
                        ? 'Reps'
                        : String(previousSet.reps)
                    }
                    inputMode="numeric"
                    type="number"
                    min="0"
                    value={set.reps ?? ''}
                    onChange={(event) =>
                      updateEffort(onChange, actions, entry.id, set.id, {
                        reps:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
          <div className="strength-grid-add calisthenics-grid-add">
            <span className="strength-grid-set-heading">Sets</span>
            <button
              className="secondary"
              type="button"
              onClick={() =>
                onChange((current) => actions.addSet(current, entry.id))
              }
            >
              + Add set
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardioWorkout({
  entry,
  distanceUnit,
  onChange,
  actions,
}: {
  entry: WorkoutEntry;
  distanceUnit: DistanceUnit;
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  const recordedResult = entry.sets[0];
  if (entry.cardioMode === 'interval') {
    return (
      <IntervalTimer
        entry={entry}
        recordedResult={recordedResult}
        distanceUnit={distanceUnit}
        onChange={onChange}
        actions={actions}
      />
    );
  }
  if (!recordedResult) return null;
  return (
    <div className="cardio-workout-inputs">
      <DurationInput
        label={`${entry.exerciseName} duration`}
        value={recordedResult.durationSeconds}
        onChange={(durationSeconds) =>
          updateEffort(onChange, actions, entry.id, recordedResult.id, {
            durationSeconds,
          })
        }
      />
      <label className="cardio-distance-input">
        Distance ({distanceUnit})
        <span className="number-unit">
          <input
            aria-label={`${entry.exerciseName} distance`}
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            value={
              convertDistance(
                recordedResult.distance,
                recordedResult.distanceUnit,
                distanceUnit,
              ) ?? ''
            }
            onChange={(event) =>
              updateEffort(onChange, actions, entry.id, recordedResult.id, {
                distance:
                  event.target.value === '' ? null : Number(event.target.value),
                distanceUnit,
              })
            }
          />
          <span className="unit-label">{distanceUnit}</span>
        </span>
      </label>
    </div>
  );
}

function DurationInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const minutes = value == null ? '' : Math.floor(value / 60);
  const seconds = value == null ? '' : value % 60;
  function updatePart(part: 'minutes' | 'seconds', raw: string) {
    if (raw === '' && value == null) return;
    const nextMinutes =
      part === 'minutes'
        ? Number(raw || 0)
        : minutes === ''
          ? 0
          : Number(minutes);
    const nextSeconds =
      part === 'seconds'
        ? Math.min(59, Number(raw || 0))
        : seconds === ''
          ? 0
          : Number(seconds);
    const total = Math.max(0, nextMinutes * 60 + nextSeconds);
    onChange(total === 0 ? null : total);
  }
  return (
    <fieldset className="duration-input">
      <legend>{label}</legend>
      <label>
        <span className="sr-only">{label} minutes</span>
        <input
          aria-label={`${label} minutes`}
          inputMode="numeric"
          type="number"
          min="0"
          value={minutes}
          onChange={(event) => updatePart('minutes', event.target.value)}
        />
        <span>min</span>
      </label>
      <label>
        <span className="sr-only">{label} seconds</span>
        <input
          aria-label={`${label} seconds`}
          inputMode="numeric"
          type="number"
          min="0"
          max="59"
          value={seconds}
          onChange={(event) => updatePart('seconds', event.target.value)}
        />
        <span>sec</span>
      </label>
    </fieldset>
  );
}

interface IntervalStage {
  name: 'Prep' | 'Work' | 'Rest';
  iteration: number | null;
  durationSeconds: number;
}

interface TimerEvent {
  atMs: number;
  kind: 'countdown' | 'transition';
  number?: number;
}

interface TimerRun {
  status: 'idle' | 'running' | 'paused' | 'complete';
  elapsedMs: number;
  startedAt: number | null;
}

function IntervalTimer({
  entry,
  recordedResult,
  distanceUnit,
  onChange,
  actions,
}: {
  entry: WorkoutEntry;
  recordedResult: WorkoutSet | undefined;
  distanceUnit: DistanceUnit;
  onChange: WorkoutViewProps['onChange'];
  actions: WorkoutActions;
}) {
  const stages = useMemo(() => buildIntervalStages(entry), [entry]);
  const totalMs = stages.reduce(
    (total, stage) => total + stage.durationSeconds * 1000,
    0,
  );
  const timerEvents = useMemo(() => buildTimerEvents(stages), [stages]);
  const checkpointKey = `spotter-interval-timer:${entry.id}`;
  const [run, setRun] = useState<TimerRun>(() =>
    restoreTimerRun(checkpointKey),
  );
  const [displayElapsedMs, setDisplayElapsedMs] = useState(0);
  const [soundReady, setSoundReady] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const playedEvents = useRef(new Set<number>());
  const lastElapsedMs = useRef(0);

  useEffect(() => {
    if (run.status !== 'running' || run.startedAt == null) return;
    const startedAt = run.startedAt;
    const baseElapsed = run.elapsedMs;
    const interval = window.setInterval(() => {
      const elapsedMs = Math.min(
        totalMs,
        baseElapsed + performance.now() - startedAt,
      );
      setDisplayElapsedMs(elapsedMs);
      for (const timerEvent of timerEvents) {
        if (
          timerEvent.atMs <= lastElapsedMs.current ||
          timerEvent.atMs > elapsedMs ||
          playedEvents.current.has(timerEvent.atMs)
        ) {
          continue;
        }
        playedEvents.current.add(timerEvent.atMs);
        if (elapsedMs - timerEvent.atMs < 1_000) {
          playBeep(audioContext.current, timerEvent.number);
        }
      }
      lastElapsedMs.current = elapsedMs;
      if (elapsedMs >= totalMs) {
        window.clearInterval(interval);
        clearTimerCheckpoint(checkpointKey);
        setRun({ status: 'complete', elapsedMs: totalMs, startedAt: null });
        if (recordedResult) {
          const durationSeconds =
            (entry.intervalWorkSeconds ?? 0) * (entry.intervalIterations ?? 0);
          onChange((current) =>
            actions.updateSet(current, entry.id, recordedResult.id, {
              durationSeconds,
              completed: true,
            }),
          );
        }
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [
    actions,
    checkpointKey,
    entry,
    onChange,
    recordedResult,
    run.status,
    run.startedAt,
    run.elapsedMs,
    timerEvents,
    totalMs,
  ]);

  const elapsedMs = run.status === 'running' ? displayElapsedMs : run.elapsedMs;
  const currentStage = stageAtElapsed(stages, elapsedMs);
  const distanceValue = recordedResult
    ? convertDistance(
        recordedResult.distance,
        recordedResult.distanceUnit,
        distanceUnit,
      )
    : null;

  function start() {
    activateAudio();
    const now = performance.now();
    if (run.status === 'paused') {
      lastElapsedMs.current = run.elapsedMs;
      saveTimerCheckpoint(checkpointKey, {
        status: 'running',
        elapsedMs: run.elapsedMs,
        startedAtWallMs: Date.now(),
      });
      setRun({ ...run, status: 'running', startedAt: now });
      return;
    }
    playedEvents.current.clear();
    lastElapsedMs.current = -1;
    setDisplayElapsedMs(0);
    saveTimerCheckpoint(checkpointKey, {
      status: 'running',
      elapsedMs: 0,
      startedAtWallMs: Date.now(),
    });
    setRun({ status: 'running', elapsedMs: 0, startedAt: now });
  }

  function reset() {
    clearTimerCheckpoint(checkpointKey);
    setRun({ status: 'idle', elapsedMs: 0, startedAt: null });
    setDisplayElapsedMs(0);
    playedEvents.current.clear();
    lastElapsedMs.current = 0;
  }

  function pause() {
    const nowElapsed = Math.min(
      totalMs,
      run.elapsedMs +
        (run.startedAt == null ? 0 : performance.now() - run.startedAt),
    );
    saveTimerCheckpoint(checkpointKey, {
      status: 'paused',
      elapsedMs: nowElapsed,
      startedAtWallMs: null,
    });
    setRun({ status: 'paused', elapsedMs: nowElapsed, startedAt: null });
    setDisplayElapsedMs(nowElapsed);
    lastElapsedMs.current = nowElapsed;
  }

  return (
    <div className="cardio-interval-workout">
      {recordedResult && (
        <label className="cardio-distance-input">
          Distance ({distanceUnit})
          <span className="number-unit">
            <input
              aria-label={`${entry.exerciseName} distance`}
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              value={distanceValue ?? ''}
              onChange={(event) =>
                updateEffort(onChange, actions, entry.id, recordedResult.id, {
                  distance:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                  distanceUnit,
                })
              }
            />
            <span className="unit-label">{distanceUnit}</span>
          </span>
        </label>
      )}
      <div className="interval-timer" aria-live="polite">
        <div className="interval-timer-readout">
          <span>
            {currentStage?.stage.name ??
              (run.status === 'complete' ? 'Complete' : 'Ready')}
          </span>
          {currentStage?.stage.iteration != null && (
            <small>
              Round {currentStage.stage.iteration} of {entry.intervalIterations}
            </small>
          )}
          <strong>{formatClock(currentStage?.remainingSeconds ?? 0)}</strong>
        </div>
        <div className="inline-actions">
          {run.status === 'running' ? (
            <button className="secondary" type="button" onClick={pause}>
              Pause
            </button>
          ) : (
            <button type="button" onClick={start}>
              {run.status === 'paused'
                ? 'Resume timer'
                : run.status === 'complete'
                  ? 'Start again'
                  : 'Start interval timer'}
            </button>
          )}
          {run.status === 'running' &&
            !soundReady &&
            typeof window.AudioContext !== 'undefined' && (
              <button
                className="secondary"
                type="button"
                onClick={activateAudio}
              >
                Enable beeps
              </button>
            )}
          {run.status !== 'idle' && (
            <button className="secondary" type="button" onClick={reset}>
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );

  function activateAudio() {
    try {
      let context = audioContext.current;
      if (context == null && typeof window.AudioContext !== 'undefined') {
        context = new window.AudioContext();
        audioContext.current = context;
      }
      if (context?.state === 'suspended') {
        void context
          .resume()
          .then(() => setSoundReady(context?.state === 'running'))
          .catch(() => setSoundReady(false));
      } else {
        setSoundReady(context?.state === 'running');
      }
    } catch {
      setSoundReady(false);
    }
  }
}

function restoreTimerRun(key: string): TimerRun {
  const idle: TimerRun = { status: 'idle', elapsedMs: 0, startedAt: null };
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return idle;
    const checkpoint = JSON.parse(saved) as {
      status?: unknown;
      elapsedMs?: unknown;
      startedAtWallMs?: unknown;
    };
    const elapsedMs = Number(checkpoint.elapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return idle;
    if (checkpoint.status === 'paused') {
      return { status: 'paused', elapsedMs, startedAt: null };
    }
    if (
      checkpoint.status === 'running' &&
      typeof checkpoint.startedAtWallMs === 'number' &&
      Number.isFinite(checkpoint.startedAtWallMs)
    ) {
      const elapsedSinceStart = Math.max(
        0,
        Date.now() - checkpoint.startedAtWallMs,
      );
      return {
        status: 'running',
        elapsedMs,
        startedAt: performance.now() - elapsedSinceStart,
      };
    }
  } catch {
    return idle;
  }
  return idle;
}

function saveTimerCheckpoint(
  key: string,
  checkpoint: {
    status: 'running' | 'paused';
    elapsedMs: number;
    startedAtWallMs: number | null;
  },
) {
  try {
    localStorage.setItem(key, JSON.stringify(checkpoint));
  } catch {
    // The timer continues if local browser storage is unavailable.
  }
}

function clearTimerCheckpoint(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // The timer continues if local browser storage is unavailable.
  }
}

function buildIntervalStages(entry: WorkoutEntry): IntervalStage[] {
  const iterations = entry.intervalIterations ?? 1;
  const stages: IntervalStage[] = [];
  if ((entry.intervalPrepSeconds ?? 0) > 0) {
    stages.push({
      name: 'Prep',
      iteration: null,
      durationSeconds: entry.intervalPrepSeconds!,
    });
  }
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    stages.push({
      name: 'Work',
      iteration,
      durationSeconds: entry.intervalWorkSeconds ?? 1,
    });
    if (iteration < iterations && (entry.intervalRestSeconds ?? 0) > 0) {
      stages.push({
        name: 'Rest',
        iteration,
        durationSeconds: entry.intervalRestSeconds!,
      });
    }
  }
  return stages;
}

function buildTimerEvents(stages: IntervalStage[]): TimerEvent[] {
  const events: TimerEvent[] = [];
  let stageStartMs = 0;
  stages.forEach((stage, index) => {
    if (index > 0) events.push({ atMs: stageStartMs, kind: 'transition' });
    for (
      let count = Math.min(5, stage.durationSeconds);
      count >= 1;
      count -= 1
    ) {
      events.push({
        atMs: stageStartMs + (stage.durationSeconds - count) * 1000,
        kind: 'countdown',
        number: count,
      });
    }
    stageStartMs += stage.durationSeconds * 1000;
  });
  if (stages.length > 0)
    events.push({ atMs: stageStartMs, kind: 'transition' });
  return events.sort((left, right) => left.atMs - right.atMs);
}

function stageAtElapsed(stages: IntervalStage[], elapsedMs: number) {
  let stageStartMs = 0;
  for (const stage of stages) {
    const stageEndMs = stageStartMs + stage.durationSeconds * 1000;
    if (elapsedMs < stageEndMs) {
      return {
        stage,
        remainingSeconds: Math.ceil((stageEndMs - elapsedMs) / 1000),
      };
    }
    stageStartMs = stageEndMs;
  }
  return undefined;
}

function playBeep(context: AudioContext | null, number?: number) {
  if (!context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = number == null ? 880 : 440 + (6 - number) * 45;
  volume.gain.setValueAtTime(0.0001, context.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.17);
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateEffort(
  onChange: WorkoutViewProps['onChange'],
  actions: WorkoutActions,
  exerciseId: string,
  effortId: string,
  patch: Partial<WorkoutSet>,
) {
  onChange((current) =>
    actions.updateSet(current, exerciseId, effortId, patch),
  );
}

function RemoveEffort({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-button danger-text"
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      ×
    </button>
  );
}

function displayWeight(
  weight: number | null,
  recordedUnit: WorkoutSet['weightUnit'],
  displayUnit: WeightUnit,
) {
  return convertWeight(weight, recordedUnit, displayUnit) ?? '';
}

type PreviousSetsIndex = {
  byId: Map<string, WorkoutSet[]>;
  byName: Map<string, WorkoutSet[]>;
};

function addExerciseHistory(
  index: Map<string, WorkoutExercise[]>,
  key: string,
  exercise: WorkoutExercise,
) {
  const entries = index.get(key);
  if (entries) entries.push(exercise);
  else index.set(key, [exercise]);
}

function latestRecordedSets(
  index: Map<string, WorkoutExercise[]>,
): Map<string, WorkoutSet[]> {
  const result = new Map<string, WorkoutSet[]>();
  for (const [key, entries] of index) {
    const latestWithValues = entries.find((entry) =>
      entry.sets.some(
        (set) =>
          set.reps != null ||
          (entry.exerciseType === 'strength' && set.weight != null),
      ),
    );
    if (latestWithValues) {
      result.set(
        key,
        [...latestWithValues.sets].sort(
          (left, right) => left.position - right.position,
        ),
      );
    }
  }
  return result;
}

function findPreviousSets(
  index: PreviousSetsIndex,
  exercise: WorkoutExercise,
): WorkoutSet[] {
  const byId = exercise.exerciseId
    ? index.byId.get(exerciseIdKey(exercise.exerciseId, exercise.exerciseType))
    : undefined;
  return (
    byId ??
    index.byName.get(
      exerciseNameKey(exercise.exerciseName, exercise.exerciseType),
    ) ??
    []
  );
}

function exerciseIdKey(id: string, type: Exercise['exerciseType']) {
  return `${type}:${id}`;
}

function exerciseNameKey(name: string, type: Exercise['exerciseType']) {
  return `${type}:${name.trim().toLocaleLowerCase()}`;
}
