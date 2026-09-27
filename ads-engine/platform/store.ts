import type {ActionStore} from './actions.ts';
import type {Json} from '../core.ts';
export function actionStore(db:any):ActionStore {
  const row=async(table:string,id:any)=>{const r=await db.from(table).select('*').eq('id',id).single();if(r.error)throw new Error('ADS_STORAGE_UNAVAILABLE');return r.data;};
  return {
    approval:id=>row('ads_batches',id),state:()=>row('ads_engine_state',true),
    reserve:async(key,batchId,kind,before,payload,rollback)=>{const r=await db.rpc('ads_claim_action',{p_key:key,p_batch:batchId,p_kind:kind,p_before:before,p_payload:payload,p_rollback:rollback});if(r.error)throw new Error('ADS_ACTION_HELD');return r.data;},
    finish:async(id,status,after,rollback)=>{const r=await db.rpc('ads_finish_action',{p_id:id,p_status:status,p_after:after,p_rollback:rollback});if(r.error)throw new Error('ADS_RECEIPT_SAVE_FAILED');},
  };
}
export async function saveEvent(db:any,event:Json) {
  const result=await db.from('ads_funnel_events').upsert(event,{onConflict:'event_id',ignoreDuplicates:true});
  if(result.error)throw new Error('ADS_EVENT_SAVE_FAILED');
}
