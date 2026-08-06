const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const artifactDir = `C:\\Users\\Administrator\\.gemini\\antigravity-cli\\brain\\83369c7d-9318-4fc6-9079-1cee2b5b6e62`;
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

(async () => {
  console.log('Starting verification on http://127.0.0.1:3000/...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err));

  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check Properties panel visibility
  let propPanel = page.locator('text=Properties').first();
  let isVisible = await propPanel.isVisible().catch(() => false);
  console.log('Properties panel initially visible:', isVisible);

  if (!isVisible) {
    console.log('Opening settings to enable Properties panel...');
    const settingsBtn = page.locator('button[data-tooltip="Settings"]').first();
    if (await settingsBtn.isVisible().catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(300);
      const propToggle = page.locator('.settings-item:has-text("Show Document Properties") .toggle-switch, input[type="checkbox"]').first();
      if (await propToggle.isVisible().catch(() => false)) {
        await propToggle.click();
        await page.waitForTimeout(300);
      }
      await page.mouse.click(50, 50);
      await page.waitForTimeout(300);
    }
  }

  // Ensure collapsed panel is open
  const collapsedChevron = page.locator('div:has-text("Properties") > svg.lucide-chevron-right').first();
  if (await collapsedChevron.isVisible().catch(() => false)) {
    console.log('Expanding collapsed Properties panel...');
    await page.locator('div:has-text("Properties")').first().click();
    await page.waitForTimeout(300);
  }

  console.log('\n========================================');
  console.log('TEST 1: Fixed Key Order Verification');
  console.log('========================================');

  const rows = page.locator('.fm-row');
  const count = await rows.count();
  console.log(`Found ${count} property rows.`);

  const keys = [];
  for (let i = 0; i < count; i++) {
    const keyText = await rows.nth(i).locator('span').nth(1).textContent();
    keys.push(keyText ? keyText.trim() : '');
  }
  console.log('Detected property keys in order:', keys);

  const expectedFixedKeys = ['title', 'date', 'tags', 'author', 'status'];
  const fixedKeysOrderMatches = expectedFixedKeys.every((key, idx) => keys[idx] === key);
  console.log('Fixed keys order test result:', fixedKeysOrderMatches ? 'PASS ✅' : 'FAIL ❌');

  await page.screenshot({ path: path.join(artifactDir, 'test1_fixed_keys_order.png'), fullPage: false });

  console.log('\n========================================');
  console.log('TEST 2: X Button Behavior (Fixed Keys vs Custom Keys)');
  console.log('========================================');

  // Fill initial values for fixed keys
  console.log('Setting initial values for fixed keys...');
  const titleRow = page.locator('.fm-row:has-text("title")');
  const titleInput = titleRow.locator('input.fm-input');
  if (await titleInput.isVisible().catch(() => false)) {
    await titleInput.fill('Initial Test Title');
    await titleInput.dispatchEvent('change');
  }

  const authorRow = page.locator('.fm-row:has-text("author")');
  const authorInput = authorRow.locator('input.fm-input');
  if (await authorInput.isVisible().catch(() => false)) {
    await authorInput.fill('Initial Author Name');
    await authorInput.dispatchEvent('change');
  }
  await page.waitForTimeout(300);

  // Add custom key
  console.log('Adding custom property "custom_field"...');
  const addPropBtn = page.getByRole('button', { name: 'Add Property' }).first();
  await addPropBtn.click();
  await page.waitForTimeout(200);

  const newPropInput = page.locator('input[placeholder*="Property name"]');
  await newPropInput.fill('custom_field');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForTimeout(300);

  const customRow = page.locator('.fm-row:has-text("custom_field")');
  const customValInput = customRow.locator('input.fm-input');
  if (await customValInput.isVisible().catch(() => false)) {
    await customValInput.fill('custom_value');
    await customValInput.dispatchEvent('change');
  }

  await page.screenshot({ path: path.join(artifactDir, 'test2_before_x_clicks.png') });

  // 2a. Click X on fixed key "title"
  console.log('Clicking X button on fixed key "title"...');
  const titleDelBtn = titleRow.locator('button.fm-prop-del-btn');
  await titleDelBtn.click();
  await page.waitForTimeout(300);

  const titleRowExistsAfterX = await titleRow.isVisible();
  const titleValueAfterX = await titleInput.inputValue();
  console.log('Title row still exists after X click?:', titleRowExistsAfterX ? 'YES ✅' : 'NO ❌');
  console.log('Title input value after X click:', JSON.stringify(titleValueAfterX));
  const titleResetPass = titleRowExistsAfterX && titleValueAfterX === '';

  // 2b. Click X on fixed key "author"
  console.log('Clicking X button on fixed key "author"...');
  const authorDelBtn = authorRow.locator('button.fm-prop-del-btn');
  await authorDelBtn.click();
  await page.waitForTimeout(300);

  const authorRowExistsAfterX = await authorRow.isVisible();
  const authorValueAfterX = await authorInput.inputValue();
  console.log('Author row still exists after X click?:', authorRowExistsAfterX ? 'YES ✅' : 'NO ❌');
  console.log('Author input value after X click:', JSON.stringify(authorValueAfterX));
  const authorResetPass = authorRowExistsAfterX && authorValueAfterX === '';

  // Check row positions for fixed keys after reset
  const keysAfterFixedReset = [];
  const currentRowsCount = await rows.count();
  for (let i = 0; i < currentRowsCount; i++) {
    const keyText = await rows.nth(i).locator('span').nth(1).textContent();
    keysAfterFixedReset.push(keyText ? keyText.trim() : '');
  }
  console.log('Keys order after fixed key reset:', keysAfterFixedReset);

  // 2c. Click X on custom key "custom_field"
  console.log('Clicking X button on custom key "custom_field"...');
  const customDelBtn = customRow.locator('button.fm-prop-del-btn');
  await customDelBtn.click();
  await page.waitForTimeout(300);

  const customRowExistsAfterX = await page.locator('.fm-row:has-text("custom_field")').isVisible().catch(() => false);
  console.log('Custom key row still exists after X click?:', customRowExistsAfterX ? 'YES ❌ (Should be deleted)' : 'NO ✅ (Successfully deleted)');
  const customDeletePass = !customRowExistsAfterX;

  await page.screenshot({ path: path.join(artifactDir, 'test2_after_x_clicks.png') });

  console.log('\n========================================');
  console.log('TEST 3: Tag Chips X Button Verification');
  console.log('========================================');

  const tagsRow = page.locator('.fm-row:has-text("tags")');
  const tagInput = tagsRow.locator('input[type="text"]');

  console.log('Adding tag "frontend"...');
  await tagInput.fill('frontend');
  await tagInput.press('Enter');
  await page.waitForTimeout(200);

  console.log('Adding tag "react"...');
  await tagInput.fill('react');
  await tagInput.press('Enter');
  await page.waitForTimeout(200);

  console.log('Adding tag "testing"...');
  await tagInput.fill('testing');
  await tagInput.press('Enter');
  await page.waitForTimeout(300);

  const tagChips = tagsRow.locator('.fm-chip');
  const chipCountBefore = await tagChips.count();
  console.log(`Number of tag chips before deletion: ${chipCountBefore}`);
  const tagTextsBefore = [];
  for (let i = 0; i < chipCountBefore; i++) {
    tagTextsBefore.push((await tagChips.nth(i).innerText()).trim());
  }
  console.log('Tags present:', tagTextsBefore);

  await page.screenshot({ path: path.join(artifactDir, 'test3_tags_added.png') });

  // Click X on "react" tag chip
  console.log('Clicking X button on "react" tag chip...');
  const reactChip = tagsRow.locator('.fm-chip:has-text("react")');
  const reactChipX = reactChip.locator('.fm-chip-x');
  await reactChipX.click();
  await page.waitForTimeout(300);

  const chipCountAfter = await tagChips.count();
  console.log(`Number of tag chips after deletion: ${chipCountAfter}`);
  const tagTextsAfter = [];
  for (let i = 0; i < chipCountAfter; i++) {
    tagTextsAfter.push((await tagChips.nth(i).innerText()).trim());
  }
  console.log('Tags remaining:', tagTextsAfter);

  const tagsRowStillExists = await tagsRow.isVisible();
  console.log('Tags row still exists after chip deletion?:', tagsRowStillExists ? 'YES ✅' : 'NO ❌');

  const chipDeletionPass = chipCountBefore === 3 && chipCountAfter === 2 && !tagTextsAfter.includes('react') && tagsRowStillExists;
  console.log('Tag chip deletion test result:', chipDeletionPass ? 'PASS ✅' : 'FAIL ❌');

  await page.screenshot({ path: path.join(artifactDir, 'test3_tag_chip_deleted.png') });

  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');
  console.log(`1. Fixed Key Order Consistency: ${fixedKeysOrderMatches ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`2a. Fixed Key Title Reset (Row preserved, value cleared): ${titleResetPass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`2b. Fixed Key Author Reset (Row preserved, value cleared): ${authorResetPass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`2c. Custom Key Full Deletion: ${customDeletePass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`3. Tag Chip X Deletion (Chip removed, row preserved): ${chipDeletionPass ? 'PASS ✅' : 'FAIL ❌'}`);

  await browser.close();
})();
