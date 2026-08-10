import { chromium } from '@playwright/test';

const mockVsCodeApi = `
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) {
      window.__vscode = {
        postMessage: (msg) => {},
        getState: () => ({}),
        setState: (state) => {}
      };
    }
    return window.__vscode;
  };
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.addInitScript(mockVsCodeApi);
  await page.goto('http://127.0.0.1:5174/');
  await page.waitForSelector('.bn-editor', { timeout: 10000 });

  const res = await page.evaluate(() => {
    const editor = window.__editor;
    const tiptap = editor._tiptapEditor;
    const extMgr = tiptap.extensionManager;
    return {
      extMgrKeys: Object.keys(extMgr),
      extMgrProtoKeys: Object.keys(Object.getPrototypeOf(extMgr)),
    };
  });

  console.log('ExtensionManager keys:', JSON.stringify(res, null, 2));
  await browser.close();
})();
