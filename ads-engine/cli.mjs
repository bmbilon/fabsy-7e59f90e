import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {config as loadEnv} from 'dotenv';
const root=fileURLToPath(new URL('../',import.meta.url));
loadEnv({path:path.join(root,'.env.local'),quiet:true});loadEnv({path:path.join(root,'.env'),quiet:true});
const engine=fileURLToPath(new URL('./',import.meta.url));
async function module(name){const r=await build({entryPoints:[path.join(engine,name)],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);}
const {digest,lint,buildReport}=await module('core.ts');
const {GoogleAds,planGoogle}=await module('platform/google.ts');
const config=JSON.parse(await readFile(path.join(engine,'config.json'),'utf8'));
const specs=await Promise.all(['G-Search-Officer','G-Search-Camera'].map(async n=>JSON.parse(await readFile(path.join(engine,'campaigns',`${n}.yaml`),'utf8'))));
const offers=JSON.parse(await readFile(path.join(root,'src/config/offers.json'),'utf8'));
const brief=await readFile(path.join(engine,'brief.md'),'utf8');
const [command='sync',...args]=process.argv.slice(2);
const option=name=>{const i=args.indexOf(`--${name}`);return i>=0?args[i+1]:null;};
const request=async(action,values={})=>{
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Supabase operator credentials required');
 const r=await fetch(`${process.env.SUPABASE_URL}/functions/v1/ads-engine`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',...(process.env.ADS_ENGINE_OPERATOR_SECRET?{'x-ads-operator-secret':process.env.ADS_ENGINE_OPERATOR_SECRET}:{})},body:JSON.stringify({action,...values}),signal:AbortSignal.timeout(55000)});
 const body=await r.json();if(!r.ok)throw new Error(body.error||'Ads worker unavailable');return body;
};
try {
 const errors=specs.flatMap(s=>lint(s,{officer:offers.rapidResolution.priceCad,camera:offers.photoRadar.priceCad}));
 if(errors.length)throw new Error(errors.join('; '));
 if(command==='sync'){
  let live=null,plan=null,hold='Live account access has not been checked';
  if(args.includes('--live-read')){const google=new GoogleAds(k=>process.env[k]);try{live=await google.snapshot();plan=planGoogle(specs,config,live);hold=null;}catch(e){hold=e.message;}}
  const proposed={dryRun:true,spendingAuthorized:false,specs,config,copyHash:await digest({specs,brief}),liveAccountHash:live?.hash||null,plan,hold};
  await writeFile(path.join(engine,'launch-dry-run.json'),JSON.stringify(proposed,null,2)+'\n');
  console.log(JSON.stringify({dryRun:true,pausedDrafts:specs.map(s=>s.name),keywordCounts:specs.map(s=>s.groups.reduce((n,g)=>n+g.keywords.length,0)),hold,output:'ads-engine/launch-dry-run.json'},null,2));
 }else if(command==='stage'){
  const limit=Number(option('learning-limit'));const start=option('start');
  const proposed={...config,learningSpendLimitCad:limit>0?limit:null,startDate:start,spendingAuthorized:true};
  console.log(JSON.stringify(await request('stage',{config:proposed,specs,brief}),null,2));
 }else if(command==='apply'||command==='launch'){
  const id=args[0];if(!id)throw new Error('Approved batch ID required');
  console.log(JSON.stringify(await request(command==='apply'?'sync':'launch',{id,dryRun:!args.includes('--execute')}),null,2));
 }else if(command==='revert'){
  if(!args[0]||!option('batch'))throw new Error('Usage: revert <action_id> --batch <approved_batch_id>. Stages rollback for review.');
  console.log(JSON.stringify(await request('stage-revert',{id:option('batch'),actionId:args[0]}),null,2));
 }else if(command==='pause'){
  if(!args.includes('--execute'))console.log(JSON.stringify({dryRun:true,proposed:'Pause approved campaigns'}));
  else console.log(JSON.stringify(await request('pause'),null,2));
 }else if(command==='report'){
  const report=args.includes('--local')?buildReport([],[],new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton'}).format(new Date())):await request('report');
  await writeFile(path.join(engine,'daily-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
 }else if(command==='memo'){
  const status=await request('status');const latest=status.reports[0];if(!latest)throw new Error('No observed report yet');
  const d=new Date(`${latest.date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const year=d.getUTCFullYear(),week=Math.ceil(((d-new Date(Date.UTC(year,0,1)))/86400000+1)/7);
  const dest=path.join(engine,'learnings',`${year}-${String(week).padStart(2,'0')}.md`);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,latest.memo);console.log(dest);
 }else throw new Error('Commands: sync [--live-read], stage --learning-limit <CAD> --start <YYYY-MM-DD>, apply <batch> [--execute], launch <batch> [--execute], revert <action> --batch <approved batch>, pause [--execute], report [--local], memo');
} catch(e){console.error(e.message);process.exitCode=1;}
