import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createApp } from '../../server/app';
import type { PlayerAssessment } from '../../shared/judging';

// The browser test isolates the judge boundary. Real Gemini + YOLO are checked by ai:check.
test('AI photos: both players submit, see judging, and receive identical scores without voting', async ({
  page: a,
  browser,
}) => {
  let finishJudge: () => void = () => {
    throw new Error('Judge has not received photos');
  };
  const instance = await createApp({
    origin: 'http://localhost:3101',
    databasePath: ':memory:',
    production: true,
    aiJudge: {
      judge: ({ photos }) =>
        new Promise<PlayerAssessment[]>((resolve) => {
          finishJudge = () =>
            resolve(
              photos.map((photo, i) => ({
                playerId: photo.playerId,
                valid: true,
                confidence: 0.95,
                fulfillment: i ? 70 : 50,
                presentation: 25,
                score: i ? 95 : 75,
                objects: ['cup'],
                reason: 'Test fixture: the presented cup fulfills the challenge.',
                detector: 'yolov8',
                detections: [{ label: 'cup', confidence: 0.92, box: [0.2, 0.2, 0.8, 0.8] }],
              })),
            );
        }),
    },
  });
  await new Promise<void>((resolve) => instance.http.listen(3101, resolve));
  const contextB = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const b = await contextB.newPage();
  try {
    await a.goto('http://localhost:3101');
    await a.getByRole('button', { name: 'Start a Battle', exact: true }).first().click();
    await expect(a.getByText(/AI judge on/)).toBeVisible();
    await a.getByRole('textbox', { name: 'Your player name' }).fill('Alex');
    await a.getByRole('button', { name: 'Create Battle', exact: true }).click();
    await expect(a.getByRole('heading', { name: 'Every rivalry starts here.' })).toBeVisible();
    await b.goto(a.url());
    await b.getByRole('textbox', { name: 'Your player name' }).fill('Jamie');
    await b.getByRole('button', { name: 'Join Battle', exact: true }).click();
    for (const page of [a, b]) {
      await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
      await expect(page.locator('video[aria-label="Your live camera preview"]')).toHaveJSProperty(
        'readyState',
        4,
      );
      await page.getByRole('button', { name: 'I’m ready' }).click();
    }
    await expect(a.getByRole('button', { name: 'I’ve got it! Send snapshot' })).toBeEnabled();
    await a.getByRole('button', { name: 'I’ve got it! Send snapshot' }).click();
    await expect(a.getByRole('button', { name: 'Photo locked in' })).toBeDisabled();
    await expect(b.getByRole('button', { name: 'Yes, that counts' })).toHaveCount(0);
    await b.getByRole('button', { name: 'I’ve got it! Send snapshot' }).click();
    await expect(a.getByRole('heading', { name: 'Let the photos decide.' })).toBeVisible();
    await expect(a.getByAltText('Alex’s submitted photo')).toHaveJSProperty('complete', true);
    await a.screenshot({ path: 'test-results/ai-judging-desktop.png', fullPage: true });
    finishJudge();
    await expect(a.getByRole('heading', { name: 'Jamie wins the round.' })).toBeVisible();
    await expect(b.getByRole('heading', { name: 'You win the round.' })).toBeVisible();
    for (const page of [a, b]) {
      await expect(page.locator('.ai-score b')).toHaveText(['75/100', '95/100']);
      await expect(page.getByText('Recognized: cup', { exact: true })).toHaveCount(2);
    }
    await a.screenshot({ path: 'test-results/ai-verdict-desktop.png', fullPage: true });
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({ path: 'test-results/ai-verdict-mobile.png', fullPage: true });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page: a })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations.map((v) => v.id)).toEqual([]);
  } finally {
    await contextB.close();
    await instance.close();
  }
});
