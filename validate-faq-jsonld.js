const fs = require('fs');
const glob = require('glob');
const cheerio = require('cheerio');

function normalize(s){ return (s||'').replace(/\s+/g,' ').trim(); }

(async ()=>{
  const files = glob.sync('./dist/**/*.html');
  let errors = 0;
  for(const file of files){
    const html = fs.readFileSync(file,'utf8');
    const $ = cheerio.load(html);
    let jsonLd = null;
    $('script[type="application/ld+json"]').each((i, el)=>{
      try{
        const obj = JSON.parse($(el).html());
        if(obj && (obj['@type'] === 'FAQPage' || (Array.isArray(obj) && obj.some(o=>o['@type']==='FAQPage')))){
          jsonLd = obj['@type'] === 'FAQPage' ? obj : (Array.isArray(obj) ? obj.find(o=>o['@type']==='FAQPage') : null);
        }
      }catch(e){}
    });
    if(!jsonLd) continue;
    const visible = [];
    $('details').each((i, el)=>{
      const q = normalize($(el).find('summary').text());
      const a = normalize($(el).find('p').first().text());
      if(q) visible.push({q,a});
    });
    const main = jsonLd.mainEntity || [];
    if(visible.length !== main.length){
      console.error(`COUNT MISMATCH: ${file} HTML ${visible.length} vs JSON-LD ${main.length}`);
      errors++;
      continue;
    }
    for(let i=0;i<main.length;i++){
      const h      const h      const[i].q);
      const htmlA = normalize(visible[i].a);
      const jsonQ = normalize(main[i].name || '');
      const jsonA = normalize((main[i].acceptedAnswer && main[i].acceptedAnswer.text) || '');
      if(htmlQ !== jsonQ || htmlA !== jsonA){
        console.error(`MISMATCH in ${file} index ${i}\nHTML Q: ${htmlQ}\nJSON Q: ${jsonQ}\nHTML A: ${htmlA}\nJSON A: ${jsonA}`);
        errors++;
      }
    }
  }
  if(errors>0){ console.error(`Validation failed: ${errors} errors`); process.exit(1); }
  console.log('Validation passed: FAQ HTML matches JSON-LD');
  process.exit(0);
})();
