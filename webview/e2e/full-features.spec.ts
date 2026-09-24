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

const DEMO_DOC = `---
title: Demo Document
date: '2026-08-01'
tags: []
author: John Doe
status: draft
---

# Heading 1
This is a demo document with words and chars.
`;

test.describe('Zen Markdown Editor - Expanded Pattern Suite (Pattern A - M)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(mockVsCodeApi);
    await page.goto('/');
    await page.evaluate((text) => {
      window.postMessage({ type: 'config', showWordCount: true }, '*');
      window.postMessage({ type: 'update', text }, '*');
    }, DEMO_DOC);

    await page.waitForSelector('.bn-editor');
  });

  /** PATTERN B: Quick Stats Badges Dynamic Word and Character Counting */
  test('Pattern B: Quick Stats Badges Dynamic Counting', async ({ page }) => {
    const wordsBadge = page.locator('.quick-stats-badge', { hasText: 'words' });
    const charsBadge = page.locator('.quick-stats-badge', { hasText: 'chars' });

    await expect(wordsBadge).toBeVisible();
    await expect(charsBadge).toBeVisible();

    const initialWordsText = await wordsBadge.textContent();
    expect(initialWordsText).toMatch(/\d+\s*words/);
  });

  /** PATTERN G: Glassmorphism Settings Modal Interaction */
  test('Pattern G: Glassmorphism Settings Panel Options Interactivity', async ({ page }) => {
    const settingsTrigger = page.locator('button[data-tooltip="Settings"]');
    await settingsTrigger.click();

    const glassPanel = page.locator('.glass-panel');
    await expect(glassPanel).toBeVisible();

    // Toggle Spell Check slider
    const spellItem = glassPanel.locator('.settings-item', { hasText: 'Spell Check' });
    const spellSlider = spellItem.locator('.toggle-slider');
    await spellSlider.click();

    const spellInput = spellItem.locator('.toggle-switch input');
    await expect(spellInput).toBeChecked();

    // Select Content Width
    const widthItem = glassPanel.locator('.settings-item', { hasText: 'Content Width' });
    const widthSelect = widthItem.locator('.settings-select');
    await widthSelect.selectOption('full');
    await expect(widthSelect).toHaveValue('full');
  });

  /** PATTERN H: Markdown Inline Formatting Shortcuts (# Heading & Bullet List) */
  test('Pattern H: WYSIWYG Markdown Formatting Shortcuts', async ({ page }) => {
    const editorElement = page.locator('.bn-editor');
    await editorElement.click();

    // Focus editor and type heading shortcut
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('# Enhanced Pattern Heading');
    await page.keyboard.press('Enter');

    const headingBlock = editorElement.locator('h1', { hasText: 'Enhanced Pattern Heading' });
    await expect(headingBlock).toBeVisible();
  });

  /** PATTERN J: Theme Switching & High-Contrast Theme Verification */
  test('Pattern J: Theme Switching (Light, Dark, Orca, Nord)', async ({ page }) => {
    const settingsTrigger = page.locator('button[data-tooltip="Settings"]');
    await settingsTrigger.click();

    const glassPanel = page.locator('.glass-panel');
    const themeItem = glassPanel.locator('.settings-item', { hasText: 'Theme' });
    const themeSelect = themeItem.locator('.settings-select');

    // Change Theme to Dark
    await themeSelect.selectOption('dark');
    await expect(themeSelect).toHaveValue('dark');

    // Change Theme to Orca
    await themeSelect.selectOption('orca');
    await expect(themeSelect).toHaveValue('orca');
  });

  /** PATTERN K: Table of Contents (TOC) Toggle & Floating Sidebar Visibility */
  test('Pattern K: Table of Contents (TOC) Toggle Interaction', async ({ page }) => {
    const tocTrigger = page.locator('button[data-tooltip="Table of Contents"]');
    if (await tocTrigger.isVisible()) {
      await tocTrigger.click();
      const tocPanel = page.locator('.toc-sidebar, [data-testid="toc-panel"]').first();
      await expect(tocPanel).toBeVisible();
    }
  });

  /** PATTERN L: Undo & Redo Keyboard Shortcut Triggers (Ctrl+Z, Ctrl+Y) */
  test('Pattern L: Undo and Redo Keyboard Actions', async ({ page }) => {
    const editorElement = page.locator('.bn-editor');
    await editorElement.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Testing Undo Keyboard Shortcut');

    // Trigger Ctrl+Z
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    // Trigger Ctrl+Y
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(200);
  });

  /** PATTERN N: Settings Save Button Explicit Batch Persistence */
  test('Pattern N: Settings Save Button Interaction and Feedback', async ({ page }) => {
    const settingsTrigger = page.locator('button[data-tooltip="Settings"]');
    await settingsTrigger.click();

    const glassPanel = page.locator('.glass-panel');
    await expect(glassPanel).toBeVisible();

    const saveBtn = glassPanel.locator('.settings-save-btn');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toContainText('설정 저장');

    // 저장이 실패하면 성공 표시 없이 버튼만 다시 누를 수 있어야 한다
    await saveBtn.click();
    await expect(saveBtn).toBeDisabled();
    await page.waitForTimeout(400);
    await expect(saveBtn).not.toHaveClass(/saved/);
    await page.evaluate(() => window.postMessage({ type: 'configSaveFailed' }, '*'));
    await expect(saveBtn).toBeEnabled();
    await expect(saveBtn).not.toHaveClass(/saved/);
    await expect(glassPanel).toBeVisible();

    // 호스트가 저장을 확인(configSaved)한 뒤에만 성공을 표시한다
    await saveBtn.click();
    await page.evaluate(() => window.postMessage({ type: 'configSaved' }, '*'));
    await expect(saveBtn).toContainText('설정이 저장되었습니다');
    await expect(saveBtn).toHaveClass(/saved/);

    // Verify panel closes automatically after feedback delay
    await expect(glassPanel).not.toBeVisible({ timeout: 2000 });
  });

  /** PATTERN O: Single Bullet Left Line Removal & Multi Bullet Continuity */
  test('Pattern O: Single Bullet Left Line Removal and Multi Bullet Guide Line', async ({ page }) => {
    const editor = page.locator('.bn-editor');
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');

    // Create a bullet item
    await page.keyboard.type('- Parent item');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Single child item');
    await page.waitForTimeout(300);

    // With only one nested child, the left line should be hidden
    const singleChildBorder = await page.evaluate(() => {
      const nestedOuter = document.querySelector('.bn-block-group .bn-block-group > .bn-block-outer:only-child');
      if (!nestedOuter) return null;
      return window.getComputedStyle(nestedOuter, '::before').borderLeft;
    });
    expect(singleChildBorder).toMatch(/0px|none/);

    // Add a second nested child -> now two items, left line should appear
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second child item');
    await page.waitForTimeout(300);

    const multiChildBorder = await page.evaluate(() => {
      const nestedOuters = Array.from(document.querySelectorAll('.bn-block-group .bn-block-group > .bn-block-outer'));
      if (nestedOuters.length < 2) return null;
      return window.getComputedStyle(nestedOuters[0], '::before').borderLeft;
    });
    expect(multiChildBorder).toContain('1px solid');
  });
});


