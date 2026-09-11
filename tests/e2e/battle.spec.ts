import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
}

async function openBattle(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a Battle', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Your player name' }).fill(name);
  await page.getByRole('button', { name: 'Create Battle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Every rivalry starts here.' })).toBeVisible();
}
async function enableCamera(page: Page) {
  await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
  await expect(page.locator('video[aria-label="Your live camera preview"]')).toHaveJSProperty(
    'readyState',
    4,
  );
}
async function winRound(a: Page, b: Page, capture: 'click' | 'space' = 'click', shot?: string) {
  await expect(a.getByRole('button', { name: 'I’ve got it! Send snapshot' })).toBeEnabled();
  await expect(b.getByRole('button', { name: 'I’ve got it! Send snapshot' })).toBeEnabled();
  expect(await a.locator('#challenge-heading').innerText()).toBe(
    await b.locator('#challenge-heading').innerText(),
  );
  if (capture === 'space') {
    // Both hands are on the object: the shortcut has to work without focus on the button.
    await a.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await a.keyboard.press('Space');
  } else await a.getByRole('button', { name: 'I’ve got it! Send snapshot' }).click();
  await expect(b.getByRole('heading', { name: 'Did they do it?' })).toBeVisible();
  await expect(b.getByText('The snapshot', { exact: true })).toBeVisible();
  await expect(b.getByAltText('Your opponent’s submitted challenge evidence')).toHaveJSProperty(
    'complete',
    true,
  );
  // The earlier frames are what makes an action reviewable; they must actually render.
  for (const frame of await b.getByAltText(/Earlier evidence frame/).all()) {
    await expect(frame).toHaveJSProperty('complete', true);
    const box = (await frame.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(4 / 3, 1);
  }
  if (shot) await b.screenshot({ path: shot, fullPage: true });
  await b.getByRole('button', { name: 'Yes, that counts' }).click();
  await expect(a.getByRole('heading', { name: 'You win the round.' })).toBeVisible();
  await expect(b.getByRole('heading', { name: 'Alex wins the round.' })).toBeVisible();
}

test('two real browser contexts: invite, WebRTC cameras, review, match, share, rematch, refresh and leave', async ({
  page: a,
  browser,
}) => {
  const errors: string[] = [];
  const contextB = await browser.newContext({
    permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
    viewport: { width: 1280, height: 900 },
  });
  const b = await contextB.newPage();
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  }
  for (const p of [a, b])
    await p.addInitScript(() => {
      const streams: MediaStream[] = [];
      Object.assign(window, { __observedStreams: streams });
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        streams.push(stream);
        return stream;
      };
    });
  await openBattle(a, 'Alex');
  await a.getByRole('button', { name: 'Copy invite link' }).click();
  const invite = await a.getByRole('textbox', { name: 'Battle invite link' }).inputValue();
  expect(invite).toBe(a.url());
  await b.goto(invite);
  await b.getByRole('textbox', { name: 'Your player name' }).fill('Jamie');
  await b.getByRole('button', { name: 'Join Battle' }).click();
  await expect(a.getByRole('heading', { name: 'The rivalry is ready.' })).toBeVisible();
  await enableCamera(a);
  await enableCamera(b);
  for (const p of [a, b]) {
    await expect(p.locator('.camera-opponent video')).not.toHaveClass(/video-hidden/);
    await expect(p.locator('.camera-opponent video')).toHaveJSProperty('readyState', 4);
  }
  await a.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await expect(a.getByRole('button', { name: 'Mute microphone', exact: true })).toBeVisible();
  await a.screenshot({ path: 'test-results/lobby-desktop.png', fullPage: true });
  await accessible(a);
  await a.getByRole('button', { name: 'I’m ready' }).click();
  await b.getByRole('button', { name: 'I’m ready' }).click();
  await expect(a.getByText('GET READY', { exact: true })).toBeVisible();
  await expect(b.getByText('GET READY', { exact: true })).toBeVisible();
  await a.screenshot({ path: 'test-results/countdown-desktop.png', fullPage: true });
  await winRound(a, b, 'click', 'test-results/review-desktop.png');
  await a.screenshot({ path: 'test-results/round-result.png', fullPage: true });
  await expect(a.getByRole('progressbar', { name: 'Round time remaining' })).toBeVisible();
  await a.screenshot({ path: 'test-results/arena-desktop.png', fullPage: true });
  await winRound(a, b, 'space');
  await winRound(a, b);
  await expect(a.getByRole('heading', { name: 'You took the arena.' })).toBeVisible();
  await expect(b.getByRole('heading', { name: 'Alex takes the arena.' })).toBeVisible();
  await expect(a.locator('.final-score strong').first()).toHaveText('3');
  await expect(b.locator('.final-score strong').last()).toHaveText('3');
  // Every round the winner actually won carries the time it took.
  await expect(a.locator('.round-recap .recap-time')).toHaveCount(3);
  await a.screenshot({ path: 'test-results/match-result.png', fullPage: true });
  await accessible(a);
  await a.setViewportSize({ width: 390, height: 844 });
  await a.screenshot({ path: 'test-results/match-result-mobile.png', fullPage: true });
  expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await a.setViewportSize({ width: 1440, height: 1000 });
  // Force the documented clipboard fallback to avoid opening the OS share sheet in an unattended test.
  await a.evaluate(() =>
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }),
  );
  await a.getByRole('button', { name: 'Share results' }).click();
  await expect(a.getByRole('button', { name: 'Result copied' })).toBeVisible();
  await a.getByRole('button', { name: 'Run it back' }).click();
  await expect(b.getByText('Alex wants a rematch. Your move.')).toBeVisible();
  await b.getByRole('button', { name: 'Run it back' }).click();
  await expect(a.getByText('GET READY', { exact: true })).toBeVisible();
  await expect(a.locator('.scoreboard strong').first()).toHaveText('0');
  // A refresh retains identity and membership but deliberately requires camera consent again.
  await b.reload();
  await expect(a.getByText(/Your opponent disconnected. Holding/)).toBeVisible();
  await enableCamera(b);
  await expect(a.getByRole('button', { name: 'I’ve got it! Send snapshot' })).toBeEnabled();
  await expect(b.locator('.camera-opponent video')).not.toHaveClass(/video-hidden/);
  await a.getByRole('button', { name: 'Leave battle', exact: true }).click();
  await a.getByRole('button', { name: 'Leave battle', exact: true }).last().click();
  await expect(a).toHaveURL('http://localhost:3100/');
  await expect(b.getByRole('heading', { name: 'Call it a timeout.' })).toBeVisible();
  await b.screenshot({ path: 'test-results/cancelled.png', fullPage: true });
  for (const p of [a, b])
    expect(
      await p.evaluate(() =>
        (window as unknown as { __observedStreams: MediaStream[] }).__observedStreams
          .flatMap((s) => s.getTracks())
          .every((t) => t.readyState === 'ended'),
      ),
    ).toBe(true);
  expect(errors).toEqual([]);
  await contextB.close();
});

