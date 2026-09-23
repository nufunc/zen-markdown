import { test, expect, Page } from '@playwright/test';

// P0: 전송하지 않은 로컬 편집이 있을 때 도착한 외부 변경이 그 편집을 지우지 않아야 한다.
// 호스트로 나간 메시지는 window.__msgs에 쌓는다.
const mockVsCodeApi = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) {
      window.__vscode = {
        postMessage: (msg) => { window.__msgs.push(msg); },
        getState: () => ({}),
        setState: () => {}
      };
    }
    return window.__vscode;
  };
`;

const INITIAL = '# Title\n\nbody';
const EXTERNAL = '# Title\n\nbody\n\nEXTERNAL';

const changes = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string));

const sendExternal = (page: Page) =>
  page.evaluate((text) => window.postMessage({ type: 'external_update', text }, '*'), EXTERNAL);

/** 첫 문단 끝에 ' LOCAL'을 입력하고, 디바운스가 끝나기 전에 외부 변경을 보낸다 */
const typeLocalThenExternal = async (page: Page) => {
  await page.locator('.bn-editor p', { hasText: 'body' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' LOCAL');
  await page.waitForTimeout(100);
  await sendExternal(page);
};

const bar = (page: Page) => page.locator('.external-conflict-bar');

test.describe('External change conflict (P0)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(mockVsCodeApi);
    await page.goto('/');
    await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), INITIAL);
    await page.waitForSelector('.bn-editor');
  });

  test('로컬 편집이 없으면 막대 없이 채택한다', async ({ page }) => {
    await page.locator('.bn-editor p', { hasText: 'body' }).click();
    await sendExternal(page);
    // 에디터 밖을 눌러 focusout으로 보류분을 채택시킨다
    await page.locator('button[data-tooltip="Raw Markdown Mode"]').click();
    await page.waitForTimeout(500);
    await expect(bar(page)).toHaveCount(0);
    expect((await changes(page)).some(t => t.includes('LOCAL'))).toBe(false);
  });

  test('Raw 버튼을 눌러도 로컬 편집을 버리지 않고 막대를 띄운다', async ({ page }) => {
    await typeLocalThenExternal(page);
    await page.locator('button[data-tooltip="Raw Markdown Mode"]').click();
    await expect(bar(page)).toBeVisible();
    // 충돌이 풀리기 전에는 모드를 바꾸지 않는다
    await expect(page.locator('.bn-editor')).toBeVisible();
    expect(await page.locator('.bn-editor').innerText()).toContain('LOCAL');
  });

  test('1.5초 타이머도 로컬 편집이 있으면 채택하지 않는다', async ({ page }) => {
    await typeLocalThenExternal(page);
    await page.waitForTimeout(2500);
    await expect(bar(page)).toBeVisible();
    expect(await page.locator('.bn-editor').innerText()).toContain('LOCAL');
  });

  test('충돌 후 "내 편집 유지"는 로컬 텍스트를 보낸다', async ({ page }) => {
    await typeLocalThenExternal(page);
    await page.locator('button[data-tooltip="Raw Markdown Mode"]').click();
    await bar(page).getByRole('button', { name: 'Keep my edits' }).click();
    await page.waitForTimeout(300);
    const sent = await changes(page);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[sent.length - 1]).toContain('LOCAL');
    await expect(bar(page)).toHaveCount(0);
  });

  test('충돌 후 "외부 변경 채택"은 로컬 편집을 버린다', async ({ page }) => {
    await typeLocalThenExternal(page);
    await page.locator('button[data-tooltip="Raw Markdown Mode"]').click();
    await bar(page).getByRole('button', { name: 'Use external version' }).click();
    await page.waitForTimeout(1000);
    const text = await page.locator('.bn-editor').innerText();
    expect(text).toContain('EXTERNAL');
    expect(text).not.toContain('LOCAL');
    expect((await changes(page)).some(t => t.includes('LOCAL'))).toBe(false);
    await expect(bar(page)).toHaveCount(0);
  });

  test('막대가 떠 있는 동안 입력해도 change가 나가지 않는다', async ({ page }) => {
    await typeLocalThenExternal(page);
    await page.waitForTimeout(2500);
    await expect(bar(page)).toBeVisible();
    await page.locator('.bn-editor p', { hasText: 'LOCAL' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' MORE');
    await page.waitForTimeout(1500);
    expect(await changes(page)).toEqual([]);
  });

  test('Raw 모드에서도 로컬 편집을 지키고 "내 편집 유지"로 보낸다', async ({ page }) => {
    await page.locator('button[data-tooltip="Raw Markdown Mode"]').click();
    const raw = page.locator('.raw-markdown-editor .cm-content');
    await raw.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' LOCAL');
    await page.waitForTimeout(100);
    await sendExternal(page);
    await page.waitForTimeout(2500);
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: 'Keep my edits' }).click();
    await page.waitForTimeout(300);
    const sent = await changes(page);
    expect(sent[sent.length - 1]).toContain('LOCAL');
  });
});
