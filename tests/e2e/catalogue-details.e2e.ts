import { expect, test } from '@playwright/test';

test('manages roles, reviewed imports, GIFs, notes, and detailed history', async ({
  context,
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const primaryName = `Chest ${suffix}`;
  const secondaryName = `Triceps ${suffix}`;
  const gifExerciseName = `GIF press ${suffix}`;
  const planName = `Detailed plan ${suffix}`;

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Catalogue' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Muscles' }).click();

  for (const name of [primaryName, secondaryName]) {
    await page.getByLabel('New muscle name').fill(name);
    await page.getByRole('button', { name: 'Add muscle' }).click();
    await expect(page.getByLabel(`${name} name`)).toBeVisible();
  }

  await page.getByRole('button', { name: 'Exercises' }).click();

  await page.getByLabel(`${primaryName} role`).first().selectOption('primary');
  await page
    .getByLabel(`${secondaryName} role`)
    .first()
    .selectOption('secondary');
  await page
    .getByLabel('Exercise page URL')
    .fill('https://import.test/exercises/row');
  await page.getByRole('button', { name: 'Preview website' }).click();
  await expect(page.getByLabel('Imported exercise name')).toHaveValue(
    'Imported row',
  );
  await expect(page.getByLabel('Imported instructions')).toHaveValue(
    'Pause at the top',
  );
  await page.getByLabel('Imported exercise type').selectOption('cardio');
  await expect(
    page.getByRole('link', { name: /Review detected GIF/ }),
  ).toHaveAttribute('href', 'https://cdn.import.test/row.gif');
  await page
    .getByRole('button', { name: 'Confirm and create exercise' })
    .click();
  await expect(page.getByLabel('Imported row name')).toBeVisible();
  const importedCard = page.locator('article.form-card').filter({
    has: page.getByLabel('Imported row name'),
  });
  await importedCard
    .getByLabel('Imported row instructions')
    .fill('Reviewed instructions');
  const exerciseUpdate = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      /\/api\/exercises\//.test(response.url()),
  );
  await importedCard.getByRole('button', { name: 'Save' }).click();
  expect((await exerciseUpdate).ok()).toBe(true);

  const exercisesAfterImport = (await (
    await request.get('/api/exercises')
  ).json()) as Array<{
    name: string;
    exerciseType: string;
    instructions: string | null;
    muscles: Array<{ name: string; role: string }>;
    source: { url: string; mediaUrl: string } | null;
  }>;
  const imported = exercisesAfterImport.find(
    (exercise) => exercise.name === 'Imported row',
  );
  expect(imported).toMatchObject({
    exerciseType: 'cardio',
    muscles: [
      { name: primaryName, role: 'primary' },
      { name: secondaryName, role: 'secondary' },
    ],
    source: {
      url: 'https://import.test/exercises/row',
      mediaUrl: 'https://cdn.import.test/row.gif',
    },
  });
  expect(
    exercisesAfterImport.find((exercise) => exercise.name === 'Imported row'),
  ).toMatchObject({ instructions: 'Reviewed instructions' });

  await page.getByLabel('New exercise name').fill(gifExerciseName);
  await page.getByLabel(`${primaryName} role`).first().selectOption('primary');
  await page
    .getByLabel(`${secondaryName} role`)
    .first()
    .selectOption('secondary');
  await page
    .getByLabel('Demonstration GIF (maximum 5 MB)', { exact: true })
    .setInputFiles({
      name: 'press.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        'base64',
      ),
    });
  await page.getByRole('button', { name: 'Create exercise' }).click();
  const gif = page.getByRole('img', {
    name: `${gifExerciseName} demonstration`,
  });
  await expect(gif).toBeVisible();
  const mediaUrl = await gif.getAttribute('src');
  expect(mediaUrl).toMatch(/^\/api\/media\//);
  await expect
    .poll(() =>
      page.evaluate(async (url) => Boolean(await caches.match(url!)), mediaUrl),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Exercises' }).click();
  await expect(gif).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('status')).toContainText('Online');

  await page.getByRole('button', { name: 'Templates' }).click();
  await page.getByLabel('New weekly template name').fill(planName);
  await page.getByRole('button', { name: 'Create weekly template' }).click();
  const template = page.locator('.template-card').filter({
    has: page.getByLabel(`${planName} name`),
  });
  await template
    .getByLabel('Add exercise to Monday')
    .selectOption({ label: `${gifExerciseName} (strength)` });
  await template
    .getByLabel('Add exercise to Monday')
    .selectOption({ label: 'Imported row (cardio)' });
  await template
    .getByLabel('Add exercise to Tuesday')
    .selectOption({ label: 'Imported row (cardio)' });
  await template
    .getByLabel(`${gifExerciseName} template notes on Monday`)
    .fill('Template exercise note');
  await template
    .getByLabel(`${gifExerciseName} target sets on Monday`)
    .fill('1');
  await template
    .getByLabel(`${gifExerciseName} target reps on Monday`)
    .fill('10');
  await template.getByLabel('Imported row target minutes on Monday').fill('30');
  await template.getByLabel('Imported row target distance on Monday').fill('5');
  await template.getByRole('button', { name: 'Save weekly template' }).click();

  await page.getByRole('button', { name: 'Workout' }).click();
  const plan = page.locator('article.card').filter({ hasText: planName });
  await expect(
    plan.getByRole('button', { name: 'Start Monday (2)' }),
  ).toBeVisible();
  await expect(
    plan.getByRole('button', { name: 'Start Tuesday (1)' }),
  ).toBeVisible();
  await plan.getByRole('button', { name: 'Start Monday (2)' }).click();
  await page.getByLabel('Session notes').fill('Session note');
  await page
    .getByPlaceholder(`Notes for ${gifExerciseName}`)
    .fill('Workout exercise note');
  await page.getByLabel(`${gifExerciseName} weight set 1`).fill('52.5');
  await page.getByLabel(`${gifExerciseName} repetitions set 1`).fill('10');
  await page.getByLabel(`${gifExerciseName} set 1 notes`).fill('Set note');
  await page.getByLabel(`${gifExerciseName} set 1 complete`).check();
  await expect(
    page.getByLabel('Imported row duration minutes effort 1'),
  ).toBeVisible();
  await expect(page.getByLabel('Imported row weight set 1')).toHaveCount(0);
  await page.getByLabel('Imported row duration minutes effort 1').fill('31');
  await page.getByLabel('Imported row distance effort 1').fill('5.2');
  await page.getByLabel('Imported row effort 1 complete').check();
  await page.getByRole('button', { name: 'Finish' }).click();

  await page.getByRole('button', { name: 'History' }).click();
  const history = page.locator('details').filter({ hasText: planName });
  await history.locator('summary').click();
  await expect(history).toContainText(gifExerciseName);
  await expect(history).toContainText('52.5 kg × 10 reps');
  await expect(history).toContainText('31 min · 5.2 km');
  await expect(history).toContainText('Session note');
  await expect(history).toContainText('Workout exercise note');
  await expect(history).toContainText('Set note');
});
