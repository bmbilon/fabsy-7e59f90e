import {assertEquals,assertThrows} from 'jsr:@std/assert@1';
import {GoogleAds,planGoogle,planMeasurement} from './platform/google.ts';
import {digest,lint,type Json} from './core.ts';
const read=async(path:string)=>JSON.parse(await Deno.readTextFile(new URL(path,import.meta.url)));
const specs=await Promise.all(['G-Search-Officer','G-Search-Camera'].map(name=>read(`./campaigns/${name}.yaml`)));
const pilotConfig=await read('./config.json');
const config={...pilotConfig,campaigns:{'G-Search-Officer':{service:'officer',dailyBudgetCad:50},'G-Search-Camera':{service:'camera',dailyBudgetCad:20}},durationDays:30,priceAssetsEnabled:true,googleCustomerId:'1234567890',retiredCampaignIds:[],albertaGeoTarget:'geoTargetConstants/1',googleQualifiedConversionAction:'customers/1234567890/conversionActions/1',googlePurchaseConversionActions:['customers/1234567890/conversionActions/2']};
function empty():Json{return {account:[{customer:{id:'1234567890',currencyCode:'CAD',timeZone:'America/Edmonton'}}],campaigns:[],groups:[],keywords:[],criteria:[],ads:[],assets:[],goals:[],conversions:[{conversionAction:{resourceName:config.googleQualifiedConversionAction,category:'SUBMIT_LEAD_FORM',primaryForGoal:true,type:'WEBPAGE',status:'ENABLED'}},{conversionAction:{resourceName:config.googlePurchaseConversionActions[0],category:'PURCHASE',primaryForGoal:false,type:'WEBPAGE',status:'ENABLED'}}],hash:'source',observedAt:new Date().toISOString()};}
Deno.test('both campaign specs pass truth lint with 24 phrase keywords each',()=>{for(const spec of specs){assertEquals(lint(spec,{officer:198,camera:79}),[]);assertEquals(spec.groups.flatMap((g:Json)=>g.keywords).length,24);}});
Deno.test('Google plan creates paused Search campaigns with no target and asset automation off',()=>{const plan=planGoogle(specs,config,empty());const campaigns=plan.operations.filter((o:Json)=>o.campaignOperation).map((o:Json)=>o.campaignOperation.create);assertEquals(campaigns.length,2);for(const c of campaigns){assertEquals(c.status,'PAUSED');assertEquals(c.maximizeConversions,{});assertEquals(c.aiMaxSetting.enableAiMax,false);assertEquals(c.assetAutomationSettings.every((a:Json)=>a.assetAutomationStatus==='OPTED_OUT'),true);}const budgets=plan.operations.filter((o:Json)=>o.campaignBudgetOperation).map((o:Json)=>o.campaignBudgetOperation.create.amountMicros);assertEquals(budgets,['50000000','20000000']);});
Deno.test('a same-destination campaign is detected instead of duplicating it',()=>{const live=empty();live.campaigns=[{campaign:{id:'100',resourceName:'existing',name:'Earlier Officer Campaign',advertisingChannelType:'SEARCH'},campaignBudget:{explicitlyShared:false}}];live.groups=[{adGroup:{resourceName:'group',campaign:'existing',name:'legacy'}}];live.ads=[{adGroupAd:{adGroup:'group',ad:{finalUrls:[specs[0].destination]}}}];assertThrows(()=>planGoogle(specs,config,live),Error,'EXISTING_BIDDING_REQUIRES_SEPARATE_APPROVED_MIGRATION');});
Deno.test('ambiguous existing campaigns and unverified goals are held',()=>{const live=empty();live.campaigns=[{campaign:{name:specs[0].name}},{campaign:{name:specs[0].name}}];assertThrows(()=>planGoogle(specs,config,live),Error,'AMBIGUOUS_EXISTING_CAMPAIGN');const missing=empty();missing.conversions=[];assertThrows(()=>planGoogle(specs,config,missing),Error,'QUALIFIED_PRIMARY_WEB_CONVERSION_REQUIRED');});
Deno.test('Google API read requires actual credentials and never prints tokens',async()=>{let calls=0;const google=new GoogleAds(()=>undefined,async()=>{calls++;throw new Error('unexpected network');});try{await google.snapshot();}catch(e){assertEquals((e as Error).message,'INVALID_GOOGLE_CUSTOMER');}assertEquals(calls,0);});
Deno.test('Cloud project OAuth works without a retired developer token',async()=>{
 const env:Record<string,string>={GOOGLE_ADS_CLIENT_ID:'test-client',GOOGLE_ADS_CLIENT_SECRET:'test-secret',GOOGLE_ADS_REFRESH_TOKEN:'test-refresh',GOOGLE_ADS_CUSTOMER_ID:'9385017797'};
 let calls=0;
 const google=new GoogleAds(key=>env[key],async(_url,options)=>{
  calls++;
  if(calls===1)return Response.json({access_token:'synthetic-access'});
  const headers=options?.headers as Record<string,string>;
  assertEquals(headers.Authorization,'Bearer synthetic-access');
  assertEquals(headers['developer-token'],undefined);
  return Response.json([{results:[{customer:{id:'9385017797'}}]}]);
 });
 assertEquals(await google.read('SELECT customer.id FROM customer'),[{customer:{id:'9385017797'}}]);
 assertEquals(calls,2);
});

