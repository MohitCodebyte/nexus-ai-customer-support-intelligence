const { chromium } = require('../frontend/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/HP/.gemini/antigravity/brain/05b2c0ab-9033-4048-a72d-0879dfdc5009';

async function run() {
  console.log('Launching browser with msedge channel...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const viewports = [
    { name: '1366x768_laptop', width: 1366, height: 768, isMobile: false },
    { name: '1440x900_desktop', width: 1440, height: 900, isMobile: false },
    { name: '1920x1080_fullhd', width: 1920, height: 1080, isMobile: false },
    { name: '375x812_mobile', width: 375, height: 812, isMobile: true },
  ];

  for (const vp of viewports) {
    console.log(`Testing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
    });
    const page = await context.newPage();

    await page.goto('http://localhost:5173/chat', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Verify composer is visible in initial viewport
    const composerBox = await page.locator('form').first().boundingBox();
    console.log(`[${vp.name}] Composer bounding box:`, composerBox);

    // Check page scroll height vs viewport height
    const scrollInfo = await page.evaluate(() => ({
      windowHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      hasWindowScroll: document.documentElement.scrollHeight > window.innerHeight,
    }));
    console.log(`[${vp.name}] Scroll info:`, scrollInfo);

    // Screenshot of initial AI Assistant view
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `nexus_compact_${vp.name}_initial.png`),
      fullPage: false,
    });
    console.log(`Saved nexus_compact_${vp.name}_initial.png`);

    // Click Category Card if on desktop
    if (!vp.isMobile) {
      console.log(`[${vp.name}] Clicking Card & Account category card...`);
      await page.click('button:has-text("Card & Account")');
      await page.waitForTimeout(3500);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `nexus_compact_${vp.name}_conversation.png`),
        fullPage: false,
      });
      console.log(`Saved nexus_compact_${vp.name}_conversation.png`);
    }

    await context.close();
  }

  // Voice Interaction & Error UI Inspection
  console.log('Testing Microphone Button & Compact Error Handling...');
  const voiceContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const voicePage = await voiceContext.newPage();
  await voicePage.goto('http://localhost:5173/chat', { waitUntil: 'networkidle' });
  await voicePage.waitForTimeout(1500);

  // Click Mic button
  console.log('Clicking Mic button...');
  await voicePage.click('button[aria-label="Start voice input"]');
  await voicePage.waitForTimeout(1000);

  await voicePage.screenshot({
    path: path.join(ARTIFACT_DIR, 'nexus_compact_voice_active_or_error.png'),
    fullPage: false,
  });
  console.log('Saved nexus_compact_voice_active_or_error.png');

  // Verify composer is still fully visible
  const composerAfterMic = await voicePage.locator('form').first().boundingBox();
  console.log('Composer bounding box after mic click:', composerAfterMic);

  await voiceContext.close();
  await browser.close();
  console.log('All compact AI Assistant verification tests completed!');
}

run().catch((err) => {
  console.error('Verification run failed:', err);
  process.exit(1);
});
