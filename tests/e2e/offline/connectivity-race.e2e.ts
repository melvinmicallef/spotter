import { expect, test } from '@playwright/test';

test('a refresh that finishes after disconnecting cannot restore online controls', async ({
  page,
  request,
  context,
}) => {
  await page.goto('/exercises');
  const addExercise = page.getByRole('button', {
    name: 'Add exercise',
    exact: true,
  });
  await expect(addExercise).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Sync now', exact: true }),
  ).toBeEnabled();

  // The next reference refresh must introduce a visible change so the test can
  // await the React commit, rather than assert Offline before sync has finished.
  const exerciseName = `Late refresh ${crypto.randomUUID().slice(0, 8)}`;
  const created = await request.post('/api/exercises', {
    data: { name: exerciseName, exerciseType: 'strength', muscles: [] },
  });
  expect(created.ok()).toBe(true);
  const refreshedExercise = page
    .locator('button.exercise-library-row')
    .filter({ hasText: exerciseName });
  await expect(refreshedExercise).toHaveCount(0);

  let releaseSettings!: () => void;
  const holdSettings = new Promise<void>((resolve) => {
    releaseSettings = resolve;
  });
  let settingsFetched = false;
  await page.route('**/api/settings', async (route) => {
    const response = await route.fetch();
    settingsFetched = true;
    await holdSettings;
    await route.fulfill({ response });
  });

  try {
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    await expect.poll(() => settingsFetched).toBe(true);
    await context.setOffline(true);
    const status = page.locator('.status-bar');
    await expect(status).toHaveClass(/offline/);
    await expect(addExercise).toBeDisabled();

    // Fulfil a request started online after the browser has gone offline.
    releaseSettings();
    await expect(refreshedExercise).toBeVisible();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(status).toHaveClass(/offline/);
    await expect(addExercise).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Sync now', exact: true }),
    ).toHaveCount(0);

    await page.unroute('**/api/settings');
    await context.setOffline(false);
    await expect(status).toHaveClass(/online/);
    await expect(addExercise).toBeEnabled();
  } finally {
    releaseSettings();
    await context.setOffline(false);
  }
});
