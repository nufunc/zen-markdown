import { test, expect, Page } from '@playwright/test';
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
