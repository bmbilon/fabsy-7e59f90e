import {digest, type Json} from '../core.ts';
import {statusOperation} from './google.ts';
export interface ActionStore {
  approval(id:string):Promise<Json>;
  state():Promise<Json>;
  reserve(key:string,batchId:string,kind:string,before:Json,payload:Json,rollback:Json):Promise<Json>;
  finish(id:string,status:string,after:Json,rollback:Json):Promise<void>;
}
export interface PlatformAdapter {
  snapshot():Promise<Json>;
  approvedPlan?(batch:Json,kind:string,live:Json):Promise<Json>;
  mutate(operations:Json[],validateOnly?:boolean):Promise<Json>;
}
/** The sole platform mutation gate. Dry runs never call mutate. */
export async function execute(store:ActionStore,adapter:PlatformAdapter,input:{batchId:string;kind:'sync'|'measurement_setup'|'launch'|'pause'|'revert'|'safety_pause';payload:Json;idempotencyKey:string;dryRun?:boolean}):Promise<Json> {
  if(!input.idempotencyKey||input.idempotencyKey.length>180)throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  if(input.dryRun!==false)return {dryRun:true,kind:input.kind,proposed:input.payload};
  const batch=await store.approval(input.batchId);
  if(batch.status!=='approved'||!batch.approved_by||!batch.approved_at||await digest(batch.payload)!==batch.payload_hash)throw new Error('EXACT_BATCH_APPROVAL_REQUIRED');
  const state=await store.state();
  const safe=['pause','safety_pause'].includes(input.kind);
  if(!safe&&(state.frozen||state.paused&&!['sync','measurement_setup'].includes(input.kind)))throw new Error('ACTIONS_FROZEN');
  if(input.kind==='measurement_setup'&&(batch.payload.kind!=='measurement_setup'||input.payload.operations.some((o:Json)=>!o.conversionActionOperation)))throw new Error('MEASUREMENT_SETUP_SCOPE_INVALID');
  if(!safe&&batch.payload.holds.length)throw new Error('LAUNCH_HOLDS');
  if(!safe&&['launch','revert'].includes(input.kind)&&(!batch.payload.config.spendingAuthorized||!(batch.payload.config.learningSpendLimitCad>0)))throw new Error('SPENDING_NOT_AUTHORIZED');
  const before=await adapter.snapshot();
  if(!safe){
    const exact=await digest(input.payload)===batch.payload.actionHashes[input.kind];
    const derived=['sync','launch'].includes(input.kind)&&adapter.approvedPlan ? await adapter.approvedPlan(batch,input.kind,before) : null;
    if(!exact&&(!derived||await digest(derived)!==await digest(input.payload)))throw new Error('ACTION_NOT_IN_APPROVED_BATCH');
  }
  if(!safe&&(Date.now()-Date.parse(before.observedAt)>120000||before.hash!==input.payload.sourceHash))throw new Error('LIVE_SOURCE_CHANGED');
  if(safe){
    const owned=new Set(before.campaigns.filter((r:Json)=>Object.keys(batch.payload.config.campaigns).includes(r.campaign.name)||Object.values(batch.payload.config.existingCampaignIds).includes(r.campaign.id)).map((r:Json)=>r.campaign.resourceName));
    for(const op of input.payload.operations){if(!owned.has(op.campaignOperation?.update?.resourceName)||op.campaignOperation.update.status!=='PAUSED'||op.campaignOperation.updateMask!=='status')throw new Error('PAUSE_SCOPE_INVALID');}
  }
  const initialRollback=safe?input.payload.operations.map((op:Json)=>statusOperation(op.campaignOperation.update.resourceName,before.campaigns.find((r:Json)=>r.campaign.resourceName===op.campaignOperation.update.resourceName).campaign.status)):(input.payload.rollback||[]);
  const action=await store.reserve(input.idempotencyKey,input.batchId,input.kind,before,input.payload,{operations:initialRollback});
  if(action.duplicate)return action;
  try {
    // Validate before a commit. A validation failure made no campaign changes.
    await adapter.mutate(input.payload.operations,true);
  } catch {
    await store.finish(action.id,'failed',{error:'PLATFORM_VALIDATION_FAILED'},{operations:initialRollback});
    throw new Error('PLATFORM_VALIDATION_FAILED');
  }
  let receipt:Json|null=null;
  const rollback=[...initialRollback];
  try {
    receipt=await adapter.mutate(input.payload.operations,false);
    for(const [index,kind] of Object.entries(input.payload.createdOperationKinds||{}).reverse()){
      if(['campaign','campaignBudget'].includes(String(kind)))continue;
      const result=receipt.mutateOperationResponses?.[Number(index)]?.[`${kind}Result`];
      if(result?.resourceName)rollback.push(kind==='conversionAction'?{conversionActionOperation:{update:{resourceName:result.resourceName,status:'HIDDEN',primaryForGoal:false},updateMask:'status,primary_for_goal'}}:{[`${kind}Operation`]:{remove:result.resourceName}});
    }
    for(const i of input.payload.newCampaignIndexes||[]){const name=receipt.mutateOperationResponses?.[i]?.campaignResult?.resourceName;if(name)rollback.unshift(statusOperation(name,'PAUSED'));}
    const after=await adapter.snapshot();
    await store.finish(action.id,'applied',{receipt,snapshot:after},{operations:rollback,sourceHash:after.hash});
    return {id:action.id,status:'applied'};
  } catch {
    await store.finish(action.id,'uncertain',{receipt,error:'RECONCILE_LIVE_STATE_BEFORE_RETRY'},{operations:rollback});
    throw new Error('UNCERTAIN_PLATFORM_WRITE');
  }
}
