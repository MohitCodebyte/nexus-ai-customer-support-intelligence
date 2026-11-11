const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runFullVerification() {
  console.log('=== STARTING END-TO-END VERIFICATION SUITE ===');
  
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const outDir = path.resolve(__dirname, '..', 'verification_screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  try {
    // -------------------------------------------------------------
    // 1. Dashboard View
    // -------------------------------------------------------------
    console.log('[1/8] Loading Dashboard at 1440x900...');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500); // Wait for Three.js canvas & WebGL shaders to compile

    console.log('  -> Capturing: 01_dashboard.png');
    await page.screenshot({ path: path.join(outDir, '01_dashboard.png'), fullPage: false });

    // -------------------------------------------------------------
    // 2. 3D Mascot Close-up
    // -------------------------------------------------------------
    console.log('[2/8] Capturing 3D Mascot Close-up...');
    const mascotWrapper = page.locator('.mascot-canvas-wrapper').first();
    if (await mascotWrapper.isVisible()) {
      await mascotWrapper.screenshot({ path: path.join(outDir, '02_mascot_closeup.png') });
    }

    // -------------------------------------------------------------
    // 3. Test Mascot Emotion State Pills
    // -------------------------------------------------------------
    console.log('[3/8] Testing Mascot Emotion Animations (happy & speaking)...');
    const happyPill = page.locator('button:has-text("happy")').first();
    if (await happyPill.isVisible()) {
      await happyPill.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(outDir, '03_mascot_happy_state.png') });
    }

    // -------------------------------------------------------------
    // 4. Navigate to AI Chat Tab (Empty State)
    // -------------------------------------------------------------
    console.log('[4/8] Navigating to AI Chat Workspace...');
    await page.locator('header button:has-text("AI Chat")').click();
    await page.waitForTimeout(2000);

    console.log('  -> Capturing: 04_chat_empty_state.png');
    await page.screenshot({ path: path.join(outDir, '04_chat_empty_state.png'), fullPage: false });

    // -------------------------------------------------------------
    // 5. Send Banking Query: "I lost my debit card. How can I block it?"
    // -------------------------------------------------------------
    console.log('[5/8] Sending Customer Banking Inquiry: "I lost my debit card. How can I block it?"');
    const textarea = page.locator('textarea[aria-label="Customer inquiry message input"]');
    await textarea.fill('I lost my debit card. How can I block it?');
    await page.keyboard.press('Enter');

    console.log('  -> Waiting for live Banking77 classification and RAG retrieval response...');
    // Wait for the assistant bubble
    await page.waitForSelector('.glass-panel:has-text("Intent: ")', { timeout: 20000 });
    await page.waitForTimeout(3000);

    console.log('  -> Capturing: 05_chat_active_conversation.png');
    await page.screenshot({ path: path.join(outDir, '05_chat_active_conversation.png'), fullPage: false });

    // -------------------------------------------------------------
    // 6. Expand FAQ Sources Drawer
    // -------------------------------------------------------------
    console.log('[6/8] Expanding Verified FAQ Sources Drawer...');
    const sourcesBtn = page.locator('button:has-text("FAQ Sources")').first();
    if (await sourcesBtn.isVisible()) {
      await sourcesBtn.click();
      await page.waitForTimeout(1200);
      console.log('  -> Capturing: 06_chat_sources_drawer.png');
      await page.screenshot({ path: path.join(outDir, '06_chat_sources_drawer.png'), fullPage: false });
    }

    // -------------------------------------------------------------
    // 7. Test "New Chat" Functionality
    // -------------------------------------------------------------
    console.log('[7/8] Testing New Chat Reset...');
    // Grab session ID before clicking New Chat
    const sessionTextBefore = await page.locator('code:has-text("...")').first().innerText();
    console.log(`  -> Initial Session ID prefix: ${sessionTextBefore}`);

    // Click New Chat button in header
    const newChatBtn = page.locator('header button:has-text("New Chat")').first();
    await newChatBtn.click();
    await page.waitForTimeout(1500);

    const sessionTextAfter = await page.locator('code:has-text("...")').first().innerText();
    console.log(`  -> New Session ID prefix: ${sessionTextAfter}`);
    if (sessionTextBefore !== sessionTextAfter) {
      console.log('  -> SUCCESS: New Chat generated a fresh session UUID!');
    } else {
      console.warn('  -> WARNING: Session ID did not change.');
    }

    // Verify chat workspace is cleared
    const messageCount = await page.locator('.glass-panel:has-text("Intent: ")').count();
    console.log(`  -> Active message bubbles after reset: ${messageCount} (Expected 0)`);

    // Send a message in the new session
    console.log('  -> Sending message in new session: "How can I check my account balance?"');
    await textarea.fill('How can I check my account balance?');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.glass-panel:has-text("Intent: ")', { timeout: 20000 });
    await page.waitForTimeout(3000);

    console.log('  -> Capturing: 07_new_session_conversation.png');
    await page.screenshot({ path: path.join(outDir, '07_new_session_conversation.png'), fullPage: false });

    // -------------------------------------------------------------
    // 8. History View & Insights View
    // -------------------------------------------------------------
    console.log('[8/8] Testing History & Insights Views...');
    await page.locator('header button:has-text("History")').click();
    await page.waitForTimeout(2500);
    console.log('  -> Capturing: 08_history_page.png');
    await page.screenshot({ path: path.join(outDir, '08_history_page.png'), fullPage: false });

    await page.locator('header button:has-text("Insights")').click();
    await page.waitForTimeout(2500);
    console.log('  -> Capturing: 09_insights_page.png');
    await page.screenshot({ path: path.join(outDir, '09_insights_page.png'), fullPage: false });

    // -------------------------------------------------------------
    // 9. Mobile Responsive View (390x844)
    // -------------------------------------------------------------
    console.log('Testing Mobile Viewport (390x844)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('header button:has-text("AI Chat")').click();
    await page.waitForTimeout(2000);
    console.log('  -> Capturing: 10_mobile_chat_viewport.png');
    await page.screenshot({ path: path.join(outDir, '10_mobile_chat_viewport.png'), fullPage: false });

    console.log('=== VERIFICATION COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Error during Playwright verification:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

runFullVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});

