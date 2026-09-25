import { test, expect, Page } from '@playwright/test';
import { placeCaretAtEnd } from './caret';
import { load } from './harness';

// 추가 검토 31: 머리 막대(파일 이름, 단어 수, 목차)
const BASE = 'https://file%2B.vscode-resource.vscode-cdn.net/d%3A/git/notes';
const config = (page: Page, extra: Record<string, unknown>) =>
  page.evaluate((c) => window.postMessage({ type: 'config', theme: 'light', fontSize: 16, showWordCount: true, ...c }, '*'), extra);

test('31-5 머리 막대는 문서 폴더가 아니라 파일 이름을 보인다', async ({ page }) => {
  await load(page, 'body\n');
  await config(page, { docBaseUri: BASE, fileName: 'todo.md' });
  const label = page.locator('[title="D:/git/notes/todo.md"]');
  await expect(label).toHaveText('todo.md');
});

test('31-5 파일 이름이 없으면(제목 없는 문서) document.md', async ({ page }) => {
  await load(page, 'body\n');
  await config(page, { docBaseUri: '' });
  await expect(page.getByText('document.md', { exact: true })).toBeVisible();
});

test('31-6 단어 수는 편집에 따라 바뀌고 마크다운 기호를 세지 않는다', async ({ page }) => {
  await load(page, '# Title\n\nbody\n');
  await config(page, {});
  const badge = page.locator('.quick-stats-badge');
  await expect(badge).toContainText('2 words');
  await placeCaretAtEnd(page, page.locator('.bn-editor p', { hasText: 'body' }));
  await page.keyboard.type(' more words');
  await expect(badge).toContainText('4 words');
  await expect(badge).toContainText('21 chars');
});

// 사용자 결정(2026-09-25): 머리 막대의 TOC 단추는 이 편집기에서만 켜고 끈다. 사용자 설정을 바꾸지 않는다
test('31 TOC 단추는 사용자 설정을 바꾸지 않고 이 편집기의 목차만 켜고 끈다', async ({ page }) => {
  await load(page, '# One\n\n## Two\n\nbody\n');
  await config(page, { showToc: false });
  await page.locator('[data-tooltip="Toggle Table of Contents"]').click();
  await expect(page.locator('[data-tooltip="Close TOC"]')).toBeVisible();
  await page.locator('[data-tooltip="Close TOC"]').click();
  await expect(page.locator('[data-tooltip="Close TOC"]')).toHaveCount(0);
  await page.locator('[data-tooltip="Toggle Table of Contents"]').click();
  await expect(page.locator('[data-tooltip="Close TOC"]')).toBeVisible();
  const updates = await page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'updateConfig'));
  expect(updates).toEqual([]);
  // 설정의 기본값이 바뀌면 그 값을 따른다
  await page.locator('[data-tooltip="Close TOC"]').click();
  await config(page, { showToc: true });
  await expect(page.locator('[data-tooltip="Close TOC"]')).toBeVisible();
});
