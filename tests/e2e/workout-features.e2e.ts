import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DayOfWeek } from '@spotter/shared';

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

test('records typed sets, previous values, and an audible interval timer', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const today = (new Date().getDay() || 7) as DayOfWeek;
  const todayName = WEEKDAYS[today - 1]!;
  const secondDay = ((today % 7) + 1) as DayOfWeek;
  const secondDayName = WEEKDAYS[secondDay - 1]!;
  const thirdDay = ((secondDay % 7) + 1) as DayOfWeek;
  const thirdDayName = WEEKDAYS[thirdDay - 1]!;
  const strengthName = `Progress press ${suffix}`;
  const calisthenicsName = `Bodyweight squat ${suffix}`;
  const cardioName = `Sprint intervals ${suffix}`;

  const strengthResponse = await request.post('/api/exercises', {
    data: {
      name: strengthName,
      exerciseType: 'strength',
      preparation: 'Set the shoulders',
      execution: 'Press with control',
      comments: 'Stop if form breaks',
      muscles: [],
    },
  });
  expect(strengthResponse.ok()).toBe(true);
  const strength = (await strengthResponse.json()) as { id: string };

  const calisthenicsResponse = await request.post('/api/exercises', {
    data: {
      name: calisthenicsName,
      exerciseType: 'calisthenics',
      preparation: 'Stand tall',
      execution: 'Lower under control',
      comments: 'Use a comfortable depth',
      muscles: [],
    },
  });
  expect(calisthenicsResponse.ok()).toBe(true);
  const calisthenics = (await calisthenicsResponse.json()) as { id: string };

  const cardioResponse = await request.post('/api/exercises', {
    data: {
      name: cardioName,
      exerciseType: 'cardio',
      preparation: null,
      execution: 'Run hard during each work stage',
      comments: 'The timer should beep at countdown and stage changes',
      muscles: [],
    },
  });
  expect(cardioResponse.ok()).toBe(true);
  const cardio = (await cardioResponse.json()) as { id: string };

  const templateName = `Feature checks ${suffix}`;
  const templateResponse = await request.post('/api/templates', {
    data: {
      name: templateName,
      isActive: true,
      notes: null,
      dayNames: [
        { dayOfWeek: today, name: 'Strength + intervals' },
        { dayOfWeek: secondDay, name: 'Set history 2' },
        { dayOfWeek: thirdDay, name: 'Set history 3' },
      ],
      exercises: [
        {
          exerciseId: strength.id,
          dayOfWeek: today,
          notes: null,
          targetSets: 2,
          targetReps: 10,
          targetDurationSeconds: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
        },
        {
          exerciseId: calisthenics.id,
          dayOfWeek: today,
          notes: null,
          targetSets: 2,
          targetReps: 8,
          targetDurationSeconds: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
        },
        {
          exerciseId: cardio.id,
          dayOfWeek: today,
          notes: null,
          targetSets: null,
          targetReps: null,
          targetDurationSeconds: null,
          cardioMode: 'duration',
          targetDistance: 2.5,
          targetDistanceUnit: 'km',
        },
        {
          exerciseId: strength.id,
          dayOfWeek: secondDay,
          notes: null,
          targetSets: 2,
          targetReps: 10,
          targetDurationSeconds: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
        },
        {
          exerciseId: cardio.id,
          dayOfWeek: secondDay,
          notes: null,
          targetSets: null,
          targetReps: null,
          targetDurationSeconds: null,
          cardioMode: 'duration',
          targetDistance: null,
          targetDistanceUnit: 'km',
        },
        {
          exerciseId: strength.id,
          dayOfWeek: thirdDay,
          notes: null,
          targetSets: 2,
          targetReps: 10,
          targetDurationSeconds: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
        },
        {
          exerciseId: cardio.id,
          dayOfWeek: thirdDay,
          notes: null,
          targetSets: null,
          targetReps: null,
          targetDurationSeconds: null,
          cardioMode: 'interval',
          intervalPrepSeconds: null,
          intervalWorkSeconds: null,
          intervalRestSeconds: null,
          intervalIterations: null,
          targetDistance: null,
          targetDistanceUnit: 'km',
        },
      ],
    },
  });
  expect(templateResponse.ok()).toBe(true);

  await page.addInitScript(() => {
    const testWindow = window as Window & {
      __spotterBeeTimes?: number[];
      __spotterBeepFrequencies?: number[];
    };
    testWindow.__spotterBeeTimes = JSON.parse(
      localStorage.getItem('test-beep-times') ?? '[]',
    ) as number[];
    testWindow.__spotterBeepFrequencies = [];

    class TestAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};

      createOscillator() {
        const frequency = { value: 0 };
        return {
          type: 'sine',
          frequency,
          connect() {
            return this;
          },
          start() {
            testWindow.__spotterBeeTimes?.push(Date.now());
            testWindow.__spotterBeepFrequencies?.push(frequency.value);
            localStorage.setItem(
              'test-beep-times',
              JSON.stringify(testWindow.__spotterBeeTimes),
            );
          },
          stop() {},
        };
      }

      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {
            return this;
          },
        };
      }
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: TestAudioContext,
    });
  });
  await page.clock.install({ time: new Date() });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Online');
  await expect(
    page.locator('.today-workout-card').getByText('Active for 0 days'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Templates' }).click();
  const templateRow = page
    .locator('button.template-library-row')
    .filter({ hasText: templateName });
  await expect(templateRow).toBeVisible();
  await templateRow.click();
  await page.getByRole('button', { name: `Edit ${templateName}` }).click();

  const templateCard = page.locator('.template-card');
  await expect(
    templateCard.getByLabel(`${todayName} workout name`),
  ).toHaveValue('Strength + intervals');
  const strengthTargets = templateCard
    .locator('.template-entry')
    .filter({ hasText: strengthName })
    .locator('.target-fields label');
  await expect(strengthTargets.nth(0)).toContainText('Target reps');
  await expect(strengthTargets.nth(1)).toContainText('Target sets');

  const cardioMode = templateCard.getByLabel(
    `${cardioName} cardio mode on ${todayName}`,
  );
  await cardioMode.selectOption('interval');
  await expect(
    templateCard.getByLabel(`${cardioName} target distance on ${todayName}`),
  ).toHaveCount(0);
  await expect(
    templateCard.getByLabel(`${cardioName} prep time on ${todayName} seconds`),
  ).toHaveCount(0);
  await templateCard
    .getByRole('button', { name: 'Save weekly template' })
    .click();
  const savedTemplatesResponse = await request.get('/api/templates');
  expect(savedTemplatesResponse.ok()).toBe(true);
  const savedTemplates = (await savedTemplatesResponse.json()) as Array<{
    name: string;
    exercises: Array<{
      exerciseName: string;
      cardioMode: string;
      intervalPrepSeconds: number | null;
      intervalWorkSeconds: number | null;
      intervalRestSeconds: number | null;
      intervalIterations: number | null;
      targetDistance: number | null;
    }>;
  }>;
  const savedInterval = savedTemplates
    .find((template) => template.name === templateName)
    ?.exercises.find((entry) => entry.exerciseName === cardioName);
  expect(savedInterval).toMatchObject({
    cardioMode: 'interval',
    intervalPrepSeconds: null,
    intervalWorkSeconds: null,
    intervalRestSeconds: null,
    intervalIterations: null,
    targetDistance: null,
  });

  await page.getByRole('link', { name: 'Workout' }).click();
  await page.getByRole('button', { name: "Start today's workout" }).click();
  await expect(
    page.getByText(`${todayName} (Strength + intervals)`, { exact: true }),
  ).toBeVisible();

  const strengthCard = page
    .locator('article.workout-card')
    .filter({ hasText: strengthName });
  const calisthenicsCard = page
    .locator('article.workout-card')
    .filter({ hasText: calisthenicsName });
  const cardioCard = page
    .locator('article.workout-card')
    .filter({ hasText: cardioName });
  await expect(cardioCard.locator('.target-summary')).not.toContainText('km');
  await expect(
    cardioCard.getByLabel(`${cardioName} prep time seconds`),
  ).toHaveValue('0');
  await expect(
    cardioCard.getByLabel(`${cardioName} work time seconds`),
  ).toHaveValue('30');
  await expect(
    cardioCard.getByLabel(`${cardioName} interval iterations`),
  ).toHaveValue('8');
  await cardioCard.getByLabel(`${cardioName} prep time seconds`).fill('20');
  await cardioCard.getByLabel(`${cardioName} work time seconds`).fill('20');
  await cardioCard.getByLabel(`${cardioName} rest time seconds`).fill('0');
  await cardioCard.getByLabel(`${cardioName} interval iterations`).fill('1');

  await expect(
    strengthCard.getByLabel(`${strengthName} weight set 1`),
  ).toHaveAttribute('inputmode', 'decimal');
  await expect(
    strengthCard.getByLabel(`${strengthName} repetitions set 1`),
  ).toHaveAttribute('inputmode', 'numeric');
  await strengthCard.getByLabel(`${strengthName} weight set 1`).fill('40');
  await expect(strengthCard.getByRole('alert')).toContainText(
    'Enter both weight and reps',
  );
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(
    strengthCard.getByRole('button', {
      name: `Mark ${strengthName} as completed`,
    }),
  ).toBeDisabled();
  await strengthCard.getByLabel(`${strengthName} repetitions set 1`).fill('10');
  await expect(strengthCard.getByRole('alert')).toHaveCount(0);
  await strengthCard.getByLabel(`${strengthName} weight set 2`).fill('0');
  await strengthCard.getByLabel(`${strengthName} repetitions set 2`).fill('0');
  await strengthCard.getByRole('button', { name: `+ Add set` }).click();
  await expect(
    strengthCard.getByLabel(`${strengthName} weight set 3`),
  ).toHaveCount(1);
  await strengthCard
    .getByRole('button', { name: `Remove ${strengthName} set 3` })
    .click();
  await expect(
    strengthCard.getByLabel(`${strengthName} weight set 3`),
  ).toHaveCount(0);

  await expect(
    calisthenicsCard.getByLabel(`${calisthenicsName} repetitions set 1`),
  ).toBeVisible();
  await expect(
    calisthenicsCard.getByLabel(`${calisthenicsName} weight set 1`),
  ).toHaveCount(0);
  await expect(calisthenicsCard.getByText('No notes')).toHaveCount(0);
  await calisthenicsCard
    .getByLabel(`${calisthenicsName} repetitions set 1`)
    .fill('12');
  await calisthenicsCard
    .getByRole('button', { name: `How to do ${calisthenicsName}` })
    .click();
  const guide = page.getByRole('dialog', { name: calisthenicsName });
  await expect(guide).toContainText('Lower under control');
  await expect(guide).toContainText('Use a comfortable depth');
  await guide.getByRole('button', { name: 'Close exercise details' }).click();

  const intervalTimer = cardioCard.locator('.interval-timer');
  await expect(intervalTimer).toContainText('Prep');
  await expect(intervalTimer).toContainText('00:20');
  await cardioCard
    .getByRole('button', { name: 'Start interval timer' })
    .click();
  await page.clock.fastForward(2_000);
  await expect(intervalTimer).toContainText('00:18');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __spotterBeepFrequencies?: number[] })
            .__spotterBeepFrequencies?.length ?? 0,
      ),
    )
    .toBe(0);

  await page.reload();
  await expect(
    page.getByRole('heading', { name: new RegExp(templateName) }),
  ).toBeVisible();
  await expect
    .poll(async () => page.locator('.interval-timer-readout').innerText())
    .toMatch(/00:1[0-9]/);
  const resumedTimer = page.locator('.interval-timer');
  await expect(resumedTimer).toContainText('Prep');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Enable beeps' }).click();
  await page.clock.runFor(18_000);
  await expect(resumedTimer).toContainText('Work');
  await expect(resumedTimer).toContainText('00:20');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __spotterBeepFrequencies?: number[] })
            .__spotterBeepFrequencies?.length ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(6);
  const beepFrequencies = await page.evaluate(
    () =>
      (window as Window & { __spotterBeepFrequencies?: number[] })
        .__spotterBeepFrequencies ?? [],
  );
  expect(beepFrequencies).toEqual(
    expect.arrayContaining([485, 530, 575, 620, 665, 880]),
  );
  await page.clock.runFor(20_000);
  await expect(resumedTimer).toContainText('Complete');

  const active = page.locator('article.workout-card');
  const currentStrength = active.filter({ hasText: strengthName });
  await currentStrength
    .getByRole('button', { name: `Mark ${strengthName} as completed` })
    .click();
  await expect(
    currentStrength.getByRole('button', { name: `Reopen ${strengthName}` }),
  ).toBeVisible();
  await currentStrength
    .getByRole('button', { name: `Reopen ${strengthName}` })
    .click();
  await finishIncompleteWorkout(page);

  await page.getByRole('link', { name: 'History' }).click();
  const firstHistoryRow = page
    .locator('.history-entry')
    .filter({ hasText: templateName });
  await expect(firstHistoryRow).toBeVisible();
  await firstHistoryRow.locator('.history-open-button').click();
  const strengthHistory = page
    .locator('.history-exercise')
    .filter({ hasText: strengthName });
  const calisthenicsHistory = page
    .locator('.history-exercise')
    .filter({ hasText: calisthenicsName });
  const cardioHistory = page
    .locator('.history-exercise')
    .filter({ hasText: cardioName });
  await expect(strengthHistory).toContainText('40 kg × 10 reps');
  await expect(strengthHistory.locator('ol li')).toHaveCount(1);
  await expect(calisthenicsHistory).toContainText('12 reps');
  await expect(cardioHistory).toContainText('0m 20s');

  await page.getByRole('link', { name: 'Workout' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Measurement system').selectOption('imperial');
  await page.getByRole('link', { name: 'Workout' }).click();
  await page
    .getByRole('button', { name: `Start ${secondDayName}'s workout` })
    .click();
  const secondStrength = page
    .locator('article.workout-card')
    .filter({ hasText: strengthName });
  await expect(secondStrength.locator('.unit-label').first()).toHaveText('lb');
  await expect(
    secondStrength.getByLabel(`${strengthName} weight set 1`),
  ).toHaveAttribute('placeholder', '88.18');
  await expect(
    secondStrength.getByLabel(`${strengthName} repetitions set 1`),
  ).toHaveAttribute('placeholder', '10');
  await expect(
    secondStrength.getByLabel(`${strengthName} weight set 2`),
  ).toHaveAttribute('placeholder', 'Wt');
  await expect(
    secondStrength.getByLabel(`${strengthName} repetitions set 2`),
  ).toHaveAttribute('placeholder', 'Reps');

  await secondStrength.getByLabel(`${strengthName} weight set 2`).fill('100');
  await secondStrength
    .getByLabel(`${strengthName} repetitions set 2`)
    .fill('8');
  await secondStrength.getByRole('button', { name: '+ Add set' }).click();
  await secondStrength.getByLabel(`${strengthName} weight set 3`).fill('110');
  await secondStrength
    .getByLabel(`${strengthName} repetitions set 3`)
    .fill('6');
  const secondCardio = page
    .locator('article.workout-card')
    .filter({ hasText: cardioName });
  await expect(secondCardio).toContainText('Distance (mi)');
  await secondCardio.getByLabel(`${cardioName} distance`).fill('3.1');
  await finishIncompleteWorkout(page);

  await page
    .getByRole('button', { name: `Start ${thirdDayName}'s workout` })
    .click();
  const thirdStrength = page
    .locator('article.workout-card')
    .filter({ hasText: strengthName });
  const thirdCardio = page
    .locator('article.workout-card')
    .filter({ hasText: cardioName });
  await expect(
    thirdCardio.getByLabel(`${cardioName} prep time seconds`),
  ).toHaveValue('20');
  await expect(
    thirdCardio.getByLabel(`${cardioName} work time seconds`),
  ).toHaveValue('20');
  await expect(
    thirdCardio.getByLabel(`${cardioName} rest time seconds`),
  ).toHaveValue('0');
  await expect(
    thirdCardio.getByLabel(`${cardioName} interval iterations`),
  ).toHaveValue('1');
  await expect(
    thirdStrength.getByLabel(`${strengthName} weight set 3`),
  ).toHaveCount(0);
  await expect(
    thirdStrength.getByLabel(`${strengthName} weight set 1`),
  ).toHaveAttribute('placeholder', '100');
  await expect(
    thirdStrength.getByLabel(`${strengthName} repetitions set 1`),
  ).toHaveAttribute('placeholder', '8');
  await expect(
    thirdStrength.getByLabel(`${strengthName} weight set 2`),
  ).toHaveAttribute('placeholder', '110');
  await expect(
    thirdStrength.getByLabel(`${strengthName} repetitions set 2`),
  ).toHaveAttribute('placeholder', '6');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Measurement system').selectOption('metric');
  await page.getByRole('link', { name: 'Workout' }).click();
  await expect(thirdStrength.locator('.unit-label').first()).toHaveText('kg');
  await expect(
    thirdStrength.getByLabel(`${strengthName} weight set 1`),
  ).toHaveAttribute('placeholder', '45.36');
});

async function finishIncompleteWorkout(page: Page) {
  await page.getByRole('button', { name: 'Finish' }).click();
  const warning = page.getByRole('alertdialog');
  await expect(warning).toContainText('not marked complete');
  await warning.getByRole('button', { name: 'Finish anyway' }).click();
}