test('landing, narrow layout, dialogs and invalid routes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your room is the arena.' })).toBeVisible();
  await accessible(page);
  await page.screenshot({ path: 'test-results/landing-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'See how it works' }).click();
  await expect(page.locator('#how-it-works')).toBeInViewport();
  await page.getByRole('button', { name: 'Privacy', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/landing-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Joining from a code someone read out, rather than from a link.
  await page.goto('/');
  const codeField = page.getByRole('textbox', { name: /Paste the code or link/ });
  await codeField.fill('not-a-code');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('That is not a battle code.')).toBeVisible();
  await codeField.fill('https://example.invalid/battle/ffffffffff');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3100/battle/FFFFFFFFFF');
  await page.getByRole('textbox', { name: 'Your player name' }).fill('Mobile');
  await page.getByRole('button', { name: 'Join Battle' }).click();
  await expect(page.getByText('This battle no longer exists. Start a new one.')).toBeVisible();
  await page.goto('/battle/not-a-room');
  await expect(page.getByRole('heading', { name: 'This battle no longer exists.' })).toBeVisible();
});

test('mobile arena, offline recovery, review and 200% zoom-equivalent reflow', async ({
  page: a,
  browser,
}) => {
  await a.setViewportSize({ width: 390, height: 844 });
  const contextB = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    permissions: ['camera', 'microphone'],
  });
  const b = await contextB.newPage();
  await openBattle(a, 'Alex');
  await b.goto(a.url());
  await b.getByRole('textbox', { name: 'Your player name' }).fill('Jamie');
  await b.getByRole('button', { name: 'Join Battle' }).click();
  await enableCamera(a);
  await enableCamera(b);
  await a.getByRole('button', { name: 'I’m ready' }).click();
  await b.getByRole('button', { name: 'I’m ready' }).click();
  await expect(a.getByRole('button', { name: 'I’ve got it! Send snapshot' })).toBeEnabled();
  await a.screenshot({ path: 'test-results/arena-mobile.png', fullPage: true });
  expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await a.context().setOffline(true);
  await expect.poll(() => a.evaluate(() => navigator.onLine)).toBe(false);
  await expect(b.getByText(/Your opponent disconnected. Holding/)).toBeVisible({ timeout: 22_000 });
  await b.screenshot({ path: 'test-results/reconnecting-tablet.png', fullPage: true });
  await a.context().setOffline(false);
  await expect(a.getByRole('button', { name: 'I’ve got it! Send snapshot' })).toBeEnabled();
  await expect(b.getByRole('button', { name: 'I’ve got it! Send snapshot' })).toBeEnabled();
  await b.getByRole('button', { name: 'I’ve got it! Send snapshot' }).click();
  await expect(a.getByRole('heading', { name: 'Did they do it?' })).toBeVisible();
  await expect(a.getByRole('button', { name: 'Yes, that counts' })).toBeInViewport({ ratio: 1 });
  await a.screenshot({ path: 'test-results/review-mobile.png', fullPage: true });
  await a.getByRole('button', { name: 'Yes, that counts' }).click();
  await expect(a.getByRole('heading', { name: 'Jamie wins the round.' })).toBeVisible();
  await a.getByRole('button', { name: 'Leave battle', exact: true }).click();
  await a.getByRole('button', { name: 'Leave battle', exact: true }).last().click();
  // A 1280×900 display at 200% browser zoom has a 640×450 CSS viewport.
  // CSS `zoom` would not change media queries and is not a browser-zoom test.
  const emulation = await a.context().newCDPSession(a);
  await emulation.send('Emulation.setDeviceMetricsOverride', {
    width: 640,
    height: 450,
    deviceScaleFactor: 2,
    mobile: false,
  });
  expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await a.getByRole('button', { name: 'Start a Battle', exact: true }).first().click();
  await expect(a.getByRole('button', { name: 'Create Battle', exact: true })).toBeVisible();
  await a.screenshot({ path: 'test-results/zoom-equivalent-dialog.png', fullPage: true });
  await contextB.close();
});

