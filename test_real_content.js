import puppeteer from 'playwright';

async function testRealContent() {
  console.log('🔬 Testing Real Content Pages');
  console.log('==============================');
  
  const browser = await puppeteer.chromium.launch({ headless: true });
  const testUrls = [
    { url: 'https://fabsy.ca/content/fight-speeding-ticket-calgary', type: 'Real Content (Calgary)' },
    { url: 'https://fabsy.ca/content/fight-careless-ticket-edmonton', type: 'Real Content (Edmonton)' },
    { url: 'https://fabsy.ca/test-static-content', type: 'Static Test Route' }
  ];
  
  for (const { url, type } of testUrls) {
    console.log(`\n🧪 Testing ${type}`);
    console.log(`   URL: ${url}`);
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
      
      console.log(`   📊 HTTP Status: ${response.status()}`);
      
      // Wait for React to render
      await page.waitForTimeout(4000);
      
      // Check page structure
      const hasMain = await page.locator('main').count() > 0;
      const hasHeader = await page.locator('header').count() > 0;
      const hasFooter = await page.locator('footer').count() > 0;
      const hasH1 = await page.locator('h1').count() > 0;
      
      console.log(`   🏗️  Structure: Header(${hasHeader ? '✅' : '❌'}) Main(${hasMain ? '✅' : '❌'}) Footer(${hasFooter ? '✅' : '❌'}) H1(${hasH1 ? '✅' : '❌'})`);
      console.log(`   ❌ JS Errors: ${errorCount}`);
      
      // Check for content
      const bodyText = await page.textContent('body');
      const hasRealContent = bodyText.length > 200;
      const hasLoadingText = bodyText.includes('Loading...');
      
      console.log(`   📝 Has Content: ${hasRealContent ? '✅' : '❌'} (${bodyText.length} chars)`);
      console.log(`   ⏳ Shows Loading: ${hasLoadingText ? '⚠️' : '✅'}`);
      
      if (errorCount > 0) {
        console.log(`   🔍 First Error: ${errors[0].substring(0, 100)}...`);
      }
      
      // Check if title updated
      const title = await page.title();
      const titleUpdated = !title.includes('Fabsy - Fight Traffic Tickets for Alberta Women | 100% Success Rate');
      console.log(`   📄 Dynamic Title: ${titleUpdated ? '✅' : '❌'} ("${title.substring(0, 50)}...")`);
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    }
    
    await page.close();
  }
  
  await browser.close();
  console.log('\n✅ Test complete!');
}

testRealContent().catch(console.error);