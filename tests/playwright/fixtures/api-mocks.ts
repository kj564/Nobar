/**
 * Shared setup — installs page.route() mocks for every /api/* endpoint
 * so specs don't need the Go backend to be running.
 */
import type { Page, Route } from '@playwright/test';
import {
  mockConfig,
  mockTrendingPage1,
  mockTrendingPage2,
  mockDiscover,
  mockSearchResults,
  mockMovieDetail,
} from '../fixtures/mocks';

export async function installApiMocks(page: Page) {
  await page.route('**/api/config', (route: Route) => route.fulfill({ json: mockConfig }));
  await page.route('**/api/trending**', (route: Route) => {
    const url = new URL(route.request().url());
    const page_ = url.searchParams.get('page') || '1';
    if (page_ === '1') return route.fulfill({ json: mockTrendingPage1 });
    if (page_ === '2') return route.fulfill({ json: mockTrendingPage2 });
    return route.fulfill({ json: { page: Number(page_), total_pages: 3, total_results: 57, results: [] } });
  });
  await page.route('**/api/discover**', (route: Route) => route.fulfill({ json: mockDiscover }));
  await page.route('**/api/search**', (route: Route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q') || '';
    if (q.toLowerCase().includes('searched')) {
      return route.fulfill({ json: mockSearchResults });
    }
    return route.fulfill({ json: { page: 1, total_pages: 0, total_results: 0, results: [] } });
  });
  await page.route('**/api/movie/**', (route: Route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1];
    return route.fulfill({ json: { ...mockMovieDetail, id: Number(id) || 101 } });
  });
}