test('permission failure is recoverable and camera-off players cannot ready', async ({ page }) => {
  await openBattle(page, 'Permission');
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('test raw private error', 'NotAllowedError');
    };
  });
  await page.reload();
  await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
  await expect(page.getByText(/Camera access is required to play/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'I’m ready' })).toBeDisabled();
  await expect(page.getByText('test raw private error')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/camera-error-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('random matchmaking: cancel a search, match two browsers and connect their cameras', async ({
  page: a,
  browser,
}) => {
  const contextB = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const b = await contextB.newPage();
  const search = async (page: Page, name: string) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start a Battle', exact: true }).first().click();
    await page.getByRole('radio', { name: /Random opponent/ }).check();
    await page.getByRole('textbox', { name: 'Your player name' }).fill(name);
    await page.getByRole('button', { name: 'Find opponent', exact: true }).click();
  };
  try {
    await search(a, 'QueueA');
    await expect(a.getByRole('heading', { name: 'Finding your opponent.' })).toBeVisible();
    await expect(a.getByRole('button', { name: 'Copy invite link' })).toHaveCount(0);
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({ path: 'test-results/matchmaking-mobile.png', fullPage: true });
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await accessible(a);
    const oldRoom = a.url();
    await a.getByRole('button', { name: 'Cancel search' }).click();
    await expect(a).toHaveURL('/');
    await search(a, 'QueueA');
    await expect(a.getByRole('heading', { name: 'Finding your opponent.' })).toBeVisible();
    expect(a.url()).not.toBe(oldRoom);
    await search(b, 'QueueB');
    await expect(b.getByRole('heading', { name: 'The rivalry is ready.' })).toBeVisible();
    await expect(a.getByRole('heading', { name: 'The rivalry is ready.' })).toBeVisible();
    expect(a.url()).toBe(b.url());
    await enableCamera(a);
    await enableCamera(b);
    await expect(a.locator('.camera-opponent video')).toHaveJSProperty('readyState', 4);
    await a.getByRole('button', { name: 'I’m ready' }).click();
    await b.getByRole('button', { name: 'I’m ready' }).click();
    await expect(a.getByText('GET READY', { exact: true })).toBeVisible();
    await a.getByRole('button', { name: 'Leave battle', exact: true }).click();
    await a.getByRole('button', { name: 'Leave battle', exact: true }).last().click();
    await expect(b.getByRole('heading', { name: 'Call it a timeout.' })).toBeVisible();
  } finally {
    await contextB.close();
  }
});
