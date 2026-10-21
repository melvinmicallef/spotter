import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface WorkoutSetSnapshot {
  reps: number | null;
  weight: number | null;
  completed: boolean;
}

async function activeSetSnapshot(page: Page) {
  return page.evaluate<WorkoutSetSnapshot | undefined>(async () => {
    const request = indexedDB.open('spotter');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('workouts', 'readonly');
    const workouts = transaction.objectStore('workouts').getAll();
    const records = await new Promise<
      Array<{
        status: string;
        exercises: Array<{ sets: WorkoutSetSnapshot[] }>;
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

async function outboxSize(page: Page) {
  return page.evaluate<number>(async () => {
    const request = indexedDB.open('spotter');
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
    const request = indexedDB.open('spotter');
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
  const muscleResponse = await request.post('/api/muscles', {
    data: { name: `E2E muscle ${suffix}` },
  });
  expect(muscleResponse.ok()).toBe(true);
  const muscle = (await muscleResponse.json()) as { id: string };

  const exerciseName = `Offline press ${suffix}`;
  const exerciseResponse = await request.post('/api/exercises', {
    data: {
      name: exerciseName,
      instructions: 'Cached by the browser test',
      muscles: [{ muscleId: muscle.id, role: 'primary' }],
    },
  });
  expect(exerciseResponse.ok()).toBe(true);

  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Online');

  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: unknown[];
  };
  expect(manifest).toMatchObject({
    name: 'Spotter Workout Tracker',
    display: 'standalone',
    start_url: '/',
  });
  expect(manifest.icons.length).toBeGreaterThan(0);

  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await expect.poll(() => cachedExerciseNames(page)).toContain(exerciseName);

  await context.setOffline(true);
  await expect(page.getByRole('status')).toContainText('Offline');

  await page.getByRole('button', { name: 'Start an open workout' }).click();
  await expect(
    page.getByRole('heading', { name: 'Open workout' }),
  ).toBeVisible();
  await page.getByLabel('Add exercise').selectOption({ label: exerciseName });
  await expect(
    page.getByRole('article').getByText(exerciseName, { exact: true }),
  ).toBeVisible();

  await page.getByLabel('Weight', { exact: true }).fill('42.5');
  await expect
    .poll(async () => (await activeSetSnapshot(page))?.weight)
    .toBe(42.5);
  await page.getByLabel('Repetitions').fill('8');
  await expect.poll(async () => (await activeSetSnapshot(page))?.reps).toBe(8);
  await page.getByLabel('Set complete').check();
  await expect
    .poll(async () => (await activeSetSnapshot(page))?.completed)
    .toBe(true);
  await expect.poll(() => outboxSize(page)).toBeGreaterThan(0);

  await page.goto('/offline-reload-check');
  await expect(
    page.getByRole('heading', { name: 'Open workout' }),
  ).toBeVisible();
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('42.5');
  await expect(page.getByLabel('Repetitions')).toHaveValue('8');
  await expect(page.getByLabel('Set complete')).toBeChecked();

  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByText('1 completed sets')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByText('1 completed sets')).toBeVisible();

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
  await expect(page.getByRole('status')).not.toContainText('changes waiting');

  const historyResponse = await request.get('/api/workouts');
  expect(historyResponse.ok()).toBe(true);
  const workouts = (await historyResponse.json()) as Array<{
    status: string;
    exercises: Array<{ sets: WorkoutSetSnapshot[] }>;
  }>;
  expect(workouts).toHaveLength(1);
  expect(workouts[0]).toMatchObject({
    status: 'completed',
    exercises: [
      {
        sets: [
          {
            reps: 8,
            weight: 42.5,
            completed: true,
          },
        ],
      },
    ],
  });
});
