import { test, expect } from '@playwright/test';
import { placeCaretAtEnd } from './caret';
import { load, lastChange, paste, tableShapeOk } from './harness';

// 추가 검토 30: 표 열 추가, 표 셀 줄바꿈, 코드 블록 탈출

test('30-2 표에 열을 더하면 모든 행이 같은 칸 수다', async ({ page }) => {
  await load(page, '| A | B |\n| --- | --- |\n| 1 | 2 |\n\nafter\n');
  await page.locator('.bn-editor td', { hasText: '2' }).first().hover();
  await page.waitForTimeout(400);
  await page.locator('.bn-extend-button-add-remove-columns').click();
  await expect.poll(() => lastChange(page)).toBeTruthy();
  await page.waitForTimeout(1200);
  const saved = (await lastChange(page))!;
  expect(tableShapeOk(saved), saved).toBe(true);
});

test('30-3 표 셀 안 줄바꿈은 <br>로 저장되고 다시 열어도 줄바꿈이다', async ({ page, browser }) => {
  await load(page, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  await placeCaretAtEnd(page, page.locator('.bn-editor td', { hasText: '1' }).first());
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('z');
  await expect.poll(() => lastChange(page)).toContain('z');
  await page.waitForTimeout(1200);
  const saved = (await lastChange(page))!;
  expect(tableShapeOk(saved), saved).toBe(true);
  expect(saved).toContain('1<br>z');
  const p2 = await browser.newPage();
  await load(p2, saved);
  const cell = await p2.evaluate(() => (window as any).__editor.document[0].content.rows[1].cells[0].content.map((c: any) => c.text).join(''));
  expect(cell).toBe('1\nz');
});

test('30-3 표 셀에 여러 줄을 붙여 넣어도 표 행이 한 줄이다', async ({ page }) => {
  await load(page, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  await placeCaretAtEnd(page, page.locator('.bn-editor td', { hasText: '1' }).first());
  await paste(page, { 'text/plain': 'x\r\ny' });
  await expect.poll(() => lastChange(page)).toContain('y');
  await page.waitForTimeout(1200);
  expect(await lastChange(page)).toBe('| A | B |\n| --- | --- |\n| 1x<br>y | 2 |\n');
});

test('30-8 코드 블록 끝에서 Enter 세 번은 새 빈 문단을 만든다', async ({ page }) => {
  await load(page, '```js\nx\n```\n\nafter\n');
  await placeCaretAtEnd(page, page.locator('.bn-editor pre code'));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('out');
  await expect.poll(() => lastChange(page)).toContain('out');
  await page.waitForTimeout(1200);
  expect(await lastChange(page)).toBe('```js\nx\n```\n\nout\n\nafter\n');
});
