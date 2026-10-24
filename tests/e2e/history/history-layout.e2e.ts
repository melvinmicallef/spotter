import { expect, test } from '@playwright/test';
import type { Workout, WorkoutExercise, WorkoutSet } from '@spotter/shared';

test('summarizes history by count and edits compact set columns without changing snapshots', async ({
  page,
  request,
  context,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  function exercise(
    name: string,
    type: WorkoutExercise['exerciseType'],
    position: number,
  ): WorkoutExercise {
    const set: WorkoutSet = {
      id: crypto.randomUUID(),
      position: 0,
      reps: type === 'cardio' ? null : 8,
      weight: type === 'strength' ? 25 : null,
      weightUnit: 'kg',
      durationSeconds: type === 'cardio' ? 300 : null,
      distance: type === 'cardio' ? 1.2 : null,
      distanceUnit: 'km',
      notes: 'Original set note',
      completed: true,
    };
    return {
      id: crypto.randomUUID(),
      exerciseId: null,
      exerciseName: `${name} ${suffix}`,
      exerciseType: type,
      position,
      referenceUrl: null,
      notes: 'Original exercise note',
      targetSets: type === 'cardio' ? null : 1,
      targetReps: type === 'cardio' ? null : 8,
      targetDurationSeconds: null,
      targetDistance: null,
      targetDistanceUnit: 'km',
      sets: [set],
    };
  }
  const strength = exercise('Press', 'strength', 0);
  const calisthenics = exercise('Pull-up', 'calisthenics', 1);
  const cardio = exercise('Run', 'cardio', 2);
  const interval: WorkoutExercise = {
    ...exercise('Intervals', 'cardio', 3),
    cardioMode: 'interval',
    intervalPrepSeconds: 5,
    intervalWorkSeconds: 20,
    intervalRestSeconds: 10,
    intervalIterations: 3,
  };
  interval.sets[0] = {
    ...interval.sets[0]!,
    durationSeconds: 60,
    distance: null,
  };
  const workout: Workout = {
    id: crypto.randomUUID(),
    templateId: null,
    templateDay: null,
    name: `History layout ${suffix}`,
    status: 'completed',
    startedAt: now,
    completedAt: now,
    updatedAt: now,
    notes: 'Original session note',
    exercises: [strength, calisthenics, cardio, interval],
  };
  const seed = await request.post('/api/sync', {
    data: {
      operations: [
        {
          operationId: crypto.randomUUID(),
          kind: 'upsert_workout',
          createdAt: now,
          workout,
        },
      ],
    },
  });
  expect(seed.ok()).toBe(true);
  const seedResult = await seed.json();
  expect(seedResult.results[0].status, JSON.stringify(seedResult)).toBe(
    'applied',
  );

  const row = page.locator('.history-entry').filter({ hasText: workout.name });
  const strengthCard = page.locator('.history-exercise').filter({
    has: page.getByRole('heading', {
      name: strength.exerciseName,
      exact: true,
    }),
  });
  const calisthenicsCard = page.locator('.history-exercise').filter({
    has: page.getByRole('heading', {
      name: calisthenics.exerciseName,
      exact: true,
    }),
  });
  for (const theme of ['dark', 'light']) {
    await page.goto('/settings');
    await expect(
      page.getByRole('button', { name: /Switch to (dark|light) mode/ }),
    ).toBeVisible();
    const toggle = page.getByRole('button', {
      name: `Switch to ${theme} mode`,
    });
    if (await toggle.count()) await toggle.click();
    await page.getByRole('link', { name: 'History', exact: false }).click();
    await expect(row).toContainText('4 exercises');
    for (const entry of workout.exercises)
      await expect(row).not.toContainText(entry.exerciseName);
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    const open = row.locator('.history-open-button');
    const badge = row.locator('.history-open-meta > span').first();
    await page.mouse.move(0, 0);
    const badgeBackground = await badge.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    expect(badgeBackground).not.toBe('rgba(0, 0, 0, 0)');
    await open.hover();
    // A parent brightness filter can wash out a badge despite its own CSS being unchanged.
    await expect(open).toHaveCSS('filter', 'none');
    await expect(badge).toHaveCSS('background-color', badgeBackground);
    await page.mouse.move(0, 0);
    await open.focus();
    await expect(badge).toHaveCSS('background-color', badgeBackground);
    await open.press('Enter');
    await page
      .getByRole('button', { name: 'Edit workout', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [card, entry] of [
        [strengthCard, strength],
        [calisthenicsCard, calisthenics],
      ] as const) {
        const table = card.locator('.strength-workout-grid');
        const initialWidth = (await table.boundingBox())!.width;
        expect(initialWidth).toBeLessThan(220);
        const add = card.getByRole('button', {
          name: '+ Add set',
          exact: true,
        });
        for (let count = 2; count <= 8; count += 1) await add.click();
        const columns = card.locator('.strength-grid-set');
        await expect(columns).toHaveCount(8);
        const first = (await columns.nth(0).boundingBox())!;
        const second = (await columns.nth(1).boundingBox())!;
        expect(second.x).toBeGreaterThan(first.x);
        expect(second.y).toBe(first.y);
        expect((await table.boundingBox())!.width - initialWidth).toBeCloseTo(
          7 * first.width,
          0,
        );
        if (width < 760) {
          const scroll = card.getByRole('group', {
            name: `${entry.exerciseName} sets`,
            exact: true,
          });
          expect(
            await scroll.evaluate((node) => node.scrollWidth),
          ).toBeGreaterThan(await scroll.evaluate((node) => node.clientWidth));
          await add.scrollIntoViewIfNeeded();
          await expect(add).toBeInViewport();
        }
        const overflow = await page.evaluate(() =>
          [...document.querySelectorAll('body *')]
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              return (
                rect.right > innerWidth &&
                !node.closest('.strength-workout-grid-scroll')
              );
            })
            .map((node) => ({
              tag: node.tagName,
              className: node.className,
              right: node.getBoundingClientRect().right,
            })),
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          JSON.stringify(overflow),
        ).toBeLessThanOrEqual(width);
        for (let count = 8; count >= 2; count -= 1) {
          await card
            .getByRole('button', {
              name: `Remove ${entry.exerciseName} set ${count}`,
              exact: true,
            })
            .click();
        }
        expect((await table.boundingBox())!.width).toBe(initialWidth);
      }
    }
    await expect(calisthenicsCard.locator('.strength-grid-weight')).toHaveCount(
      0,
    );
    await expect(
      strengthCard.getByLabel(`${strength.exerciseName} weight set 1 (kg)`, {
        exact: true,
      }),
    ).toHaveValue('25');
    await strengthCard
      .getByLabel(`${strength.exerciseName} weight set 1 (kg)`, { exact: true })
      .fill('99');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.reload();
    await expect(strengthCard).toContainText('25 kg × 8 reps');
  }

  // History retains its existing unit conversion and optional-weight semantics.
  await page.getByRole('link', { name: 'Settings', exact: false }).click();
  await page.getByLabel('Measurement system').selectOption('imperial');
  await page.goto(`/history/${workout.id}`);
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  const weight = strengthCard.getByLabel(
    `${strength.exerciseName} weight set 1 (lb)`,
    { exact: true },
  );
  await expect(weight).toHaveValue('55.12');
  await weight.fill('60.5');
  await strengthCard
    .getByLabel(`${strength.exerciseName} repetitions set 1`, { exact: true })
    .fill('10');
  await strengthCard
    .getByRole('button', { name: '+ Add set', exact: true })
    .click();
  await strengthCard
    .getByLabel(`${strength.exerciseName} repetitions set 2`, { exact: true })
    .fill('6');
  await calisthenicsCard
    .getByRole('button', { name: '+ Add set', exact: true })
    .click();
  await calisthenicsCard
    .getByLabel(`${calisthenics.exerciseName} repetitions set 2`, {
      exact: true,
    })
    .fill('9');
  await calisthenicsCard
    .getByRole('button', {
      name: `Remove ${calisthenics.exerciseName} set 1`,
      exact: true,
    })
    .click();
  const cardioCard = page.locator('.history-exercise').filter({
    has: page.getByRole('heading', {
      name: cardio.exerciseName,
      exact: true,
    }),
  });
  const intervalCard = page.locator('.history-exercise').filter({
    has: page.getByRole('heading', {
      name: interval.exerciseName,
      exact: true,
    }),
  });
  await expect(
    cardioCard.getByLabel('Duration (seconds)', { exact: true }),
  ).toHaveValue('300');
  await expect(
    intervalCard.getByLabel(
      `${interval.exerciseName} total work time in history`,
      { exact: true },
    ),
  ).toHaveValue('60');
  await strengthCard.screenshot({
    path: test.info().outputPath('history-editor-desktop.png'),
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await strengthCard.screenshot({
    path: test.info().outputPath('history-editor-mobile.png'),
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit workout', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(strengthCard).toContainText('60.5 lb × 10 reps');
  await expect(strengthCard).toContainText('Bodyweight × 6 reps');
  await expect(calisthenicsCard).toContainText('9 reps');
  const saved = (await (
    await request.get(`/api/workouts/${workout.id}`)
  ).json()) as Workout;
  expect(saved.notes).toBe(workout.notes);
  expect(
    saved.exercises.map((entry) => [entry.id, entry.exerciseName, entry.notes]),
  ).toEqual(
    workout.exercises.map((entry) => [
      entry.id,
      entry.exerciseName,
      entry.notes,
    ]),
  );
  expect(saved.exercises[0]!.sets[0]!.notes).toBe('Original set note');
  expect(saved.exercises[2]!.sets).toEqual(cardio.sets);
  expect(saved.exercises[3]!.sets).toEqual(interval.sets);
  await context.setOffline(true);
  await expect(
    page.getByRole('button', { name: 'Edit workout', exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
});
