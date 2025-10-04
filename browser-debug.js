// Browser Console Debug Script for Fabsy Blog Post
// Copy and paste this into your browser console when on the blog post page

console.log('🔍 Debugging Blog Post...');

// Check if we're on a blog post page
const url = window.location.href;
const match = url.match(/\/blog\/([^\/]+)$/);

if (!match) {
  console.error('❌ Not on a blog post page. Navigate to the blog post first.');
} else {
  const slug = match[1];
  console.log(`📝 Blog slug: ${slug}`);
  
  // Check if supabase client is available
  if (typeof window.supabase === 'undefined') {
    console.log('⚠️  Supabase client not found in window. Trying to access from React...');
    
    // Try to get from React DevTools or check network requests
    console.log('🌐 Check Network tab for API requests to see what data is being returned');
    console.log('1. Open DevTools → Network tab');
    console.log('2. Refresh the page');  
    console.log('3. Look for requests to supabase.co');
    console.log('4. Check the response data');
    
  } else {
    // Test direct API call
    console.log('🚀 Testing direct API call...');
    
    window.supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('❌ Database Error:', error);
          if (error.code === 'PGRST116') {
            console.error('   → No post found with that slug');
          } else if (error.code === 'PGRST301') {
            console.error('   → Row Level Security is blocking access');
          }
        } else if (data) {
          console.log('✅ Post found:', data.title);
          console.log('📊 Status:', data.status);
          console.log('📄 Content length:', data.content?.length || 0);
          console.log('🖼️ Featured image:', data.featured_image ? 'Yes' : 'No');
          
          if (!data.content || data.content.trim().length === 0) {
            console.error('❌ PROBLEM: Post has no content!');
          } else {
            console.log('✅ Post has content');
            console.log('First 100 chars:', data.content.substring(0, 100) + '...');
          }
        }
      })
      .catch(err => {
        console.error('❌ API Error:', err);
      });
  }
}

// Also check React component state if available
setTimeout(() => {
  console.log('🔍 Checking React component state...');
  
  // Look for React Fiber node to check component state
  const reactFiber = document.querySelector('#root')?._reactInternalFiber || 
                     document.querySelector('#root')?._reactInternalInstance;
  
  if (reactFiber) {
    console.log('⚛️ React detected - check React DevTools for component state');
  }
  
  // Check if there are any error messages in the DOM
  const errorElements = document.querySelectorAll('[class*="red"], [class*="error"]');
  if (errorElements.length > 0) {
    console.log('🚨 Found potential error elements:', errorElements);
  }
  
  console.log('✅ Debug complete. Check the output above for issues.');
}, 1000);