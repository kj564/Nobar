import { test, expect } from '@playwright/test';
import { installApiMocks } from '../fixtures/api-mocks';

test.describe('Nobar — search flow', () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
    await page.goto('/');
  });

  test('typing in search triggers debounced /api/search request', async ({ page }) => {
    let searchCalled = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/search')) searchCalled = true;
    });

    await page.locator('#searchInput').fill('searched');
    // Debounce is 350ms — wait for the request.
    await expect.poll(() => searchCalled, { timeout: 3_000 }).toBe(true);

    // Search indicator becomes visible.
    await expect(page.locator('#searchIndicator')).toBeVisible();
    await expect(page.locator('#searchQueryLabel')).toHaveText('"searched"');

    // Grid now shows the searched result.
    const gridCards = page.locator('#videoGrid .video-card');
    await expect(gridCards).toHaveCount(1);
    await expect(gridCards.first()).toContainText('Searched Movie Title');
  });

  test('clearing search input returns to trending', async ({ page }) => {
    await page.locator('#searchInput').fill('searched');
    await expect(page.locator('#searchIndicator')).toBeVisible();

    await page.locator('#searchClear').click();
    await expect(page.locator('#searchIndicator')).toBeHidden();
    await expect(page.locator('#videoGrid .video-card')).toHaveCount(3);
  });

  test('Escape exits search mode', async ({ page }) => {
    await page.locator('#searchInput').fill('searched');
    await expect(page.locator('#searchIndicator')).toBeVisible();

    await page.locator('#searchInput').press('Escape');
    await expect(page.locator('#searchIndicator')).toBeHidden();
    await expect(page.locator('#videoGrid .video-card')).toHaveCount(3);
  });

  test('search query shorter than 2 chars does not fire', async ({ page }) => {
    let searchFired = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/search')) searchFired = true;
    });
    await page.locator('#searchInput').fill('a');
    await page.waitForTimeout(600); // wait beyond debounce window
    expect(searchFired).toBe(false);
  });
});
