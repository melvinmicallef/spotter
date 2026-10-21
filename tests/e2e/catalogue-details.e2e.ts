import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

test('manages the exercise library, weekly plan, and typed workout history', async ({
  page,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const primaryName = `Chest ${suffix}`;
  const secondaryName = `Triceps ${suffix}`;
  const strengthName = `Image press ${suffix}`;
  const cardioName = `Tempo run ${suffix}`;
  const disposableName = `Disposable ${suffix}`;
  const planName = `Detailed plan ${suffix}`;
  const jsDay = new Date().getDay();
  const todayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const today = WEEKDAYS[todayIndex]!;
  const otherDay = WEEKDAYS[(todayIndex + 1) % 7]!;

  await page.goto('/');
  const header = page.locator('.app-header');
  await expect(header).toHaveCSS('position', 'fixed');
  await expect
    .poll(async () => {
      const [box, viewport] = await Promise.all([
        header.boundingBox(),
        page.evaluate(() => window.innerWidth),
      ]);
      return box
        ? { x: Math.round(box.x), width: Math.round(box.width), viewport }
        : null;
    })
    .toEqual({ x: 0, width: 1280, viewport: 1280 });

  await page.getByRole('button', { name: 'Muscles' }).click();
  for (const name of [primaryName, secondaryName]) {
    await page.getByLabel('New muscle name').fill(name);
    await page.getByRole('button', { name: 'Add muscle' }).click();
    await expect(page.getByLabel(`${name} name`)).toBeVisible();
  }

  await page.getByRole('button', { name: 'Exercises' }).click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByLabel('Exercise name').fill(strengthName);
  await page
    .getByLabel('Preparation')
    .fill('Set the bench and plant both feet');
  await page.getByLabel('Execution').fill('Control the descent');
  await page.getByLabel(`${primaryName} role`).selectOption('primary');
  await page.getByLabel(`${secondaryName} role`).selectOption('secondary');
  await page.getByLabel('Exercise image').setInputFiles({
    name: 'press.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Create exercise' }).click();

  const strengthRow = page
    .locator('button.exercise-library-row')
    .filter({ hasText: strengthName });
  await expect(strengthRow).toContainText(primaryName);
  await expect(strengthRow).toContainText(secondaryName);
  await expect(
    strengthRow.getByRole('img', { name: `${strengthName} demonstration` }),
  ).toBeVisible();
  await strengthRow.click();
  await expect(page.getByRole('heading', { name: strengthName })).toBeVisible();
  await expect(page.getByText('Primary muscles').locator('..')).toContainText(
    primaryName,
  );
  await expect(page.getByText('Secondary muscles').locator('..')).toContainText(
    secondaryName,
  );
  await expect(
    page.getByRole('button', { name: `Delete ${strengthName}` }),
  ).toBeVisible();
  await expect(
    page.getByText('Set the bench and plant both feet'),
  ).toBeVisible();
  await expect(page.getByText('Control the descent')).toBeVisible();
  await page.getByRole('button', { name: `Edit ${strengthName}` }).click();
  await page.getByLabel('Preparation').fill('Retract the shoulder blades');
  await page.getByLabel('Execution').fill('Pause at the bottom');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Retract the shoulder blades')).toBeVisible();
  await expect(page.getByText('Pause at the bottom')).toBeVisible();
  await page.getByRole('button', { name: '← Exercises' }).click();

  await createExercise(page, cardioName, 'cardio');
  await createExercise(page, disposableName, 'strength');
  const disposableRow = page
    .locator('button.exercise-library-row')
    .filter({ hasText: disposableName });
  await disposableRow.click();
  await page.getByRole('button', { name: `Delete ${disposableName}` }).click();
  await expect(disposableRow).toHaveCount(0);

  await page.getByRole('button', { name: 'Templates' }).click();
  await page.getByLabel('New weekly template name').fill(planName);
  await page.getByRole('button', { name: 'Create weekly template' }).click();
  const template = page.locator('.template-card').filter({
    has: page.getByLabel(`${planName} name`),
  });
  await expect(template.getByText('Active', { exact: true })).toBeVisible();

  await template.getByLabel(`Add exercise to ${today}`).click();
  let picker = page.getByRole('dialog', { name: 'Choose exercises' });
  await picker.getByLabel('Filter by muscle').selectOption({
    label: primaryName,
  });
  await picker.getByLabel('Filter by name').fill(strengthName);
  await expect(
    picker.getByRole('img', { name: `${strengthName} demonstration` }),
  ).toBeVisible();
  await picker.getByRole('button', { name: `Add to ${today}` }).click();
  await picker.getByLabel('Filter by muscle').selectOption('');
  await picker.getByLabel('Filter by name').fill(cardioName);
  await picker.getByRole('button', { name: `Add to ${today}` }).click();
  await picker.getByRole('button', { name: 'Done' }).click();

  await template.getByLabel(`Add exercise to ${otherDay}`).click();
  picker = page.getByRole('dialog', { name: 'Choose exercises' });
  await picker.getByLabel('Filter by name').fill(cardioName);
  await picker.getByRole('button', { name: `Add to ${otherDay}` }).click();
  await picker.getByRole('button', { name: 'Done' }).click();
  await template
    .getByLabel(`${strengthName} target sets on ${today}`)
    .fill('1');
  await template
    .getByLabel(`${strengthName} target reps on ${today}`)
    .fill('10');
  await template
    .getByLabel(`${cardioName} target minutes on ${today}`)
    .fill('30');
  await template
    .getByLabel(`${cardioName} target distance on ${today}`)
    .fill('5');
  await template.getByRole('button', { name: 'Save weekly template' }).click();

  await page.getByRole('button', { name: 'Workout' }).click();
  await expect(page.getByRole('button', { name: /^Start Monday/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: "Start today's workout" }),
  ).toBeEnabled();
  await page.getByRole('button', { name: "Start today's workout" }).click();
  await page.getByLabel(`${strengthName} weight set 1`).fill('52.5');
  await page.getByLabel(`${strengthName} repetitions set 1`).fill('10');
  await page.getByLabel(`${strengthName} set 1 complete`).check();
  await expect(
    page.getByLabel(`${cardioName} duration minutes effort 1`),
  ).toBeVisible();
  await expect(page.getByLabel(`${cardioName} weight set 1`)).toHaveCount(0);
  await page.getByLabel(`${cardioName} duration minutes effort 1`).fill('31');
  await page.getByLabel(`${cardioName} distance effort 1`).fill('5.2');
  await page.getByLabel(`${cardioName} effort 1 complete`).check();
  await page.getByRole('button', { name: 'Finish' }).click();

  await page.getByRole('button', { name: 'History' }).click();
  const history = page.locator('details').filter({ hasText: planName });
  await history.locator('summary').click();
  await expect(history).toContainText('52.5 kg × 10 reps');
  await expect(history).toContainText('31 min · 5.2 km');
});

async function createExercise(
  page: Page,
  name: string,
  type: 'strength' | 'cardio',
) {
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByLabel('Exercise name').fill(name);
  await page.getByLabel('Exercise type').selectOption(type);
  await page.getByRole('button', { name: 'Create exercise' }).click();
  await expect(
    page.locator('button.exercise-library-row').filter({ hasText: name }),
  ).toBeVisible();
}
