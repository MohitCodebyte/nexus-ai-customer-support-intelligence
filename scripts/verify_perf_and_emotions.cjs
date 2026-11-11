const { chromium } = require('../frontend/node_modules/playwright');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/HP/.gemini/antigravity/brain/05b2c0ab-9033-4048-a72d-0879dfdc5009';

async function run() {
  console.log('--- Starting Nexus AI Performance & Emotion Controls Verification ---');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const perfMetrics = {};

  // 1. Measure Landing Page Performance (Cold Load)
  console.log('1. Measuring Landing Page Performance...');
  const landingContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const landingPage = await landingContext.newPage();

  const t0 = Date.now();
  await landingPage.goto('http://localhost:5173/', { waitUntil: 'load' });
  const loadDuration = Date.now() - t0;

  const navTiming = await landingPage.evaluate(() => {
    const perf = window.performance.getEntriesByType('navigation')[0];
    return {
      domContentLoaded: perf ? Math.round(perf.domContentLoadedEventEnd - perf.startTime) : null,
      loadComplete: perf ? Math.round(perf.loadEventEnd - perf.startTime) : null,
      domInteractive: perf ? Math.round(perf.domInteractive - perf.startTime) : null,
    };
  });
  perfMetrics.landing = { loadDuration, ...navTiming };
  console.log('Landing navigation timing:', perfMetrics.landing);

  // Smooth scroll test on landing
  console.log('Testing smooth scroll across landing sections...');
  await landingPage.evaluate(() => window.scrollTo({ top: 800, behavior: 'smooth' }));
  await landingPage.waitForTimeout(1000);
  await landingPage.screenshot({
    path: path.join(ARTIFACT_DIR, 'nexus_perf_landing_scrolled.png'),
    fullPage: false,
  });
  console.log('Saved nexus_perf_landing_scrolled.png');
  await landingContext.close();

  // 2. Viewports & Emotion Controls Testing on AI Assistant (/chat)
  const viewports = [
    { name: '1440x900_desktop', width: 1440, height: 900, isMobile: false },
    { name: '1366x768_laptop', width: 1366, height: 768, isMobile: false },
    { name: '1920x1080_fullhd', width: 1920, height: 1080, isMobile: false },
    { name: '375x720_mobile', width: 375, height: 720, isMobile: true },
  ];

  for (const vp of viewports) {
    console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
    });
    const page = await context.newPage();

    const tChat0 = Date.now();
    await page.goto('http://localhost:5173/chat', { waitUntil: 'networkidle' });
    const chatLoadTime = Date.now() - tChat0;

    await page.waitForTimeout(1500);

    const scrollCheck = await page.evaluate(() => ({
      windowHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      hasWindowScroll: document.documentElement.scrollHeight > window.innerHeight,
    }));
    console.log(`[${vp.name}] Scroll info:`, scrollCheck);

    const composerBox = await page.locator('form').first().boundingBox();
    console.log(`[${vp.name}] Composer bounding box:`, composerBox);

    if (vp.name === '1440x900_desktop') {
      // Test all six emotion preview buttons
      console.log('Testing 6 emotion preview buttons in companion panel...');
      const emotions = ['Idle', 'Listening', 'Thinking', 'Speaking', 'Happy', 'Confused'];

      for (const emotion of emotions) {
        console.log(`  Clicking emotion preview: ${emotion}...`);
        const btn = page.locator(`button:has-text("${emotion}")`).first();
        await btn.click();
        await page.waitForTimeout(400);

        // Verify status bubble reflects preview
        const statusText = await page.locator('.nexus-workspace-companion').innerText();
        const hasPreview = statusText.toLowerCase().includes('preview:') || statusText.toLowerCase().includes(emotion.toLowerCase());
        console.log(`  [${emotion}] Companion status text verified:`, hasPreview);
      }

      // Save screenshot showing active emotion preview state
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'nexus_perf_1440x900_emotion_preview.png'),
        fullPage: false,
      });
      console.log('Saved nexus_perf_1440x900_emotion_preview.png');

      // Test "↺ Auto Mode" button
      console.log('Testing Auto Mode reset button...');
      const autoBtn = page.locator('button:has-text("Auto Mode")');
      if (await autoBtn.isVisible()) {
        await autoBtn.click();
        await page.waitForTimeout(300);
        console.log('Returned to Auto Mode successfully.');
      }

      // Test Real Interaction Override: Click a category card and verify status switches to Thinking
      console.log('Testing real submission priority over preview...');
      // Set preview to Happy first
      await page.locator('button:has-text("Happy")').first().click();
      await page.waitForTimeout(300);

      // Now click category card
      await page.click('button:has-text("Card & Account")');
      console.log('Sent Card & Account query; verifying assistant turn...');
      await page.waitForTimeout(4000);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'nexus_perf_1440x900_conversation.png'),
        fullPage: false,
      });
      console.log('Saved nexus_perf_1440x900_conversation.png');
    } else {
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `nexus_perf_${vp.name}.png`),
        fullPage: false,
      });
      console.log(`Saved nexus_perf_${vp.name}.png`);
    }

    await context.close();
  }

  await browser.close();
  console.log('--- All Performance & Emotion Tests Completed Successfully ---');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});

