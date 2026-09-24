import { test, expect, Page } from '@playwright/test';
import { placeCaretAtEnd } from './caret';

// 개편 1의 6번: 속성 패널을 지운 뒤 frontmatter는 원문 그대로 보존한다.
// WYSIWYG에서는 보이지 않고, 본문을 고쳐 저장해도 바이트 단위로 같아야 한다. 편집은 텍스트 에디터에서 한다.
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;

// 주석, 따옴표 스타일, 빈 줄, 키 순서처럼 YAML을 다시 직렬화하면 바뀌는 것을 일부러 섞는다.
// 본문의 #태그는 예전 태그 동기화가 frontmatter를 고치던 조건이다.
const FM = `---
title: "Demo"   # 제목
date: '2026-08-01'

tags: [a,  b]
zeta: 1
alpha: 2
---
`;
const DOC = FM + '\n# Heading\n\nBody text with #newtag here.\n';

const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), DOC);
  await page.waitForSelector('.bn-editor');
});

test('WYSIWYG에는 frontmatter가 보이지 않는다', async ({ page }) => {
  await expect(page.locator('.bn-editor')).toContainText('Body text');
  await expect(page.locator('.bn-editor')).not.toContainText('title');
  await expect(page.locator('button[data-tooltip="Toggle Properties"]')).toHaveCount(0);
});

test('본문을 한 글자 고쳐 저장해도 frontmatter가 바이트 단위로 같다', async ({ page }) => {
  await placeCaretAtEnd(page, page.locator('.bn-editor p', { hasText: 'Body text' }));
  await page.keyboard.type('X');
  await expect.poll(() => lastChange(page)).toContain('here.X');
  const sent = (await lastChange(page))!;
  expect(sent.startsWith(FM)).toBe(true);
});
