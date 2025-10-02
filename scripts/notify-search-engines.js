#!/usr/bin/env node
import https from 'https';

const SITEMAP_URL = 'https://fabsy.ca/sitemap.xml';

function notifyGoogle() {
  return new Promise((resolve, reject) => {
    const url = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;
    https.get(url, (res) => {
      console.log(`✅ Google notified (status: ${res.statusCode})`);
      resolve();
    }).on('error', reject);
  });
}

function notifyBing() {
  return new Promise((resolve, reject) => {
    const url = `https://www.bing.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;
    https.get(url, (res) => {
      console.log(`✅ Bing notified (status: ${res.statusCode})`);
      resolve();
    }).on('error', reject);
  });
}

async function notifyAll() {
  console.log('🚀 Notifying search engines...\n');
  
  try {
    await notifyGoogle();
    await notifyBing();
    console.log('\n✨ All search engines notified!');
    console.log('⏰ Indexing typically begins within 24-48 hours\n');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

notifyAll();