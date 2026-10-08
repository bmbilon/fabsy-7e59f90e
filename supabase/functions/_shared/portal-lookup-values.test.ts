import {normalizePortalLookup} from './portal-lookup-values.ts';
const assert=(ok:boolean)=>{if(!ok)throw new Error('Assertion failed');};
const invalid=(kind:string,value:string)=>{let held=false;try{normalizePortalLookup(kind,value,'2026-10-08');}catch(error){held=error instanceof Error&&error.message==='VERIFICATION_DETAIL_INVALID';}assert(held);};
Deno.test('all three lookup choices preserve usable values without a URL payload',()=>{
 assert(normalizePortalLookup('plate','abc-1234')==='ABC1234');
 assert(normalizePortalLookup('drivers_license','123456-789')==='123456789');
 assert(normalizePortalLookup('date_of_birth','1990-02-28','2026-10-08')==='1990-02-28');
});
Deno.test('blank, placeholder, invalid and future identifiers hold rather than guess',()=>{
 for(const value of ['','Not supplied','UNKNOWN','PHOTO-INTAKE-123456','too/long'])invalid('drivers_license',value);
 for(const value of ['','A','ABCDEFGHIJKLM','abc<123','N/A','NONE','NULL'])invalid('plate',value);
 for(const value of ['1990-02-30','10/08/1990','2026-10-09','1899-12-31'])invalid('date_of_birth',value);
 invalid('officer_number','123456');
});
