import { expect, test } from '@playwright/test';

test('groups the duplicate icon with edit and delete on phone and desktop', async ({
  page,
  request,
  context,
}) => {
  const name = `Action icons ${crypto.randomUUID().slice(0, 8)}`;
  const response = await request.post('/api/templates', {
    data: { name, isActive: false, notes: null, exercises: [] },
  });
  expect(response.ok()).toBe(true);
  const template = (await response.json()) as { id: string };
  await page.goto(`/templates/${template.id}`);

  const actions = page.locator(
    '.template-details-heading .exercise-detail-actions',
  );
  const duplicate = actions.getByRole('button', {
    name: `Duplicate ${name}`,
    exact: true,
  });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(duplicate).toBeVisible();
    await expect(duplicate.locator('svg')).toBeVisible();
    await expect(duplicate).toHaveText('');
    await expect(
      page
        .locator('.template-details-actions')
        .getByRole('button', { name: /Duplicate/ }),
    ).toHaveCount(0);
    const boxes = await Promise.all([
      actions
        .getByRole('button', { name: `Edit ${name}`, exact: true })
        .boundingBox(),
      duplicate.boundingBox(),
      actions
        .getByRole('button', { name: `Delete ${name}`, exact: true })
        .boundingBox(),
    ]);
    expect(boxes.every(Boolean)).toBe(true);
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
    expect(Math.abs(boxes[1]!.y - boxes[2]!.y)).toBeLessThan(2);
    expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x);
    expect(boxes[2]!.x).toBeGreaterThan(boxes[1]!.x);
  }

  await context.setOffline(true);
  await expect(duplicate).toBeDisabled();
  await context.setOffline(false);
  await expect(duplicate).toBeEnabled();
  await duplicate.click();
  await expect(
    page.getByRole('heading', { name: `${name} copy`, exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(`/templates/${template.id}`);
});
