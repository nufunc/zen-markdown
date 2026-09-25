import { test, expect, Page } from '@playwright/test';
import { placeCaretAtEnd } from './caret';

// 추가 검토 27: 블록 수식은 코드 블록(언어 $$)으로 보이고 $$ 줄로 저장된다. 인라인 수식의 백슬래시와 중괄호는 원문 그대로다.
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;
const DOC = String.raw`수식 $a\_b + \{x\}$ 끝

$$
\int_0^1 x\,dx
$$

뒤 문단
`;
const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));

test('블록 수식은 코드 블록으로 보이고, 편집 뒤에도 수식이 원문 그대로 저장된다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), DOC);
  await page.waitForSelector('.bn-editor pre code');
  await expect(page.locator('.bn-editor pre code')).toContainText(String.raw`\int_0^1 x\,dx`);
  await expect(page.locator('.bn-editor p', { hasText: '수식' })).toContainText(String.raw`$a\_b + \{x\}$`);
  // 수식이 든 문단 끝과 뒤 문단을 고친다. 수식 줄은 병합이 아니라 직렬화 결과로 써진다
  await placeCaretAtEnd(page, page.locator('.bn-editor p', { hasText: '수식' }));
  await page.keyboard.type('!');
  await expect.poll(() => lastChange(page)).toContain('끝!');
  expect(await lastChange(page)).toBe(String.raw`수식 $a\_b + \{x\}$ 끝!

$$
\int_0^1 x\,dx
$$

뒤 문단
`);
  expect(errors).toEqual([]);
});
