#!/usr/bin/env node

const https = require('https');

const testUrls = [
    'https://fabsy.ca/content/speeding-ticket-edmonton',
    'https://fabsy.ca/content/fight-careless-ticket-calgary',
    'https://fabsy.ca/content/fight-red-light-ticket-edmonton',
    'https://fabsy.ca/', // homepage
];

async function checkCanonical(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const canonicalMatch = data.match(/<link rel="canonical" href="([^"]+)"/i);
                if (canonicalMatch) {
                    resolve({
                        url,
                        canonical: canonicalMatch[1],
                        correct: canonicalMatch[1] === url,
                        expected: url
                    });
                } else {
                    resolve({
                        url,
                        canonical: 'NOT_FOUND',
                        correct: false,
                        expected: url
                    });
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

async function verifyCanonicals() {
    console.log('🔍 Verifying canonical tags...\n');
    
    const results = [];
    
    for (const url of testUrls) {
        try {
            const result = await checkCanonical(url);
            results.push(result);
            
            const status = result.correct ? '✅' : '❌';
            console.log(`${status} ${result.url}`);
            console.log(`   Canonical: ${result.canonical}`);
            console.log(`   Expected:  ${result.expected}`);
            console.log('');
        } catch (error) {
            console.log(`❌ ${url} - Error: ${error.message}`);
            results.push({
                url,
                canonical: 'ERROR',
                correct: false,
                expected: url
            });
        }
    }
    
    const passedTests = results.filter(r => r.correct).length;
    const totalTests = results.length;
    
    console.log(`📊 Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All canonical tags are now self-referential!');
        console.log('✅ The canonical tag fix has been successfully deployed.');
        process.exit(0);
    } else {
        console.log('❌ Some canonical tags still need fixing');
        console.log('⏳ This may indicate that deployment is still in progress.');
        process.exit(1);
    }
}

verifyCanonicals().catch(console.error);