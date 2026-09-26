import { test, expect, Page } from '@playwright/test';
import { load, lastChange } from './harness';
import { placeCaretAtEnd } from './caret';

// 추가 검토 31: 찾기 창 위치, 유니코드 단어 단위, 정규식 바꾸기
const find = (page: Page) => page.locator('input[placeholder="Find"]');
const count = (page: Page) => page.locator('.find-count-label');
const option = (page: Page, label: string) => page.locator(`[aria-label="${label}"]`);
const openReplace = async (page: Page) => {
  await page.keyboard.press('Control+h');
  await expect(find(page)).toBeFocused();
};

test('31-4 찾기 창은 머리 막대의 단추를 가리지 않는다', async ({ page }) => {
  await load(page, 'alpha\n');
  await page.keyboard.press('Control+f');
  const widget = (await page.locator('.vscode-find-widget').boundingBox())!;
  for (const tip of ['Toggle Table of Contents', 'Export Document as PDF', 'Settings']) {
    const b = (await page.locator(`[data-tooltip="${tip}"]`).boundingBox())!;
    const overlap = widget.x < b.x + b.width && b.x < widget.x + widget.width && widget.y < b.y + b.height && b.y < widget.y + widget.height;
    expect(overlap, tip).toBe(false);
  }
});

test('31-4b 단어 단위는 한글 같은 유니코드 글자 경계로 판정한다', async ({ page }) => {
  await load(page, '편집기 편집 기능 편집\n\nfoo food foo_bar foo\n');
  await page.keyboard.press('Control+f');
  await option(page, 'Match Whole Word').click();
  await find(page).fill('편집');
  await expect(page.locator('.search-highlight')).toHaveCount(2);
  await find(page).fill('foo');
  await expect(page.locator('.search-highlight')).toHaveCount(2);
});

test('31-4c 정규식 뒤보기(lookbehind)로 모두 바꾸기', async ({ page }) => {
  await load(page, 'price $10 and $20\n');
  await openReplace(page);
  await option(page, 'Use Regular Expression').click();
  await find(page).fill(String.raw`(?<=\$)\d+`);
  await page.locator('input[placeholder="Replace"]').fill('99');
  await expect(page.locator('.search-highlight')).toHaveCount(2);
  await page.locator('[title^="Replace All"]').click();
  await expect.poll(() => lastChange(page)).toBe('price $99 and $99\n');
});

test('31-4c 정규식 캡처와 한 건 바꾸기', async ({ page }) => {
  await load(page, 'date 2024-01-15\n');
  await openReplace(page);
  await option(page, 'Use Regular Expression').click();
  await find(page).fill(String.raw`(\d{4})-(\d{2})-(\d{2})`);
  await page.locator('input[placeholder="Replace"]').fill('$3/$2/$1');
  await expect(count(page)).toContainText('1');
  await page.locator('[title="Replace (Enter)"]').click();
  await expect.poll(() => lastChange(page)).toBe('date 15/01/2024\n');
});

// 선택한 글자가 없으면 Ctrl+H도 찾기 칸에 포커스를 둔다. 바로 친 글자가 바꾸기 칸에 들어가지 않는다
test('Ctrl+H는 선택이 없으면 찾기 칸, 있으면 바꾸기 칸에 포커스를 둔다', async ({ page }) => {
  await load(page, 'alpha beta\n');
  await page.keyboard.press('Control+h');
  await expect(find(page)).toBeFocused();
  // 입력 칸이 뜨자마자 포커스를 받고, 50ms 뒤 select()가 한 번 더 온다. 그 뒤에 친다
  await page.waitForTimeout(100);
  await page.keyboard.type('beta');
  await expect(find(page)).toHaveValue('beta');
  await expect(page.locator('input[placeholder="Replace"]')).toHaveValue('');
  await page.keyboard.press('Escape');

  await placeCaretAtEnd(page, page.locator('.bn-editor p'));
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+h');
  await expect(page.locator('input[placeholder="Replace"]')).toBeFocused();
  await expect(find(page)).toHaveValue('alpha beta');
});
