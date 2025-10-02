import puppeteer from 'playwright';

async function testContentPage() {
  console.log('🧪 Testing content page functionality...');
  
  const browser = await puppeteer.chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Console error:', msg.text());
    }
  });
  
  // Listen for page errors
  page.on('pageerror', error => {
    console.log('❌ Page error:', error.message);
  });
  
  try {
    console.log('🌐 Loading content page...');
    const response = await page.goto('https://fabsy.ca/content/fight-speeding-ticket-calgary', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log('📊 Response status:', response.status());
    
    // Wait a bit for React to render
    await page.waitForTimeout(3000);
    
    // Check page content
    const title = await page.title();
    console.log('📄 Page title:', title);
    
    const bodyText = await page.textContent('body');
    const isBlankPage = bodyText.trim().length < 100;
    console.log('📝 Page has content:', !isBlankPage);
    
    if (isBlankPage) {
      console.log('⚠️  Page appears to be blank or minimal');
    }
    
    // Check for specific content elements
    const hasHeader = await page.locator('header').count() > 0;
    const hasFooter = await page.locator('footer').count() > 0;
    const hasMainContent = await page.locator('main').count() > 0;
    
    console.log('🏗️  Page structure:');
    console.log('   Header:', hasHeader ? '✅' : '❌');
    console.log('   Main:', hasMainContent ? '✅' : '❌');
    console.log('   Footer:', hasFooter ? '✅' : '❌');
    
    // Check if it's showing the test version or full version
    const hasTestContent = bodyText.includes('This is a simplified test version');
    const hasRealContent = bodyText.includes('Fight Your') || bodyText.includes('Calgary');
    
    console.log('🧪 Content type:');
    console.log('   Test version:', hasTestContent ? '✅' : '❌');
    console.log('   Full content:', hasRealContent ? '✅' : '❌');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testContentPage().catch(console.error);