import { test, expect, Page } from '@playwright/test';

// 추가 검토 3: 여는 시간이 블록 수의 제곱으로 늘지 않아야 한다.
// 기계 속도와 무관하게 판정하려고 8,000블록과 1,000블록의 여는 시간 배율을 본다.
// 4,000 대 1,000은 0.51.4에서도 4.5~5.5배라 퇴행을 가르지 못했다. 8,000 대 1,000은 0.54.2에서 5.8~6.8배이고,
// 0.51.4는 두 배마다 2.5배로 느는 추세를 외삽하면 12배를 넘는다(직접 재지 않았다).
const mock = `window.acquireVsCodeApi = () => {
  if (!window.__vscode) window.__vscode = { postMessage: () => {}, getState: () => ({}), setState: () => {} };
  return window.__vscode;
};`;

const openMs = async (page: Page, sections: number) => {
  let doc = '';
  for (let i = 0; i < sections; i++) doc += `## H ${i}\n\nParagraph ${i} text.\n\n`;
  await page.addInitScript(mock);
  await page.goto('/');
  const t0 = await page.evaluate((d) => { const t = performance.now(); window.postMessage({ type: 'update', text: d }, '*'); return t; }, doc);
  await page.waitForFunction((n) => document.querySelectorAll('.bn-editor h2').length >= n, sections, { timeout: 60000 });
  return page.evaluate((t) => performance.now() - t, t0);
};

test('8,000블록을 여는 시간이 1,000블록의 9배 아래다', async ({ browser }) => {
  test.setTimeout(120000);
  const measure = async (sections: number) => {
    const page = await browser.newPage();
    try { return await openMs(page, sections); } finally { await page.close(); }
  };
  await measure(500); // 개발 서버의 첫 모듈 변환 비용을 측정에서 뺀다
  const small = await measure(500);
  const large = await measure(4000);
  const ratio = large / small;
  console.log(`open 1000 blocks ${Math.round(small)}ms, 8000 blocks ${Math.round(large)}ms, ratio ${ratio.toFixed(2)}`);
  expect(ratio).toBeLessThan(9);
});
