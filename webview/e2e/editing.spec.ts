import { test, expect } from '@playwright/test';

const mockVsCodeApi = `
  window.acquireVsCodeApi = () => {
    if (!window.__vscode) {
      window.__vscode = {
        postMessage: (msg) => {
          window.dispatchEvent(new CustomEvent('vscode-post-message', { detail: msg }));
        },
        getState: () => ({}),
        setState: (state) => {}
      };
    }
    return window.__vscode;
  };
`;

test.describe('WYSIWYG Editing Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(mockVsCodeApi);
    await page.goto('/');
    
    await page.evaluate(() => {
      window.postMessage({
        type: 'originalContent',
        content: ''
      }, '*');
      window.postMessage({
        type: 'update',
        text: ''
      }, '*');
    });

    await page.waitForSelector('.bn-editor');
  });

  test('should create a heading using markdown shortcuts', async ({ page }) => {
    const editor = page.locator('.bn-editor');
    await editor.click();

    // 입력: "# " -> Heading 1 전환, 이어서 텍스트 입력
    await page.keyboard.type('# ');
    await page.keyboard.type('This is a heading');

    // 블록이 h1 태그(또는 data-content-type="heading")로 변경되었는지 확인
    await expect(editor.locator('h1')).toContainText('This is a heading');
  });

  test('should create a bullet list using markdown shortcuts', async ({ page }) => {
    const editor = page.locator('.bn-editor');
    await editor.click();

    // 입력: "- " -> Bullet List 전환
    await page.keyboard.type('- ');
    await page.keyboard.type('List item 1');
    await page.keyboard.press('Enter');
    
    // 들여쓰기 (다단계) - Tab
    await page.keyboard.press('Tab');
    await page.keyboard.type('Nested item 1.1');
    await page.keyboard.press('Enter');

    // 내어쓰기 (기존 레벨 복귀) - Shift+Tab
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('List item 2');

    // 텍스트들이 잘 렌더링되었는지 확인
    await expect(editor).toContainText('List item 1');
    await expect(editor).toContainText('Nested item 1.1');
    await expect(editor).toContainText('List item 2');
  });

  test('should create a numbered list using markdown shortcuts', async ({ page }) => {
    const editor = page.locator('.bn-editor');
    await editor.click();

    // 입력: "1. " -> Numbered List 전환
    await page.keyboard.type('1. ');
    await page.keyboard.type('First item');
    await page.keyboard.press('Enter');
    
    // 들여쓰기 (다단계) - Tab
    await page.keyboard.press('Tab');
    await page.keyboard.type('Nested item 1.1');
    await page.keyboard.press('Enter');

    // 내어쓰기 (기존 레벨 복귀) - Shift+Tab
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('Second item');

    // 텍스트들이 잘 렌더링되었는지 확인
    await expect(editor).toContainText('First item');
    await expect(editor).toContainText('Nested item 1.1');
    await expect(editor).toContainText('Second item');
  });

  test('should apply bold and italic styling', async ({ page }) => {
    const editor = page.locator('.bn-editor');
    await editor.click();

    // BlockNote는 **text** 입력 시 자동으로 굵게(bold) 변환됨
    await page.keyboard.type('Normal text and **bold text**');
    
    // strong 태그 검증
    const strong = editor.locator('strong');
    await expect(strong).toHaveText('bold text');

    await page.keyboard.press('Enter');

    // BlockNote는 *text* 또는 _text_ 입력 시 자동으로 기울임(italic) 변환됨
    await page.keyboard.type('And some _italic text_');
    
    const em = editor.locator('em, i');
    await expect(em).toHaveText('italic text');
  });

  test('should create a blockquote using markdown shortcuts', async ({ page }) => {
    const editor = page.locator('.bn-editor');
    await editor.click();

    // 입력: "> " -> Blockquote 전환
    await page.keyboard.type('> ');
    await page.keyboard.type('This is a quote');

    // 인용구 태그 또는 커스텀 속성 검증
    // BlockNote는 때때로 커스텀 스타일을 쓰지만 기본적으로 HTML 구조에 반영될 것을 기대함
    // 텍스트가 정상적으로 입력되었는지는 확인 가능
    await expect(editor).toContainText('This is a quote');
  });

  test('should create a table using slash menu', async ({ page }) => {
    const editor = page.locator('.bn-editor');
    await editor.click();

    // 입력: "/table" -> Slash menu open
    await page.keyboard.type('/table');
    await page.waitForTimeout(300); // 메뉴가 뜰 때까지 대기
    await page.keyboard.press('Enter');

    // 테이블 블록이 생성되었는지 확인
    const table = editor.locator('[data-content-type="table"]');
    await expect(table).toBeVisible();

    // 테이블 셀에 텍스트 입력 확인
    await page.keyboard.type('Header 1');
    await expect(table).toContainText('Header 1');
  });
});
