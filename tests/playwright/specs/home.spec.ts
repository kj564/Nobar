import { test, expect } from '@playwright/test';
import { installApiMocks } from '../fixtures/api-mocks';

test.describe('Nobar — home page smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
    await page.goto('/');
  });

  test('header + brand visible', async ({ page }) => {
    await expect(page.locator('#header')).toBeVisible();
    await expect(page.getByText('Nobar').first()).toBeVisible();
  });

  test('hero stats populated dynamically (not hardcoded 240+/85/12)', async ({ page }) => {
    // CATEGORIES.length = 8 → rendered into #statCategories after init.
    await expect(page.locator('#statCategories')).toHaveText('8');
    // CREATORS.length = 3 (mock fixture) → #statCreators.
    await expect(page.locator('#statCreators')).toHaveText('3');
    // Trending total_results = 57 (mock) → formatViews(57) = "57".
    await expect(page.locator('#statMovies')).toHaveText('57');
  });

  test('footer year is current (2025), not stale 2026', async ({ page }) => {
    await expect(page.locator('footer')).toContainText('© 2025');
    await expect(page.locator('footer')).not.toContainText('© 2026');
  });

  test('trending row renders 3 cards from mocked backend', async ({ page }) => {
    const featuredCards = page.locator('#featuredRow .video-card');
    await expect(featuredCards).toHaveCount(3);
    await expect(featuredCards.first()).toContainText('Example Action Movie');
  });

  test('category grid populates with trending movies', async ({ page }) => {
    const gridCards = page.locator('#videoGrid .video-card');
    await expect(gridCards).toHaveCount(3);
    await expect(gridCards.nth(0)).toContainText('Example Action Movie');
    await expect(gridCards.nth(1)).toContainText('Example Drama Film');
    await expect(gridCards.nth(2)).toContainText('Example Comedy');
  });

  test('filter chips render 8 categories', async ({ page }) => {
    const chips = page.locator('#filterChips button');
    await expect(chips).toHaveCount(8);
    await expect(chips.first()).toHaveText('Trending');
  });

  test('creators row renders 3 cards from /api/config', async ({ page }) => {
    const creators = page.locator('#creatorRow > div');
    await expect(creators).toHaveCount(3);
    await expect(creators.first()).toContainText('Aisyah Putri');
  });

  test('XSS hardening — title with HTML metacharacters is escaped', async ({ page }) => {
    // Override trending mock to return a title with HTML markup.
    await page.unroute('**/api/trending**');
    await page.route('**/api/trending**', (route) => route.fulfill({
      json: {
        page: 1, total_pages: 1, total_results: 1,
        results: [
          { id: 777, title: '<img src=x onerror=alert(1)>', poster_path: '/x.jpg', release_date: '2024-01-01', vote_average: 5.0, vote_count: 1 },
        ],
      },
    }));
    await page.reload();

    const card = page.locator('#videoGrid .video-card').first();
    await expect(card).toBeVisible();
    // The onerror= payload must NOT appear as a live attribute on an <img>.
    const dangerousImgs = await page.locator('img[onerror*="alert"]').count();
    expect(dangerousImgs).toBe(0);
    // The raw text should appear escaped, not as a tag.
    const cardHtml = await card.evaluate((el) => el.innerHTML);
    expect(cardHtml).toContain('&lt;img');
  });
});
