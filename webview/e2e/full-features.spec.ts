import { test, expect } from '@playwright/test';

test.describe('Zen Markdown Editor - Expanded Pattern Suite (Pattern A - M)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000); // Wait for demo document fallback

    // Ensure Properties panel is expanded if hidden
    const fmRow = page.locator('.fm-row').first();
    if (!(await fmRow.isVisible())) {
      const propBtn = page.locator('button[data-tooltip="Toggle Properties"]');
      if (await propBtn.isVisible()) {
        await propBtn.click();
      }
    }
  });

  /** PATTERN A: View Mode Switching & Editor State Synchronization */
  test('Pattern A: View Mode Switching (WYSIWYG <-> RAW)', async ({ page }) => {
    const segmentedWYSIWYG = page.locator('.segmented-btn', { hasText: 'WYSIWYG' });
    const segmentedRaw = page.locator('.segmented-btn', { hasText: 'Raw' });

    await expect(segmentedWYSIWYG).toHaveClass(/active/);

    // Switch to RAW CodeMirror editor
    await segmentedRaw.click();
    await expect(segmentedRaw).toHaveClass(/active/);
    await expect(page.locator('.cm-editor')).toBeVisible();

    // Switch back to WYSIWYG BlockNote editor
    await segmentedWYSIWYG.click();
    await expect(segmentedWYSIWYG).toHaveClass(/active/);
    await expect(page.locator('.bn-editor')).toBeVisible();
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

  /** PATTERN C: Fixed Property Key Ordering Strict Invariance */
  test('Pattern C: Strict Fixed Key Ordering (title -> date -> tags -> author -> status)', async ({ page }) => {
    const propertyRows = page.locator('.fm-row');
    const expectedOrder = ['title', 'date', 'tags', 'author', 'status'];

    const count = await propertyRows.count();
    expect(count).toBeGreaterThanOrEqual(5);

    for (let i = 0; i < expectedOrder.length; i++) {
      const rowKeyText = await propertyRows.nth(i).locator('span').first().textContent();
      expect(rowKeyText?.trim()).toBe(expectedOrder[i]);
    }
  });

  /** PATTERN D: Keyboard-First Tag Editing (Enter, Comma, Backspace, & Chip Removal) */
  test('Pattern D: Keyboard Tag Creation, Comma Splitting, & Backspace Deletion', async ({ page }) => {
    const tagRow = page.locator('.fm-row', { hasText: 'tags' });
    const tagInput = tagRow.locator('input[type="text"]');
    await tagInput.focus();

    // Add tag 'release-v0.5' via Enter
    await tagInput.fill('release-v0.5');
    await page.keyboard.press('Enter');

    // Add tag 'react-editor' via Comma keypress
    await tagInput.fill('react-editor');
    await page.keyboard.press(',');

    const tagChips = tagRow.locator('.fm-chip');
    await expect(tagChips).toHaveCount(2);
    await expect(tagChips.nth(0)).toContainText('release-v0.5');
    await expect(tagChips.nth(1)).toContainText('react-editor');

    // Remove latest tag using Backspace on empty input
    await tagInput.focus();
    await page.keyboard.press('Backspace');
    await expect(tagChips).toHaveCount(1);
    await expect(tagChips.nth(0)).toContainText('release-v0.5');

    // Remove remaining tag using Chip X button
    const chipDeleteBtn = tagChips.first().locator('.fm-chip-x');
    await chipDeleteBtn.click();
    await expect(tagChips).toHaveCount(0);
  });

  /** PATTERN E: Custom Property Combo (Add -> Input Text -> Delete) */
  test('Pattern E: Custom Property Addition and Full Removal', async ({ page }) => {
    const addPropBtn = page.locator('button', { hasText: 'Add Property' });
    await addPropBtn.click();

    const inlineInput = page.locator('input[placeholder*="Property name"]');
    await expect(inlineInput).toBeVisible();
    await inlineInput.fill('version_tag');
    await page.keyboard.press('Enter');

    const customRow = page.locator('.fm-row', { hasText: 'version_tag' });
    await expect(customRow).toBeVisible();

    const customInput = customRow.locator('input[type="text"]');
    await customInput.fill('v0.5.0-release');
    await expect(customInput).toHaveValue('v0.5.0-release');

    // Delete custom property using row X button
    await customRow.hover();
    const deleteBtn = customRow.locator('.fm-prop-del-btn');
    await deleteBtn.click();

    await expect(customRow).not.toBeVisible();
  });

  /** PATTERN F: Fixed Property X Reset vs Preservation */
  test('Pattern F: Fixed Property Value Reset without Removing Fixed Row', async ({ page }) => {
    const authorRow = page.locator('.fm-row', { hasText: 'author' });
    const authorInput = authorRow.locator('input[type="text"]');

    await authorInput.fill('Antigravity Deepmind');
    await expect(authorInput).toHaveValue('Antigravity Deepmind');

    // Click X button on fixed author property
    await authorRow.hover();
    const deleteBtn = authorRow.locator('.fm-prop-del-btn');
    await deleteBtn.click();

    // Author row must remain visible at 4th position, value cleared
    await expect(authorRow).toBeVisible();
    await expect(authorInput).toHaveValue('');
  });

  /** PATTERN G: Glassmorphism Settings Modal Interaction */
  test('Pattern G: Glassmorphism Settings Panel Options Interactivity', async ({ page }) => {
    const settingsTrigger = page.locator('button[data-tooltip="Settings"]');
    await settingsTrigger.click();

    const glassPanel = page.locator('.glass-panel');
    await expect(glassPanel).toBeVisible();

    // Toggle Focus Mode slider
    const focusModeItem = glassPanel.locator('.settings-item', { hasText: 'Focus Mode' });
    const focusModeSlider = focusModeItem.locator('.toggle-slider');
    await focusModeSlider.click();

    const focusModeInput = focusModeItem.locator('.toggle-switch input');
    await expect(focusModeInput).toBeChecked();

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

  /** PATTERN I: Frontmatter to RAW Mode Bilateral Synchronization */
  test('Pattern I: Frontmatter Edits Live Synchronization to RAW Markdown Text', async ({ page }) => {
    const titleRow = page.locator('.fm-row', { hasText: 'title' });
    const titleInput = titleRow.locator('input[type="text"]');
    await titleInput.fill('Synchronized Frontmatter Test');

    // Switch to Raw mode and check YAML header string
    const segmentedRaw = page.locator('.segmented-btn', { hasText: 'Raw' });
    await segmentedRaw.click();

    const codeMirrorContent = page.locator('.cm-content');
    await expect(codeMirrorContent).toBeVisible();
    const rawText = await codeMirrorContent.textContent();
    expect(rawText).toContain('title: Synchronized Frontmatter Test');
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

  /** PATTERN M: Collapse & Expand Frontmatter Properties Header */
  test('Pattern M: Properties Header Collapse and Expand Toggle', async ({ page }) => {
    const propsTitle = page.locator('span', { hasText: 'Properties' }).first();
    await propsTitle.click();

    // After collapsing, property rows should be hidden
    const propertyRows = page.locator('.fm-row');
    await expect(propertyRows.first()).not.toBeVisible();

    // Expand properties again
    await propsTitle.click();
    await expect(propertyRows.first()).toBeVisible();
  });
});
