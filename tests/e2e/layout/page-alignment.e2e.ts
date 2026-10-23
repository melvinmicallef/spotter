import { expect, test } from '@playwright/test';

test('keeps long pages horizontally aligned with the other pages', async ({
  page,
}) => {
  for (const width of [390, 1024, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    const leftEdges: number[] = [];

    for (const [path, title] of [
      ['/exercises', 'Exercises'],
      ['/muscles', 'Muscles'],
      ['/settings', 'Settings'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      const heading = await page
        .locator('.section-heading')
        .evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return {
            left: bounds.left,
            right: window.innerWidth - bounds.right,
          };
        });
      expect(Math.abs(heading.left - heading.right)).toBeLessThanOrEqual(1);
      leftEdges.push(heading.left);

      const frame = await page.evaluate(() => {
        const header = document
          .querySelector('.app-header')!
          .getBoundingClientRect();
        const brand = document.querySelector('.brand')!.getBoundingClientRect();
        const navigation = document
          .querySelector('.bottom-nav')!
          .getBoundingClientRect();
        return {
          headerLeft: header.left,
          headerRight: header.right,
          brandLeft: brand.left,
          navigationLeft: navigation.left,
          navigationRight: navigation.right,
        };
      });
      expect(frame.headerLeft).toBe(0);
      expect(frame.headerRight).toBe(width);
      expect(frame.navigationLeft).toBe(0);
      expect(frame.navigationRight).toBe(width);
      expect(Math.abs(frame.brandLeft - heading.left)).toBeLessThanOrEqual(1);

      if (path === '/muscles' || path === '/settings') {
        const card = page
          .locator(
            path === '/muscles' ? '.muscle-directory-group' : '.settings-card',
          )
          .first();
        await expect(card).toBeVisible();
        const cardLeft = await card.evaluate(
          (node) => node.getBoundingClientRect().left,
        );
        expect(Math.abs(cardLeft - heading.left)).toBeLessThanOrEqual(1);
      }
    }

    expect(Math.max(...leftEdges) - Math.min(...leftEdges)).toBeLessThanOrEqual(
      1,
    );
  }
});

test('uses the same viewport gradient on every page', async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 720 });

    for (const theme of ['dark', 'light']) {
      await page.goto('/settings');
      await page.evaluate(
        (value) => localStorage.setItem('spotter-theme', value),
        theme,
      );

      let reference: number[][] | undefined;
      for (const path of [
        '/workout',
        '/history',
        '/muscles',
        '/exercises',
        '/templates',
        '/settings',
        '/stretching',
      ]) {
        await page.goto(path);
        await expect(page.locator('.app-shell')).toBeVisible();
        const screenshot = await page.screenshot();
        const pixels = await page.evaluate(
          async ({ base64, width: viewportWidth }) => {
            const bytes = Uint8Array.from(atob(base64), (character) =>
              character.charCodeAt(0),
            );
            const bitmap = await createImageBitmap(
              new Blob([bytes], { type: 'image/png' }),
            );
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(bitmap, 0, 0);
            const edge = viewportWidth === 390 ? 2 : 30;
            return [
              [edge, 160],
              [viewportWidth - edge, 160],
              [viewportWidth - edge, 100],
            ].map(([x, y]) =>
              Array.from(context.getImageData(x, y, 1, 1).data),
            );
          },
          { base64: screenshot.toString('base64'), width },
        );

        reference ??= pixels;
        const largestDifference = Math.max(
          ...pixels.flatMap((pixel, index) =>
            pixel.map((value, channel) =>
              Math.abs(value - reference![index]![channel]!),
            ),
          ),
        );
        expect(
          largestDifference,
          `${theme} background on ${path} at ${width}px`,
        ).toBeLessThanOrEqual(2);
      }
    }
  }
});
