import { test, expect } from '@playwright/test';
import { installApiMocks } from '../fixtures/api-mocks';

test.describe('Nobar — modal + server picker', () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
    await page.goto('/');
  });

  test('clicking a card opens modal with fetched details', async ({ page }) => {
    const firstCard = page.locator('#videoGrid .video-card').first();
    await firstCard.click();

    await expect(page.locator('#videoModal')).toHaveClass(/open/);
    await expect(page.locator('#modalTitle')).toHaveText('Example Action Movie');
    await expect(page.locator('#modalDescription')).toContainText('A description of the example action movie');
    await expect(page.locator('#modalCreator')).toHaveText('Director Name');
    await expect(page.locator('#modalDuration')).toHaveText('1j 58m');
    await expect(page.locator('#modalYear')).toHaveText('2024');
  });

  test('server picker renders from /api/config and first (recommended) is auto-selected', async ({ page }) => {
    await page.locator('#videoGrid .video-card').first().click();
    await expect(page.locator('#serverPicker .server-btn')).toHaveCount(2);
    await expect(page.locator('#serverPicker .server-btn').first()).toHaveClass(/active/);
    await expect(page.locator('#currentServerLabel')).toContainText('Server 1 (HD)');
  });

  test('clicking alternate server swaps iframe src + shows toast', async ({ page }) => {
    await page.locator('#videoGrid .video-card').first().click();
    await page.locator('#serverPicker .server-btn').nth(1).click();

    await expect(page.locator('#currentServerLabel')).toContainText('Server 2 (Fast)');
    await expect(page.locator('#toast')).toHaveClass(/toast-show/);

    const iframeSrc = await page.locator('#videoIframe').getAttribute('src');
    expect(iframeSrc).toContain('/alt/');
    expect(iframeSrc).toContain('101');
  });

  test('Escape closes the modal', async ({ page }) => {
    await page.locator('#videoGrid .video-card').first().click();
    await expect(page.locator('#videoModal')).toHaveClass(/open/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#videoModal')).not.toHaveClass(/open/);
  });

  test('similar movies + cast sections render from detail response', async ({ page }) => {
    await page.locator('#videoGrid .video-card').first().click();
    await expect(page.locator('#modalSimilar')).toBeVisible();
    await expect(page.locator('#modalSimilarRow .similar-card')).toHaveCount(1);
    await expect(page.locator('#modalCast')).toBeVisible();
    await expect(page.locator('#modalCastList > div')).toHaveCount(2);
    await expect(page.locator('#modalCastList')).toContainText('Actor One');
    await expect(page.locator('#modalCastList')).toContainText('sebagai Hero');
  });
});
