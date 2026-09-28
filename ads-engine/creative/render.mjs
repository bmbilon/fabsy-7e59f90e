import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const directory=fileURLToPath(new URL('./',import.meta.url));
const brand=await readFile(new URL('../../public/favicon.svg',import.meta.url),'utf8');
const offers=JSON.parse(await readFile(new URL('../../src/config/offers.json',import.meta.url),'utf8'));
const concepts=[
 {id:'officer-price',service:'officer',kicker:'ALBERTA OFFICER-ISSUED TICKETS',headline:'Your ticket.\nA clear next step.',price:`$${offers.rapidResolution.priceCad} CAD + GST`,body:'Eligible pre-trial traffic ticket agent services.',dark:true},
 {id:'camera-price',service:'camera',kicker:'ALBERTA PHOTO RADAR + RED-LIGHT NOTICES',headline:'A camera notice\nin your mailbox?',price:`$${offers.photoRadar.priceCad} CAD + GST`,body:`Registered-owner camera notice help. $${offers.photoRadar.totalCad.toFixed(2)} total.`,dark:false},
 {id:'officer-process',service:'officer',kicker:'ALBERTA TRAFFIC TICKET AGENT SERVICES',headline:'Start with\nyour ticket photo.',price:`$${offers.rapidResolution.priceCad} CAD + GST`,body:'Disclosure review. Clear file updates. You approve any Crown deal.',dark:false},
];
const escape=v=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function html(c,height){return `<!doctype html><html lang="en"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:1080px;height:${height}px;overflow:hidden;background:${c.dark?'#0f172a':'#f8fafc'};color:${c.dark?'#fff':'#0f172a'};font-family:Arial,Helvetica,sans-serif}article{position:relative;width:100%;height:100%;padding:100px 76px}.brand{display:flex;gap:20px;align-items:center;font-size:56px;font-weight:800}.brand img{width:66px;height:66px}.main{position:absolute;left:76px;right:76px;top:${height===1080?'240':height===1350?'340':'470'}px}.kicker{font-size:25px;font-weight:700;letter-spacing:2px;color:${c.dark?'#93c5fd':'#1d4ed8'}}h1{font-size:84px;line-height:1.03;letter-spacing:-3px;margin:28px 0 35px;white-space:pre-line}.price{font-size:54px;font-weight:800;letter-spacing:-1px}.body{font-size:32px;line-height:1.35;max-width:900px;margin-top:20px}.bottom{position:absolute;left:76px;right:76px;bottom:${height===1920?'275':'68'}px}.cta{font-size:35px;font-weight:700;background:#1d4ed8;color:#fff;border-radius:18px;padding:24px;text-align:center}.disclaimer{font-size:25px;line-height:1.3;margin-top:22px}.url{font-size:27px;font-weight:700;margin-top:18px}</style><article><div class="brand"><img src="data:image/svg+xml;base64,${Buffer.from(brand).toString('base64')}">Fabsy</div><div class="main"><div class="kicker">${escape(c.kicker)}</div><h1>${escape(c.headline)}</h1><div class="price">${escape(c.price)}</div><p class="body">${escape(c.body)}</p></div><div class="bottom"><div class="cta">Upload a photo of your ticket.</div><div class="disclaimer">Government fines and trial representation are separate.<br>No outcome is promised.</div><div class="url">fabsy.ca</div></div></article></html>`;}
await mkdir(path.join(directory,'exports'),{recursive:true});
const browser=await chromium.launch({headless:true,...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
const manifest=[];
try{for(const concept of concepts){for(const height of [1080,1350,1920]){
 const page=await browser.newPage({viewport:{width:1080,height},deviceScaleFactor:1});await page.route('**/*',r=>r.abort());
 const document=html(concept,height);const base=`${concept.id}-1080x${height}`;
 await writeFile(path.join(directory,'exports',base+'.html'),document);await page.setContent(document);await page.evaluate(()=>document.fonts.ready);
 const checks=await page.evaluate(()=>{const main=document.querySelector('.main').getBoundingClientRect(),bottom=document.querySelector('.bottom').getBoundingClientRect();return {overlap:main.bottom>bottom.top,overflow:document.documentElement.scrollWidth>1080,text:document.body.innerText};});
 if(checks.overlap||checks.overflow)throw new Error(`Layout overflow: ${base}`);
 if(/[\u2014]|\b(?:guaranteed|lawyer|win|insurance goes up)\b/i.test(checks.text))throw new Error(`Unapproved claim: ${base}`);
 const image=await page.screenshot({path:path.join(directory,'exports',base+'.png')});
 manifest.push({id:base,concept:concept.id,service:concept.service,width:1080,height,text:checks.text,imageSha256:createHash('sha256').update(image).digest('hex'),htmlSha256:createHash('sha256').update(document).digest('hex'),status:'unapproved',aiReview:'required-before-activation',image:`exports/${base}.png`});await page.close();
}}}finally{await browser.close();}
await writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(directory,'review.html'),`<!doctype html><meta charset="utf-8"><title>Fabsy static ad review</title><style>body{font:16px system-ui;background:#f1f5f9;margin:32px}main{display:flex;gap:20px;flex-wrap:wrap}figure{margin:0;width:300px}img{width:100%}figcaption{padding:12px}</style><h1>Three prepared concepts</h1><p>Unapproved. Meta inactive. Exact HTML text, no image model. Story exports keep text away from the top and bottom overlays.</p><main>${manifest.map(m=>`<figure><img src="${m.image}" alt="${m.id}"><figcaption>${m.id}</figcaption></figure>`).join('')}</main>`);
console.log(`${manifest.length} exact PNG exports created`);
