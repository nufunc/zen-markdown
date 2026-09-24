import { test, expect, Page } from '@playwright/test';

// 2단계 원문 조각 보존: 서식 차이가 있는 문서에서 문단 하나를 고치면, 저장되는 텍스트는 원문과 그 한 줄만 다르다.
// 병합이 없으면 BlockNote가 원문과 다르게 쓰는 줄(수평선, 목록 기호, 표 너비, 언어 없는 펜스, 인용)이 모두 함께 바뀐다.
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;

const DOC = [
  '# Title',
  '',
  '- **x**: first',
  '- **y**: second',
  '',
  '---',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '```',
  'plain fence',
  '```',
  '',
  '> quote one',
  '>',
  '> quote two',
  '',
  'Target paragraph here.',
  '',
  'Last paragraph.',
  '',
].join('\n');

const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));

const changedLines = (a: string, b: string) => {
  const x = a.split('\n'), y = b.split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push(`${i + 1}: ${JSON.stringify(x[i])} -> ${JSON.stringify(y[i])}`);
  return out;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), DOC);
  await page.waitForSelector('.bn-editor');
});

test('문단 하나를 고치면 원문과 그 한 줄만 다르다', async ({ page }) => {
  await page.locator('.bn-editor p', { hasText: 'Target paragraph' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' EDIT');
  await expect.poll(() => lastChange(page)).toContain('here. EDIT');
  expect(changedLines(DOC, (await lastChange(page))!)).toEqual([
    '20: "Target paragraph here." -> "Target paragraph here. EDIT"',
  ]);
});

test('Raw 모드로 바꿔도 원문의 서식이 남는다', async ({ page }) => {
  await page.locator('.bn-editor p', { hasText: 'Last paragraph' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.locator('.segmented-btn', { hasText: 'Raw' }).click();
  const raw = page.locator('.raw-markdown-editor .cm-content');
  await expect(raw).toContainText('Last paragraph.!');
  expect(changedLines(DOC, (await lastChange(page))!)).toEqual([
    '22: "Last paragraph." -> "Last paragraph.!"',
  ]);
});
