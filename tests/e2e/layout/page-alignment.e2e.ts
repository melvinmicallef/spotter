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
