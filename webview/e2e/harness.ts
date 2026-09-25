// 붙여 넣기와 표 편집 E2E의 공용 도우미(추가 검토 30)
import { Page } from '@playwright/test';

const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;
export const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));
export const types = (page: Page) => page.evaluate(() => (window as any).__editor.document.map((b: any) => b.type));
export const load = async (page: Page, text: string) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((t) => window.postMessage({ type: 'update', text: t }, '*'), text);
  await page.waitForSelector('.bn-editor');
  await page.waitForTimeout(300);
};
export const paste = (page: Page, data: Record<string, string>) => page.evaluate((d) => {
  const dt = new DataTransfer();
  for (const [k, v] of Object.entries(d)) dt.setData(k, v);
  const target = (document.activeElement as HTMLElement) ?? document.querySelector('.bn-editor');
  target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, data);
/** 표 줄마다 칸 수(| 개수)가 같은가 */
export const tableShapeOk = (md: string) => {
  const rows = md.split('\n').filter(l => /^\|.*\|$/.test(l.trim()));
  const counts = rows.map(r => r.replace(/\\\|/g, '').split('|').length);
  return rows.length >= 2 && counts.every(c => c === counts[0]);
};
