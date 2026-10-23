import { expect, test } from '@playwright/test';
import type {
  Exercise,
  Muscle,
  Workout,
  WorkoutTemplate,
} from '@spotter/shared';

test('keeps pickers and active workout controls responsive in both themes', async ({
  page,
  request,
  context,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const today = new Date().getDay() || 7;
  const day = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ][today - 1]!;
  const muscles = (await (
    await request.get('/api/muscles')
  ).json()) as Muscle[];
  const target = muscles.find(
    (muscle) =>
      muscle.group === 'Shoulders' &&
      muscle.subgroup === 'Deltoid' &&
      muscle.name === 'Anterior',
  )!;
  const hierarchy = 'Shoulders › Deltoid › Anterior';
  const referenceUrl = 'https://example.com/exercise-reference';
  const exercises: Exercise[] = [];
  for (let index = 0; index < 15; index += 1) {
    const response = await request.post('/api/exercises', {
      data: {
        name: `UX ${suffix} exercise ${index}`,
        exerciseType: index === 1 ? 'calisthenics' : 'strength',
        muscles: [{ muscleId: target.id, role: 'primary' }],
        referenceUrl,
      },
    });
    expect(response.ok()).toBe(true);
    exercises.push((await response.json()) as Exercise);
  }
  const first = exercises[0]!;
  const second = exercises[1]!;
  const added = exercises[2]!;
  const planResponse = await request.post('/api/templates', {
    data: {
      name: `UX plan ${suffix}`,
      isActive: true,
      notes: null,
      exercises: [first, second].map((exercise) => ({
        exerciseId: exercise.id,
        dayOfWeek: today,
        targetSets: 3,
        targetReps: 8,
      })),
    },
  });
  expect(planResponse.ok()).toBe(true);
  const plan = (await planResponse.json()) as WorkoutTemplate;

  // Templates remain multi-select; Done stays reachable when a long list scrolls.
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto(`/templates/${plan.id}/edit`);
  await page.getByLabel(`Add exercise to ${day}`, { exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose exercises' });
  await picker.getByLabel('Filter by name').fill(`UX ${suffix}`);
  await picker
    .getByLabel('Filter by muscle')
    .selectOption({ label: hierarchy });
  await expect(picker.locator('.exercise-picker-card').first()).toContainText(
    hierarchy,
  );
  await picker
    .locator('.exercise-picker-card')
    .filter({ hasText: added.name })
    .getByRole('button', { name: `Add to ${day}`, exact: true })
    .click();
  await expect(picker).toBeVisible();
  await expect(
    picker
      .locator('.exercise-picker-card')
      .filter({ hasText: added.name })
      .getByRole('button', { name: /Add again/ }),
  ).toHaveCount(1);
  const done = picker.getByRole('button', { name: 'Done', exact: true });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    await picker.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(done).toBeInViewport();
    expect(
      await picker.evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBeLessThanOrEqual(1);
  }
  await done.click();
  await expect(picker).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.getByRole('link', { name: 'Workout', exact: false }).click();
  await page
    .getByRole('button', { name: "Start today's workout", exact: true })
    .click();
  const card = page.locator('article.workout-card').filter({
    has: page.getByRole('button', {
      name: `How to do ${first.name}`,
      exact: true,
    }),
  });
  const secondCard = page.locator('article.workout-card').filter({
    has: page.getByRole('button', {
      name: `How to do ${second.name}`,
      exact: true,
    }),
  });
  for (const theme of ['dark', 'light']) {
    await page.getByRole('link', { name: 'Settings', exact: false }).click();
    const toggle = page.getByRole('button', {
      name: `Switch to ${theme} mode`,
    });
    if (await toggle.count()) await toggle.click();
    await page.getByRole('link', { name: 'Workout', exact: false }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 390, 760, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const action of ['Cancel workout', 'Finish']) {
        const button = page.getByRole('button', { name: action, exact: true });
        await expect(button).toBeVisible();
        await expect(button.locator('.workout-action-icon')).toBeVisible({
          visible: width <= 760,
        });
        await expect(button.locator('.workout-action-label')).toBeVisible({
          visible: width > 760,
        });
      }
      for (const entry of [card, secondCard]) {
        const layout = await entry.evaluate((node) => {
          const header = node
            .querySelector('.workout-strength-info')!
            .getBoundingClientRect();
          const sets = node
            .querySelector('.workout-strength-sets')!
            .getBoundingClientRect();
          const table = node
            .querySelector('.strength-workout-grid')!
            .getBoundingClientRect();
          const reorder = node
            .querySelector('.workout-reorder-controls')!
            .getBoundingClientRect();
          const remove = node
            .querySelector('header .danger-text')!
            .getBoundingClientRect();
          return {
            header: header.toJSON(),
            sets: sets.toJSON(),
            table: table.toJSON(),
            reorder: reorder.toJSON(),
            remove: remove.toJSON(),
          };
        });
        expect(layout.sets.y).toBeGreaterThanOrEqual(layout.header.bottom);
        expect(
          Math.abs(layout.sets.width - layout.header.width),
        ).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.sets.x - layout.header.x)).toBeLessThanOrEqual(
          1,
        );
        expect(layout.table.width).toBeLessThan(400);
        if (width >= 760) {
          expect(layout.table.width).toBeLessThan(layout.header.width);
        }
        expect(layout.reorder.y).toBeGreaterThanOrEqual(layout.sets.bottom);
        expect(layout.reorder.y - layout.remove.bottom).toBeGreaterThan(40);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  }

  // Both set types grow by a compact column, then scroll without widening the page.
  for (const [entry, exercise] of [
    [card, first],
    [secondCard, second],
  ] as const) {
    await page.setViewportSize({ width: 1280, height: 844 });
    for (const set of [3, 2]) {
      await entry
        .getByRole('button', {
          name: `Remove ${exercise.name} set ${set}`,
          exact: true,
        })
        .click();
    }
    const table = entry.locator('.strength-workout-grid');
    const column = entry.locator('.strength-grid-set').first();
    const initialWidth = (await table.boundingBox())!.width;
    const columnWidth = (await column.boundingBox())!.width;
    expect(initialWidth).toBeLessThan(220);
    expect(columnWidth).toBeGreaterThanOrEqual(80);
    for (let count = 2; count <= 12; count += 1) {
      await entry
        .getByRole('button', { name: '+ Add set', exact: true })
        .click();
      await expect(entry.locator('.strength-grid-set')).toHaveCount(count);
      const width = (await table.boundingBox())!.width;
      expect(
        Math.abs(width - initialWidth - (count - 1) * columnWidth),
      ).toBeLessThanOrEqual(1);
      expect((await column.boundingBox())!.width).toBe(columnWidth);
    }
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const scrollArea = entry.locator('.strength-workout-grid-scroll');
      expect(
        await scrollArea.evaluate((node) => node.scrollWidth),
      ).toBeGreaterThan(await scrollArea.evaluate((node) => node.clientWidth));
      await entry
        .getByRole('button', { name: '+ Add set', exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        entry.getByRole('button', { name: '+ Add set', exact: true }),
      ).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    for (let set = 12; set >= 2; set -= 1) {
      await entry
        .getByRole('button', {
          name: `Remove ${exercise.name} set ${set}`,
          exact: true,
        })
        .click();
    }
    expect((await table.boundingBox())!.width).toBe(initialWidth);
    // Restore the planned three sets for the rest of the workout checks.
    await entry.getByRole('button', { name: '+ Add set', exact: true }).click();
    await entry.getByRole('button', { name: '+ Add set', exact: true }).click();
  }

  // Reordering still works and never invokes a removal/cancellation action.
  await secondCard
    .getByRole('button', { name: `Move ${second.name} up`, exact: true })
    .click();
  await expect(page.locator('article.workout-card').first()).toContainText(
    second.name,
  );
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('article.workout-card')).toHaveCount(2);

  await expect(page.locator('.workout-active-page a[href]')).toHaveCount(0);
  await card
    .getByRole('button', { name: `How to do ${first.name}`, exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByRole('link', { name: /reference/i }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close exercise details' }).click();
  await card
    .getByLabel(`${first.name} weight set 1`, { exact: true })
    .fill('40');
  await expect(
    card.getByLabel(`${first.name} weight set 1`, { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText(
      'Enter both weight and reps for a set, or clear both fields.',
    ),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(
    card.getByRole('button', {
      name: `Mark ${first.name} as completed`,
      exact: true,
    }),
  ).toBeDisabled();

  await page
    .getByRole('button', { name: '+ Add exercise', exact: true })
    .click();
  await expect(
    picker.getByRole('button', { name: 'Done', exact: true }),
  ).toHaveCount(0);
  await picker.getByLabel('Filter by name').fill(added.name);
  await picker
    .getByRole('button', { name: 'Add to workout', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(picker).toHaveCount(0);
  await expect(page.locator('article.workout-card')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('article.workout-card')).toHaveCount(3);
  await expect(
    card.getByLabel(`${first.name} weight set 1`, { exact: true }),
  ).toHaveValue('40');
  await context.setOffline(true);
  await card
    .getByLabel(`${first.name} repetitions set 1`, { exact: true })
    .fill('8');
  await page.reload();
  await expect(
    card.getByLabel(`${first.name} repetitions set 1`, { exact: true }),
  ).toHaveValue('8');
  await expect(
    card.getByRole('button', {
      name: `Mark ${first.name} as completed`,
      exact: true,
    }),
  ).toBeEnabled();

  // Removing an exercise needs confirmation even offline; dismissing is harmless.
  const removal = page.getByRole('alertdialog', {
    name: `Remove ${first.name}?`,
    exact: true,
  });
  const remove = card.getByRole('button', {
    name: `Remove ${first.name}`,
    exact: true,
  });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const dismiss of ['keep', 'escape', 'close']) {
      await remove.click();
      await expect(removal).toBeVisible();
      await expect(removal).toContainText('recorded sets and progress');
      await expect(page.locator('article.workout-card')).toHaveCount(3);
      await expect(
        removal.getByRole('button', { name: 'Remove exercise', exact: true }),
      ).toBeInViewport();
      if (dismiss === 'escape') {
        await page.keyboard.press('Escape');
      } else {
        await removal
          .getByRole('button', {
            name:
              dismiss === 'keep'
                ? 'Keep exercise'
                : 'Close removal confirmation',
            exact: true,
          })
          .click();
      }
      await expect(removal).toHaveCount(0);
      await expect(
        card.getByLabel(`${first.name} weight set 1`, { exact: true }),
      ).toHaveValue('40');
      await expect(
        card.getByLabel(`${first.name} repetitions set 1`, { exact: true }),
      ).toHaveValue('8');
    }
  }
  await page.reload();
  await expect(page.locator('article.workout-card')).toHaveCount(3);
  await remove.click();
  await removal
    .getByRole('button', { name: 'Remove exercise', exact: true })
    .click();
  await expect(removal).toHaveCount(0);
  await expect(card).toHaveCount(0);
  await expect(page.locator('article.workout-card')).toHaveCount(2);
  // Wait for the existing asynchronous IndexedDB write before reloading.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const open = indexedDB.open('spotter-v2');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result;
              const transaction = db.transaction('workouts', 'readonly');
              const workouts = transaction.objectStore('workouts').getAll();
              transaction.oncomplete = () => {
                db.close();
                const active = (workouts.result as Workout[]).find(
                  (workout) => workout.status === 'in_progress',
                );
                resolve(active?.exercises.length ?? 0);
              };
              transaction.onabort = () => {
                db.close();
                reject(transaction.error);
              };
            };
          }),
      ),
    )
    .toBe(2);
  await page.reload();
  await expect(card).toHaveCount(0);
  await expect(page.locator('article.workout-card')).toHaveCount(2);
  await context.setOffline(false);
  const unchangedPlans = (await (
    await request.get('/api/templates')
  ).json()) as WorkoutTemplate[];
  expect(
    unchangedPlans
      .find((entry) => entry.id === plan.id)
      ?.exercises.map((entry) => entry.exerciseId),
  ).toContain(first.id);
  await page.goto(`/exercises/${first.id}`);
  await expect(
    page.getByRole('link', { name: /Open exercise reference/ }),
  ).toHaveAttribute('href', referenceUrl);
});
