import { test, expect, Page } from '@playwright/test';

// 추가 검토 7: 부분 선택을 복사하면 선택한 부분만 마크다운으로 복사된다.
// 한 블록 안의 선택은 블록 표식 없이 인라인만, 여러 블록에 걸치면 블록 표식을 붙인다.
//
// 선택은 키보드 대신 DOM Range로 글자 위치를 정확히 만든다. 병렬 부하에서는 방향키 입력이 빠져 선택이 흔들렸다.
// 복사는 실제 Ctrl+C로 한다. OS 클립보드는 병렬 워커가 함께 쓰므로, 복사 이벤트가 window까지 올라왔을 때 clipboardData를 읽는다.
const mock = `window.acquireVsCodeApi = () => {
  if (!window.__vscode) window.__vscode = { postMessage: () => {}, getState: () => ({}), setState: () => {} };
  return window.__vscode;
};
window.addEventListener('copy', (e) => { window.__copied = e.clipboardData.getData('text/plain'); });`;
const DOC = '# Title\n\nHello **bold** and [link](a.md) and `code`.\n\n- item one\n- item **two**\n\n> quote *it*\n\n```js\nconst answer = 42;\n```';

type Point = { sel: string; text: string };

/** start.text의 첫 글자부터 end.text의 마지막 글자까지 화면에서 선택한다. 각 text는 해당 요소 글자 안에서 처음 나오는 곳을 쓴다.
 *  beforeEach의 클릭 선택이 늦게 반영되면 만든 선택을 덮어 접는다(추가 검토 18). 잠시 뒤에도 선택이 남아 있는지 보고, 접혔으면 다시 만든다. */
const select = async (page: Page, start: Point, end: Point) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await selectOnce(page, start, end);
    await page.waitForTimeout(50);
    if (await page.evaluate(() => !window.getSelection()?.isCollapsed)) return;
    console.log(`select: ${attempt}번째 선택이 접힘`);
  }
  throw new Error('선택이 계속 접힌다');
};
const selectOnce = (page: Page, start: Point, end: Point) =>
  page.evaluate(([s, e]) => {
    const locate = (p: { sel: string; text: string }, atEnd: boolean) => {
      const el = document.querySelector(p.sel)!;
      const idx = el.textContent!.indexOf(p.text);
      if (idx < 0) throw new Error(`not found: ${p.text}`);
      let target = idx + (atEnd ? p.text.length : 0);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const len = n.textContent!.length;
        if (target < len || (atEnd && target === len)) return { node: n, offset: target };
        target -= len;
      }
      throw new Error(`offset out of range: ${p.text}`);
    };
    const a = locate(s, false), b = locate(e, true);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }, [start, end] as const);

const copy = async (page: Page) => {
  await page.evaluate(() => { (window as any).__copied = 'NOT_COPIED'; });
  await page.keyboard.press('Control+c');
  return page.evaluate(() => (window as any).__copied as string);
};

const P = '.bn-editor [data-content-type="paragraph"]';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((d) => window.postMessage({ type: 'update', text: d }, '*'), DOC);
  await page.waitForSelector('.bn-editor pre code');
  await page.locator('.bn-editor h1').click();
});

test('첫 문단의 일부는 인라인 마크다운만 복사한다', async ({ page }) => {
  await select(page, { sel: P, text: 'bold and' }, { sel: P, text: 'bold and' });
  expect(await copy(page)).toBe('**bold** and');
});

test('첫 문단 전체는 표식 없는 한 줄로 복사한다', async ({ page }) => {
  await select(page, { sel: P, text: 'Hello' }, { sel: P, text: 'code.' });
  expect(await copy(page)).toBe('Hello **bold** and [link](a.md) and `code`.');
});

test('여러 블록에 걸친 선택은 블록 표식을 붙인다', async ({ page }) => {
  const lastItem = '.bn-editor [data-content-type="bulletListItem"]:has(strong)';
  await select(page, { sel: P, text: 'e.' }, { sel: lastItem, text: 'two' });
  expect(await copy(page)).toBe('`e`.\n\n- item one\n- item **two**\n');
});

test('인용 끝 네 글자는 인용 표식 없이 복사한다', async ({ page }) => {
  const q = '.bn-editor [data-content-type="quote"]';
  await select(page, { sel: q, text: 'e it' }, { sel: q, text: 'e it' });
  expect(await copy(page)).toBe('e *it*');
});

test('헤딩 일부는 헤딩 표식 없이 선택한 글자만 복사한다', async ({ page }) => {
  await select(page, { sel: '.bn-editor h1', text: 'Tit' }, { sel: '.bn-editor h1', text: 'Tit' });
  expect(await copy(page)).toBe('Tit');
});

test('코드 블록 안의 선택은 펜스 없이 코드 텍스트만 복사한다', async ({ page }) => {
  const code = '.bn-editor pre code';
  await select(page, { sel: code, text: 'answer = 42' }, { sel: code, text: 'answer = 42' });
  expect(await copy(page)).toBe('answer = 42');
});

test('전체 선택은 문서 전체를 마크다운으로 복사한다', async ({ page }) => {
  // 부하가 걸리면 키 입력이 빠질 때가 있어 선택이 생길 때까지 다시 누른다
  await expect(async () => {
    await page.locator('.bn-editor h1').click();
    await page.keyboard.press('Control+a');
    expect(await page.evaluate(() => window.getSelection()!.toString().length)).toBeGreaterThan(0);
  }).toPass({ timeout: 10000 });
  expect(await copy(page)).toBe(DOC + '\n');
});
