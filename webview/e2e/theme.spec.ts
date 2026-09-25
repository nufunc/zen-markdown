import { test, expect, Page } from '@playwright/test';
import { load } from './harness';

// 추가 검토 31: 테마 판정과 대비
const config = (page: Page, extra: Record<string, unknown>) => page.evaluate((c) => window.postMessage({ type: 'config', fontSize: 16, ...c }, '*'), extra);
/** 편집 영역 바탕색의 상대 휘도(0~1) */
const bgLuminance = (page: Page) => page.evaluate(() => {
  const [r, g, b] = getComputedStyle(document.querySelector('#root > div') as Element).backgroundColor.match(/\d+/g)!.map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
});

test('31-3 auto 테마는 VS Code 고대비 밝은 테마에서 밝다', async ({ page }) => {
  await load(page, '# Title\n\nbody\n');
  // VS Code는 고대비 밝은 테마에 두 클래스를 함께 붙인다
  await page.evaluate(() => { document.body.className = 'vscode-high-contrast-light vscode-high-contrast'; });
  await config(page, { theme: 'auto' });
  await expect.poll(() => bgLuminance(page)).toBeGreaterThan(0.5);
  await page.evaluate(() => { document.body.className = 'vscode-high-contrast'; });
  await expect.poll(() => bgLuminance(page)).toBeLessThan(0.5);
});
