import {canonical, campaignEndDate, digest, edmontonDate, type Json} from '../core.ts';

export class GoogleAds {
  constructor(readonly env: (key:string)=>string|undefined, readonly fetcher = fetch) {}
  private authHeaders?:Promise<Record<string,string>>;
  private headers(){return this.authHeaders ||= this.refreshHeaders();}
  private async refreshHeaders():Promise<Record<string,string>> {
    const names=['GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_CUSTOMER_ID'];
    if (names.some(n=>!this.env(n))) throw new Error('GOOGLE_ADS_ACCESS_NOT_CONFIGURED');
    const response=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(15000),body:new URLSearchParams({grant_type:'refresh_token',client_id:this.env(names[0])!,client_secret:this.env(names[1])!,refresh_token:this.env(names[2])!})});
    if(!response.ok)throw new Error('GOOGLE_OAUTH_UNAVAILABLE');
    const token=await response.json();
    if(typeof token.access_token!=='string')throw new Error('GOOGLE_OAUTH_UNAVAILABLE');
    return {Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json',...(this.env('GOOGLE_ADS_LOGIN_CUSTOMER_ID')?{'login-customer-id':this.env('GOOGLE_ADS_LOGIN_CUSTOMER_ID')!.replaceAll('-','')}:{})};
  }
  private url(method:string) {
    const id=this.env('GOOGLE_ADS_CUSTOMER_ID')?.replaceAll('-','');
    if(!/^\d{10}$/.test(id||''))throw new Error('INVALID_GOOGLE_CUSTOMER');
    return `https://googleads.googleapis.com/v23/customers/${id}/${method}`;
  }
  async read(query:string):Promise<Json[]> {
    const response=await this.fetcher(this.url('googleAds:searchStream'),{method:'POST',headers:await this.headers(),body:JSON.stringify({query}),signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw new Error(`GOOGLE_READ_HTTP_${response.status}`);
    return (await response.json()).flatMap((b:Json)=>b.results||[]);
  }
  async snapshot():Promise<Json> {
    const account=await this.read('SELECT customer.id, customer.currency_code, customer.time_zone FROM customer');
    if(account[0]?.customer.currencyCode!=='CAD'||account[0]?.customer.timeZone!=='America/Edmonton')throw new Error('ACCOUNT_CURRENCY_OR_TIMEZONE_MISMATCH');
    const [campaigns,groups,keywords,criteria,ads,assets,goals,conversions] = await Promise.all([
      this.read("SELECT campaign.resource_name, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.campaign_budget, campaign.start_date_time, campaign.end_date_time, campaign.maximize_conversions.target_cpa_micros, campaign.bidding_strategy_type, campaign.ai_max_setting.enable_ai_max, campaign.asset_automation_settings, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network, campaign.geo_target_type_setting.positive_geo_target_type, campaign.geo_target_type_setting.negative_geo_target_type, campaign.final_url_suffix, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.period, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED'"),
      this.read("SELECT ad_group.resource_name, ad_group.campaign, ad_group.name, ad_group.status FROM ad_group WHERE ad_group.status != 'REMOVED'"),
      this.read("SELECT ad_group_criterion.resource_name, ad_group_criterion.ad_group, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'"),
      this.read("SELECT campaign_criterion.resource_name, campaign_criterion.campaign, campaign_criterion.negative, campaign_criterion.type, campaign_criterion.bid_modifier, campaign_criterion.device.type, campaign_criterion.location.geo_target_constant, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion"),
      this.read("SELECT ad_group_ad.resource_name, ad_group_ad.ad_group, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'"),
      this.read("SELECT campaign_asset.resource_name, campaign_asset.campaign, campaign_asset.asset, campaign_asset.field_type, campaign_asset.status, asset.name, asset.callout_asset.callout_text, asset.sitelink_asset.link_text, asset.final_urls, asset.price_asset.type, asset.price_asset.language_code, asset.price_asset.price_offerings FROM campaign_asset WHERE campaign_asset.status != 'REMOVED'"),
      this.read('SELECT campaign_conversion_goal.resource_name, campaign_conversion_goal.campaign, campaign_conversion_goal.category, campaign_conversion_goal.origin, campaign_conversion_goal.biddable FROM campaign_conversion_goal'),
      this.read("SELECT conversion_action.resource_name, conversion_action.name, conversion_action.category, conversion_action.type, conversion_action.primary_for_goal, conversion_action.status FROM conversion_action WHERE conversion_action.status != 'REMOVED'"),
    ]);
    const graph={account,campaigns,groups,keywords,criteria,ads,assets,goals,conversions};
    for(const rows of Object.values(graph))rows.sort((a:Json,b:Json)=>canonical(a).localeCompare(canonical(b)));
    return {...graph,hash:await digest(graph),observedAt:new Date().toISOString()};
  }
  async approvedPlan(batch:Json,kind:string,live:Json):Promise<Json> {
    const config=batch.payload.config,specs=batch.payload.specs;
    if(kind==='sync')return planGoogle(specs,config,live);
    if(kind!=='launch')throw new Error('EXACT_ACTION_APPROVAL_REQUIRED');
    const plan=planGoogle(specs,config,live);
    if(plan.operations.length)throw new Error('SYNC_PAUSED_CAMPAIGNS_AND_GOALS_FIRST');
    const campaigns=live.campaigns.filter((r:Json)=>specs.some((s:Json)=>s.name===r.campaign.name));
    if(!specs.length||campaigns.length!==specs.length)throw new Error('EXACT_CAMPAIGNS_REQUIRED');
    for(const row of campaigns){
      const goals=live.goals.filter((r:Json)=>r.campaignConversionGoal.campaign===row.campaign.resourceName).map((r:Json)=>r.campaignConversionGoal);
      const qualified=live.conversions.find((r:Json)=>r.conversionAction.resourceName===config.googleQualifiedConversionAction).conversionAction;
      if(!goals.some((g:Json)=>g.category===qualified.category&&g.origin==='WEBSITE'&&g.biddable)||goals.some((g:Json)=>g.biddable&&(g.category!==qualified.category||g.origin!=='WEBSITE')))throw new Error('EXACT_PRIMARY_GOAL_REQUIRED');
      const ads=live.ads.filter((r:Json)=>live.groups.some((g:Json)=>g.adGroup.campaign===row.campaign.resourceName&&g.adGroup.resourceName===r.adGroupAd.adGroup));
      if(ads.some((r:Json)=>{const p=r.adGroupAd.policySummary;return p?.approvalStatus!=='APPROVED'&&!(p?.approvalStatus==='UNKNOWN'&&p?.reviewStatus==='REVIEW_IN_PROGRESS');}))throw new Error('ADS_NOT_APPROVED_BY_GOOGLE');
    }
    return {sourceHash:live.hash,operations:campaigns.map((r:Json)=>statusOperation(r.campaign.resourceName,'ENABLED')),rollback:campaigns.map((r:Json)=>statusOperation(r.campaign.resourceName,'PAUSED'))};
  }
  async spend(config:Json):Promise<Json> {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(config.startDate||''))throw new Error('LAUNCH_START_DATE_REQUIRED');
    const date=edmontonDate();
    const daily=await this.read(`SELECT campaign.resource_name, campaign.name, campaign.status, metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date = '${date}' AND campaign.status != 'REMOVED'`);
    const total=await this.read(`SELECT metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${config.startDate}' AND '${date}'`);
    return {date,observedAt:new Date().toISOString(),learningSpendCad:total.reduce((n,r)=>n+Number(r.metrics?.costMicros||0)/1e6,0),campaigns:daily.filter(r=>config.campaigns[r.campaign.name]).map(r=>({name:r.campaign.name,resourceName:r.campaign.resourceName,status:r.campaign.status,spendCad:Number(r.metrics?.costMicros||0)/1e6,clicks:Number(r.metrics?.clicks||0),impressions:Number(r.metrics?.impressions||0),service:config.campaigns[r.campaign.name].service}))};
  }
  /** Only platform/actions calls this write method. Never retry an ambiguous response. */
  async mutate(operations:Json[], validateOnly=false):Promise<Json> {
    const response=await this.fetcher(this.url('googleAds:mutate'),{method:'POST',headers:await this.headers(),body:JSON.stringify({mutateOperations:operations,partialFailure:false,validateOnly}),signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error(`GOOGLE_MUTATION_HTTP_${response.status}`);
    return await response.json();
  }
}

const update=(kind:string,fields:Json,mask:string)=>({[`${kind}Operation`]:{update:fields,updateMask:mask}});
export const statusOperation=(campaign:string,status:string)=>update('campaign',{resourceName:campaign,status},'status');
// Google adds performance and policy metadata to text assets on readback.
const rsaContent=(rsa:Json)=>({...rsa,...Object.fromEntries(['headlines','descriptions'].map(key=>[key,rsa[key]?.map(({assetPerformanceLabel:_performance,policySummaryInfo:_policy,...content}:Json)=>content)]))});

/** Measurement setup cannot enable campaign delivery. */
export function planMeasurement(config:Json,live:Json):Json {
  const customer=live.account[0].customer.id;
  if(config.googleCustomerId!==customer)throw new Error('CONFIG_ACCOUNT_MISMATCH');
  const operations:Json[]=[],rollback:Json[]=[],createdOperationKinds:Json={};
  const desired=[
    {name:'Qualified Ticket Upload',category:'SUBMIT_LEAD_FORM',primaryForGoal:true},
    {name:'Officer Paid',category:'PURCHASE',primaryForGoal:false,resourceName:config.googlePurchaseConversionActions?.[0]},
    {name:'Camera Paid',category:'PURCHASE',primaryForGoal:false,resourceName:config.googlePurchaseConversionActions?.[1]},
  ];
  for(const setting of desired){
    const matches=live.conversions.filter((r:Json)=>r.conversionAction.name===setting.name||setting.resourceName&&r.conversionAction.resourceName===setting.resourceName);
    if(matches.length>1)throw new Error('AMBIGUOUS_CONVERSION_ACTION');
    const old=matches[0]?.conversionAction;
    if(old){
      if(old.type!=='WEBPAGE'||old.category!==setting.category)throw new Error('CONVERSION_TYPE_MISMATCH');
      if(old.name!==setting.name||old.primaryForGoal!==setting.primaryForGoal||old.status!=='ENABLED'){
        const mask='name,primary_for_goal,status';
        operations.push(update('conversionAction',{resourceName:old.resourceName,name:setting.name,primaryForGoal:setting.primaryForGoal,status:'ENABLED'},mask));
        rollback.unshift(update('conversionAction',{resourceName:old.resourceName,name:old.name,primaryForGoal:old.primaryForGoal,status:old.status},mask));
      }
    }else{
      if(setting.resourceName)throw new Error('EXISTING_PAID_ACTION_REQUIRED');
      createdOperationKinds[operations.length]='conversionAction';
      operations.push({conversionActionOperation:{create:{name:setting.name,category:setting.category,primaryForGoal:setting.primaryForGoal,type:'WEBPAGE',status:'ENABLED',countingType:'ONE_PER_CLICK',valueSettings:{defaultValue:0,defaultCurrencyCode:'CAD',alwaysUseDefaultValue:true}}}});
    }
  }
  return {sourceHash:live.hash,operations,rollback,createdOperationKinds,newCampaignIndexes:[]};
}

/** All decisions, including existing campaign reuse, become frozen operations. */
export function planGoogle(specs:Json[],config:Json,live:Json):Json {
  if(!live?.hash)throw new Error('LIVE_ACCOUNT_READ_REQUIRED');
  const customer=live.account[0].customer.id;
  if(config.googleCustomerId!==customer)throw new Error('CONFIG_ACCOUNT_MISMATCH');
  const qualified=live.conversions.find((r:Json)=>r.conversionAction.resourceName===config.googleQualifiedConversionAction)?.conversionAction;
  if(!qualified||qualified.primaryForGoal!==true||qualified.type!=='WEBPAGE'||qualified.status!=='ENABLED'||live.conversions.some((r:Json)=>r.conversionAction.resourceName!==qualified.resourceName&&r.conversionAction.category===qualified.category&&r.conversionAction.primaryForGoal===true&&r.conversionAction.status==='ENABLED'))throw new Error('QUALIFIED_PRIMARY_WEB_CONVERSION_REQUIRED');
  if(!config.googlePurchaseConversionActions?.length||config.googlePurchaseConversionActions.some((id:string)=>!live.conversions.some((r:Json)=>r.conversionAction.resourceName===id&&r.conversionAction.primaryForGoal===false&&r.conversionAction.type==='WEBPAGE')))throw new Error('SECONDARY_PAID_WEB_CONVERSIONS_REQUIRED');
  if(!/^geoTargetConstants\/\d+$/.test(config.albertaGeoTarget||''))throw new Error('VERIFIED_ALBERTA_GEO_REQUIRED');
  const operations:Json[]=[];const rollback:Json[]=[];const newCampaignIndexes:number[]=[];const createdOperationKinds:Json={};let temp=-1;
  const retired=new Set(config.retiredCampaignIds||[]);
  for(const id of retired){
    const row=live.campaigns.find((r:Json)=>r.campaign.id===id);
    if(!row||row.campaign.advertisingChannelType!=='SEARCH'||Object.values(config.existingCampaignIds).includes(id))throw new Error('RETIRED_CAMPAIGN_SCOPE_INVALID');
    if(row.campaign.status!=='PAUSED'){
      operations.push(statusOperation(row.campaign.resourceName,'PAUSED'));
      rollback.unshift(statusOperation(row.campaign.resourceName,row.campaign.status));
    }
  }
  const resource=(kind:string)=>`customers/${customer}/${kind}/${temp--}`;
  const add=(kind:string,create:Json)=>{createdOperationKinds[operations.length]=kind;operations.push({[`${kind}Operation`]:{create}});};
  for(const spec of specs){
    const budgetSetting=config.campaigns[spec.name];
    const totalBudget=budgetSetting?.budgetType==='TOTAL';
    const budgetField=totalBudget?'totalAmountMicros':'amountMicros';
    const budgetAmount=totalBudget?budgetSetting.totalBudgetCad:budgetSetting?.dailyBudgetCad;
    if(!(Number.isFinite(budgetAmount)&&budgetAmount>0))throw new Error('PROPOSE_POSITIVE_CAMPAIGN_BUDGETS');
    const dates=totalBudget?{startDateTime:`${config.startDate} 00:00:00`,endDateTime:`${campaignEndDate(config)} 23:59:59`}:{};
    const explicit=config.existingCampaignIds[spec.name];
    const matches=live.campaigns.filter((r:Json)=>!retired.has(r.campaign.id)&&(explicit?r.campaign.id===explicit:r.campaign.name===spec.name||r.campaign.advertisingChannelType==='SEARCH'&&live.ads.some((a:Json)=>a.adGroupAd.ad.finalUrls?.includes(spec.destination)&&live.groups.some((g:Json)=>g.adGroup.resourceName===a.adGroupAd.adGroup&&g.adGroup.campaign===r.campaign.resourceName))));
    if(matches.length>1||explicit&&!matches.length)throw new Error('AMBIGUOUS_EXISTING_CAMPAIGN');
    const existing=matches[0];
    const settings={name:spec.name,status:'PAUSED',...dates,finalUrlSuffix:`utm_source=google&utm_medium=cpc&utm_campaign=${spec.name}&utm_content=${spec.service}_launch_v1&variant_id=${spec.service}_v1`,maximizeConversions:{},networkSettings:{targetGoogleSearch:true,targetSearchNetwork:false,targetContentNetwork:false,targetPartnerSearchNetwork:false},geoTargetTypeSetting:{positiveGeoTargetType:'PRESENCE',negativeGeoTargetType:'PRESENCE'},aiMaxSetting:{enableAiMax:false},assetAutomationSettings:['TEXT_ASSET_AUTOMATION','FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION'].map(assetAutomationType=>({assetAutomationType,assetAutomationStatus:'OPTED_OUT'}))};
    let campaign:string;
    if(existing){
      campaign=existing.campaign.resourceName;
      if(existing.campaign.advertisingChannelType!=='SEARCH'||existing.campaignBudget.explicitlyShared)throw new Error('EXISTING_CAMPAIGN_NEEDS_REVIEW');
      if((existing.campaignBudget.period==='CUSTOM_PERIOD')!==totalBudget)throw new Error('CAMPAIGN_BUDGET_TYPE_CANNOT_CHANGE');
      const fields={...settings,resourceName:campaign};
      const mask='name,status,maximize_conversions,network_settings,geo_target_type_setting,ai_max_setting,asset_automation_settings,final_url_suffix'+(totalBudget?',start_date_time,end_date_time':'');
      const oldFields=Object.fromEntries(Object.keys(settings).map(k=>[k,existing.campaign[k]??(k==='maximizeConversions'?{}:undefined)]));
      const normalized:Json={...oldFields,networkSettings:Object.fromEntries(Object.keys(settings.networkSettings).map(k=>[k,existing.campaign.networkSettings?.[k]===true])),aiMaxSetting:{enableAiMax:existing.campaign.aiMaxSetting?.enableAiMax===true},assetAutomationSettings:existing.campaign.assetAutomationSettings?.filter((a:Json)=>settings.assetAutomationSettings.some(v=>v.assetAutomationType===a.assetAutomationType)).sort((a:Json,b:Json)=>a.assetAutomationType.localeCompare(b.assetAutomationType))};
      // The approved start has calendar granularity; Google clamps a same-day start to creation time.
      if(totalBudget&&existing.campaign.startDateTime?.slice(0,10)===config.startDate)normalized.startDateTime=settings.startDateTime;
      const compare={...settings,assetAutomationSettings:[...settings.assetAutomationSettings].sort((a,b)=>a.assetAutomationType.localeCompare(b.assetAutomationType))};
      if(canonical(normalized)!==canonical(compare)){
        operations.push(update('campaign',fields,mask));
        rollback.unshift(update('campaign',{resourceName:campaign,...oldFields},mask));
      }
      // Bidding restoration is staged separately when the former strategy differs.
      if(existing.campaign.biddingStrategyType!=='MAXIMIZE_CONVERSIONS')throw new Error('EXISTING_BIDDING_REQUIRES_SEPARATE_APPROVED_MIGRATION');
      const amount=String(Math.round(budgetAmount*1e6)),budgetMask=totalBudget?'total_amount_micros':'amount_micros';
      if(existing.campaignBudget[budgetField]!==amount){operations.push(update('campaignBudget',{resourceName:existing.campaign.campaignBudget,[budgetField]:amount},budgetMask));rollback.unshift(update('campaignBudget',{resourceName:existing.campaign.campaignBudget,[budgetField]:existing.campaignBudget[budgetField]},budgetMask));}
    }else{
      const budget=resource('campaignBudgets');campaign=resource('campaigns');
      add('campaignBudget',{resourceName:budget,name:`${spec.name} launch v1`,[budgetField]:String(Math.round(budgetAmount*1e6)),...(totalBudget?{period:'CUSTOM_PERIOD'}:{}),deliveryMethod:'STANDARD',explicitlyShared:false});
      newCampaignIndexes.push(operations.length);
      add('campaign',{resourceName:campaign,...settings,campaignBudget:budget,advertisingChannelType:'SEARCH',containsEuPoliticalAdvertising:'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'});
    }
    const ownedCriteria=live.criteria.filter((r:Json)=>r.campaignCriterion.campaign===campaign);
    for(const row of ownedCriteria){
      const c=row.campaignCriterion;
      const neutralDevice=c.type==='DEVICE'&&!c.negative&&['DESKTOP','MOBILE','TABLET'].includes(c.device?.type)&&(c.bidModifier===undefined||c.bidModifier===1);
      const wanted=neutralDevice||c.type==='LOCATION'&&!c.negative&&c.location?.geoTargetConstant===config.albertaGeoTarget||c.type==='KEYWORD'&&c.negative&&c.keyword?.matchType==='PHRASE'&&spec.negativeKeywords.includes(c.keyword.text);
      if(!wanted)throw new Error('EXISTING_TARGETING_REQUIRES_REVIEW');
    }
    if(!ownedCriteria.some((r:Json)=>r.campaignCriterion.location?.geoTargetConstant===config.albertaGeoTarget))add('campaignCriterion',{campaign,location:{geoTargetConstant:config.albertaGeoTarget}});
    for(const text of spec.negativeKeywords)if(!ownedCriteria.some((r:Json)=>r.campaignCriterion.keyword?.text===text))add('campaignCriterion',{campaign,negative:true,keyword:{text,matchType:'PHRASE'}});
    const existingGroups=live.groups.filter((r:Json)=>r.adGroup.campaign===campaign);
    if(existingGroups.some((r:Json)=>!spec.groups.some((g:Json)=>g.name===r.adGroup.name)))throw new Error('EXISTING_AD_GROUP_REQUIRES_REVIEW');
    for(const group of spec.groups){
      const matches=existingGroups.filter((r:Json)=>r.adGroup.name===group.name);
      if(matches.length>1)throw new Error('DUPLICATE_AD_GROUP');
      const adGroup=matches[0]?.adGroup.resourceName||resource('adGroups');
      if(!matches.length)add('adGroup',{resourceName:adGroup,campaign,name:group.name,status:'ENABLED',type:'SEARCH_STANDARD'});
      const existingKeywords=live.keywords.filter((r:Json)=>r.adGroupCriterion.adGroup===adGroup);
      if(existingKeywords.some((r:Json)=>r.adGroupCriterion.negative||r.adGroupCriterion.keyword?.matchType!=='PHRASE'||!group.keywords.includes(r.adGroupCriterion.keyword.text)))throw new Error('EXISTING_KEYWORDS_REQUIRE_REVIEW');
      for(const text of group.keywords)if(!existingKeywords.some((r:Json)=>r.adGroupCriterion.keyword.text===text))add('adGroupCriterion',{adGroup,status:'ENABLED',keyword:{text,matchType:'PHRASE'}});
      const rsa={headlines:group.headlines.map((text:string,i:number)=>({text,...(i===group.pinnedHeadlineIndex?{pinnedField:'HEADLINE_1'}:{})})),descriptions:group.descriptions.map((text:string)=>({text}))};
      const existingAds=live.ads.filter((r:Json)=>r.adGroupAd.adGroup===adGroup);
      if(existingAds.some((r:Json)=>canonical(rsaContent(r.adGroupAd.ad.responsiveSearchAd))!==canonical(rsa)||canonical(r.adGroupAd.ad.finalUrls)!==canonical([spec.destination])))throw new Error('EXISTING_COPY_REQUIRES_REVIEW');
      if(!existingAds.length)add('adGroupAd',{adGroup,status:'ENABLED',ad:{finalUrls:[spec.destination],responsiveSearchAd:rsa}});
    }
    const goals=live.goals.filter((r:Json)=>r.campaignConversionGoal.campaign===campaign);
    for(const row of goals){const g=row.campaignConversionGoal;const biddable=g.category===qualified.category&&g.origin==='WEBSITE';if((g.biddable===true)!==biddable){operations.push(update('campaignConversionGoal',{resourceName:g.resourceName,biddable},'biddable'));rollback.unshift(update('campaignConversionGoal',{resourceName:g.resourceName,biddable:g.biddable===true},'biddable'));}}
    // New campaign goals are configured after the paused create, in a second approved sync.
    for(const [type,entries] of [['CALLOUT',spec.callouts.map((text:string)=>({name:`${spec.name}: ${text}`,calloutAsset:{calloutText:text}}))],['SITELINK',spec.sitelinks.map((s:Json)=>({name:`${spec.name}: ${s.text}`,sitelinkAsset:{linkText:s.text},finalUrls:[s.url]}))],...(config.priceAssetsEnabled===false?[]:[['PRICE',[{name:`${spec.name}: Price`,priceAsset:{type:'SERVICES',languageCode:'en',priceOfferings:[...spec.priceAssets,...specs.filter(s=>s.name!==spec.name).flatMap(s=>s.priceAssets),{header:'Resolution Bundle',description:'Service and report + GST',amountCad:229,url:'https://fabsy.ca/rapid-resolution'}].map((a:Json)=>({header:a.header,description:a.description,price:{amountMicros:String(a.amountCad*1e6),currencyCode:'CAD'},finalUrl:a.url}))}}]]])] as [string,Json[]][]){
      for(const value of entries){
        const found=live.assets.filter((r:Json)=>r.campaignAsset.campaign===campaign&&r.asset.name===value.name);
        if(found.length){
          for(const row of found){
            const actual=row.asset;
            const keys=Object.keys(value).filter(k=>k!=='name');
            if(keys.some(k=>canonical(actual[k])!==canonical(value[k])))throw new Error('EXISTING_ASSET_CONTENT_CHANGED');
          }
          continue;
        }
        const asset=resource('assets');add('asset',{resourceName:asset,...value});add('campaignAsset',{campaign,asset,fieldType:type,status:'ENABLED'});
      }
    }
  }
  return {operations,rollback,newCampaignIndexes,createdOperationKinds,sourceHash:live.hash,requiresPostCreateGoalSync:newCampaignIndexes.length>0};
}
