import {useSyncExternalStore} from 'react';
import {googleOptOutCopy} from '@/i18n/googleOptOutCopy';
import {splitLocalePath} from '@/i18n/locale-policy.mjs';
import {Link,useLocation} from 'react-router-dom';
import {GOOGLE_CONSENT_CHANGED,getGoogleConsentChoice,setGoogleConsentChoice} from '@/lib/googleConsent';
const subscribe=(notify:()=>void)=>{window.addEventListener(GOOGLE_CONSENT_CHANGED,notify);window.addEventListener('storage',notify);return()=>{window.removeEventListener(GOOGLE_CONSENT_CHANGED,notify);window.removeEventListener('storage',notify);};};
export default function GoogleConsent(){
 const choice=useSyncExternalStore(subscribe,getGoogleConsentChoice,()=> 'unknown' as const);
 const allowed=choice==='accepted';
 const location=useLocation(),{locale}=splitLocalePath(location.pathname);
 const copy=googleOptOutCopy[locale]||googleOptOutCopy.en;
 return <div lang={locale} dir={locale==='ar'?'rtl':'ltr'} data-google-consent-controls className="bg-slate-50 px-4 pt-3 pb-28 text-center text-xs leading-relaxed text-slate-700 md:pb-3">
  <p>{allowed?copy.notice:copy.off}{' '}
   <button type="button" data-google-measurement-toggle className="min-h-11 underline underline-offset-2" onClick={()=>setGoogleConsentChoice(allowed?'declined':'accepted')}>{allowed?copy.optOut:copy.enable}</button>.{' '}
   <Link className="underline underline-offset-2" to="/privacy-policy">{copy.privacy}</Link>
  </p>
 </div>;
}
