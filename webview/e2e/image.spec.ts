import { test, expect, Page } from '@playwright/test';

// 추가 검토 25: 꺾쇠 주소 이미지도 문서 폴더 주소를 붙여 미리보기하고, 이미지 블록을 편집해 저장해도 원래 상대 경로로 돌아온다.
// 에디터는 연 이미지의 주소를 정규화한다(file%2B → file+, 한글과 공백은 퍼센트 인코딩). 예전에는 그 줄을 편집하면 절대 주소로 저장됐다.
const BASE = 'https://file%2B.vscode-resource.vscode-cdn.net/d%3A/docs';
const mock = `
  window.__msgs = [];
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) window.__vscode = { postMessage: (m) => window.__msgs.push(m), getState: () => ({}), setState: () => {} };
    return window.__vscode;
  };
`;
const DOC = 'intro\n\n![a](img.png)\n\n![b](<my img.png>)\n\n![d](../up.png)\n\n![f](assets/화면.png)\n\nend\n';
const lastChange = (page: Page) =>
  page.evaluate(() => (window as any).__msgs.filter((m: any) => m.type === 'change').map((m: any) => m.text as string).at(-1));
const imageUrls = (page: Page) => page.evaluate(() => (window as any).__editor.document.filter((b: any) => b.type === 'image').map((b: any) => b.props.url));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mock);
  await page.goto('/');
  await page.evaluate((b) => window.postMessage({ type: 'config', theme: 'light', fontSize: 16, docBaseUri: b }, '*'), BASE);
  await page.evaluate((text) => window.postMessage({ type: 'update', text }, '*'), DOC);
  await page.waitForSelector('.bn-editor');
  await expect.poll(() => imageUrls(page).then(u => u.length)).toBe(4);
});

test('꺾쇠 주소 이미지도 문서 폴더 주소를 붙여 미리보기한다', async ({ page }) => {
  const urls = await imageUrls(page);
  expect(urls[1]).toBe('https://file+.vscode-resource.vscode-cdn.net/d%3A/docs/my%20img.png');
});

test('이미지 블록을 편집해 저장해도 상대 경로로 돌아온다', async ({ page }) => {
  // 이미지마다 이름을 바꿔, 그 줄을 병합이 아니라 직렬화 결과로 쓰게 한다
  await page.evaluate(() => {
    const ed = (window as any).__editor;
    for (const b of ed.document.filter((x: any) => x.type === 'image')) ed.updateBlock(b, { props: { name: b.props.name + 'X' } });
  });
  await expect.poll(() => lastChange(page)).toContain('aX');
  expect(await lastChange(page)).toBe('intro\n\n![aX](img.png)\n\n![bX](<my img.png>)\n\n![dX](../up.png)\n\n![fX](assets/화면.png)\n\nend\n');
});
