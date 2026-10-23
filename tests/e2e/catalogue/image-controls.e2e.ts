import { expect, test } from '@playwright/test';

const image = {
  name: 'exercise.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
};

test('reveals exercise upload controls only after removing the preview', async ({
  page,
  request,
}) => {
  const name = `Image controls ${crypto.randomUUID().slice(0, 8)}`;
  await page.goto('/exercises/new');
  await page.getByLabel('Exercise name', { exact: true }).fill(name);
  const upload = page.getByRole('button', { name: /Drop an image here/ });
  const file = page.getByLabel('Choose an exercise image', { exact: true });
  const remove = page.getByRole('button', {
    name: 'Remove exercise image',
    exact: true,
  });

  await expect(upload).toBeVisible();
  await file.setInputFiles(image);
  await expect(
    page.getByRole('img', { name: `${name} image preview` }),
  ).toBeVisible();
  await expect(upload).toHaveCount(0);
  await expect(file).toHaveCount(0);
  await expect(page.getByLabel('Exercise name', { exact: true })).toHaveValue(
    name,
  );
  await remove.click();
  await expect(upload).toBeVisible();
  await file.setInputFiles(image);
  await page
    .getByRole('button', { name: 'Create exercise', exact: true })
    .click();
  await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]+$/);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;

  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(upload).toHaveCount(0);
  const original = await request.get('/api/exercises');
  const originalMedia = (
    (await original.json()) as Array<{ id: string; media: { id: string } }>
  ).find((exercise) => exercise.id === id)!.media.id;
  await remove.click();
  await expect(upload).toBeVisible();
  await expect(
    page.getByText('Image will be removed when you save.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(upload).toHaveCount(0);
  await expect(remove).toBeVisible();

  await remove.click();
  await file.setInputFiles({ ...image, name: 'replacement.png' });
  await expect(upload).toHaveCount(0);
  // Preview changes are local until the exercise is saved.
  expect((await request.get(`/api/media/${originalMedia}`)).ok()).toBe(true);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(`/exercises/${id}`);
  await page.reload();
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(upload).toHaveCount(0);
  await expect(
    page.getByRole('img', { name: `${name} demonstration`, exact: true }),
  ).toBeVisible();
  const updated = await request.get('/api/exercises');
  const replacement = (
    (await updated.json()) as Array<{
      id: string;
      media: { id: string; originalName: string };
    }>
  ).find((exercise) => exercise.id === id)!.media;
  expect(replacement.originalName).toBe('replacement.png');
  expect(replacement.id).not.toBe(originalMedia);
});
