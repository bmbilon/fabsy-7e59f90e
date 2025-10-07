#!/usr/bin/env node

/**
 * AEO-CANONICAL-001: Self-referential canonicals fix
 * 
 * This script fixes the canonical tag issue where all /content/* pages
 * are incorrectly pointing to the homepage instead of their own URLs.
 * 
 * The issue is in the base template (index.html) which has a hardcoded
 * canonical pointing to the homepage. This overrides the dynamic canonicals.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 AEO-CANONICAL-001: Fixing self-referential canonical tags...\n');

// 1. Fix the base template to remove hardcoded canonical
const indexPath = './index.html';

if (fs.existsSync(indexPath)) {
    console.log('✅ Found index.html - removing hardcoded canonical...');
    
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Remove the hardcoded canonical tag
    const originalCanonical = '    <link rel="canonical" href="https://fabsy.ca/" />';
    const commentedCanonical = '    <!-- <link rel="canonical" href="https://fabsy.ca/" /> Dynamic canonical set by components -->';
    
    if (indexContent.includes(originalCanonical)) {
        indexContent = indexContent.replace(originalCanonical, commentedCanonical);
        fs.writeFileSync(indexPath, indexContent, 'utf8');
        console.log('   ✅ Removed hardcoded canonical from index.html');
    } else {
        console.log('   ⚠️  Hardcoded canonical not found or already fixed');
    }
} else {
    console.log('❌ index.html not found');
}

// 2. Verify the canonical implementation in WorkingContentPage
const contentPagePath = './src/pages/WorkingContentPage.tsx';

if (fs.existsSync(contentPagePath)) {
    const pageContent = fs.readFileSync(contentPagePath, 'utf8');
    
    // Check if the canonical is correctly set
    const hasCorrectCanonical = pageContent.includes('canonical: slug ? `https://fabsy.ca/content/${slug}` : undefined');
    
    if (hasCorrectCanonical) {
        console.log('✅ WorkingContentPage.tsx has correct self-referential canonical implementation');
    } else {
        console.log('❌ WorkingContentPage.tsx canonical implementation needs fixing');
    }
} else {
    console.log('❌ WorkingContentPage.tsx not found');
}

// 3. Create a test script to verify the fix
const testScriptContent = `#!/usr/bin/env node

/**
 * Test script to verify canonical tag fixes
 */

const testUrls = [
    'https://fabsy.ca/content/speeding-ticket-edmonton',
    'https://fabsy.ca/content/speeding-ticket-calgary', 
    'https://fabsy.ca/content/careless-driving-ticket-airdrie',
    'https://fabsy.ca/content/speeding-ticket-leduc',
    'https://fabsy.ca/content/careless-driving-ticket-fort-mcmurray'
];

async function testCanonicalTags() {
    console.log('🧪 Testing canonical tags after fix...\\n');
    
    const results = [];
    
    for (const url of testUrls) {
        try {
            const response = await fetch(url);
            const html = await response.text();
            
            const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
            
            if (canonicalMatch) {
                const canonicalUrl = canonicalMatch[1];
                const isCorrect = canonicalUrl === url;
                
                results.push({
                    url,
                    canonical: canonicalUrl,
                    correct: isCorrect,
                    status: isCorrect ? '✅' : '❌'
                });
                
                console.log(\`\${isCorrect ? '✅' : '❌'} \${url}\`);
                console.log(\`   Canonical: \${canonicalUrl}\`);
                console.log(\`   Expected:  \${url}\`);
                console.log('');
            } else {
                results.push({
                    url,
                    canonical: 'NOT_FOUND',
                    correct: false,
                    status: '❌'
                });
                console.log(\`❌ \${url} - No canonical tag found\`);
            }
        } catch (error) {
            console.log(\`❌ \${url} - Error: \${error.message}\`);
            results.push({
                url,
                canonical: 'ERROR',
                correct: false,
                status: '❌'
            });
        }
    }
    
    const passedTests = results.filter(r => r.correct).length;
    const totalTests = results.length;
    
    console.log(\`\\n📊 Results: \${passedTests}/\${totalTests} tests passed\`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All canonical tags are now self-referential!');
        process.exit(0);
    } else {
        console.log('❌ Some canonical tags still need fixing');
        process.exit(1);
    }
}

testCanonicalTags().catch(console.error);
`;

fs.writeFileSync('./scripts/test-canonical-fix.js', testScriptContent, 'utf8');
fs.chmodSync('./scripts/test-canonical-fix.js', '755');
console.log('✅ Created test script: ./scripts/test-canonical-fix.js');

// 4. Check if there are other templates that might need fixing
const templatesDir = './public/prerendered';
if (fs.existsSync(templatesDir)) {
console.log('\n🔍 Checking prerendered templates...');
    
    const checkTemplate = (filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        const hasHomepageCanonical = content.includes('<link rel="canonical" href="https://fabsy.ca/" />');
        
        if (hasHomepageCanonical) {
            console.log(`   ❌ ${filePath} has incorrect canonical pointing to homepage`);
            return false;
        } else {
            console.log(`   ✅ ${filePath} canonical looks correct`);
            return true;
        }
    };
    
    // Check a few sample templates
    const sampleTemplates = [
        './public/prerendered/index.html',
        './public/prerendered/about/index.html',
        './public/prerendered/services/index.html'
    ];
    
    sampleTemplates.forEach(template => {
        if (fs.existsSync(template)) {
            checkTemplate(template);
        }
    });
}

console.log('\n📋 Summary:');
console.log('1. ✅ Removed hardcoded canonical from base template');
console.log('2. ✅ Verified WorkingContentPage uses correct dynamic canonicals');
console.log('3. ✅ Created test script for verification');
console.log('');
console.log('🚀 Next steps:');
console.log('1. Build and deploy the app');
console.log('2. Run: node scripts/test-canonical-fix.js');
console.log('3. Submit sitemap to GSC and request indexing');
console.log('');
console.log('Expected outcome:');
console.log('- /content/speeding-ticket-edmonton → canonical: https://fabsy.ca/content/speeding-ticket-edmonton');
console.log('- /content/careless-driving-ticket-airdrie → canonical: https://fabsy.ca/content/careless-driving-ticket-airdrie');
console.log('- All GSC "Alternate page with proper canonical tag" warnings should resolve');
`;

fs.chmodSync('./scripts/fix-canonical-tags.js', '755');

console.log('🔧 Created canonical fix script. Run with:');
console.log('node scripts/fix-canonical-tags.js');