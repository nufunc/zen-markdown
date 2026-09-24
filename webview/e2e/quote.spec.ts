import { test, expect, Page } from '@playwright/test';
import { placeCaretAtEnd } from './caret';

// 추가 검토 9: 여러 문단 인용은 화면에서 인용 블록 여럿으로 보이고, 편집한 뒤에도 한 인용(`>` 빈 줄)으로 저장된다.
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;
const DOC = '# T\n\n> first para\n>\n> second para\n\ntext\n\n> alone one\n\n> alone two\n\n> # Head\n> tail\n';

const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), DOC);
  await page.waitForSelector('.bn-editor [data-content-type="quote"]');
});

test('두 문단 인용은 인용 블록 둘로 보이고 사이 간격이 붙는다', async ({ page }) => {
  const quotes = page.locator('.bn-editor [data-content-type="quote"] blockquote');
  await expect(quotes.filter({ hasText: 'first para' })).toHaveCount(1);
  await expect(quotes.filter({ hasText: 'second para' })).toHaveCount(1);
  const gap = await page.evaluate(() => {
    const qs = [...document.querySelectorAll('.bn-editor [data-content-type="quote"] blockquote')] as HTMLElement[];
    const a = qs.find(q => q.textContent!.includes('first para'))!.getBoundingClientRect();
    const b = qs.find(q => q.textContent!.includes('second para'))!.getBoundingClientRect();
    const c = qs.find(q => q.textContent!.includes('alone one'))!.getBoundingClientRect();
    const d = qs.find(q => q.textContent!.includes('alone two'))!.getBoundingClientRect();
    return { joined: b.top - a.bottom, separate: d.top - c.bottom };
  });
  // 이어진 인용은 떨어진 인용보다 사이가 좁다
  expect(gap.joined).toBeLessThan(gap.separate);
});

test('이어진 인용을 고쳐도 한 인용으로, 떨어진 인용은 떨어진 채로 저장된다', async ({ page }) => {
  await placeCaretAtEnd(page, page.locator('.bn-editor blockquote', { hasText: 'second para' }));
  await page.keyboard.type(' EDIT');
  await expect.poll(() => lastChange(page)).toContain('second para EDIT');
  const sent = (await lastChange(page))!;
  expect(sent).toContain('> first para\n>\n> second para EDIT');
  expect(sent).toContain('> alone one\n\n> alone two');
});

test('인용 안 헤딩은 인용의 자식 헤딩이고 다음 줄과 붙지 않는다', async ({ page }) => {
  // 추가 검토 20부터 인용 안 헤딩은 인용 블록의 자식 헤딩 블록이다
  const head = page.locator('.bn-editor .bn-block:has(> [data-content-type="quote"]) [data-content-type="heading"]', { hasText: 'Head' });
  await expect(head).toHaveCount(1);
  await expect(head).not.toContainText('tail');
});
