import { expect, test } from '@playwright/test';
import type { DayOfWeek } from '@spotter/shared';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('offers a waiting service-worker update without losing an active workout', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const exerciseName = `Update recovery ${suffix}`;
  const today = (new Date().getDay() || 7) as DayOfWeek;
  const exerciseResponse = await request.post('/api/exercises', {
    data: {
      name: exerciseName,
      exerciseType: 'strength',
      preparation: null,
      execution: null,
      comments: null,
      muscles: [],
    },
  });
  expect(exerciseResponse.ok()).toBe(true);
  const exercise = (await exerciseResponse.json()) as { id: string };

  const templateResponse = await request.post('/api/templates', {
    data: {
      name: `Update plan ${suffix}`,
      isActive: true,
      notes: null,
      exercises: [
        {
          exerciseId: exercise.id,
          dayOfWeek: today,
          notes: null,
          targetSets: 1,
          targetReps: 5,
          targetDurationSeconds: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
        },
      ],
    },
  });
  expect(templateResponse.ok()).toBe(true);

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);

  await page.getByRole('button', { name: "Start today's workout" }).click();
  await page.getByLabel(`${exerciseName} weight set 1`).fill('60');
  await page.getByLabel(`${exerciseName} repetitions set 1`).fill('5');

  const workerPath = resolve('apps/web/dist/sw.js');
  const existingWorker = await readFile(workerPath);
  try {
    await writeFile(
      workerPath,
      `
        self.addEventListener('install', () => {});
        self.addEventListener('activate', (event) => {
          event.waitUntil(self.clients.claim());
        });
        self.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'SKIP_WAITING') {
            self.skipWaiting();
          }
        });
      `,
    );
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await expect
      .poll(() =>
        page.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
        ),
      )
      .toBe(true);
    await expect(page.getByText('An update is ready.')).toBeVisible();
    await page.getByRole('button', { name: 'Update now' }).click();

    await expect(page.getByLabel(`${exerciseName} weight set 1`)).toHaveValue(
      '60',
    );
    await expect(
      page.getByLabel(`${exerciseName} repetitions set 1`),
    ).toHaveValue('5');
    await expect(
      page.getByRole('heading', {
        name: new RegExp(`Update plan ${suffix}`),
      }),
    ).toBeVisible();
  } finally {
    await writeFile(workerPath, existingWorker);
  }
});
