import { test, expect } from '@playwright/test';

test.describe('Zen Markdown Editor - Comprehensive Full Features Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://127.0.0.1:3000/');
    // Wait for properties panel row to be rendered (indicates initial document loading completed)
    await page.locator('.fm-row').first().waitFor({ state: 'visible', timeout: 15000 });
  });

  test('1. View Mode Segmented Control Switching', async ({ page }) => {
    const segmentedWYSIWYG = page.locator('.segmented-btn', { hasText: 'WYSIWYG' });
    const segmentedRaw = page.locator('.segmented-btn', { hasText: 'Raw' });

    await expect(segmentedWYSIWYG).toHaveClass(/active/);
    
    // Switch to Raw mode
    await segmentedRaw.click();
    await expect(segmentedRaw).toHaveClass(/active/);
    await expect(page.locator('.cm-editor')).toBeVisible();

    // Switch back to WYSIWYG mode
    await segmentedWYSIWYG.click();
    await expect(segmentedWYSIWYG).toHaveClass(/active/);
    await expect(page.locator('.bn-editor')).toBeVisible();
  });

  test('2. Quick Stats Badges (words/chars)', async ({ page }) => {
    const statsBadge = page.locator('.quick-stats-badge');
    await expect(statsBadge).toBeVisible();
    
    const wordsItem = statsBadge.locator('.quick-stat-item', { hasText: 'words' });
    const charsItem = statsBadge.locator('.quick-stat-item', { hasText: 'chars' });

    await expect(wordsItem).toBeVisible();
    await expect(charsItem).toBeVisible();

    const wordsText = await wordsItem.textContent();
    const charsText = await charsItem.textContent();

    expect(wordsText).toMatch(/\d+\s+words/);
    expect(charsText).toMatch(/\d+\s+chars/);
  });

  test('3. Fixed Key Ordering in Properties Panel', async ({ page }) => {
    const propertyRows = page.locator('.fm-row');
    const expectedOrder = ['title', 'date', 'tags', 'author', 'status'];

    const count = await propertyRows.count();
    expect(count).toBeGreaterThanOrEqual(5);

    for (let i = 0; i < expectedOrder.length; i++) {
      const rowKeyText = await propertyRows.nth(i).locator('span').first().textContent();
      expect(rowKeyText?.trim()).toBe(expectedOrder[i]);
    }
  });

  test('4. Keyboard-First Tag Input and Deletion', async ({ page }) => {
    const tagRow = page.locator('.fm-row', { hasText: 'tags' });
    const tagInput = tagRow.locator('input[type="text"]');
    await tagInput.focus();

    // Add tag 'design' via Enter
    await tagInput.fill('design');
    await page.keyboard.press('Enter');

    // Add tag 'architecture' via comma key
    await tagInput.fill('architecture');
    await page.keyboard.press(',');

    const tagChips = tagRow.locator('.fm-chip');
    await expect(tagChips).toHaveCount(2);
    await expect(tagChips.nth(0)).toContainText('design');
    await expect(tagChips.nth(1)).toContainText('architecture');

    // Delete tag using Backspace
    await tagInput.focus();
    await page.keyboard.press('Backspace');
    await expect(tagChips).toHaveCount(1);
    await expect(tagChips.nth(0)).toContainText('design');
  });

  test('5. Add Custom Property and Delete Custom Property', async ({ page }) => {
    const addPropBtn = page.locator('button', { hasText: 'Add Property' });
    await addPropBtn.click();

    const inlineInput = page.locator('input[placeholder*="Property name"]');
    await expect(inlineInput).toBeVisible();
    await inlineInput.fill('category');
    await page.keyboard.press('Enter');

    // Custom property 'category' should be added
    const categoryRow = page.locator('.fm-row', { hasText: 'category' });
    await expect(categoryRow).toBeVisible();

    const categoryInput = categoryRow.locator('input[type="text"]');
    await categoryInput.fill('Engineering');
    await expect(categoryInput).toHaveValue('Engineering');

    // Delete custom property
    await categoryRow.hover();
    const deleteBtn = categoryRow.locator('.fm-prop-del-btn');
    await deleteBtn.click();

    await expect(categoryRow).not.toBeVisible();
  });

  test('6. Fixed Property X Button Resets Value without Removing Row', async ({ page }) => {
    const titleRow = page.locator('.fm-row', { hasText: 'title' });
    const titleInput = titleRow.locator('input[type="text"]');

    await titleInput.fill('Zen Editor Test Document');
    await expect(titleInput).toHaveValue('Zen Editor Test Document');

    // Click X button on fixed property title
    await titleRow.hover();
    const deleteBtn = titleRow.locator('.fm-prop-del-btn');
    await deleteBtn.click();

    // Title row MUST still be visible at 1st position and value cleared
    await expect(titleRow).toBeVisible();
    await expect(titleInput).toHaveValue('');
  });

  test('7. Glassmorphism Settings Panel & Options Interactions', async ({ page }) => {
    const settingsTrigger = page.locator('button[data-tooltip="Settings"]');
    await settingsTrigger.click();

    const glassPanel = page.locator('.glass-panel');
    await expect(glassPanel).toBeVisible();

    // Toggle Focus Mode switch by clicking toggle-switch container
    const focusModeItem = glassPanel.locator('.settings-item', { hasText: 'Focus Mode' });
    const focusModeSwitchInput = focusModeItem.locator('input');
    await focusModeItem.locator('.toggle-switch').click();
    await expect(focusModeSwitchInput).toBeChecked();

    // Change Content Width select specifically inside the Content Width item
    const widthSelectItem = glassPanel.locator('.settings-item', { hasText: 'Content Width' });
    const widthSelect = widthSelectItem.locator('.settings-select');
    await widthSelect.selectOption('full');
    await expect(widthSelect).toHaveValue('full');
  });
});
