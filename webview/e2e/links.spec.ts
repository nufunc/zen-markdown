import { test, expect, Page } from '@playwright/test';

// 추가 검토 27: [아래로](#두-번째-절)를 Ctrl+클릭하면 호스트로 보내지 않고 같은 문서의 헤딩으로 스크롤한다(GitHub 방식 슬러그).
// 예전에는 openLink가 빈 경로를 문서 폴더로 풀어 폴더를 열었다.
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;
const filler = Array.from({ length: 60 }, (_, i) => `문단 ${i}`).join('\n\n');
const DOC = `[아래로](#두-번째-절) [없는 곳](#없음) [다른 문서](other.md)\n\n# 첫 절\n\n${filler}\n\n## 두 번째 절\n\n끝\n`;
const opened = (page: Page) => page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'openLink').map((m: any) => m.href));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), DOC);
  await page.waitForSelector('.bn-editor h2');
});

test('#헤딩 링크를 Ctrl+클릭하면 그 헤딩으로 스크롤하고 호스트로 보내지 않는다', async ({ page }) => {
  const head = page.locator('.bn-editor h2', { hasText: '두 번째 절' });
  await expect(head).not.toBeInViewport();
  await page.locator('.bn-editor a', { hasText: '아래로' }).click({ modifiers: ['Control'] });
  await expect(head).toBeInViewport();
  expect(await opened(page)).toEqual([]);
});

test('없는 헤딩은 아무것도 하지 않고, 다른 문서 링크는 전처럼 호스트로 보낸다', async ({ page }) => {
  await page.locator('.bn-editor a', { hasText: '없는 곳' }).click({ modifiers: ['Control'] });
  await page.locator('.bn-editor a', { hasText: '다른 문서' }).click({ modifiers: ['Control'] });
  await expect.poll(() => opened(page)).toEqual(['other.md']);
});
