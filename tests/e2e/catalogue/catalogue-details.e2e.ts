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
  const primaryName = 'Sternal';
  const referenceUrl =
    'https://exrx.net/WeightExercises/PectoralSternal/BBBenchPress';
  const strengthName = `Image press ${suffix}`;
  const cardioName = `Tempo run ${suffix}`;
  const disposableName = `Disposable ${suffix}`;
  const planName = `Detailed plan ${suffix}`;
  const disposablePlanName = `Disposable plan ${suffix}`;
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

  await page.getByRole('link', { name: 'Muscles' }).click();
  await expect(page).toHaveURL(/\/muscles$/);
  await expect(page.getByRole('heading', { name: 'Chest' })).toBeVisible();
  await expect(page.getByText('Pectoralis Major').first()).toBeVisible();
  await expect(
    page.getByRole('link', { name: primaryName, exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByLabel('New muscle name')).toHaveCount(0);

  await page.getByRole('link', { name: 'Exercises' }).click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await expectAutofillDisabled(page);
  await page.getByLabel('Exercise name').fill(strengthName);
  await page
    .getByLabel('Preparation')
    .fill('Set the bench and plant both feet');
  await page.getByLabel('Execution').fill('Control the descent');
  await page.getByLabel('Comments').fill('Keep elbows soft');
  await page.getByLabel('Reference website (optional)').fill(referenceUrl);
  await page
    .getByLabel('Muscle to add')
    .selectOption({ label: `Pectoralis Major › ${primaryName}` });
  await expect(page.getByLabel('Muscle role')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add muscle' }).click();
  const assignedMuscles = page.getByLabel('Assigned muscles');
  await expect(
    assignedMuscles.locator('.assigned-muscle-row').nth(0),
  ).toContainText(primaryName);
  await expect(assignedMuscles.locator('select')).toHaveCount(0);
  await expect(
    page
      .getByLabel('Muscle to add')
      .locator('option')
      .filter({ hasText: primaryName }),
  ).toHaveCount(0);
  await page.getByLabel('Exercise image').setInputFiles({
    name: 'press.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Create exercise' }).click();

  await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]+$/);
  await expect(
    page.getByRole('heading', { name: strengthName, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: strengthName, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '← Exercises' }).click();

  const strengthRow = page
    .locator('button.exercise-library-row')
    .filter({ hasText: strengthName });
  await expect(strengthRow).toContainText(primaryName);
  await expect(
    strengthRow.getByRole('img', { name: `${strengthName} demonstration` }),
  ).toBeVisible();
  await expect(
    strengthRow.getByRole('img', { name: `${strengthName} demonstration` }),
  ).toHaveCSS('object-fit', 'contain');
  await strengthRow.click();
  await expect(
    page.getByRole('heading', { name: strengthName, exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Primary muscles').locator('..')).toContainText(
    primaryName,
  );
  await expect(page.getByText('Secondary muscles')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: `Delete ${strengthName}` }),
  ).toBeVisible();
  await expect(
    page.getByText('Set the bench and plant both feet'),
  ).toBeVisible();
  await expect(page.getByText('Control the descent')).toBeVisible();
  await expect(page.getByText('Keep elbows soft')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open exercise reference' }),
  ).toHaveAttribute('href', referenceUrl);
  await page.getByRole('button', { name: `Edit ${strengthName}` }).click();
  await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]+\/edit$/);
  await page.reload();
  await expect(page.getByLabel('Exercise name')).toHaveValue(strengthName);
  await page.getByLabel('Preparation').fill('Retract the shoulder blades');
  await page.getByLabel('Execution').fill('Pause at the bottom');
  await page.getByLabel('Comments').fill('Keep the wrists stacked');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]+$/);
  await expect(page.getByText('Retract the shoulder blades')).toBeVisible();
  await expect(page.getByText('Pause at the bottom')).toBeVisible();
  await expect(page.getByText('Keep the wrists stacked')).toBeVisible();
  await page.getByRole('button', { name: '← Exercises' }).click();

  await createExercise(page, cardioName, 'cardio');
  await createExercise(page, disposableName, 'strength');
  const disposableRow = page
    .locator('button.exercise-library-row')
    .filter({ hasText: disposableName });
  await disposableRow.click();
  await page.getByRole('button', { name: `Delete ${disposableName}` }).click();
  const exerciseDeleteDialog = page.getByRole('alertdialog');
  await expect(exerciseDeleteDialog).toBeVisible();
  await exerciseDeleteDialog
    .getByRole('button', { name: 'Delete exercise' })
    .click();
  await expect(page).toHaveURL(/\/exercises$/);
  await expect(disposableRow).toHaveCount(0);

  const addTemplateButton = page.getByRole('button', { name: 'Add template' });
  await page.getByRole('link', { name: 'Templates' }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(addTemplateButton).toBeEnabled();
  await addTemplateButton.click();
  await expect(page).toHaveURL(/\/templates\/new$/);
  await page.getByLabel('Template name').fill(planName);
  await page.getByRole('button', { name: 'Create template' }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: planName })).toBeVisible();
  const setActiveButton = page.getByRole('button', { name: 'Set active' });
  if (await setActiveButton.isVisible()) await setActiveButton.click();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Templates' }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(addTemplateButton).toBeEnabled();

  await addTemplateButton.click();
  await page.getByLabel('Template name').fill(disposablePlanName);
  await page.getByRole('button', { name: 'Create template' }).click();
  await page
    .getByRole('button', { name: `Delete ${disposablePlanName}` })
    .click();
  const templateDeleteDialog = page.getByRole('alertdialog');
  await expect(templateDeleteDialog).toBeVisible();
  await templateDeleteDialog
    .getByRole('button', { name: 'Delete template' })
    .click();
  await expect(page).toHaveURL(/\/templates$/);

  const templateRow = page
    .locator('button.template-library-row')
    .filter({ hasText: planName });
  await templateRow.click();
  await page.getByRole('button', { name: `Edit ${planName}` }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]+\/edit$/);
  await page.reload();
  await expect(page.getByLabel('Template name')).toHaveValue(planName);
  await expectAutofillDisabled(page);
  const template = page.locator('.template-card');
  await page.setViewportSize({ width: 390, height: 844 });
  const swapTrigger = template.getByRole('button', {
    name: 'Swap workout days',
  });
  await expect(swapTrigger).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Swap workout days' }),
  ).toHaveCount(0);
  await expect(template.getByLabel('First day to swap')).toHaveCount(0);
  const [swapTriggerBounds, cancelBounds] = await Promise.all([
    swapTrigger.boundingBox(),
    template.getByRole('button', { name: 'Cancel' }).boundingBox(),
  ]);
  expect(swapTriggerBounds).not.toBeNull();
  expect(cancelBounds).not.toBeNull();
  expect(Math.abs(swapTriggerBounds!.y - cancelBounds!.y)).toBeLessThan(2);
  await swapTrigger.click();
  const swapDialog = page.getByRole('dialog', { name: 'Swap workout days' });
  await expect(swapDialog).toBeVisible();
  await expectAutofillDisabled(page);
  const dialogBounds = await swapDialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(390);
  await swapDialog
    .getByLabel('First day to swap')
    .selectOption({ label: today });
  await swapDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(swapDialog).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 720 });
  await template.getByLabel(`${today} workout name`).fill('Chest & Back');

  await template.getByLabel(`Add exercise to ${today}`).click();
  let picker = page.getByRole('dialog', { name: 'Choose exercises' });
  await expectAutofillDisabled(page);
  await picker.getByLabel('Filter by muscle').selectOption({
    label: `Chest › Pectoralis Major › ${primaryName}`,
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
    .getByLabel(`${strengthName} target reps on ${today}`)
    .fill('10');
  await template
    .getByLabel(`${strengthName} target sets on ${today}`)
    .fill('1');
  await template
    .getByLabel(`${cardioName} duration on ${today} minutes`)
    .fill('30');
  await template
    .getByLabel(`${cardioName} target distance on ${today}`)
    .fill('5');

  await swapTrigger.click();
  const firstSwapDay = swapDialog.getByLabel('First day to swap');
  const secondSwapDay = swapDialog.getByLabel('Second day to swap');
  const swapDaysButton = swapDialog.getByRole('button', { name: 'Swap days' });
  await expect(firstSwapDay).toHaveValue('');
  await expect(swapDaysButton).toBeDisabled();
  await firstSwapDay.selectOption({ label: today });
  await secondSwapDay.selectOption({ label: today });
  await expect(swapDaysButton).toBeDisabled();
  await secondSwapDay.selectOption({ label: otherDay });
  await swapDaysButton.click();
  await expect(swapDialog).toHaveCount(0);
  await expect(
    template.getByLabel(`${strengthName} target reps on ${today}`),
  ).toHaveCount(0);
  await expect(
    template.getByLabel(`${strengthName} target reps on ${otherDay}`),
  ).toHaveValue('10');
  await expect(template.getByLabel(`${today} workout name`)).toHaveValue('');
  await expect(template.getByLabel(`${otherDay} workout name`)).toHaveValue(
    'Chest & Back',
  );

  await template.getByRole('button', { name: 'Save weekly template' }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]+$/);
  const swappedOtherDay = page
    .locator('.template-details-week .template-day')
    .filter({
      has: page.getByRole('heading', { name: `${otherDay} · Chest & Back` }),
    });
  await expect(swappedOtherDay).toContainText(strengthName);
  await expect(swappedOtherDay).toContainText(cardioName);
  const swappedToday = page
    .locator('.template-details-week .template-day')
    .filter({ has: page.getByRole('heading', { name: today, exact: true }) });
  await expect(swappedToday).toContainText(cardioName);
  await expect(swappedToday).not.toContainText(strengthName);

  await page.getByRole('button', { name: `Edit ${planName}` }).click();
  const reopenedTemplate = page.locator('.template-card');
  await expect(
    reopenedTemplate.getByLabel(`${strengthName} target reps on ${otherDay}`),
  ).toHaveValue('10');
  await reopenedTemplate
    .getByRole('button', { name: 'Swap workout days' })
    .click();
  await swapDialog
    .getByLabel('First day to swap')
    .selectOption({ label: today });
  await swapDialog
    .getByLabel('Second day to swap')
    .selectOption({ label: otherDay });
  await swapDialog.getByRole('button', { name: 'Swap days' }).click();
  await expect(
    reopenedTemplate.getByLabel(`${today} workout name`),
  ).toHaveValue('Chest & Back');
  await expect(
    reopenedTemplate.getByLabel(`${otherDay} workout name`),
  ).toHaveValue('');
  await reopenedTemplate
    .getByRole('button', { name: 'Save weekly template' })
    .click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]+$/);

  await page.getByRole('link', { name: 'Workout' }).click();
  await expect(page.getByRole('button', { name: /^Start Monday/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: "Start today's workout" }),
  ).toBeEnabled();
  await page.getByRole('button', { name: "Start today's workout" }).click();
  await expect(
    page.getByText(`${today} (Chest & Back)`, { exact: true }),
  ).toBeVisible();
  await expectAutofillDisabled(page);
  await page.getByRole('button', { name: `How to do ${strengthName}` }).click();
  const exerciseGuide = page.getByRole('dialog', { name: strengthName });
  await expect(exerciseGuide).toContainText('Pause at the bottom');
  await expect(exerciseGuide).toContainText('Keep the wrists stacked');
  await exerciseGuide
    .getByRole('button', { name: 'Close exercise details' })
    .click();
  await expect(page.locator('.workout-active-page a[href]')).toHaveCount(0);
  await page.getByLabel(`${strengthName} weight set 1`).fill('52.5');
  await page.getByLabel(`${strengthName} repetitions set 1`).fill('10');
  await page
    .getByRole('button', { name: `Mark ${strengthName} as completed` })
    .click();
  await expect(page.getByLabel(`${cardioName} duration minutes`)).toBeVisible();
  await expect(page.getByLabel(`${cardioName} weight set 1`)).toHaveCount(0);
  await page.getByLabel(`${cardioName} duration minutes`).fill('31');
  await page.getByLabel(`${cardioName} distance`).fill('5.2');
  await page.getByRole('button', { name: 'Finish' }).click();
  const finishWarning = page.getByRole('alertdialog');
  await expect(finishWarning).toContainText(
    '1 exercise is not marked complete',
  );
  await finishWarning.getByRole('button', { name: 'Finish anyway' }).click();

  await page.getByRole('link', { name: 'History' }).click();
  const historyRow = page
    .locator('.history-entry')
    .filter({ hasText: planName });
  await expect(historyRow).toContainText(strengthName);
  await historyRow.locator('.history-open-button').click();
  const strengthHistory = page
    .locator('.history-exercise')
    .filter({ hasText: strengthName });
  const cardioHistory = page
    .locator('.history-exercise')
    .filter({ hasText: cardioName });
  await expect(strengthHistory).toContainText('52.5 kg × 10 reps');
  await expect(cardioHistory).toContainText('31m 0s · 5.2 km');
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
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Exercises' }).click();
  await expect(
    page.locator('button.exercise-library-row').filter({ hasText: name }),
  ).toBeVisible();
}

async function expectAutofillDisabled(page: Page) {
  const enabledControls = await page
    .locator('form, input:not([type="file"]), select, textarea')
    .evaluateAll((controls) =>
      controls
        .filter((control) => control.getAttribute('autocomplete') !== 'off')
        .map((control) => control.outerHTML.slice(0, 120)),
    );
  expect(enabledControls).toEqual([]);
}
