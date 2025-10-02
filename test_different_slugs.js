import puppeteer from 'playwright';

async function testDifferentSlugs() {
  console.log('🧪 Testing different content page slugs...');
  
  const browser = await puppeteer.chromium.launch({ headless: true });
  const testUrls = [
    'https://fabsy.ca/content/test-seed',
    'https://fabsy.ca/content/fight-speeding-ticket-calgary', 
    'https://fabsy.ca/content/nonexistent-slug'
  ];
  
  for (const url of testUrls) {
    console.log(`\n🌐 Testing: ${url}`);
    const page = await browser.newPage();
    
    let errorCount = 0;
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errorCount++;
      }
    });
    
    page.on('pageerror', error => {
      errorCount++;
    });
    
    try {
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 15000
      });
      
      console.log(`📊 Status: ${response.status()}`);
      console.log(`❌ JS Errors: ${errorCount}`);
      
      await page.waitForTimeout(2000);
      
      const hasContent = await page.locator('main').count() > 0;
      console.log(`📝 Has main content: ${hasContent ? '✅' : '❌'}`);
      
    } catch (error) {
      console.log(`❌ Failed to load: ${error.message}`);
    }
    
    await page.close();
  }
  
  await browser.close();
}

testDifferentSlugs().catch(console.error);