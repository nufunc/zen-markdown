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

  /** PATTERN N: 설정은 바꾸는 즉시 저장하고 저장 단추는 없다(2026-09-25 사용자 결정) */
  test('Pattern N: Settings Persist Immediately Without Save Button', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__posted = [];
      window.addEventListener('vscode-post-message', (e: any) => (window as any).__posted.push(e.detail));
    });
    const settingsTrigger = page.locator('button[data-tooltip="Settings"]');
    await settingsTrigger.click();

    const glassPanel = page.locator('.glass-panel');
    await expect(glassPanel).toBeVisible();
    await expect(glassPanel.locator('.settings-save-btn')).toHaveCount(0);

    await glassPanel.locator('select').filter({ has: page.locator('option[value="narrow"]') }).selectOption('narrow');
    const posted = await page.evaluate(() => (window as any).__posted);
    expect(posted).toContainEqual({ type: 'updateConfig', key: 'contentWidth', value: 'narrow' });
    expect(posted.some((m: any) => m.type === 'saveAllConfig')).toBe(false);
  });

  /** PATTERN O: Single Bullet Left Line Removal & Multi Bullet Continuity */
  test('Pattern O: Nested list guide line is hidden for one child and for several', async ({ page }) => {
    const editor = page.locator('.bn-editor');
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');

    await page.keyboard.type('- Parent item');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Single child item');
    await page.waitForTimeout(300);

    // 중첩 안내선(자식 묶음 왼쪽의 | 선)은 자식 수와 상관없이 보이지 않는다
    const guides = () => page.evaluate(() => Array.from(document.querySelectorAll('.bn-block-group .bn-block-group > .bn-block-outer'))
      .map(el => { const cs = window.getComputedStyle(el, '::before'); return cs.display === 'none' || /^0px|none/.test(cs.borderLeft); }));
    const one = await guides();
    expect(one.length).toBe(1);
    expect(one.every(Boolean)).toBe(true);

    await page.keyboard.press('Enter');
    await page.keyboard.type('Second child item');
    await page.waitForTimeout(300);
    const two = await guides();
    expect(two.length).toBe(2);
    expect(two.every(Boolean)).toBe(true);
  });
});


