import { test, expect, Page } from '@playwright/test';

// 추가 검토 24: 에디터를 클릭하지 않고 Ctrl+H로 바꿔도 바뀐다.
// 예전 코드는 tiptap의 editorState 필드를 먼저 읽었는데, 연 직후 clearUndoHistory가 view.updateState로 상태를 바꾸면
// 그 필드가 낡은 채 남아 검색 결과가 비어 보였고 바꾸기가 조용히 끝났다.
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;
const DOC = 'hello **world** end\n\nsay world now\n';
const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), DOC);
  await page.waitForSelector('.bn-editor p');
  await page.waitForTimeout(300);
});

const replaceAll = async (page: Page) => {
  await page.keyboard.press('Control+h');
  await page.locator('input[placeholder="Find"]').fill('world');
  await expect(page.locator('.search-highlight')).toHaveCount(2);
  await page.locator('input[placeholder="Replace"]').fill('earth');
  await page.locator('[title^="Replace All"]').click();
};

test('에디터를 클릭하지 않고 모두 바꾸기를 해도 바뀐다', async ({ page }) => {
  await replaceAll(page);
  await expect.poll(() => lastChange(page)).toBe('hello **earth** end\n\nsay earth now\n');
});

test('에디터를 클릭한 뒤 모두 바꾸기도 그대로 바뀐다', async ({ page }) => {
  await page.locator('.bn-editor p', { hasText: 'say world now' }).click();
  await replaceAll(page);
  await expect.poll(() => lastChange(page)).toBe('hello **earth** end\n\nsay earth now\n');
});

test('연 직후 Ctrl+Z는 문서를 비우지 않는다', async ({ page }) => {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  await expect(page.locator('.bn-editor')).toContainText('say world now');
  expect(await lastChange(page)).toBeUndefined();
});
