import {getGoogleConsentChoice,setGoogleConsentChoice,GOOGLE_CONSENT_CHANGED,GOOGLE_CONSENT_STORAGE_KEY} from './googleConsent';
export const ADS_CONSENT_CHANGED=GOOGLE_CONSENT_CHANGED;
export const ADS_CONSENT_KEY=GOOGLE_CONSENT_STORAGE_KEY;
export const adsConsent=()=>getGoogleConsentChoice()==='accepted';
export const chooseAdsConsent=(allowed:boolean)=>setGoogleConsentChoice(allowed?'accepted':'declined');
