import { test, expect } from '@playwright/test';

// 추가 검토 2: 코드 블록이 많은 문서에서 코드 블록이 아닌 문단에 입력할 때 메인 스레드가 멈추지 않아야 한다.
// 입력 구간(첫 키부터 마지막 키 뒤 200ms까지)의 긴 작업만 센다. 멈춘 뒤 600ms에 도는 전체 직렬화는 따로다.
const mock = `
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: () => {}, getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
  window.__long = [];
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push({ s: e.startTime, d: e.duration }); })
    .observe({ type: 'longtask', buffered: true });
`;

const UNITS = 1000;
const makeDoc = () => {
  let s = '';
  for (let i = 0; i < UNITS; i++) s += `## Section ${i}\n\nParagraph ${i} text.\n\n\`\`\`js\nconst v${i} = ${i};\n\`\`\`\n\n`;
  return s;
};

test('코드 블록 1,000개 문서에서 문단 입력 중 긴 작업 합계가 200ms 아래다', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), makeDoc());
  await page.waitForFunction((n) => document.querySelectorAll('.bn-editor h2').length >= n, UNITS, { timeout: 90000 });
  // 코드 블록 하이라이트가 끝날 때까지 기다린다
  await page.waitForFunction(() => document.querySelectorAll('.bn-editor pre code span[style]').length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.locator('.bn-editor p').first().click();
  await page.waitForTimeout(300);
  const start = await page.evaluate(() => performance.now());
  await page.keyboard.type('abcdefghijklmnopqrst', { delay: 50 });
  const end = await page.evaluate(() => performance.now() + 200);
  await page.waitForTimeout(200);

  const sum = await page.evaluate(([s, e]) =>
    (window as any).__long.filter((x: any) => x.s >= s && x.s <= e).reduce((a: number, x: any) => a + x.d, 0), [start, end]);
  console.log(`long task sum during typing: ${Math.round(sum)}ms`);
  expect(sum).toBeLessThan(200);
});

test('코드 블록 안에 입력하면 하이라이트가 갱신되고, 언어를 바꾸면 다시 하이라이트된다', async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), '# T\n\n```js\nconst a = 1;\n```\n');
  const code = page.locator('.bn-editor pre code');
  await expect(code.locator('span[style]').first()).toBeVisible({ timeout: 30000 });

  // 새로 입력한 키워드가 토큰 span으로 나뉘어야 한다
  await code.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' return');
  await expect(code.locator('span[style]', { hasText: /^return$/ })).toHaveCount(1);

  // 케밥 메뉴에서 언어를 Plain Text로 바꾸면 토큰 span이 사라지고, Python으로 바꾸면 다시 생긴다
  const setLanguage = async (name: string) => {
    // 버튼은 호버 중에만 보인다. 블록 위에서 mousemove를 두 번 내 대상 블록을 잡은 뒤 click을 직접 보낸다.
    // 부하가 걸리면 숨김 타이머와 경합하므로 메뉴가 열릴 때까지 다시 시도한다.
    await expect(async () => {
      const box = (await code.boundingBox())!;
      await page.mouse.move(box.x + 5, box.y + 5);
      await page.mouse.move(box.x + 10, box.y + 5);
      await page.locator('.bn-floating-menu-btn').dispatchEvent('click');
      await expect(page.locator('.cbm-panel')).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 10000 });
    await page.locator('.cbm-item.cbm-has-sub', { hasText: /^언어/ }).hover();
    await page.locator('.cbm-item.cbm-has-sub', { hasText: /^언어/ }).locator('.cbm-sub .cbm-item', { hasText: name }).click();
  };
  await setLanguage('Plain Text');
  await expect(code.locator('span[style]')).toHaveCount(0);
  await setLanguage('Python');
  await expect(code.locator('span[style]').first()).toBeVisible();
});
