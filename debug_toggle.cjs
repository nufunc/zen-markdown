const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const artifactDir = `C:\\Users\\Administrator\\.gemini\\antigravity-cli\\brain\\83369c7d-9318-4fc6-9079-1cee2b5b6e62`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('LOG:', msg.text()));

  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(artifactDir, 'debug_01_init.png') });

  const settingsBtn = page.locator('button[data-tooltip="Settings"]').first();
  console.log('Settings button visible:', await settingsBtn.isVisible());
  await settingsBtn.click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(artifactDir, 'debug_02_settings_open.png') });

  const toggleItem = page.locator('.settings-item:has-text("Show Document Properties")');
  console.log('Toggle item visible:', await toggleItem.isVisible());
  
  const checkbox = toggleItem.locator('input[type="checkbox"]');
  console.log('Checkbox checked before:', await checkbox.isChecked());
  
  await toggleItem.locator('.toggle-slider, label.toggle-switch').first().click();
  await page.waitForTimeout(500);

  console.log('Checkbox checked after:', await checkbox.isChecked());
  await page.screenshot({ path: path.join(artifactDir, 'debug_03_toggled.png') });

  // Click outside to close settings
  await page.mouse.click(50, 50);
  await page.waitForTimeout(500);

  const rows = page.locator('.fm-row');
  console.log('Count of .fm-row after toggle:', await rows.count());

  await page.screenshot({ path: path.join(artifactDir, 'debug_04_properties_visible.png') });

  await browser.close();
})();
