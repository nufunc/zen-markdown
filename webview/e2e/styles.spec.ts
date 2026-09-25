import { test, expect, Page } from '@playwright/test';
import { placeCaretAtEnd } from './caret';

// 추가 검토 22: 마크다운으로 저장되지 않는 인라인 스타일(밑줄, 글자색, 배경색)은 스키마에서 뺐다.
// 단축키와 붙여 넣기로도 들어오지 않고, Ctrl+Shift+M은 저장되는 구분선을 넣는다.
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;
const DOC = 'first\n\nhello world here\n\nlast\n';

const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));
/** 모델에 나타난 인라인 스타일 이름 */
const styleNames = (page: Page) => page.evaluate(() => {
  const names = new Set<string>();
  const walk = (bs: any[]) => bs.forEach((b: any) => {
    for (const c of Array.isArray(b.content) ? b.content : []) {
      for (const t of c.type === 'link' ? c.content : [c]) Object.keys(t.styles ?? {}).forEach(k => names.add(k));
    }
    walk(b.children ?? []);
  });
  walk((window as any).__editor.document);
  return [...names].sort();
});
/** 'hello world here'의 world를 선택한다 */
const selectWorld = (page: Page) => page.evaluate(() => {
  const p = [...document.querySelectorAll('.bn-editor p')].find(e => e.textContent === 'hello world here')!;
  const text = p.firstChild!.nodeType === Node.TEXT_NODE ? p.firstChild! : p.querySelector('*')!.firstChild!;
  const range = document.createRange();
  range.setStart(text, 6);
  range.setEnd(text, 11);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), DOC);
  await page.waitForSelector('.bn-editor p');
});

test('Ctrl+U와 Ctrl+Shift+H는 저장되지 않는 스타일을 만들지 않는다', async ({ page }) => {
  await page.locator('.bn-editor p', { hasText: 'hello world here' }).click();
  await selectWorld(page);
  await page.keyboard.press('Control+u');
  await page.keyboard.press('Control+Shift+h');
  await page.waitForTimeout(800);
  expect(await styleNames(page)).toEqual([]);
  expect(await lastChange(page)).toBeUndefined();
});

test('붙여 넣은 HTML의 밑줄, 글자색, 배경색은 모델에 들어오지 않는다', async ({ page }) => {
  await placeCaretAtEnd(page, page.locator('.bn-editor p', { hasText: 'hello world here' }));
  await page.evaluate(() => {
    const html = '<p>a <u>under</u> <span style="color: red">red</span> <mark>hi</mark> <span style="background-color: yellow">bg</span> <b>bold</b></p>';
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', 'a under red hi bg bold');
    document.querySelector('.bn-editor .ProseMirror, .bn-editor')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.bn-editor')).toContainText('under');
  expect(await styleNames(page)).toEqual(['bold']);
});

test('Ctrl+Shift+M은 구분선 블록을 넣고 ---로 저장한다', async ({ page }) => {
  await placeCaretAtEnd(page, page.locator('.bn-editor p', { hasText: 'hello world here' }));
  await page.keyboard.press('Control+Shift+m');
  await expect(page.locator('.bn-editor [data-content-type="divider"]')).toHaveCount(1);
  await expect.poll(() => lastChange(page)).toContain('---');
  expect(await lastChange(page)).toBe('first\n\nhello world here\n\n---\n\nlast\n');
});
