import puppeteer from 'playwright';

async function testStaticVsDynamic() {
  console.log('🔬 Testing Static vs Dynamic Routes');
  console.log('====================================');
  
  const browser = await puppeteer.chromium.launch({ headless: true });
  const testUrls = [
    { url: 'https://fabsy.ca/test-static-content', type: 'Static Route' },
    { url: 'https://fabsy.ca/content/test-seed', type: 'Dynamic Route' },
  ];
  
  for (const { url, type } of testUrls) {
    console.log(`\n🧪 Testing ${type}: ${url}`);
    const page = await browser.newPage();
    
    let errorCount = 0;
    let errors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errorCount++;
        errors.push(msg.text());
      }
    });
    
    page.on('pageerror', error => {
      errorCount++;
      errors.push(error.message);
    });
    
    try {
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 20000
      });
      
      console.log(`📊 HTTP Status: ${response.status()}`);
      
      // Wait for React to render
      await page.waitForTimeout(3000);
      
      // Check for content
      const hasMain = await page.locator('main').count() > 0;
      const hasHeader = await page.locator('header').count() > 0;
      const hasFooter = await page.locator('footer').count() > 0;
      
      const bodyText = await page.textContent('body');
      const hasActualContent = bodyText.length > 100;
      
      console.log(`🏗️  Structure:`);
      console.log(`   Header: ${hasHeader ? '✅' : '❌'}`);
      console.log(`   Main: ${hasMain ? '✅' : '❌'}`);
      console.log(`   Footer: ${hasFooter ? '✅' : '❌'}`);
      console.log(`📝 Has Content: ${hasActualContent ? '✅' : '❌'}`);
      console.log(`❌ JS Errors: ${errorCount}`);
      
      if (errorCount > 0) {
        console.log(`🔍 First Error: ${errors[0]}`);
      }
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    
    await page.close();
  }
  
  await browser.close();
  console.log('\n✅ Test complete!');
}

testStaticVsDynamic().catch(console.error);