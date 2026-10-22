import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  DayOfWeek,
  Exercise,
  ExerciseMedia,
  Muscle,
  Workout,
  WorkoutTemplate,
} from '@spotter/shared';
import { exerciseMediaSchema } from '@spotter/shared';

import { api } from './api.js';
import { ExercisesView } from './components/CatalogueView.js';
import { HistoryView } from './components/HistoryView.js';
import { MusclesView } from './components/MusclesView.js';
import { SettingsView } from './components/SettingsView.js';
import { StatusBar } from './components/StatusBar.js';
import { StretchingView } from './components/StretchingView.js';
import { TemplatesView } from './components/TemplatesView.js';
import { WorkoutView } from './components/WorkoutView.js';
import { localRepository } from './db.js';
import { pathForView, viewFromPath, type View } from './routes.js';
import {
  isoWeekKey,
  scheduledTemplateDay,
  swapWeekDays,
  type WeekSchedule,
} from './schedule.js';
import { drainOutbox, refreshReferences } from './sync.js';
import { applyTheme, initialTheme } from './theme.js';
import type { Theme } from './theme.js';
import {
  applyMeasurementSystem,
  distanceUnitFor,
  initialMeasurementSystem,
  weightUnitFor,
} from './measurement-system.js';
import type { MeasurementSystem } from './measurement-system.js';
import { todayDayOfWeek } from './weekdays.js';
import {
  addExercise,
  addSet,
  createWorkout,
  finishWorkout,
  moveExercise,
  removeExercise,
  removeSet,
  setExerciseCompleted,
  updateSet,
} from './workout.js';

