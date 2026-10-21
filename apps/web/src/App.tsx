import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  Exercise,
  Muscle,
  Workout,
  WorkoutTemplate,
} from '@spotter/shared';

import { api } from './api.js';
import { CatalogueView } from './components/CatalogueView.js';
import { HistoryView } from './components/HistoryView.js';
import { PwaUpdate } from './components/PwaUpdate.js';
import { StatusBar } from './components/StatusBar.js';
import { TemplatesView } from './components/TemplatesView.js';
import { WorkoutView } from './components/WorkoutView.js';
import { localRepository } from './db.js';
import { drainOutbox, refreshReferences } from './sync.js';
import {
  addExercise,
  addSet,
  createWorkout,
  finishWorkout,
  moveExercise,
  removeExercise,
  removeSet,
  updateExerciseNotes,
  updateSet,
  updateWorkoutNotes,
} from './workout.js';

type View = 'workout' | 'history' | 'catalogue' | 'templates';

export function App() {
  const [view, setView] = useState<View>('workout');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [activeWorkout, setActiveWorkout] = useState<Workout>();
  const [localWorkouts, setLocalWorkouts] = useState<Workout[]>([]);
  const [serverWorkouts, setServerWorkouts] = useState<Workout[]>([]);
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [pending, setPending] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncErrorDetails, setSyncErrorDetails] = useState<unknown>();
  const [retryAfterMs, setRetryAfterMs] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const activeWorkoutRef = useRef<Workout | undefined>(undefined);
  const saveQueueRef = useRef(Promise.resolve());

  const loadLocal = useCallback(async () => {
    const [active, workouts, references, outbox] = await Promise.all([
      localRepository.activeWorkout(),
      localRepository.workouts(),
      localRepository.references(),
      localRepository.outbox(Number.MAX_SAFE_INTEGER),
    ]);
    setActiveWorkout(active);
    activeWorkoutRef.current = active;
    setLocalWorkouts(workouts);
    setMuscles(references.muscles);
    setExercises(references.exercises);
    setTemplates(references.templates);
    setPending(outbox.length);
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    const result = await drainOutbox();
    setPending(result.pending);
    setSyncError(
      result.failures[0]
        ? `${result.failures[0].code}: ${result.failures[0].message}`
        : result.error,
    );
    setSyncErrorDetails(result.failures[0]?.details);
    setRetryAfterMs(result.retryAfterMs);
    try {
      const [references, workouts] = await Promise.all([
        refreshReferences(),
        api.workouts(),
      ]);
      setMuscles(references.muscles);
      setExercises(references.exercises);
      setTemplates(references.templates);
      setServerWorkouts(workouts);
      setOnline(true);
    } catch (error) {
      setOnline(false);
      setRetryAfterMs((current) => current ?? 5_000);
      setSyncError(
        error instanceof Error
          ? error.message
          : 'Unable to refresh server data',
      );
      setSyncErrorDetails(undefined);
    }
  }, []);

  useEffect(() => {
    // Hydration is an asynchronous subscription to external IndexedDB state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLocal()
      .then(() => syncNow())
      .finally(() => setReady(true));
    const handleOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadLocal, syncNow]);

  useEffect(() => {
    if (!navigator.onLine || retryAfterMs == null) return;
    const timeout = window.setTimeout(() => void syncNow(), retryAfterMs);
    return () => window.clearTimeout(timeout);
  }, [pending, retryAfterMs, syncNow]);

  function persistWorkout(workout: Workout) {
    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        await localRepository.saveWorkout(workout);
        setLocalWorkouts(await localRepository.workouts());
        setPending(
          (await localRepository.outbox(Number.MAX_SAFE_INTEGER)).length,
        );
        if (navigator.onLine) void syncNow();
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof Error
            ? `This change could not be saved: ${error.message}`
            : 'This change could not be saved',
        );
      });
  }

  function mutateWorkout(update: (workout: Workout) => Workout) {
    const current = activeWorkoutRef.current;
    if (!current) return;
    const next = update(current);
    activeWorkoutRef.current = next.status === 'in_progress' ? next : undefined;
    setActiveWorkout(activeWorkoutRef.current);
    persistWorkout(next);
  }

  function start(template?: WorkoutTemplate) {
    if (activeWorkoutRef.current) return;
    const workout = createWorkout(template);
    activeWorkoutRef.current = workout;
    setActiveWorkout(workout);
    persistWorkout(workout);
  }

  const refreshOnlineReferences = useCallback(async () => {
    const references = await refreshReferences();
    setMuscles(references.muscles);
    setExercises(references.exercises);
    setTemplates(references.templates);
  }, []);

  const history = useMemo(() => {
    const merged = new Map(
      serverWorkouts.map((workout) => [workout.id, workout]),
    );
    for (const workout of localWorkouts) {
      if (workout.status === 'completed') merged.set(workout.id, workout);
    }
    return [...merged.values()].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
  }, [localWorkouts, serverWorkouts]);

  if (!ready) {
    return (
      <main className="loading">
        <span className="brand-mark">S</span>
        <p>Loading your training data…</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          className="brand"
          type="button"
          onClick={() => setView('workout')}
        >
          <span className="brand-mark">S</span>
          <span>Spotter</span>
        </button>
        <StatusBar
          online={online}
          pending={pending}
          syncError={syncError}
          syncErrorDetails={syncErrorDetails}
          onRetry={() => void syncNow()}
        />
      </header>

      {message && (
        <div className="toast" role="alert">
          <span>{message}</span>
          <button
            className="icon-button"
            type="button"
            aria-label="Dismiss message"
            onClick={() => setMessage(null)}
          >
            ×
          </button>
        </div>
      )}

      <main>
        {view === 'workout' && (
          <WorkoutView
            workout={activeWorkout}
            exercises={exercises}
            templates={templates}
            onStart={start}
            onChange={mutateWorkout}
            actions={{
              addExercise,
              removeExercise,
              moveExercise,
              addSet,
              removeSet,
              updateSet,
              updateWorkoutNotes,
              updateExerciseNotes,
              finish: finishWorkout,
            }}
          />
        )}
        {view === 'history' && <HistoryView workouts={history} />}
        {view === 'catalogue' && (
          <CatalogueView
            online={online}
            muscles={muscles}
            exercises={exercises}
            onRefresh={refreshOnlineReferences}
            onError={setMessage}
          />
        )}
        {view === 'templates' && (
          <TemplatesView
            online={online}
            exercises={exercises}
            templates={templates}
            onRefresh={refreshOnlineReferences}
            onError={setMessage}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavButton
          active={view === 'workout'}
          label="Workout"
          icon="●"
          onClick={() => setView('workout')}
        />
        <NavButton
          active={view === 'history'}
          label="History"
          icon="↗"
          onClick={() => setView('history')}
        />
        <NavButton
          active={view === 'catalogue'}
          label="Catalogue"
          icon="◇"
          onClick={() => setView('catalogue')}
        />
        <NavButton
          active={view === 'templates'}
          label="Templates"
          icon="▤"
          onClick={() => setView('templates')}
        />
      </nav>
      <PwaUpdate />
    </div>
  );
}

function NavButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'active' : ''} type="button" onClick={onClick}>
      <span>{icon}</span>
      {label}
    </button>
  );
}
