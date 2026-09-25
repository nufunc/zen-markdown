import { test, expect, Page } from '@playwright/test';
import { placeCaretAtEnd } from './caret';

// 추가 검토 23: Word에서 붙여 넣은 목록(mso-list 문단)이 목록 블록이 된다.
// 실제 Word 클립보드가 아니라 Word가 내보내는 모양을 흉내 낸 HTML로 붙여 넣는다.
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;
const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));
const types = (page: Page) => page.evaluate(() => (window as any).__editor.document.map((b: any) => b.type));

const item = (text: string, marker: string, level = 1) =>
  `<p class=MsoListParagraph style="mso-list:l0 level${level} lfo1"><!--[if !supportLists]--><span style="mso-list:Ignore">${marker}<span style="font:7.0pt">&nbsp;&nbsp;</span></span><!--[endif]-->${text}<o:p></o:p></p>`;
const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>${item('항목 하나', '·')}${item('세부', 'o', 2)}${item('항목 둘', '·')}</body></html>`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate(() => window.postMessage({ type: 'update', text: 'first\n\nlast\n' }, '*'));
  await page.waitForSelector('.bn-editor p');
});

test('Word 목록을 붙여 넣으면 중첩까지 목록 블록이 된다', async ({ page }) => {
  await placeCaretAtEnd(page, page.locator('.bn-editor p', { hasText: 'first' }));
  await page.keyboard.press('Enter');
  await page.evaluate((html) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', '· 항목 하나\no 세부\n· 항목 둘');
    document.querySelector('.bn-editor')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, WORD);
  await expect(page.locator('.bn-editor [data-content-type="bulletListItem"]')).toHaveCount(3);
  expect(await types(page)).toEqual(['paragraph', 'bulletListItem', 'bulletListItem', 'paragraph']);
  await expect.poll(() => lastChange(page)).toContain('항목 둘');
  // 중첩 글머리는 깊이마다 -와 *를 번갈아 쓴다(normalizeUnorderedListBullets)
  expect(await lastChange(page)).toContain('- 항목 하나\n  * 세부\n- 항목 둘');
});