const STRETCHING_POSTER_STORAGE_KEY = 'spotter-stretching-poster';

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const view = viewFromPath(pathname);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [measurementSystem, setMeasurementSystem] = useState<MeasurementSystem>(
    initialMeasurementSystem,
  );
  const [stretchingPoster, setStretchingPoster] =
    useState<ExerciseMedia | null>(initialStretchingPoster);
  const weightUnit = weightUnitFor(measurementSystem);
  const distanceUnit = distanceUnitFor(measurementSystem);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [activeWorkout, setActiveWorkout] = useState<Workout>();
  const [localWorkouts, setLocalWorkouts] = useState<Workout[]>([]);
  const [serverWorkouts, setServerWorkouts] = useState<Workout[]>([]);
  const [muscles, setMuscles] = useState<Muscle[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [weekSchedule, setWeekSchedule] = useState<WeekSchedule>({});
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncErrorDetails, setSyncErrorDetails] = useState<unknown>();
  const [retryAfterMs, setRetryAfterMs] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const activeWorkoutRef = useRef<Workout | undefined>(undefined);
  const saveQueueRef = useRef(Promise.resolve());
  const today = todayDayOfWeek();
  const currentWeekKey = isoWeekKey();
  const activeTemplate = useMemo(
    () => templates.find((template) => template.isActive),
    [templates],
  );
  const scheduledDay = scheduledTemplateDay(today, weekSchedule);

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    try {
      if (stretchingPoster) {
        window.localStorage.setItem(
          STRETCHING_POSTER_STORAGE_KEY,
          JSON.stringify(stretchingPoster),
        );
      } else {
        window.localStorage.removeItem(STRETCHING_POSTER_STORAGE_KEY);
      }
    } catch {
      // Local cache is optional; the server remains the source of truth.
    }
  }, [stretchingPoster]);
  useEffect(
    () => applyMeasurementSystem(measurementSystem),
    [measurementSystem],
  );

  useEffect(() => {
    const restorePath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', restorePath);
    return () => window.removeEventListener('popstate', restorePath);
  }, []);

  useEffect(() => {
    if (!activeTemplate) {
      // This state mirrors the currently selected template's IndexedDB record.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWeekSchedule({});
      return;
    }
    let cancelled = false;
    void localRepository
      .weekSchedule(activeTemplate.id, currentWeekKey)
      .then((schedule) => {
        if (!cancelled) setWeekSchedule(schedule);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTemplate, currentWeekKey]);

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
    setMuscles(references.muscles.filter((muscle) => muscle.isBuiltin));
    setExercises(references.exercises);
    setTemplates(references.templates);
    setPending(outbox.length);
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const result = await drainOutbox();
      setPending(result.pending);
      setSyncError(
        result.failures[0]
          ? `${result.failures[0].code}: ${result.failures[0].message}`
          : result.error,
      );
      setSyncErrorDetails(result.failures[0]?.details);
      setRetryAfterMs(result.retryAfterMs);
      const [references, workouts, settings] = await Promise.all([
        refreshReferences(),
        api.workouts(),
        api.settings(),
      ]);
      setMuscles(references.muscles.filter((muscle) => muscle.isBuiltin));
      setExercises(references.exercises);
      setTemplates(references.templates);
      setServerWorkouts(workouts);
      setStretchingPoster(settings.stretchingPoster);
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
    } finally {
      setSyncing(false);
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

  function navigatePath(nextPath: string) {
    if (window.location.pathname !== nextPath)
      window.history.pushState(null, '', nextPath);
    setPathname(nextPath);
    window.scrollTo({ top: 0 });
  }

  function navigate(nextView: View) {
    navigatePath(pathForView(nextView));
  }

  async function changeStretchingPoster(file: File | null) {
    if (!navigator.onLine)
      throw new Error('Connect to the server to change the stretching poster.');

    let uploaded: ExerciseMedia | undefined;
    try {
      if (file) uploaded = await api.uploadImage(file);
      const settings = await api.updateSettings({
        stretchingPosterId: uploaded?.id ?? null,
      });
      setStretchingPoster(settings.stretchingPoster);
    } catch (error) {
      if (uploaded) await api.deleteMedia(uploaded.id).catch(() => {});
      throw error;
    }
  }

  function mutateWorkout(update: (workout: Workout) => Workout) {
    const current = activeWorkoutRef.current;
    if (!current) return;
    const next = update(current);
    activeWorkoutRef.current = next.status === 'in_progress' ? next : undefined;
    setActiveWorkout(activeWorkoutRef.current);
    persistWorkout(next);
  }

  function start(template: WorkoutTemplate, dayOfWeek: DayOfWeek) {
    if (activeWorkoutRef.current) return;
    const workout = createWorkout(template, dayOfWeek);
    activeWorkoutRef.current = workout;
    setActiveWorkout(workout);
    persistWorkout(workout);
  }

  function swapToday(dayOfWeek: DayOfWeek) {
    if (!activeTemplate) return;
    const next = swapWeekDays(weekSchedule, today, dayOfWeek);
    setWeekSchedule(next);
    void localRepository
      .saveWeekSchedule(activeTemplate.id, currentWeekKey, next)
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? `The weekly swap could not be saved: ${error.message}`
            : 'The weekly swap could not be saved',
        ),
      );
  }

  function resetWeekSchedule() {
    if (!activeTemplate) return;
    setWeekSchedule({});
    void localRepository
      .saveWeekSchedule(activeTemplate.id, currentWeekKey, {})
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? `The weekly swap could not be reset: ${error.message}`
            : 'The weekly swap could not be reset',
        ),
      );
  }

  const refreshOnlineReferences = useCallback(async () => {
    const references = await refreshReferences();
    setMuscles(references.muscles.filter((muscle) => muscle.isBuiltin));
    setExercises(references.exercises);
    setTemplates(references.templates);
  }, []);

  async function deleteHistoryWorkout(workout: Workout) {
    if (!navigator.onLine) {
      setMessage('Connect to the server before deleting a history item.');
      return;
    }

    try {
      const syncResult = await drainOutbox();
      setPending(syncResult.pending);
      if (syncResult.pending > 0 || syncResult.failures.length > 0) {
        throw new Error(
          syncResult.error ??
            'Pending workout changes must sync before deleting history.',
        );
      }

      await api.deleteWorkout(workout.id);
      await localRepository.deleteWorkout(workout.id);
      setLocalWorkouts((current) =>
        current.filter((item) => item.id !== workout.id),
      );
      setServerWorkouts((current) =>
        current.filter((item) => item.id !== workout.id),
      );
      setPending(
        (await localRepository.outbox(Number.MAX_SAFE_INTEGER)).length,
      );
      setMessage('History item deleted.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Unable to delete history item: ${error.message}`
          : 'Unable to delete history item',
      );
    }
  }

  const history = useMemo(() => {
    const merged = new Map(
      serverWorkouts
        .filter((workout) => workout.status === 'completed')
        .map((workout) => [workout.id, workout]),
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
          onClick={() => navigate('workout')}
        >
          <span className="brand-mark">S</span>
          <span>Spotter</span>
        </button>
        <div className="header-actions">
          <StatusBar
            online={online}
            pending={pending}
            syncing={syncing}
            syncError={syncError}
            syncErrorDetails={syncErrorDetails}
            onRetry={() => void syncNow()}
          />
        </div>
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
            previousWorkouts={history}
            exercises={exercises}
            activeTemplate={activeTemplate}
            today={today}
            scheduledDay={scheduledDay}
            weekKey={currentWeekKey}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
            onStart={start}
            onSwapToday={swapToday}
            onResetWeek={resetWeekSchedule}
            onShowStretching={() => navigate('stretching')}
            onChange={mutateWorkout}
            actions={{
              addExercise,
              removeExercise,
              moveExercise,
              addSet,
              removeSet,
              updateSet,
              setExerciseCompleted,
              finish: finishWorkout,
            }}
          />
        )}
        {view === 'history' && (
          <HistoryView
            workouts={history}
            online={online}
            onDeleteWorkout={deleteHistoryWorkout}
          />
        )}
        {view === 'muscles' && <MusclesView muscles={muscles} />}
        {view === 'exercises' && (
          <ExercisesView
            online={online}
            muscles={muscles}
            exercises={exercises}
            routePath={pathname}
            onNavigate={navigatePath}
            onRefresh={refreshOnlineReferences}
            onError={setMessage}
          />
        )}
        {view === 'templates' && (
          <TemplatesView
            online={online}
            exercises={exercises}
            templates={templates}
            distanceUnit={distanceUnit}
            routePath={pathname}
            onNavigate={navigatePath}
            onRefresh={refreshOnlineReferences}
            onError={setMessage}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            online={online}
            theme={theme}
            measurementSystem={measurementSystem}
            stretchingPoster={stretchingPoster}
            onToggleTheme={() =>
              setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
            }
            onChangeMeasurementSystem={setMeasurementSystem}
            onChangeStretchingPoster={changeStretchingPoster}
          />
        )}
        {view === 'stretching' && (
          <StretchingView
            poster={stretchingPoster}
            onBack={() => navigate('workout')}
            onOpenSettings={() => navigate('settings')}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavButton
          active={view === 'workout'}
          label="Workout"
          icon="●"
          href={pathForView('workout')}
          onClick={() => navigate('workout')}
        />
        <NavButton
          active={view === 'history'}
          label="History"
          icon="↗"
          href={pathForView('history')}
          onClick={() => navigate('history')}
        />
        <NavButton
          active={view === 'muscles'}
          label="Muscles"
          icon="◇"
          href={pathForView('muscles')}
          onClick={() => navigate('muscles')}
        />
        <NavButton
          active={view === 'exercises'}
          label="Exercises"
          icon="◆"
          href={pathForView('exercises')}
          onClick={() => navigate('exercises')}
        />
        <NavButton
          active={view === 'templates'}
          label="Templates"
          icon="▤"
          href={pathForView('templates')}
          onClick={() => navigate('templates')}
        />
        <NavButton
          active={view === 'settings'}
          label="Settings"
          icon="⚙"
          href={pathForView('settings')}
          onClick={() => navigate('settings')}
        />
      </nav>
    </div>
  );
}

function NavButton({
  active,
  label,
  icon,
  href,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: string;
  href: string;
  onClick: () => void;
}) {
  return (
    <a
      aria-current={active ? 'page' : undefined}
      className={active ? 'active' : ''}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      <span>{icon}</span>
      {label}
    </a>
  );
}

function initialStretchingPoster(): ExerciseMedia | null {
  try {
    const cached = window.localStorage.getItem(STRETCHING_POSTER_STORAGE_KEY);
    return cached ? exerciseMediaSchema.parse(JSON.parse(cached)) : null;
  } catch {
    return null;
  }
}
