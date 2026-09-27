import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {paymentEvent} from '../../../ads-engine/measurement.ts';
import {saveEvent} from '../../../ads-engine/platform/store.ts';
import type {Json} from '../../../ads-engine/core.ts';
export async function recordAdsPayment(db:SupabaseClient,session:Json,items:Json[],paidAt:string){
 const id=session.metadata?.ticket_submission_id||session.metadata?.submission_id;
 const attribution=await db.from('ads_attribution').select('fields').eq('submission_id',id).maybeSingle();
 if(attribution.error)throw new Error('ADS_ATTRIBUTION_READ_FAILED');
 const event=paymentEvent(session,attribution.data?.fields||{},items);
 if(event){event.occurred_at=paidAt;await saveEvent(db,event);}
}
