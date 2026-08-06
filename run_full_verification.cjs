const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const artifactDir = `C:\\Users\\Administrator\\.gemini\\antigravity-cli\\brain\\83369c7d-9318-4fc6-9079-1cee2b5b6e62`;
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

(async () => {
  console.log('=====================================================');
  console.log('  Properties Panel Live Browser Verification Script  ');
  console.log('=====================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const results = {
    fixedKeysOrder: false,
    fixedKeyResetTitle: false,
    fixedKeyResetAuthor: false,
    customKeyDeletion: false,
    tagChipDeletion: false,
    tagsRowPreserved: false
  };

  try {
    console.log('1. Navigating to http://127.0.0.1:3000/...');
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Enable Properties Panel via Settings
    console.log('2. Enabling "Show Document Properties" via Settings...');
    const settingsBtn = page.locator('button[data-tooltip="Settings"]').first();
    await settingsBtn.click();
    await page.waitForTimeout(500);

    const toggleItem = page.locator('.settings-item:has-text("Show Document Properties")');
    await toggleItem.locator('.toggle-slider, label.toggle-switch').first().click();
    await page.waitForTimeout(500);

    // Close Settings popup
    await page.mouse.click(50, 50);
    await page.waitForTimeout(500);

    // Verify 5 fixed rows present
    const rows = page.locator('.fm-row');
    const rowCount = await rows.count();
    console.log(`\nProperties panel opened. Total rows found: ${rowCount}`);

    // --- TEST 1: Fixed Keys Position Consistency ---
    console.log('\n-----------------------------------------------------');
    console.log('  TEST 1: Fixed Key Order Consistency Verification');
    console.log('-----------------------------------------------------');

    const expectedOrder = ['title', 'date', 'tags', 'author', 'status'];
    const actualOrder = [];

    for (let i = 0; i < rowCount; i++) {
      const keySpan = rows.nth(i).locator('span').nth(1);
      const text = (await keySpan.textContent()).trim();
      actualOrder.push(text);
    }

    console.log('  Expected Order:', expectedOrder);
    console.log('  Actual Order:  ', actualOrder);

    const isOrderMatch = expectedOrder.length === actualOrder.length &&
      expectedOrder.every((key, idx) => actualOrder[idx] === key);

    results.fixedKeysOrder = isOrderMatch;
    console.log(`  Result: ${isOrderMatch ? 'SUCCESS (PASS) ✅' : 'FAILED (FAIL) ❌'}`);
    await page.screenshot({ path: path.join(artifactDir, '01_fixed_keys_order.png') });

    // --- TEST 2: X Button Action (Fixed Reset vs Custom Delete) ---
    console.log('\n-----------------------------------------------------');
    console.log('  TEST 2: X Button Behavior (Fixed Reset vs Custom Delete)');
    console.log('-----------------------------------------------------');

    // Fill initial values for title and author
    const titleRow = page.locator('.fm-row:has-text("title")');
    const titleInput = titleRow.locator('input.fm-input');
    await titleInput.fill('React Editor Architecture');
    await titleInput.dispatchEvent('change');

    const authorRow = page.locator('.fm-row:has-text("author")');
    const authorInput = authorRow.locator('input.fm-input');
    await authorInput.fill('Dev Team Lead');
    await authorInput.dispatchEvent('change');
    await page.waitForTimeout(300);

    // Add a custom key
    console.log('  Adding custom key "category" with value "Engineering"...');
    const addPropBtn = page.getByRole('button', { name: 'Add Property' }).first();
    await addPropBtn.click();
    await page.waitForTimeout(300);

    const propNameInput = page.locator('input[placeholder*="Property name"]');
    await propNameInput.fill('category');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForTimeout(500);

    const categoryRow = page.locator('.fm-row:has-text("category")');
    const categoryInput = categoryRow.locator('input.fm-input');
    if (await categoryInput.isVisible()) {
      await categoryInput.fill('Engineering');
      await categoryInput.dispatchEvent('change');
    }
    await page.waitForTimeout(300);

    await page.screenshot({ path: path.join(artifactDir, '02_with_custom_property.png') });

    // 2a. Click X on fixed key 'title'
    console.log('  [2a] Clicking X button on fixed key "title"...');
    const titleXBtn = titleRow.locator('button.fm-prop-del-btn');
    await titleXBtn.click();
    await page.waitForTimeout(500);

    const titleRowVisible = await titleRow.isVisible();
    const titleVal = await titleInput.inputValue();
    console.log(`       -> Title Row visible?: ${titleRowVisible}`);
    console.log(`       -> Title Input value: "${titleVal}"`);
    results.fixedKeyResetTitle = titleRowVisible && titleVal === '';

    // 2b. Click X on fixed key 'author'
    console.log('  [2b] Clicking X button on fixed key "author"...');
    const authorXBtn = authorRow.locator('button.fm-prop-del-btn');
    await authorXBtn.click();
    await page.waitForTimeout(500);

    const authorRowVisible = await authorRow.isVisible();
    const authorVal = await authorInput.inputValue();
    console.log(`       -> Author Row visible?: ${authorRowVisible}`);
    console.log(`       -> Author Input value: "${authorVal}"`);
    results.fixedKeyResetAuthor = authorRowVisible && authorVal === '';

    // Verify fixed key order is still unchanged
    const orderAfterReset = [];
    const rowsAfterReset = page.locator('.fm-row');
    const countAfterReset = await rowsAfterReset.count();
    for (let i = 0; i < countAfterReset; i++) {
      const keySpan = rowsAfterReset.nth(i).locator('span').nth(1);
      orderAfterReset.push((await keySpan.textContent()).trim());
    }
    console.log('  Order after resetting title & author:', orderAfterReset);

    // 2c. Click X on custom key 'category'
    console.log('  [2c] Clicking X button on custom key "category"...');
    const categoryXBtn = categoryRow.locator('button.fm-prop-del-btn');
    await categoryXBtn.click();
    await page.waitForTimeout(500);

    const categoryRowVisible = await page.locator('.fm-row:has-text("category")').isVisible().catch(() => false);
    console.log(`       -> Category Row visible after X click?: ${categoryRowVisible} (Expected: false)`);
    results.customKeyDeletion = !categoryRowVisible;

    await page.screenshot({ path: path.join(artifactDir, '03_after_x_button_behavior.png') });

    // --- TEST 3: Tag Chip X Button Action ---
    console.log('\n-----------------------------------------------------');
    console.log('  TEST 3: Tag Chip X Button Verification');
    console.log('-----------------------------------------------------');

    const tagsRow = page.locator('.fm-row:has-text("tags")');
    const tagTextInput = tagsRow.locator('input[type="text"]');

    console.log('  Adding tags: "frontend", "react", "testing"...');
    await tagTextInput.fill('frontend');
    await tagTextInput.press('Enter');
    await page.waitForTimeout(200);

    await tagTextInput.fill('react');
    await tagTextInput.press('Enter');
    await page.waitForTimeout(200);

    await tagTextInput.fill('testing');
    await tagTextInput.press('Enter');
    await page.waitForTimeout(500);

    const tagChips = tagsRow.locator('.fm-chip');
    const chipCountBefore = await tagChips.count();
    const tagTextsBefore = [];
    for (let i = 0; i < chipCountBefore; i++) {
      tagTextsBefore.push((await tagChips.nth(i).innerText()).trim());
    }
    console.log(`  Tag chips before deletion (${chipCountBefore}):`, tagTextsBefore);
    await page.screenshot({ path: path.join(artifactDir, '04_tags_added.png') });

    // Click X on "react" tag chip
    console.log('  Clicking X button on "react" tag chip...');
    const reactChip = tagsRow.locator('.fm-chip:has-text("react")');
    const reactChipX = reactChip.locator('.fm-chip-x');
    await reactChipX.click();
    await page.waitForTimeout(500);

    const chipCountAfter = await tagChips.count();
    const tagTextsAfter = [];
    for (let i = 0; i < chipCountAfter; i++) {
      tagTextsAfter.push((await tagChips.nth(i).innerText()).trim());
    }
    console.log(`  Tag chips after deleting "react" (${chipCountAfter}):`, tagTextsAfter);

    const tagsRowVisibleAfterChipDel = await tagsRow.isVisible();
    console.log(`  Tags Row preserved after chip deletion?: ${tagsRowVisibleAfterChipDel}`);

    results.tagChipDeletion = chipCountBefore === 3 && chipCountAfter === 2 && !tagTextsAfter.includes('react') && tagTextsAfter.includes('frontend') && tagTextsAfter.includes('testing');
    results.tagsRowPreserved = tagsRowVisibleAfterChipDel;

    await page.screenshot({ path: path.join(artifactDir, '05_tag_chip_deleted.png') });

    console.log('\n=====================================================');
    console.log('  FINAL VERIFICATION RESULTS SUMMARY');
    console.log('=====================================================');
    console.log(`1. Fixed Key Order Consistency ('title'->'date'->'tags'->'author'->'status'): ${results.fixedKeysOrder ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`2a. Fixed Key Title Reset (Row preserved, value cleared): ${results.fixedKeyResetTitle ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`2b. Fixed Key Author Reset (Row preserved, value cleared): ${results.fixedKeyResetAuthor ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`2c. Custom Key Full Deletion (Row removed from DOM): ${results.customKeyDeletion ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`3. Tag Chip X Deletion (Only targeted chip removed): ${results.tagChipDeletion ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`   Tag Row Preservation: ${results.tagsRowPreserved ? 'PASS ✅' : 'FAIL ❌'}`);

  } catch (err) {
    console.error('VERIFICATION ERROR:', err);
  } finally {
    await browser.close();
  }
})();
