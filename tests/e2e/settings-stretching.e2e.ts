import { expect, test } from '@playwright/test';

const posterPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('keeps device preferences and shows a saved stretching poster offline', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings' }).click();

  const measurement = page.getByLabel('Measurement system');
  await expect(measurement).toHaveValue('metric');
  await measurement.selectOption('imperial');
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('spotter-measurement-system')),
    )
    .toBe('imperial');
  await page.reload();
  await expect(page.getByLabel('Measurement system')).toHaveValue('imperial');

  const imageChooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', {
      name: /Drop an image here or click to choose a file/,
    })
    .click();
  const chooser = await imageChooser;
  await chooser.setFiles({
    name: 'stretching-poster.png',
    mimeType: 'image/png',
    buffer: posterPng,
  });

  const preview = page.getByRole('img', { name: 'Current stretching poster' });
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);

  await context.setOffline(true);
  await page.getByRole('link', { name: 'Workout' }).click();
  await page.getByRole('button', { name: 'Show stretching' }).click();
  const stretchingPoster = page.getByRole('img', { name: 'Stretching poster' });
  await expect(stretchingPoster).toBeVisible();
  await expect
    .poll(() =>
      stretchingPoster.evaluate(
        (image: HTMLImageElement) => image.naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
  await expect(stretchingPoster).toHaveCSS('object-fit', 'contain');

  await context.setOffline(false);
  await expect(page.getByRole('status')).toContainText('Online');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Remove stretching poster' }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('Remove stretching poster?');
  await confirmation
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(preview).toBeVisible();

  await page.getByRole('button', { name: 'Remove stretching poster' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove poster' })
    .click();
  await expect(preview).toHaveCount(0);
  await page.getByRole('link', { name: 'Workout' }).click();
  await page.getByRole('button', { name: 'Show stretching' }).click();
  await expect(
    page.getByText('Upload a stretching image in Settings to see it here.'),
  ).toBeVisible();
});
