export type Json = Record<string, any>;
export function canonical(value: unknown): string {
  if(value===undefined)return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(k=>(value as Json)[k]!==undefined).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Json)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function digest(value: unknown): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value))))).map(x => x.toString(16).padStart(2, '0')).join('');
}
export function lint(spec: Json, prices: {officer: number; camera: number}): string[] {
  const errors: string[] = [];
  const copy = [...spec.groups.flatMap((g: Json) => [...g.headlines, ...g.descriptions]), ...spec.callouts, ...spec.sitelinks.map((s: Json) => s.text), ...spec.priceAssets.flatMap((s: Json) => [s.header,s.description])];
  const price = prices[spec.service as 'officer'|'camera'];
  const banned = /\b(lawyer|law firm|guaranteed?|win your|we win|erase|wipe out|insurance goes up|no day off|no court|save your licence|success rate|always|100%)\b|\b\d+(?:\.\d+)?%\s*(?:success|reduction|withdrawal)|\u2014/i;
  for (const text of copy) {
    if (banned.test(text)) errors.push(`Banned or unsupported claim: ${text}`);
    for (const match of text.matchAll(/\$(\d+(?:\.\d+)?)/g)) if (Number(match[1]) !== price) errors.push('Price does not match current product');
    if (/\$/.test(text) && !/GST/.test(text)) errors.push('Price must identify GST separately');
  }
  for (const group of spec.groups) {
    if (group.headlines.length < 3 || group.headlines.length > 15 || group.headlines.some((t: string) => t.length > 30)) errors.push('RSA headline limits');
    if (group.descriptions.length < 2 || group.descriptions.length > 4 || group.descriptions.some((t: string) => t.length > 90)) errors.push('RSA description limits');
    if (group.matchType !== 'PHRASE') errors.push('Phrase match required');
  }
  if (spec.priceAssets.some((a: Json) => a.amountCad !== price)) errors.push('Price asset mismatch');
  if (spec.aiMax !== false || spec.automaticallyCreatedAssets !== false || spec.bidding !== 'MAXIMIZE_CONVERSIONS' || spec.targetCpa !== null) errors.push('Decided settings changed');
  if (spec.geo !== 'Alberta' || !['https://fabsy.ca/rapid-resolution','https://fabsy.ca/photo-radar'].includes(spec.destination)) errors.push('Unapproved destination or geography');
  const keywords = spec.groups.reduce((n: number, g: Json) => n + g.keywords.length, 0);
  if (keywords < 20 || keywords > 30) errors.push('Expected 20 to 30 keywords');
  if (!copy.some(t => t.includes('Upload a photo of your ticket.'))) errors.push('Required CTA missing');
  return [...new Set(errors)];
}
export function edmontonDate(time = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
}
export function campaignEndDate(config:Json):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(config.startDate||'')||!Number.isInteger(config.durationDays)||config.durationDays<1)throw new Error('CAMPAIGN_DATES_REQUIRED');
  const start=Date.parse(`${config.startDate}T00:00:00Z`);
  if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==config.startDate)throw new Error('CAMPAIGN_DATES_REQUIRED');
  return new Date(start+(config.durationDays-1)*86400000).toISOString().slice(0,10);
}
export function safetyStops(config: Json, snapshot: Json, now = Date.now()): Json[] {
  if (!snapshot || !Number.isFinite(Date.parse(snapshot.observedAt)) || now-Date.parse(snapshot.observedAt)>config.freshnessMinutes*60000 || Date.parse(snapshot.observedAt)>now+60000 || snapshot.date !== edmontonDate(now)) throw new Error('STALE_SPEND_DATA');
  if (!Number.isFinite(snapshot.learningSpendCad) || snapshot.learningSpendCad < 0) throw new Error('MISSING_ACCOUNT_SPEND');
  const accountStop = Number.isFinite(config.learningSpendLimitCad) && config.learningSpendLimitCad > 0 && snapshot.learningSpendCad >= config.learningSpendLimitCad;
  const ended = typeof config.startDate==='string' && Date.parse(`${snapshot.date}T00:00:00Z`)-Date.parse(`${config.startDate}T00:00:00Z`)>=config.durationDays*86400000;
  return snapshot.campaigns.filter((c: Json) => {
    if (!Number.isFinite(c.spendCad) || c.spendCad < 0) throw new Error('INVALID_SPEND');
    const setting = config.campaigns[c.name];
    if(setting?.budgetType==='TOTAL'){
      if(!(setting.totalBudgetCad>0))throw new Error('UNAPPROVED_CAMPAIGN_BUDGET');
      return c.status==='ENABLED'&&(ended||accountStop);
    }
    if (!(setting?.dailyBudgetCad > 0)) throw new Error('UNAPPROVED_CAMPAIGN_BUDGET');
    return c.status === 'ENABLED' && (ended || accountStop || c.spendCad >= setting.dailyBudgetCad*1.5);
  }).map((c: Json) => ({campaign:c.resourceName, reason:ended?'LEARNING_PERIOD_ENDED':accountStop?'LEARNING_SPEND_LIMIT':'DAILY_150_PERCENT', spendCad:c.spendCad}));
}
export function buildReport(events: Json[], delivery: Json[], date: string): Json {
  const rows = new Map<string, Json>();
  const get = (campaign: string, service: string) => {
    const key = `${campaign}:${service}`;
    if (!rows.has(key)) rows.set(key,{campaign,service,spendCad:null,clicks:null,impressions:null,uploads:0,qualifiedUploads:0,checkoutStarts:0,paidClients:0,revenueCad:0,taxCad:0});
    return rows.get(key)!;
  };
  for (const d of delivery) Object.assign(get(d.name,d.service),{spendCad:d.spendCad,clicks:d.clicks,impressions:d.impressions});
  for (const e of events.filter(e=>e.livemode!==false&&edmontonDate(Date.parse(e.occurred_at))===date)) {
    const r = get(e.attribution?.utm_campaign || 'unattributed',e.service);
    if (e.event_type==='ticket_uploaded') r.uploads++;
    if (e.event_type==='qualified_ticket_upload') r.qualifiedUploads++;
    if (e.event_type==='checkout_started') r.checkoutStarts++;
    if (e.event_type==='client_paid') {r.paidClients++;r.revenueCad+=Number(e.value_cents)/100;r.taxCad+=Number(e.tax_cents)/100;}
  }
  const campaigns: Json[] = [...rows.values()].map(r=>({...r,costPerQualifiedUpload:r.qualifiedUploads&&r.spendCad!==null?r.spendCad/r.qualifiedUploads:null,costPerPaidClient:r.paidClients&&r.spendCad!==null?r.spendCad/r.paidClients:null,paidStatus:r.paidClients?'Observed paid clients':'no paid conversions yet',signal:'Directional; no causal conclusion'}));
  return {date,paidStatus:events.some(e=>e.livemode!==false&&e.event_type==='client_paid'&&edmontonDate(Date.parse(e.occurred_at))===date)?'Observed paid clients':'no paid conversions yet',currency:'CAD',timezone:'America/Edmonton',campaigns,nextAction:!delivery.length?'Restore live account reporting before changing campaigns':campaigns.some(r=>r.campaign==='unattributed'&&r.paidClients)?'Check attribution on the next consented checkout':'Review the small irrelevant search-term list before proposing one change'};
}
export function learningRecommendation(events:Json[],dailyDelivery:Json[],now=Date.now()):string|null {
  const month=events.filter(e=>e.livemode!==false&&e.event_type==='client_paid'&&Date.parse(e.occurred_at)>=now-30*86400000);
  if(month.length>=15)return 'Propose Client Paid as the primary goal for owner approval; keep budgets fixed';
  const camera=dailyDelivery.filter(r=>r.name==='G-Search-Camera');
  const dates=new Set(camera.map(r=>r.date));
  if(dates.size>=7&&camera.reduce((n,r)=>n+r.impressions,0)/dates.size<100)return 'Propose folding the camera ad group into the officer campaign for owner approval. This is insufficient delivery, not proof of poor performance';
  return null;
}
export function weekKey(date:string):string {
  const day=new Date(`${date}T12:00:00Z`);day.setUTCDate(day.getUTCDate()+4-(day.getUTCDay()||7));
  const year=day.getUTCFullYear();const week=Math.ceil(((day.getTime()-Date.UTC(year,0,1))/86400000+1)/7);
  return `${year}-${String(week).padStart(2,'0')}`;
}
export function weeklyMemo(events:Json[],date:string,nextAction:string):string {
  const end=Date.parse(`${date}T12:00:00Z`);const begin=edmontonDate(end-6*86400000);
  const observed=events.filter(e=>e.livemode!==false&&edmontonDate(Date.parse(e.occurred_at))>=begin&&edmontonDate(Date.parse(e.occurred_at))<=date);
  const paid=observed.filter(e=>e.event_type==='client_paid');
  return `# Fabsy learning memo ${weekKey(date)}\n\nAvailable internal records for ${begin} through ${date}, CAD, America/Edmonton. No historical backfill; this may be a partial observation window.\n\n${observed.filter(e=>e.event_type==='ticket_uploaded').length} uploads; ${observed.filter(e=>e.event_type==='qualified_ticket_upload').length} qualified uploads; ${paid.length} live paid transactions. Recorded pre-tax revenue: $${(paid.reduce((n,e)=>n+Number(e.value_cents),0)/100).toFixed(2)} CAD. ${paid.length?'Observed transactions only.':'No paid conversions yet.'}\n\nEarly signals are directional. These records do not establish causation or statistical significance.\n\nOne proposed next action: ${nextAction}. Stage the exact change for owner approval. Budgets stay fixed.\n`;
}
