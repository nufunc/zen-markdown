import { test, expect } from '@playwright/test';

// 모의 VS Code API 주입 스크립트
const mockVsCodeApi = `
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) {
      window.__vscode = {
        postMessage: (msg) => {
          // Playwright 테스트에서 이 이벤트를 감지할 수 있도록 window 이벤트 발송
          window.dispatchEvent(new CustomEvent('vscode-post-message', { detail: msg }));
        },
        getState: () => ({}),
        setState: (state) => {}
      };
    }
    return window.__vscode;
  };
`;

test.describe('Zen Markdown Webview Editor', () => {
  test.beforeEach(async ({ page }) => {
    // 페이지 로드 전 VS Code API 모킹 주입
    await page.addInitScript(mockVsCodeApi);
    await page.goto('/');
    
    // 초기 originalContent 전달로 loading 상태 해제 및 에디터 초기화
    await page.evaluate(() => {
      window.postMessage({
        type: 'originalContent',
        content: '# Hello World\n\nThis is a test document.'
      }, '*');
      window.postMessage({
        type: 'update',
        text: '# Hello World\n\nThis is a test document.'
      }, '*');
    });

    // 에디터가 준비될 때까지 대기
    await page.waitForSelector('.bn-editor');
  });

  test('should render editor and capture text changes', async ({ page }) => {
    // vscode-post-message 이벤트를 수집할 배열
    const messages: any[] = [];
    await page.exposeFunction('recordMessage', (msg: any) => {
      messages.push(msg);
    });
    
    await page.evaluate(() => {
      window.addEventListener('vscode-post-message', (e: any) => {
        window.recordMessage(e.detail);
      });
    });

    // 에디터에 포커스하고 텍스트 입력
    const editor = page.locator('.bn-editor');
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Typing new text');

    // 디바운스된 postMessage가 호출될 때까지 대기
    await page.waitForFunction(() => {
      // @ts-ignore
      return window.__messages_received || true; 
    });
    
    // 일정 시간 대기 (debounce 250ms 감안)
    await page.waitForTimeout(1000);

    // change 메시지가 정상적으로 발송되었는지 확인
    const changeMessages = messages.filter(m => m.type === 'change');
    expect(changeMessages.length).toBeGreaterThan(0);
    expect(changeMessages[changeMessages.length - 1].text).toContain('Typing new text');
  });

  test('should trigger undo message on Ctrl+Z', async ({ page }) => {
    const messages: any[] = [];
    await page.exposeFunction('recordMessage', (msg: any) => {
      messages.push(msg);
    });
    
    await page.evaluate(() => {
      window.addEventListener('vscode-post-message', (e: any) => {
        window.recordMessage(e.detail);
      });
    });

    const editor = page.locator('.bn-editor');
    await editor.click();

    // 단축키 입력
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+z`);

    // undo 메시지 발송 대기 (debounce 없음)
    await page.waitForTimeout(500);

    const undoMessages = messages.filter(m => m.type === 'undo');
    expect(undoMessages.length).toBe(1);
  });

  test('should trigger redo message on Ctrl+Y', async ({ page }) => {
    const messages: any[] = [];
    await page.exposeFunction('recordMessage', (msg: any) => {
      messages.push(msg);
    });
    
    await page.evaluate(() => {
      window.addEventListener('vscode-post-message', (e: any) => {
        window.recordMessage(e.detail);
      });
    });

    const editor = page.locator('.bn-editor');
    await editor.click();

    // 단축키 입력
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+y`);

    await page.waitForTimeout(500);

    const redoMessages = messages.filter(m => m.type === 'redo');
    expect(redoMessages.length).toBe(1);
  });

  test('should update editor content on external_update', async ({ page }) => {
    // 외부 업데이트 메시지 시뮬레이션
    await page.evaluate(() => {
      window.postMessage({
        type: 'external_update',
        text: '# External Change\n\nNew content from host.'
      }, '*');
    });

    // 약간의 렌더링 지연 시간 대기
    await page.waitForTimeout(500);

    // 에디터 내부 텍스트 검증
    const editorText = await page.locator('.bn-editor').innerText();
    expect(editorText).toContain('External Change');
    expect(editorText).toContain('New content from host.');
  });

  test('should switch to raw mode on config isReadOnly', async ({ page }) => {
    // config 업데이트 메시지 시뮬레이션
    await page.evaluate(() => {
      window.postMessage({
        type: 'config',
        isReadOnly: true,
        theme: 'light',
        fontSize: 16
      }, '*');
    });

    // 렌더링 대기
    await page.waitForTimeout(500);

    // Raw 모드 (readonly 텍스트 뷰어) 컴포넌트가 렌더링되었는지 확인
    const rawViewer = page.locator('.raw-markdown-editor');
    await expect(rawViewer).toBeVisible();
    
    const text = await rawViewer.innerText();
    expect(text).toContain('Hello World');
  });
});

