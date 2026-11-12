import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { agents } from './agent.ts';
import { armyBrowser } from './browser.ts';

// site/ = taste-atlas at the exact commit (public sample only, no data/); canary/ = the same build with seeded UX defects.
const app = { url: process.env.SITE_URL ?? 'http://127.0.0.1:18941/' }, canary = { url: process.env.CANARY_URL ?? 'http://127.0.0.1:18942/' };
const phone = { width: 390, height: 844 }, narrow = { width: 360, height: 800 }, desktop = { width: 1600, height: 1000 };
const target = (name: string, a: { url: string }, viewport: typeof phone) => ({ name, engine: web({ viewport, connect: armyBrowser(viewport) }), app: a });

export default {
  tests: ['tests/smoke.e2e.ts'],
  agents,
  targets: [target('phone390', app, phone), target('phone360', app, narrow), target('desktop', app, desktop), target('canary390', canary, phone)],
  output: '.e2e/army',
} satisfies E2EConfig;
