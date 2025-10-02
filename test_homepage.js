import puppeteer from 'playwright';

async function testHomepage() {
  console.log('🏠 Testing homepage functionality...');
  
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
    console.log('🌐 Loading homepage...');
    const response = await page.goto('https://fabsy.ca/', {
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
    
    // Check for specific content elements
    const hasHeader = await page.locator('header').count() > 0;
    const hasFooter = await page.locator('footer').count() > 0;
    const hasMainContent = await page.locator('main').count() > 0;
    
    console.log('🏗️  Page structure:');
    console.log('   Header:', hasHeader ? '✅' : '❌');
    console.log('   Main:', hasMainContent ? '✅' : '❌');
    console.log('   Footer:', hasFooter ? '✅' : '❌');
    
    // Check for hero section
    const hasHeroText = bodyText.includes('Fight Your Traffic Ticket') || bodyText.includes('100% Success Rate');
    console.log('🎯 Has hero content:', hasHeroText ? '✅' : '❌');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testHomepage().catch(console.error);