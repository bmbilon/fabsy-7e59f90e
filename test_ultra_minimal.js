import puppeteer from 'playwright';

async function testUltraMinimal() {
  console.log('🔬 Testing Ultra-Minimal Component');
  console.log('===================================');
  
  const browser = await puppeteer.chromium.launch({ headless: true });
  const testUrls = [
    { url: 'https://fabsy.ca/test-static-content', type: 'Static Route' },
    { url: 'https://fabsy.ca/content/test-seed', type: 'Dynamic Route' },
  ];
  
  for (const { url, type } of testUrls) {
    console.log(`\n🧪 Testing ${type}: ${url}`);
    const page = await browser.newPage();
    
    let errorCount = 0;
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errorCount++;
        console.log('❌ Console error:', msg.text());
      }
    });
    
    page.on('pageerror', error => {
      errorCount++;
      console.log('❌ Page error:', error.message);
    });
    
    try {
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 20000
      });
      
      console.log(`📊 HTTP Status: ${response.status()}`);
      
      // Wait for React to render
      await page.waitForTimeout(3000);
      
      // Check for our specific content
      const bodyText = await page.textContent('body');
      const hasUltraMinimal = bodyText.includes('Ultra Minimal Test');
      const hasErrorText = bodyText.includes('This should work without any errors');
      
      console.log(`✅ Contains "Ultra Minimal Test": ${hasUltraMinimal ? '✅' : '❌'}`);
      console.log(`✅ Contains success message: ${hasErrorText ? '✅' : '❌'}`);
      console.log(`📝 Body text length: ${bodyText.length} characters`);
      console.log(`❌ JS Errors: ${errorCount}`);
      
      if (hasUltraMinimal && hasErrorText) {
        console.log(`🎉 ${type} WORKS PERFECTLY!`);
      }
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
    
    await page.close();
  }
  
  await browser.close();
  console.log('\n✅ Test complete!');
}

testUltraMinimal().catch(console.error);