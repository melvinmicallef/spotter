import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface WorkoutSetSnapshot {
  reps: number | null;
  weight: number | null;
}

interface WorkoutExerciseSnapshot {
  completed: boolean;
  sets: WorkoutSetSnapshot[];
}

async function activeSetSnapshot(page: Page) {
  return page.evaluate<WorkoutSetSnapshot | undefined>(async () => {
    const request = indexedDB.open('spotter-v2');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('workouts', 'readonly');
    const workouts = transaction.objectStore('workouts').getAll();
    const records = await new Promise<
      Array<{
        status: string;
        exercises: WorkoutExerciseSnapshot[];
      }>
    >((resolve, reject) => {
      workouts.onsuccess = () => resolve(workouts.result);
      workouts.onerror = () => reject(workouts.error);
    });
    database.close();
    return records.find((workout) => workout.status === 'in_progress')
      ?.exercises[0]?.sets[0];
  });
}

async function activeExerciseCompleted(page: Page) {
  return page.evaluate<boolean | undefined>(async () => {
    const request = indexedDB.open('spotter-v2');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const workouts = database
      .transaction('workouts', 'readonly')
      .objectStore('workouts')
      .getAll();
    const records = await new Promise<
      Array<{ status: string; exercises: WorkoutExerciseSnapshot[] }>
    >((resolve, reject) => {
      workouts.onsuccess = () => resolve(workouts.result);
      workouts.onerror = () => reject(workouts.error);
    });
    database.close();
    return records.find((workout) => workout.status === 'in_progress')
      ?.exercises[0]?.completed;
  });
}

async function outboxSize(page: Page) {
  return page.evaluate<number>(async () => {
    const request = indexedDB.open('spotter-v2');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = database
      .transaction('outbox', 'readonly')
      .objectStore('outbox')
      .count();
    const result = await new Promise<number>((resolve, reject) => {
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    });
    database.close();
    return result;
  });
}

async function cachedExerciseNames(page: Page) {
  return page.evaluate<string[]>(async () => {
    const request = indexedDB.open('spotter-v2');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = database
      .transaction('exercises', 'readonly')
      .objectStore('exercises')
      .getAll();
    const result = await new Promise<Array<{ name: string }>>(
      (resolve, reject) => {
        records.onsuccess = () => resolve(records.result);
        records.onerror = () => reject(records.error);
      },
    );
    database.close();
    return result.map((exercise) => exercise.name);
  });
}

