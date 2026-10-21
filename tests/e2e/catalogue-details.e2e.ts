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
  await page.getByRole('button', { name: 'Catalogue' }).click();

  for (const name of [primaryName, secondaryName]) {
    await page.getByLabel('New muscle name').fill(name);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByLabel(`${name} name`)).toBeVisible();
  }

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
    instructions: string | null;
    muscles: Array<{ name: string; role: string }>;
    source: { url: string; mediaUrl: string } | null;
  }>;
  const imported = exercisesAfterImport.find(
    (exercise) => exercise.name === 'Imported row',
  );
  expect(imported).toMatchObject({
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
  await page.getByRole('button', { name: 'Catalogue' }).click();
  await expect(gif).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('status')).toContainText('Online');

  await page.getByRole('button', { name: 'Templates' }).click();
  await page.getByLabel('New template name').fill(planName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const template = page.locator('.template-card').filter({
    has: page.getByLabel(`${planName} name`),
  });
  await template
    .getByLabel('Add exercise to template')
    .selectOption({ label: gifExerciseName });
  await template
    .getByLabel(`${gifExerciseName} template notes`)
    .fill('Template exercise note');
  await template.getByRole('button', { name: 'Save template' }).click();

  await page.getByRole('button', { name: 'Workout' }).click();
  const plan = page.locator('article.card').filter({ hasText: planName });
  await plan.getByRole('button', { name: 'Start' }).click();
  await page.getByLabel('Session notes').fill('Session note');
  await page.getByLabel('Exercise notes').fill('Workout exercise note');
  await page.getByLabel('Weight', { exact: true }).fill('52.5');
  await page.getByLabel('Repetitions').fill('10');
  await page.getByLabel('Set 1 notes').fill('Set note');
  await page.getByLabel('Set complete').check();
  await page.getByRole('button', { name: 'Finish' }).click();

  await page.getByRole('button', { name: 'History' }).click();
  const history = page.locator('details').filter({ hasText: planName });
  await history.locator('summary').click();
  await expect(history).toContainText(gifExerciseName);
  await expect(history).toContainText('52.5 kg × 10 reps');
  await expect(history).toContainText('Session note');
  await expect(history).toContainText('Workout exercise note');
  await expect(history).toContainText('Set note');
});