Deno.test('paused graph converges after goal sync and launch keeps the approved scope',async()=>{
 const live=empty();const initial=planGoogle(specs,config,live);const budgets=new Map(),assets=new Map();let sequence=1;
 for(const operation of initial.operations){
  const [kind,body]=Object.entries(operation)[0] as [string,Json];const value=body.create;if(!value)continue;
  const resourceName=value.resourceName||`created/${sequence++}`;
  if(kind==='campaignBudgetOperation')budgets.set(value.resourceName,value);
  if(kind==='campaignOperation')live.campaigns.push({campaign:{...value,id:String(sequence++),biddingStrategyType:'MAXIMIZE_CONVERSIONS'},campaignBudget:budgets.get(value.campaignBudget)});
  if(kind==='adGroupOperation')live.groups.push({adGroup:value});
  if(kind==='adGroupCriterionOperation')live.keywords.push({adGroupCriterion:{...value,resourceName}});
  if(kind==='campaignCriterionOperation')live.criteria.push({campaignCriterion:{...value,resourceName,type:value.location?'LOCATION':'KEYWORD'}});
  if(kind==='adGroupAdOperation')live.ads.push({adGroupAd:{...value,resourceName,policySummary:{approvalStatus:'APPROVED'}}});
  if(kind==='assetOperation')assets.set(value.resourceName,value);
  if(kind==='campaignAssetOperation')live.assets.push({campaignAsset:{...value,resourceName},asset:assets.get(value.asset)});
 }
 for(const row of live.campaigns)for(const category of ['SUBMIT_LEAD_FORM','PURCHASE'])live.goals.push({campaignConversionGoal:{campaign:row.campaign.resourceName,resourceName:`goal/${sequence++}`,category,origin:'WEBSITE',biddable:category==='PURCHASE'}});
 live.hash=await digest(live);
 const second=planGoogle(specs,config,live);assertEquals(second.operations.length,4);
 for(const row of live.goals)row.campaignConversionGoal.biddable=row.campaignConversionGoal.category==='SUBMIT_LEAD_FORM';
 assertEquals(planGoogle(specs,config,live).operations.length,0);
 const google=new GoogleAds(()=>undefined);const launch=await google.approvedPlan({payload:{specs,config}},'launch',live);
 assertEquals(launch.operations.length,2);assertEquals(launch.operations.every((o:Json)=>o.campaignOperation.update.status==='ENABLED'),true);
});

Deno.test('conversion setup reuses paid actions and only creates the qualified web action',()=>{
 const live=empty();live.conversions=[{conversionAction:{resourceName:config.googlePurchaseConversionActions[0],name:'Legacy officer purchase',type:'WEBPAGE',category:'PURCHASE',primaryForGoal:true,status:'ENABLED'}},{conversionAction:{resourceName:'customers/1234567890/conversionActions/3',name:'Legacy camera purchase',type:'WEBPAGE',category:'PURCHASE',primaryForGoal:false,status:'ENABLED'}}];
 const setupConfig={...config,googlePurchaseConversionActions:[config.googlePurchaseConversionActions[0],'customers/1234567890/conversionActions/3']};
 const plan=planMeasurement(setupConfig,live);
 assertEquals(plan.operations.length,3);
 assertEquals(plan.operations.every((o:Json)=>!!o.conversionActionOperation),true);
 assertEquals(plan.operations[0].conversionActionOperation.create.name,'Qualified Ticket Upload');
 assertEquals(plan.operations[0].conversionActionOperation.create.primaryForGoal,true);
 assertEquals(plan.operations[1].conversionActionOperation.update.primaryForGoal,false);
 for(const o of plan.operations){const a=o.conversionActionOperation; if(a.update)Object.assign(live.conversions.find((r:Json)=>r.conversionAction.resourceName===a.update.resourceName).conversionAction,a.update);else live.conversions.push({conversionAction:{...a.create,resourceName:'created'}});}
 assertEquals(planMeasurement(setupConfig,live).operations.length,0);
});
Deno.test('approved campaign replacement pauses its predecessor before creating drafts',()=>{
 const live=empty();live.campaigns=[{campaign:{id:'100',resourceName:'old',name:'Legacy Search',status:'ENABLED',advertisingChannelType:'SEARCH'}}];
 const plan=planGoogle(specs,{...config,retiredCampaignIds:['100']},live);
 assertEquals(plan.operations[0].campaignOperation.update,{resourceName:'old',status:'PAUSED'});
 assertEquals(plan.rollback[0].campaignOperation.update.status,'ENABLED');
 assertThrows(()=>planGoogle(specs,{...config,retiredCampaignIds:['missing']},live),Error,'RETIRED_CAMPAIGN_SCOPE_INVALID');
});
Deno.test('officer pilot has one lifetime budget and a fixed 14-day serving window',()=>{
 const pilot={...config,campaigns:pilotConfig.campaigns,durationDays:14,startDate:'2026-09-27',priceAssetsEnabled:false};
 const plan=planGoogle([specs[0]],pilot,empty());
 const budgets=plan.operations.filter((o:Json)=>o.campaignBudgetOperation).map((o:Json)=>o.campaignBudgetOperation.create);
 const campaigns=plan.operations.filter((o:Json)=>o.campaignOperation).map((o:Json)=>o.campaignOperation.create);
 assertEquals(budgets.length,1);assertEquals(budgets[0].period,'CUSTOM_PERIOD');assertEquals(budgets[0].totalAmountMicros,'150000000');assertEquals(budgets[0].amountMicros,undefined);assertEquals(budgets[0].explicitlyShared,false);
 assertEquals(campaigns.length,1);assertEquals(campaigns[0].status,'PAUSED');assertEquals(campaigns[0].startDateTime,'2026-09-27 00:00:00');assertEquals(campaigns[0].endDateTime,'2026-10-10 23:59:59');
 assertEquals(plan.operations.some((o:Json)=>o.assetOperation?.create.priceAsset),false);
});
