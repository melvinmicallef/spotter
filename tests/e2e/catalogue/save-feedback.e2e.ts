import { expect, test, type Page } from '@playwright/test';

for (const catalogue of ['exercises', 'templates'] as const) {
  const exercise = catalogue === 'exercises';
  const fieldLabel = exercise ? 'Exercise name' : 'Template name';
  const createLabel = exercise ? 'Create exercise' : 'Create template';
  const saveLabel = exercise ? 'Save changes' : 'Save weekly template';

  test(`${catalogue} show pending feedback and allow retry after a failed save`, async ({
    page,
  }) => {
    const name = `Pending ${catalogue} ${crypto.randomUUID().slice(0, 8)}`;
    await page.goto(`/${catalogue}/new`);
    await page.getByLabel(fieldLabel, { exact: true }).fill(name);

    const creation = await holdMutation(page, `/api/${catalogue}`, 'POST');
    await page.getByRole('button', { name: createLabel, exact: true }).click();
    try {
      await expectPending(page, 'Creating…');
      // Even an extra form submission must not start a second request.
      await page.locator('form').evaluate((form: HTMLFormElement) => {
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      });
      expect(creation.count()).toBe(1);
    } finally {
      creation.release();
    }
    await expect(page).toHaveURL(new RegExp(`/${catalogue}/[0-9a-f-]+$`));
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await page.unroute(`**/api/${catalogue}`);

    const id = new URL(page.url()).pathname.split('/').at(-1)!;
    await page
      .getByRole('button', { name: `Edit ${name}`, exact: true })
      .click();
    const updatedName = `${name} updated`;
    await page.getByLabel(fieldLabel, { exact: true }).fill(updatedName);
    const update = await holdMutation(
      page,
      `/api/${catalogue}/${id}`,
      'PATCH',
      true,
    );
    await page.getByRole('button', { name: saveLabel, exact: true }).click();
    try {
      await expectPending(page, 'Saving…');
    } finally {
      update.release();
    }
    const save = page.getByRole('button', { name: saveLabel, exact: true });
    await expect(save).toBeEnabled();
    await expect(save).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByLabel(fieldLabel, { exact: true })).toHaveValue(
      updatedName,
    );
    await page.unroute(`**/api/${catalogue}/${id}`);

    await save.click();
    await expect(page).toHaveURL(new RegExp(`/${catalogue}/${id}$`));
    await expect(
      page.getByRole('heading', { name: updatedName, exact: true }),
    ).toBeVisible();
  });
}

async function expectPending(page: Page, label: string) {
  const button = page.getByRole('button', { name: label, exact: true });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button.locator('.save-spinner')).toBeVisible();
}

async function holdMutation(
  page: Page,
  path: string,
  method: string,
  fail = false,
) {
  let release!: () => void;
  let requests = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== method) {
      await route.fallback();
      return;
    }
    requests += 1;
    await gate;
    if (fail) {
      await route.fulfill({
        status: 500,
        json: {
          error: { code: 'TEST_FAILURE', message: 'Please retry the save' },
        },
      });
    } else {
      await route.continue();
    }
  });
  return { release, count: () => requests };
}
