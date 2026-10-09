import type {Page} from '@cloudflare/puppeteer';
import {canonicalTerms,digest} from './review-submit-policy.mjs';
export const portalBody=(page:Page)=>page.evaluate(()=>document.querySelector<HTMLElement>('main')?.innerText||document.body.innerText);
export async function portalGuard(page:Page){
 if(new URL(page.url()).origin!=='https://traffictickets.alberta.ca')throw new Error('OFFICIAL_PORTAL_REQUIRED');
 const blocked=await page.evaluate(()=>/verify (?:that )?you are human|access denied|unusual traffic|request (?:was )?blocked/i.test(document.body.innerText)||Array.from(document.querySelectorAll('iframe')).some(f=>(/bframe/.test(f.src)||/challenge/i.test(f.title))&&f.getBoundingClientRect().height>50&&f.getBoundingClientRect().width>100));
 if(blocked)throw new Error('HUMAN_VERIFICATION_REQUIRED');
}
export async function portalPath(page:Page,value:string,selector?:string){
 await page.waitForFunction(({path,selector})=>location.pathname===path&&!!document.querySelector('main')&&(!selector||!!document.querySelector(selector)),{timeout:45000},{path:value,selector});await portalGuard(page);
}
export async function portalClick(page:Page,label:string){
 await portalGuard(page);
 await page.evaluate(value=>{const matches=Array.from(document.querySelectorAll<HTMLButtonElement|HTMLAnchorElement|HTMLInputElement>('main button,main a,main input[type=submit]')).filter(e=>(e.textContent||('value'in e?e.value:'')).replace(/\s+/g,' ').trim()===value&&e.getBoundingClientRect().width>0);if(matches.length!==1||('disabled'in matches[0]&&matches[0].disabled))throw new Error('PORTAL_CONTROL_CHANGED');matches[0].click();},label);
}
export async function portalChecked(page:Page,label:string){
 await portalGuard(page);
 await page.evaluate(value=>{const matches=Array.from(document.querySelectorAll<HTMLInputElement>('main input[type=radio],main input[type=checkbox]')).filter(e=>Array.from(e.labels||[]).some(l=>l.textContent?.replace(/\s+/g,' ').trim()===value));if(matches.length!==1||matches[0].disabled)throw new Error('PORTAL_CONTROL_CHANGED');if(!matches[0].checked)matches[0].click();},label);
}
export async function portalFill(page:Page,selector:string,value:string){
 await portalGuard(page);const input=await page.$(selector);if(!input)throw new Error('PORTAL_CONTROL_CHANGED');await input.click({clickCount:3});await input.type(value);await input.press('Tab');
}
export async function readSessionTerms(page:Page){
 const tab=await page.browser().newPage();
 try{
  const response=await tab.goto('https://traffictickets.alberta.ca/terms-of-use',{waitUntil:'networkidle2',timeout:45000});
  if(response?.status()!==200)throw new Error('TERMS_UNAVAILABLE');await portalGuard(tab);
  const text=canonicalTerms(await portalBody(tab));return {text,sha256:await digest(text),url:tab.url()};
 }finally{await tab.close();}
}
