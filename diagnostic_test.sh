#!/bin/bash

echo "🔍 Fabsy Site Diagnostic Test"
echo "============================="
echo "Timestamp: $(date)"
echo

# Test URLs
BASE_URL="https://fabsy.ca"
CONTENT_URL="$BASE_URL/content/fight-speeding-ticket-calgary"
TEST_CONTENT_URL="$BASE_URL/content/test-seed"
API_URL="$BASE_URL/page_content"

echo "🌐 Testing HTTP responses..."
echo "Homepage: $(curl -s -o /dev/null -w '%{http_code}' $BASE_URL)"
echo "Content page: $(curl -s -o /dev/null -w '%{http_code}' $CONTENT_URL)"
echo "Test content: $(curl -s -o /dev/null -w '%{http_code}' $TEST_CONTENT_URL)"
echo

echo "📄 Checking JavaScript assets..."
JS_FILE=$(curl -s $BASE_URL | grep -o 'assets/index-[^"]*\.js' | head -1)
if [ -n "$JS_FILE" ]; then
    echo "JS Asset: $JS_FILE"
    echo "JS Status: $(curl -s -o /dev/null -w '%{http_code}' $BASE_URL/$JS_FILE)"
else
    echo "❌ No JavaScript asset found in HTML"
fi
echo

echo "🔍 Testing FAQ Schema presence..."
FAQ_SCHEMA=$(curl -s $CONTENT_URL | grep -o '"@type":"FAQPage"' | wc -l | tr -d ' ')
echo "FAQ Schema blocks found: $FAQ_SCHEMA"

echo
echo "📊 Testing API endpoint..."
API_RESPONSE=$(curl -s -o /dev/null -w '%{http_code}' $API_URL)
echo "API Status: $API_RESPONSE"

echo
echo "🧪 Testing content page data fetching..."
echo "Testing slug: fight-speeding-ticket-calgary"
echo "Page title check:"
PAGE_TITLE=$(curl -s $CONTENT_URL | grep -o '<title>[^<]*</title>' | head -1)
echo "Title: $PAGE_TITLE"

echo
echo "✅ Diagnostic complete!"