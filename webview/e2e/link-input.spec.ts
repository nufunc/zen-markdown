import { test, expect, Page, Frame } from '@playwright/test';
import { placeCaretAtEnd } from './caret';
import { load, lastChange } from './harness';

// 추가 검토 31: 링크 입력. VS Code 웹뷰 sandbox에는 allow-modals가 없어 prompt()가 대화상자 없이 null을 돌려준다.
// 도구 막대 단추와 Ctrl+K가 편집기 안의 입력창을 연다
const DOC = 'alpha line\n\nbeta line\n';
/** 'beta'를 선택한다. 방향키는 부하가 걸리면 어긋나므로 편집기 선택을 직접 놓는다 */
const selectBeta = (target: Page | Frame) => target.evaluate(() => {
  const tt = (window as any).__editor._tiptapEditor;
  let from = 0;
  tt.state.doc.descendants((n: any, p: number) => { if (n.isText && n.text.startsWith('beta')) from = p; });
  tt.view.focus();
  tt.commands.setTextSelection({ from, to: from + 4 });
});

test('31-1 도구 막대의 링크 단추로 선택한 글자에 링크를 건다', async ({ page }) => {
  await load(page, DOC);
  await selectBeta(page);
  await page.locator('[data-tooltip^="Insert Link"]').click();
  const input = page.locator('input[placeholder="Enter link URL"]');
  await expect(input).toBeFocused();
  await input.fill('https://example.com');
  await input.press('Enter');
  await expect.poll(() => lastChange(page)).toBe('alpha line\n\n[beta](https://example.com) line\n');
  await expect(input).toHaveCount(0);
});

test('31-1b Ctrl+K도 같은 입력창을 열고, 선택이 없으면 주소를 글자로 넣는다', async ({ page }) => {
  await load(page, DOC);
  await placeCaretAtEnd(page, page.locator('.bn-editor p', { hasText: 'alpha line' }));
  await page.keyboard.press('Control+k');
  const input = page.locator('input[placeholder="Enter link URL"]');
  await expect(input).toBeFocused();
  await input.fill('https://x.y');
  await input.press('Enter');
  await expect.poll(() => lastChange(page)).toBe('alpha line[https://x.y](https://x.y)\n\nbeta line\n');
});

test('31-1b Esc는 링크를 걸지 않고 닫는다', async ({ page }) => {
  await load(page, DOC);
  await selectBeta(page);
  await page.keyboard.press('Control+k');
  const input = page.locator('input[placeholder="Enter link URL"]');
  await input.fill('https://example.com');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await lastChange(page)).toBeUndefined();
});

test('31-1 VS Code처럼 allow-modals 없는 sandbox iframe에서도 링크를 건다', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', async d => { dialogs++; await d.dismiss(); });
  await page.route('**/__harness.html', r => r.fulfill({
    contentType: 'text/html',
    body: '<iframe id="f" src="/" sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-downloads" style="width:1200px;height:700px"></iframe>',
  }));
  await page.addInitScript(`
    window.__msgs = [];
    window.acquireVsCodeApi = () => {
      if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
      return window.__vscode;
    };
  `);
  await page.goto('/__harness.html');
  const fr = page.frameLocator('#f');
  await fr.locator('body').waitFor();
  const frame = page.frames().find(f => f !== page.mainFrame()) as Frame;
  await expect.poll(() => frame.evaluate(() => typeof (window as any).acquireVsCodeApi)).toBe('function');
  await frame.evaluate((t) => window.postMessage({ type: 'update', text: t }, '*'), DOC);
  await fr.locator('.bn-editor p').first().waitFor();
  await page.waitForTimeout(300);
  await selectBeta(frame);
  await fr.locator('[data-tooltip^="Insert Link"]').click();
  await fr.locator('input[placeholder="Enter link URL"]').fill('https://example.com');
  await fr.locator('input[placeholder="Enter link URL"]').press('Enter');
  await expect.poll(() => frame.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text).at(-1)))
    .toBe('alpha line\n\n[beta](https://example.com) line\n');
  expect(dialogs).toBe(0);
});
