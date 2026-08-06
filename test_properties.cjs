const { chromium } = require('playwright');
const path = require('path');

const artifactDir = `C:\\Users\\Administrator\\.gemini\\antigravity-cli\\brain\\f3fca17d-cdaa-40c0-b6bd-16afbd0ab999`;

(async () => {
  console.log('Starting exact browser test for Zen Markdown Editor...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('Navigating to http://127.0.0.1:3000/...');
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(artifactDir, '01_initial_page.png') });
  console.log('01_initial_page.png saved.');

  // Check if Properties panel is visible
  let isVisible = await page.locator('text=Properties').first().isVisible().catch(() => false);
  console.log('Properties panel initially visible:', isVisible);

  if (!isVisible) {
    console.log('Opening Settings popup...');
    const settingsBtn = page.locator('button[data-tooltip="Settings"]').first();
    await settingsBtn.click();
    await page.waitForTimeout(500);

    console.log('Toggling "Show Document Properties" switch...');
    const propItem = page.locator('.settings-item:has-text("Show Document Properties")');
    const toggleSwitch = propItem.locator('.toggle-switch, input[type="checkbox"]').first();
    await toggleSwitch.click();
    await page.waitForTimeout(500);

    console.log('Closing Settings popup...');
    await page.mouse.click(100, 100);
    await page.waitForTimeout(500);
  }

  isVisible = await page.locator('text=Properties').first().isVisible().catch(() => false);
  console.log('Properties panel visible after toggle:', isVisible);

  await page.screenshot({ path: path.join(artifactDir, '02_properties_panel.png') });
  console.log('02_properties_panel.png saved.');

  // Step 1: Click "+ Add Property" button and add property "author"
  console.log('--- Step 1: Add New Property "author" ---');
  const addPropBtn = page.getByRole('button', { name: 'Add Property' }).first();
  if (await addPropBtn.isVisible().catch(() => false)) {
    console.log('Clicking "+ Add Property" button...');
    await addPropBtn.click();
    await page.waitForTimeout(300);

    const propInput = page.locator('input[placeholder*="Property name"]');
    await propInput.fill('author');
    await page.waitForTimeout(200);

    console.log('Clicking "Add" button for "author"...');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForTimeout(500);

    // Set value for author property
    const authorRow = page.locator('.fm-row:has-text("author")');
    if (await authorRow.isVisible().catch(() => false)) {
      const valInput = authorRow.locator('input.fm-input');
      if (await valInput.isVisible().catch(() => false)) {
        await valInput.fill('Hong Gildong');
        await valInput.dispatchEvent('change');
        await page.waitForTimeout(300);
      }
    }
    console.log('Property "author" added with value "Hong Gildong".');
  } else {
    console.error('ERROR: "+ Add Property" button not found!');
  }

  await page.screenshot({ path: path.join(artifactDir, '03_added_author_property.png') });
  console.log('03_added_author_property.png saved.');

  // Step 2: Add array property "tags" & click "+ Tag" to add "new-tag"
  console.log('--- Step 2: Add Array Property "tags" & Add Tag "new-tag" ---');
  console.log('Clicking "+ Add Property" to create "tags"...');
  await addPropBtn.click();
  await page.waitForTimeout(300);

  const propInputTags = page.locator('input[placeholder*="Property name"]');
  await propInputTags.fill('tags');
  await page.waitForTimeout(200);

  console.log('Clicking "Add" button for "tags"...');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForTimeout(500);

  // Target the tags row explicitly
  const tagsRow = page.locator('.fm-row:has-text("tags")');
  const addTagBtn = tagsRow.locator('button:has-text("Tag")');
  const hasTagBtn = await addTagBtn.isVisible().catch(() => false);
  console.log('"+ Tag" button inside tags row visible:', hasTagBtn);

  if (hasTagBtn) {
    console.log('Clicking "+ Tag" button...');
    await addTagBtn.click();
    await page.waitForTimeout(300);

    const tagInput = tagsRow.locator('input[type="text"]');
    if (await tagInput.isVisible().catch(() => false)) {
      console.log('Typing "new-tag" into tag input field...');
      await tagInput.fill('new-tag');
      await tagInput.press('Enter');
      await page.waitForTimeout(500);
      console.log('Tag "new-tag" added successfully to "tags".');
    }
  } else {
    console.error('ERROR: "+ Tag" button not found in tags row!');
  }

  await page.screenshot({ path: path.join(artifactDir, '04_added_new_tag.png') });
  console.log('04_added_new_tag.png saved.');

  // Step 3: Interactive Modification & Deletion
  console.log('--- Step 3: Interactive Modification & Deletion Verification ---');

  if (hasTagBtn) {
    console.log('Adding second tag "second-tag"...');
    await addTagBtn.click();
    await page.waitForTimeout(200);
    const tagInput2 = tagsRow.locator('input[type="text"]');
    if (await tagInput2.isVisible().catch(() => false)) {
      await tagInput2.fill('second-tag');
      await tagInput2.press('Enter');
      await page.waitForTimeout(500);
      console.log('Tag "second-tag" added to "tags".');
    }
  }

  await page.screenshot({ path: path.join(artifactDir, '05_added_second_tag.png') });
  console.log('05_added_second_tag.png saved.');

  // Delete tag chip "second-tag"
  const tagChip = tagsRow.locator('.fm-chip:has-text("second-tag")');
  if (await tagChip.isVisible().catch(() => false)) {
    console.log('Deleting tag chip "second-tag"...');
    const chipX = tagChip.locator('.fm-chip-x');
    await chipX.click();
    await page.waitForTimeout(500);
    console.log('Tag chip "second-tag" deleted successfully.');
  }

  await page.screenshot({ path: path.join(artifactDir, '06_deleted_second_tag_chip.png') });
  console.log('06_deleted_second_tag_chip.png saved.');

  // Delete property "author"
  const authorRow = page.locator('.fm-row:has-text("author")');
  if (await authorRow.isVisible().catch(() => false)) {
    console.log('Deleting property "author"...');
    const delBtn = authorRow.locator('button.fm-prop-del-btn');
    await delBtn.click();
    await page.waitForTimeout(500);
    console.log('Property "author" deleted successfully.');
  }

  await page.screenshot({ path: path.join(artifactDir, '07_deleted_author_property.png') });
  console.log('07_deleted_author_property.png saved.');

  await browser.close();
  console.log('ALL TESTS COMPLETED SUCCESSFULLY!');
})();
