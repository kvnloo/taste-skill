import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Deterministic gate before the explore lanes: the phone chrome is on screen and Retro opens by tap.
test('mission phone chrome reachable', async ({ app, browser }) => {
  await app.open('/mission?sample=1');
  await expect(browser.locator('#lens')).toBeVisible();
  await expect(browser.locator('[data-span="week"]')).toBeVisible();
  await browser.locator('#lens').click();
  await expect(browser.locator('#insights .sink').first()).toBeVisible();
});
