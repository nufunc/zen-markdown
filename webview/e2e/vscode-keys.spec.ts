import { test, expect, Page } from '@playwright/test';
import { load, lastChange } from './harness';
import { placeCaretAtEnd } from './caret';

// VS Code 웹뷰는 contentWindow의 keydown(버블)을 모두 워크벤치로 넘겨 VS Code 단축키를 실행한다.
// 2026-09-27 격리한 VS Code 측정에서 Ctrl+B가 굵게와 함께 사이드바를 닫았다. 그 리스너를 앱보다 먼저 달아 흉내 낸다.
const forwarded = (page: Page) => page.evaluate(() => (window as any).__forwarded as string[]);
const selectLine = async (page: Page) => {
  await placeCaretAtEnd(page, page.locator('.bn-editor p').first());
  await page.keyboard.press('Shift+Home');
  await page.evaluate(() => { (window as any).__forwarded = []; });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__forwarded = [];
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !['Control', 'Shift', 'Meta', 'Alt'].includes(e.key)) (window as any).__forwarded.push((e.shiftKey ? 'Shift+' : '') + e.key.toLowerCase());
    });
  });
  await load(page, 'hello world here\n');
});

test('앱이 처리한 Ctrl+B는 VS Code로 넘어가지 않는다', async ({ page }) => {
  await selectLine(page);
  await page.keyboard.press('Control+b');
  await expect.poll(() => lastChange(page)).toBe('**hello world here**\n');
  expect(await forwarded(page)).toEqual([]);
});

test('앱이 처리하지 않은 Ctrl+S는 VS Code로 넘어간다', async ({ page }) => {
  await selectLine(page);
  await page.keyboard.press('Control+s');
  expect(await forwarded(page)).toEqual(['s']);
});

test('Ctrl+Shift+H는 앱의 바꾸기 창을 열지 않고 VS Code에 맡긴다', async ({ page }) => {
  await selectLine(page);
  await page.keyboard.press('Control+Shift+h');
  await page.waitForTimeout(200);
  await expect(page.locator('input[placeholder="Replace"]')).toHaveCount(0);
  expect(await forwarded(page)).toEqual(['Shift+h']);
});
