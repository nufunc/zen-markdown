import { test, expect, Page } from '@playwright/test';
import { load } from './harness';
import { THEMES } from '../src/themes';

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

const DOC = 'Some text with `inline code` here.\n\n> quoted text line\n\n| head | b |\n|---|---|\n| cell | 2 |\n';
/** 선택자마다 글자색과 (반투명을 겹친) 바탕색의 WCAG 대비. 글자색도 함께 돌려준다 */
const contrasts = (page: Page, selectors: Record<string, string>) => page.evaluate((sels) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const parse = (c: string) => {
    if (!c || c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const blend = (t: any, b: any) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const lum = (c: any) => { const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (el: Element | null) => {
    const stack: any[] = [];
    for (; el; el = el.parentElement) { const c = parse(getComputedStyle(el).backgroundColor); if (c.a > 0) { stack.push(c); if (c.a >= 1) break; } }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base);
    return base;
  };
  const out: Record<string, { ratio: number; color: string }> = {};
  for (const [name, sel] of Object.entries(sels)) {
    const el = document.querySelector(sel);
    if (!el) { out[name] = { ratio: 0, color: 'missing' }; continue; }
    const s = getComputedStyle(el);
    const bg = bgOf(el);
    const fg = blend({ ...parse(s.color), a: parse(s.color).a * Number(s.opacity) }, bg);
    const [l1, l2] = [lum(fg), lum(bg)];
    out[name] = { ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), color: s.color };
  }
  return out;
}, selectors);
const hexToRgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

for (const theme of Object.keys(THEMES)) {
  test(`31-7 ${theme} 테마의 본문, 인라인 코드, 인용, 표, 머리 단추는 대비 4.5 이상이고 본문은 테마 글자색이다`, async ({ page }) => {
    await load(page, DOC);
    await config(page, { theme });
    await page.waitForTimeout(300);
    const r = await contrasts(page, {
      body: '.bn-editor [data-content-type="paragraph"] .bn-inline-content',
      inlineCode: '.bn-editor [data-content-type="paragraph"] code',
      quote: '.bn-editor blockquote',
      th: '.bn-editor th',
      td: '.bn-editor td',
      header: '[data-tooltip^="Open in VS Code text editor"]',
    });
    for (const [name, v] of Object.entries(r)) expect(v.ratio, `${name} ${v.color}`).toBeGreaterThanOrEqual(4.5);
    expect(r.body.color).toBe(hexToRgb(THEMES[theme].textColor));
  });
}