test('installs its shell and synchronizes one offline workout after reload', async ({
  context,
  page,
  request,
}) => {
  const suffix = crypto.randomUUID();
  const jsDay = new Date().getDay();
  const today = jsDay === 0 ? 7 : jsDay;
  const otherDay = today === 7 ? 1 : today + 1;
  const weekdayNames = [
    '',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  const otherDayName = weekdayNames[otherDay]!;
  const muscleResponse = await request.get('/api/muscles');
  expect(muscleResponse.ok()).toBe(true);
  const muscles = (await muscleResponse.json()) as {
    id: string;
    name: string;
  }[];
  const muscle = muscles.find((entry) => entry.name === 'Sternal')!;

  const exerciseName = `Offline press ${suffix}`;
  const exerciseResponse = await request.post('/api/exercises', {
    data: {
      name: exerciseName,
      exerciseType: 'strength',
      preparation: 'Brace before lifting',
      execution: 'Cached by the browser test',
      referenceUrl: 'https://exrx.net/example-offline-press',
      muscles: [{ muscleId: muscle.id, role: 'primary' }],
    },
  });
  expect(exerciseResponse.ok()).toBe(true);
  const exercise = (await exerciseResponse.json()) as { id: string };
  const placeholderResponse = await request.post('/api/exercises', {
    data: {
      name: `Today's placeholder ${suffix}`,
      exerciseType: 'strength',
      preparation: null,
      execution: null,
      muscles: [],
    },
  });
  expect(placeholderResponse.ok()).toBe(true);
  const placeholder = (await placeholderResponse.json()) as { id: string };
  const templateResponse = await request.post('/api/templates', {
    data: {
      name: `Offline week ${suffix}`,
      isActive: true,
      notes: null,
      exercises: [
        {
          exerciseId: placeholder.id,
          dayOfWeek: today,
          notes: null,
          targetSets: 1,
          targetReps: 5,
          targetDurationSeconds: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
        },
        {
          exerciseId: exercise.id,
          dayOfWeek: otherDay,
          notes: null,
          targetSets: 1,
          targetReps: 8,
          targetDurationSeconds: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
        },
      ],
    },
  });
  expect(templateResponse.ok()).toBe(true);

  await page.goto('/');
  await expect(page.locator('.status-bar')).toContainText('Online');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'crossorigin',
    'use-credentials',
  );

  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: Array<{ src: string; purpose: string }>;
  };
  expect(manifest).toMatchObject({
    name: 'Spotter Workout Tracker',
    display: 'standalone',
    start_url: '/',
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: '/spotter-runner-192.png' }),
      expect.objectContaining({
        src: '/spotter-runner-maskable-512.png',
        purpose: 'maskable',
      }),
    ]),
  );

  const cornerAlpha = await page.evaluate(async () => {
    async function alphaAtCorner(source: string) {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context unavailable');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 1, 1).data[3];
    }
    return {
      regular: await alphaAtCorner('/spotter-runner-192.png'),
      maskable: await alphaAtCorner('/spotter-runner-maskable-512.png'),
    };
  });
  expect(cornerAlpha).toEqual({ regular: 0, maskable: 255 });

  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await expect.poll(() => cachedExerciseNames(page)).toContain(exerciseName);

  await page.getByRole('button', { name: `${otherDayName} (Workout)` }).click();
  await expect(
    page.getByRole('heading', { name: `${otherDayName} (Workout)` }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: `${weekdayNames[today]} (Workout)` }),
  ).toBeVisible();
  await page.getByRole('button', { name: `${otherDayName} (Workout)` }).click();

  await page
    .getByRole('button', { name: `Start ${otherDayName}'s workout` })
    .click();
  await page.getByRole('button', { name: 'Cancel workout' }).click();
  const cancelDialog = page.getByRole('alertdialog');
  await expect(cancelDialog).toContainText(
    'The selected day will remain available this week.',
  );
  await cancelDialog.getByRole('button', { name: 'Cancel workout' }).click();
  await expect(
    page.getByRole('button', { name: `Start ${otherDayName}'s workout` }),
  ).toBeEnabled();

  await context.setOffline(true);
  await expect(page.locator('.status-bar')).toContainText('Offline');

  await expect(
    page.getByRole('button', { name: 'Start an open workout' }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: `Start ${otherDayName}'s workout` })
    .click();
  await expect(
    page.getByRole('heading', {
      name: new RegExp(`Offline week .* · ${otherDayName}`),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('article').getByText(exerciseName, { exact: true }),
  ).toBeVisible();

  await page.getByLabel(`${exerciseName} weight set 1`).fill('42.5');
  await expect
    .poll(async () => (await activeSetSnapshot(page))?.weight)
    .toBe(42.5);
  await page.getByLabel(`${exerciseName} repetitions set 1`).fill('8');
  await expect.poll(async () => (await activeSetSnapshot(page))?.reps).toBe(8);
  await page
    .getByRole('button', { name: `Mark ${exerciseName} as completed` })
    .click();
  await expect.poll(() => activeExerciseCompleted(page)).toBe(true);
  await expect.poll(() => outboxSize(page)).toBeGreaterThan(0);

  await page.goto('/offline-reload-check');
  await expect(
    page.getByRole('heading', {
      name: new RegExp(`Offline week .* · ${otherDayName}`),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: `Reopen ${exerciseName}` }),
  ).toBeVisible();
  await expect(page.getByLabel(`${exerciseName} weight set 1`)).toHaveCount(0);

  await page.getByRole('button', { name: 'Finish' }).click();
  const completedDay = page.getByRole('button', {
    name: `${otherDayName} (Workout) Done`,
  });
  await expect(completedDay).toBeEnabled();
  await completedDay.click();
  const repeatDialog = page.getByRole('alertdialog');
  await expect(repeatDialog).toContainText('Day already completed');
  await repeatDialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('link', { name: 'History' }).click();
  const historyRow = page
    .locator('.history-entry')
    .filter({ hasText: `Offline week ${suffix}` });
  await expect(historyRow).toContainText(exerciseName);
  await historyRow.locator('.history-open-button').click();
  const historyDetails = page
    .locator('.history-exercise')
    .filter({ hasText: exerciseName });
  await expect(historyDetails).toContainText('42.5 kg × 8 reps');
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]+$/);

  await page.reload();
  await expect(historyDetails).toBeVisible();

  let acknowledgementDropped = false;
  await page.route('**/api/sync', async (route) => {
    if (acknowledgementDropped) {
      await route.continue();
      return;
    }
    await route.fetch();
    acknowledgementDropped = true;
    await route.abort('connectionfailed');
  });

  await context.setOffline(false);
  await expect.poll(() => acknowledgementDropped).toBe(true);
  await expect.poll(() => outboxSize(page)).toBeGreaterThan(0);
  await expect.poll(() => outboxSize(page), { timeout: 15_000 }).toBe(0);
  await expect(page.locator('.status-bar')).not.toContainText(
    'changes waiting',
  );

  const historyResponse = await request.get('/api/workouts');
  expect(historyResponse.ok()).toBe(true);
  const workouts = (await historyResponse.json()) as Array<{
    status: string;
    exercises: Array<{
      exerciseName: string;
      completed: boolean;
      sets: WorkoutSetSnapshot[];
    }>;
  }>;
  const matchingWorkouts = workouts.filter((workout) =>
    workout.exercises.some(
      (exercise) => exercise.exerciseName === exerciseName,
    ),
  );
  expect(matchingWorkouts).toHaveLength(1);
  expect(matchingWorkouts[0]).toMatchObject({
    status: 'completed',
    exercises: [
      {
        completed: true,
        sets: [
          {
            reps: 8,
            weight: 42.5,
          },
        ],
      },
    ],
  });

  await page.getByRole('button', { name: '← History' }).click();
  const historyEntry = page
    .locator('.history-entry')
    .filter({ hasText: `Offline week ${suffix}` });
  const deleteButton = page.getByRole('button', {
    name: new RegExp(`Delete workout Offline week ${suffix}`),
  });
  await deleteButton.click();
  const deleteDialog = page.getByRole('alertdialog');
  await expect(deleteDialog).toBeVisible();
  await deleteDialog
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(historyEntry).toBeVisible();
  await deleteButton.click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete workout' })
    .click();
  await expect(historyEntry).toHaveCount(0);
});
