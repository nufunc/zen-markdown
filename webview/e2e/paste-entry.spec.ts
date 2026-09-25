import { test, expect, Page } from '@playwright/test';
import { placeCaretAtEnd } from './caret';
import { load, lastChange, types, paste } from './harness';

// 추가 검토 30: 붙여 넣기 입구(CRLF, TSV, 우클릭 메뉴, pre만 있는 코드)

/** 두 문단 사이 빈 문단에 붙여 넣은 결과 */
const pasteIntoEmpty = async (page: Page, data: Record<string, string>) => {
  await load(page, 'start\n\nend\n');
  await placeCaretAtEnd(page, page.locator('.bn-editor p', { hasText: 'start' }));
  await page.keyboard.press('Enter');
  // Enter와 붙여 넣기가 되돌리기 기록 하나로 묶이지 않게 기다린다
  await page.waitForTimeout(700);
  await paste(page, data);
  await page.waitForTimeout(1400);
  return { saved: await lastChange(page), types: await types(page) };
};

test('30-1 CRLF 평문 붙여 넣기는 LF와 같은 블록이 된다', async ({ browser }) => {
  const md = '# a\n- b\n- c\n\n```js\nx = 1\n```';
  const lf = await pasteIntoEmpty(await browser.newPage(), { 'text/plain': md });
  const crlf = await pasteIntoEmpty(await browser.newPage(), { 'text/plain': md.replace(/\n/g, '\r\n') });
  expect(crlf.saved).toBe(lf.saved);
  expect(crlf.types).toEqual(lf.types);
  const lfLines = await pasteIntoEmpty(await browser.newPage(), { 'text/plain': 'line one\nline two' });
  const crlfLines = await pasteIntoEmpty(await browser.newPage(), { 'text/plain': 'line one\r\nline two' });
  expect(crlfLines.saved).toBe(lfLines.saved);
});

test('30-4 평문 TSV는 표 하나로 들어간다', async ({ page }) => {
  const r = await pasteIntoEmpty(page, { 'text/plain': 'Name\tAge\r\nKim\t30' });
  expect(r.types).toEqual(['paragraph', 'table', 'paragraph']);
  expect(r.saved).not.toContain('Name Age');
  expect(r.saved).toContain('| Name | Age |');
  // 되돌리기 한 번에 붙여 넣기 전으로 돌아간다
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  expect(await types(page)).toEqual(['paragraph', 'paragraph', 'paragraph']);
});

test('30-4b Excel형 HTML과 TSV를 함께 붙여 넣으면 첫 행이 머리 행이다', async ({ page }) => {
  const r = await pasteIntoEmpty(page, {
    'text/html': '<table><tr><td>Name</td><td>Age</td></tr><tr><td>Kim</td><td>30</td></tr></table>',
    'text/plain': 'Name\tAge\r\nKim\t30\r\n',
  });
  expect(r.types).toEqual(['paragraph', 'table', 'paragraph']);
  expect(r.saved).toContain('| Name | Age |');
  expect(r.saved).not.toMatch(/\|\s+\|\s+\|/);
});

test('30-5 우클릭 메뉴의 붙여넣기는 Ctrl+V와 같다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await load(page, 'start\n');
  await placeCaretAtEnd(page, page.locator('.bn-editor p', { hasText: 'start' }));
  await page.keyboard.press('Enter');
  await page.evaluate(() => navigator.clipboard.writeText('- a\n- b'));
  await page.locator('.bn-editor p').last().click({ button: 'right' });
  await page.locator('.vscode-context-menu-item', { hasText: '붙여넣기' }).click();
  await expect.poll(() => types(page)).toContain('bulletListItem');
  expect((await types(page)).filter((t: string) => t === 'bulletListItem').length).toBe(2);
});

test('30-7 <code> 없는 <pre>는 코드 블록으로 들어간다', async ({ page }) => {
  const r = await pasteIntoEmpty(page, { 'text/html': '<pre>def f():\n    return 1</pre>', 'text/plain': 'def f():\n    return 1' });
  expect(r.types).toContain('codeBlock');
  expect(r.saved).toContain('def f():\n    return 1');
});
