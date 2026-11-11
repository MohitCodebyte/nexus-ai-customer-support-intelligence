const { chromium } = require('../frontend/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/HP/.gemini/antigravity/brain/05b2c0ab-9033-4048-a72d-0879dfdc5009';

async function run() {
  console.log('=== Starting Nexus AI Suggestions & Microphone Verification ===');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  // 1. Desktop Flow & Contextual Follow-up Chips Verification
  console.log('\n--- 1. Testing Contextual Suggestions Flow on 1440x900 ---');
  const context1440 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['microphone'],
  });
  const page1440 = await context1440.newPage();

  await page1440.goto('http://localhost:5173/chat', { waitUntil: 'networkidle' });
  await page1440.waitForTimeout(1500);

  // Send a banking card query: "I lost my debit card, what should I do?"
  console.log('Sending initial query: "I lost my debit card, what should I do?"');
  const composerInput = page1440.locator('textarea[aria-label="Customer inquiry message input"]').first();
  await composerInput.waitFor({ state: 'visible', timeout: 10000 });
  await composerInput.fill('I lost my debit card, what should I do?');
  
  const sendBtn = page1440.locator('button[aria-label="Send message"]').first();
  await sendBtn.click();

  // Wait for response to appear and suggestions to render
  console.log('Waiting for assistant response and suggestions...');
  await page1440.waitForSelector('.nexus-suggestion-chip', { timeout: 15000 });
  await page1440.waitForTimeout(1500);

  // Count suggestions
  const suggestionCount = await page1440.locator('.nexus-suggestion-chip').count();
  console.log(`Found ${suggestionCount} contextual suggestion chips for Card & Account!`);

  const chipTexts = [];
  for (let i = 0; i < suggestionCount; i++) {
    const text = await page1440.locator('.nexus-suggestion-chip').nth(i).innerText();
    chipTexts.push(text.trim());
  }
  console.log('Suggestion chips:', chipTexts);

  // Screenshot initial card flow with suggestions
  await page1440.screenshot({
    path: path.join(ARTIFACT_DIR, 'nexus_suggestions_1440x900_card_flow.png'),
    fullPage: false,
  });
  console.log('Saved: nexus_suggestions_1440x900_card_flow.png');

  // Click the first suggestion chip (e.g. "How can I block my card immediately?")
  console.log(`Clicking suggestion chip: "${chipTexts[0]}"...`);
  await page1440.locator('.nexus-suggestion-chip').first().click();

  // Wait for follow-up response in the same conversation
  console.log('Waiting for follow-up response...');
  await page1440.waitForTimeout(4000);

  // Count turns: Should have 4 turns now (user, assistant, user follow-up, assistant follow-up)
  const turnsCount = await page1440.locator('[role="radiogroup"]').count();
  console.log(`Number of assistant responses rendered: ${turnsCount}`);

  // Screenshot after follow-up is answered
  await page1440.screenshot({
    path: path.join(ARTIFACT_DIR, 'nexus_suggestions_1440x900_followup_clicked.png'),
    fullPage: false,
  });
  console.log('Saved: nexus_suggestions_1440x900_followup_clicked.png');

  // Test microphone button
  console.log('Testing microphone button activation...');
  const micBtn = page1440.locator('button[aria-label*="voice" i], button[title*="voice" i], button:has(svg.lucide-mic)').first();
  await micBtn.click();
  await page1440.waitForTimeout(1200);

  await page1440.screenshot({
    path: path.join(ARTIFACT_DIR, 'nexus_microphone_ui_state.png'),
    fullPage: false,
  });
  console.log('Saved: nexus_microphone_ui_state.png');

  await context1440.close();

  // 2. Viewports Verification (1366x768 Laptop, 1920x1080 Full HD, 375x720 Mobile)
  const otherViewports = [
    { name: '1366x768_laptop', width: 1366, height: 768, isMobile: false, file: 'nexus_suggestions_1366x768_laptop.png' },
    { name: '1920x1080_fullhd', width: 1920, height: 1080, isMobile: false, file: 'nexus_suggestions_1920x1080_fullhd.png' },
    { name: '375x720_mobile', width: 375, height: 720, isMobile: true, file: 'nexus_suggestions_375x720_mobile.png' },
  ];

  for (const vp of otherViewports) {
    console.log(`\nTesting viewport: ${vp.name}...`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      permissions: ['microphone'],
    });
    const page = await ctx.newPage();
    await page.goto('http://localhost:5173/chat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const input = page.locator('textarea[aria-label="Customer inquiry message input"]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill('How do I dispute a fraudulent transaction?');
    const sBtn = page.locator('button[aria-label="Send message"]').first();
    await sBtn.click();

    await page.waitForSelector('.nexus-suggestion-chip', { timeout: 15000 });
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, vp.file),
      fullPage: false,
    });
    console.log(`Saved: ${vp.file}`);
    await ctx.close();
  }

  await browser.close();
  console.log('\n=== All Suggestion & Microphone Verifications Completed Successfully ===');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
