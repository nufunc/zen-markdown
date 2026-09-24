import { test, expect, Page } from '@playwright/test';
import { placeCaretAtEnd } from './caret';

// 추가 검토 20: 인용 안의 목록, 헤딩, 코드, 중첩 인용은 인용의 자식 블록으로 보이고, 인용 선 안에 그려진다.
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;
const DOC = '앞 문단\n\n> 인용 첫 줄\n> - 항목 a\n> - 항목 b\n\n> 1. 하나\n> 2. 둘\n\n뒤 문단\n';

const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));
/** 모델의 모양: 블록 종류와 글자를 들여쓰기로 */
const shape = (page: Page) => page.evaluate(() => {
  const walk = (bs: any[], d: number): string[] => bs.flatMap((b: any) => [
    '  '.repeat(d) + b.type + ':' + (Array.isArray(b.content) ? b.content.map((c: any) => c.text ?? '').join('') : ''),
    ...walk(b.children ?? [], d + 1),
  ]);
  return walk((window as any).__editor.document, 0);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), DOC);
  await page.waitForSelector('.bn-editor [data-content-type="bulletListItem"]');
});

test('인용 안 목록은 인용의 자식이고 인용 선 안에 그려진다', async ({ page }) => {
  expect(await shape(page)).toEqual([
    'paragraph:앞 문단',
    'quote:인용 첫 줄', '  bulletListItem:항목 a', '  bulletListItem:항목 b',
    'quote:', '  numberedListItem:하나', '  numberedListItem:둘',
    'paragraph:뒤 문단',
  ]);
  // 자식 목록의 왼쪽 선이 인용 선과 같은 x에 있다
  const x = await page.evaluate(() => {
    const quote = [...document.querySelectorAll('.bn-editor blockquote')].find(q => q.textContent === '인용 첫 줄') as HTMLElement;
    const group = quote.closest('.bn-block')!.querySelector(':scope > .bn-block-group') as HTMLElement;
    return { quote: quote.getBoundingClientRect().left, group: group.getBoundingClientRect().left, border: getComputedStyle(group).borderLeftWidth };
  });
  expect(Math.abs(x.quote - x.group)).toBeLessThan(1);
  expect(x.border).toBe('3px');
});

test('목록으로 시작하는 인용의 빈 첫 줄은 커서가 없으면 접힌다', async ({ page }) => {
  const h = await page.evaluate(() => {
    const quotes = [...document.querySelectorAll('.bn-editor [data-content-type="quote"] blockquote')] as HTMLElement[];
    return quotes.find(q => q.textContent === '')!.getBoundingClientRect().height;
  });
  expect(h).toBe(0);
});

test('인용 첫 줄 끝에서 Enter를 누르면 새 문단이 인용 안 첫 자식이 된다', async ({ page }) => {
  await placeCaretAtEnd(page, page.locator('.bn-editor blockquote', { hasText: '인용 첫 줄' }));
  await page.keyboard.press('Enter');
  await page.keyboard.type('새 줄');
  expect((await shape(page)).slice(1, 5)).toEqual(['quote:인용 첫 줄', '  paragraph:새 줄', '  bulletListItem:항목 a', '  bulletListItem:항목 b']);
  await expect.poll(() => lastChange(page)).toContain('새 줄');
  expect(await lastChange(page)).toContain('> 인용 첫 줄\n>\n> 새 줄\n>\n> - 항목 a\n> - 항목 b\n\n> 1. 하나');
});

test('인용 안 목록 항목을 고치면 그 줄만 바뀐다', async ({ page }) => {
  await placeCaretAtEnd(page, page.locator('.bn-editor [data-content-type="bulletListItem"]', { hasText: '항목 b' }));
  await page.keyboard.type(' 고침');
  await expect.poll(() => lastChange(page)).toContain('항목 b 고침');
  expect(await lastChange(page)).toBe(DOC.replace('항목 b', '항목 b 고침'));
});
