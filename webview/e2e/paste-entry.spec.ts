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

// VS Code 텍스트 편집기에서 복사하면 vscode-editor-data(JSON, mode는 언어)가 함께 온다. VS Code에서 재현한 모양을 합성했다
const vscodeData = (mode: string) => JSON.stringify({ version: 1, isFromEmptySelection: false, multicursorText: null, mode });
for (const mode of ['typescript', 'markdown']) {
  test(`30-6 VS Code에서 복사한 한 줄(${mode})은 문장 안에 글자로 들어간다`, async ({ page }) => {
    await load(page, 'front back\n');
    // 방향키는 부하가 걸리면 어긋나므로 커서를 'back' 앞에 직접 놓는다
    await page.evaluate(() => {
      const tt = (window as any).__editor._tiptapEditor;
      let pos = 0;
      tt.state.doc.descendants((n: any, p: number) => { if (n.isText && n.text.includes('front back')) pos = p + n.text.indexOf('back'); });
      tt.commands.setTextSelection(pos);
      tt.view.focus();
    });
    await paste(page, { 'text/plain': 'computeValue', 'vscode-editor-data': vscodeData(mode) });
    await expect.poll(() => lastChange(page)).toBe('front computeValueback\n');
  });
}

test('30-6 VS Code에서 복사한 여러 줄은 markdown이면 마크다운으로, 그 밖은 코드 블록으로 들어간다', async ({ browser }) => {
  const md = await pasteIntoEmpty(await browser.newPage(), { 'text/plain': '- a\r\n- b', 'vscode-editor-data': vscodeData('markdown') });
  expect(md.types).toEqual(['paragraph', 'bulletListItem', 'bulletListItem', 'paragraph']);
  const ts = await pasteIntoEmpty(await browser.newPage(), { 'text/plain': 'const a = 1;\r\nconst b = 2;', 'vscode-editor-data': vscodeData('typescript') });
  expect(ts.types).toContain('codeBlock');
  expect(ts.saved).toContain('```typescript\nconst a = 1;\nconst b = 2;\n```');
});
