const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testMascotVisuals() {
  console.log('=== STARTING 3D MASCOT VISUAL INSPECTION ===');

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
    // 1. Dashboard Mascot Hero View
    console.log('[1/7] Loading Dashboard to inspect 3D Mascot at 1440x900...');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500); // Wait for Three.js shaders & textures to compile

    console.log('  -> Capturing: mascot_01_dashboard_hero.png');
    await page.screenshot({ path: path.join(outDir, 'mascot_01_dashboard_hero.png'), fullPage: false });

    // 2. High-Res Mascot Canvas Close-up
    console.log('[2/7] Capturing High-Res 3D Mascot Close-up...');
    const mascotCard = page.locator('.mascot-controller-card').first();
    if (await mascotCard.isVisible()) {
      await page.waitForTimeout(1000);
      await mascotCard.screenshot({ path: path.join(outDir, 'mascot_02_closeup_idle.png') });
      console.log('  -> Capturing: mascot_02_closeup_idle.png');
    }

    // 3. Test All 6 Animation States
    console.log('[3/7] Testing Animation States...');
    const states = ['listening', 'thinking', 'speaking', 'happy', 'confused', 'idle'];
    for (const st of states) {
      console.log(`  -> Testing state: ${st}`);
      const pill = page.locator(`button:has-text("${st}")`).first();
      if (await pill.isVisible()) {
        await pill.click();
        await page.waitForTimeout(1200);
        await mascotCard.screenshot({ path: path.join(outDir, `mascot_03_state_${st}.png`) });
      }
    }

    // 4. Test 2D / 3D Toggle
    console.log('[4/7] Testing 2D/3D View Toggle...');
    const toggleBtn = page.locator('button:has-text("2D View")').first();
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      await page.waitForTimeout(800);
      console.log('  -> Capturing: mascot_04_2d_fallback.png');
      await mascotCard.screenshot({ path: path.join(outDir, 'mascot_04_2d_fallback.png') });

      // Toggle back to 3D View
      const toggle3DBtn = page.locator('button:has-text("3D View")').first();
      if (await toggle3DBtn.isVisible()) {
        await toggle3DBtn.click();
        await page.waitForTimeout(1000);
        console.log('  -> Successfully toggled back to 3D View');
      }
    }

    // 5. Navigate to AI Chat Workspace to Inspect Mascot in Chat Dock
    console.log('[5/7] Navigating to AI Chat Workspace...');
    await page.locator('header button:has-text("AI Chat")').click();
    await page.waitForTimeout(2000);

    console.log('  -> Capturing: mascot_05_chat_workspace_dock.png');
    await page.screenshot({ path: path.join(outDir, 'mascot_05_chat_workspace_dock.png'), fullPage: false });

    // 6. Send a Message to See Live Mascot Response Transition
    console.log('[6/7] Sending customer inquiry to observe live response transition...');
    const textarea = page.locator('textarea[aria-label="Customer inquiry message input"]');
    await textarea.fill('How can I check my account balance?');
    await page.keyboard.press('Enter');

    // Wait for response to appear and mascot to transition to speaking/happy
    await page.waitForSelector('.glass-panel:has-text("Intent: ")', { timeout: 20000 });
    await page.waitForTimeout(2000);

    console.log('  -> Capturing: mascot_06_chat_live_reaction.png');
    await page.screenshot({ path: path.join(outDir, 'mascot_06_chat_live_reaction.png'), fullPage: false });

    // 7. Mobile Viewport (390x844)
    console.log('[7/7] Testing Mobile Layout (390x844)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    console.log('  -> Capturing: mascot_07_mobile_dashboard.png');
    await page.screenshot({ path: path.join(outDir, 'mascot_07_mobile_dashboard.png'), fullPage: false });

    console.log('=== MASCOT VISUAL INSPECTION COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Error during mascot visual inspection:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

testMascotVisuals().catch((err) => {
  console.error(err);
  process.exit(1);
});
