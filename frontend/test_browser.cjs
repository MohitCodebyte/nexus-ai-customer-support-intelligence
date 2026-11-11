const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runVerification() {
  console.log('--- Launching Edge Browser Verification Suite ---');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const outDir = path.resolve(__dirname, '..', 'verification_screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Dashboard View
  console.log('1. Navigating to Dashboard: http://127.0.0.1:5173/');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000); // Wait for Three.js canvas & WebGL to render

  console.log('Capturing: 01_dashboard.png');
  await page.screenshot({ path: path.join(outDir, '01_dashboard.png'), fullPage: false });

  // 2. 3D Mascot Close-up
  const mascotStage = page.locator('.mascot-canvas-wrapper').first();
  if (await mascotStage.isVisible()) {
    console.log('Capturing: 02_mascot_closeup.png');
    await mascotStage.screenshot({ path: path.join(outDir, '02_mascot_closeup.png') });
  }

  // 3. Test Mascot State Change on Dashboard
  console.log('Testing Mascot State pills...');
  const thinkingPill = page.locator('button:has-text("thinking")').first();
  if (await thinkingPill.isVisible()) {
    await thinkingPill.click();
    await page.waitForTimeout(1000);
    console.log('Capturing: 03_mascot_thinking.png');
    await page.screenshot({ path: path.join(outDir, '03_mascot_thinking.png'), fullPage: false });
  }

  // 4. Navigate to AI Chat Tab
  console.log('2. Clicking AI Chat Tab in Header...');
  await page.locator('header button:has-text("AI Chat")').click();
  await page.waitForTimeout(2000);

  console.log('Capturing: 04_chat_empty_state.png');
  await page.screenshot({ path: path.join(outDir, '04_chat_empty_state.png'), fullPage: false });

  // 5. Test Chat Message Submission (Enter key)
  console.log('3. Typing message into chat composer: "I lost my credit card, how do I freeze it immediately?"');
  const textarea = page.locator('textarea[aria-label="Customer inquiry message input"]');
  await textarea.fill('I lost my credit card, how do I freeze it immediately?');
  await page.keyboard.press('Enter');

  console.log('Waiting for Flask backend AI response...');
  // Wait until assistant message bubble appears
  await page.waitForSelector('text=card', { timeout: 15000 });
  await page.waitForTimeout(3500); // Allow response animation & mascot speech

  console.log('Capturing: 05_chat_active_conversation.png');
  await page.screenshot({ path: path.join(outDir, '05_chat_active_conversation.png'), fullPage: false });

  // 6. Expand RAG Sources Drawer if present
  const sourcesButton = page.locator('button:has-text("FAQ Sources")').first();
  if (await sourcesButton.isVisible()) {
    console.log('Expanding FAQ Sources drawer...');
    await sourcesButton.click();
    await page.waitForTimeout(1000);
    console.log('Capturing: 06_chat_sources_drawer.png');
    await page.screenshot({ path: path.join(outDir, '06_chat_sources_drawer.png'), fullPage: false });
  }

  // 7. Navigate to Conversation History
  console.log('4. Clicking History Tab...');
  await page.locator('header button:has-text("History")').click();
  await page.waitForTimeout(2500);

  console.log('Capturing: 07_history_page.png');
  await page.screenshot({ path: path.join(outDir, '07_history_page.png'), fullPage: false });

  // 8. Navigate to Insights Tab
  console.log('5. Clicking Insights Tab...');
  await page.locator('header button:has-text("Insights")').click();
  await page.waitForTimeout(2500);

  console.log('Capturing: 08_insights_page.png');
  await page.screenshot({ path: path.join(outDir, '08_insights_page.png'), fullPage: false });

  // 9. Mobile Viewport Test (390px iPhone 14 style)
  console.log('6. Testing Mobile Viewport (390px)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('header button:has-text("AI Chat")').click();
  await page.waitForTimeout(2000);

  console.log('Capturing: 09_mobile_chat.png');
  await page.screenshot({ path: path.join(outDir, '09_mobile_chat.png'), fullPage: false });

  await browser.close();
  console.log('--- Real Browser Verification Completed Successfully! ---');
}

runVerification().catch((err) => {
  console.error('Browser Verification Error:', err);
  process.exit(1);
});
