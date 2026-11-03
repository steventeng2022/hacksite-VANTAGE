import {missions,missionTracks,totalPoints} from './catalog.mjs';
import {icon,escapeHTML} from './icons.mjs';
import {navItems,pageFactories} from './views.mjs';

const runtime=document.documentElement.dataset.runtime||'browser';
const storageKey='vantage_range_state_v2',connectionKey='vantage_range_connection_v2';
let service=null,LabServiceClass=null,token='',lastRequest=null,lastResponse=null;
let progress={completed:[],evidence:{},points:0,totalPoints,total:missions.length};
const context={};

export const presets=[
  {group:'Baseline',name:'目前操作員',method:'GET',path:'/api/me',body:{}},
  {group:'Identity',name:'建立裝置授權',method:'POST',path:'/oauth/device/code',body:{clientId:'field-tablet',audience:'telemetry.read'}},
  {group:'Identity',name:'核准最近裝置代碼',method:'POST',path:'/oauth/device/approve',body:()=>({userCode:context.userCode||'RUN DEVICE CODE FIRST'})},
  {group:'Identity',name:'以不同 audience 兌換',method:'POST',path:'/oauth/token',body:()=>({deviceCode:context.deviceCode||'RUN DEVICE CODE FIRST',clientId:'orbital-console',audience:'mission.control'})},
  {group:'GraphQL',name:'暖入 Partner persisted query',method:'POST',path:'/graphql',headers:{'X-Partner-Context':'meridian'},body:{id:'pq-mission-snapshot-v1',variables:{missionId:'perigee-12'}}},
  {group:'GraphQL',name:'以目前租戶讀相同 query',method:'POST',path:'/graphql',body:{id:'pq-mission-snapshot-v1',variables:{missionId:'aurora-7'}}},
  {group:'Events',name:'建立事件流連線',method:'POST',path:'/api/events/connect',body:{}},
  {group:'Events',name:'訂閱 Partner command topic',method:'POST',path:'/api/events/subscribe',body:()=>({connectionId:context.connectionId||'CONNECT FIRST',topic:'tenant/meridian/mission/perigee-12/commands'})},
  {group:'Integrity',name:'驗證重複欄位遙測',method:'POST',path:'/api/telemetry/validate',body:{signature:'training-signature',raw:'{"packetId":"pkt-4418","thrust":2,"thrust":9}'}},
  {group:'Integrity',name:'查看 Webhook deliveries',method:'GET',path:'/api/webhooks/deliveries',body:{}},
  {group:'Integrity',name:'重播 maintenance event',method:'POST',path:'/api/webhooks/replay',body:{eventId:'evt_mro_8841'}},
  {group:'Integrity',name:'跨 issuer 驗證 manifest',method:'POST',path:'/api/manifests/verify',body:{issuer:'https://keys.northstar.invalid',kid:'ops-2026',targetTenant:'meridian',manifest:{missionId:'perigee-12',commandDigest:'sha256:fc92'}}},
  {group:'Artifacts',name:'建立 Northstar capability',method:'POST',path:'/api/artifacts/capability',body:{object:'northstar/aurora/calibration-v4.bin'}},
  {group:'Artifacts',name:'替換 capability object',method:'GET',path:()=>`/api/artifacts/download?cap=${encodeURIComponent(context.capability||'CREATE CAPABILITY FIRST')}&object=meridian%2Fperigee%2Fflight-core-9.bin`,body:{}},
  {group:'Command',name:'讀取雙人核准',method:'GET',path:'/api/approvals/apr_burn_72',body:{}},
  {group:'Command',name:'平行送出同一核准者',method:'POST',path:'/api/approvals/apr_burn_72/parallel',body:()=>({version:context.approvalVersion||7,requests:[{operatorId:'op_elena'},{operatorId:'op_elena'}]})},
  {group:'Policy',name:'匯入特殊偏好鍵',method:'POST',path:'/api/preferences/import',body:{preferences:'{"theme":"orbital-dark","__proto__":{"allowUnattendedUplink":true}}'}},
  {group:'Finale',name:'組合目前 evidence',method:'POST',path:'/api/uplink/authorize',body:()=>({missionId:progress.evidence.cache?.missionId||'perigee-12',targetSpacecraft:'AURORA-7',windowNonce:progress.evidence.echo?.windowNonce||'COLLECT ECHO EVIDENCE',artifactDigest:progress.evidence.cargo?.digest||'COLLECT ARTIFACT EVIDENCE',approvalCapability:progress.evidence.twin?.capabilities?.[0]||'COLLECT APPROVAL EVIDENCE',policyOverride:true})}
];

async function transport(args){
  if(runtime==='browser'){
    const result=await service.request(args);localStorage.setItem(storageKey,JSON.stringify(service.snapshot()));return result;
  }
  const headers={'content-type':'application/json',...(args.headers||{})},base=new URL('./',location.href);base.hash='';
  const endpoint=new URL(args.path.replace(/^\//,''),base),method=(args.method||'GET').toUpperCase();
  const response=await fetch(endpoint,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(args.body||{})})});return response.json();
}
async function api(method,path,body={},headers={}){
  if(!path.startsWith('/')||path.includes('://'))return {status:400,body:{error:'Only relative training paths are allowed.'},proof:[]};
  return transport({method,path,body,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...headers}});
}
async function ensureSession(){
  if(runtime==='http')token=sessionStorage.getItem(connectionKey)||'';
  if(token){const current=await api('GET','/api/me');if(current.status===200)return}
  const session=await api('POST','/api/demo/session');if(session.status===200){token=session.body.token;if(runtime==='http')sessionStorage.setItem(connectionKey,token)}
}
async function refreshProgress(){
  const result=await api('GET','/api/lab/progress');if(result.status===200)progress=result.body;
  const count=progress.completed.length;document.querySelector('#lab-progress-mini').textContent=`${count}/${missions.length}`;document.querySelector('#lab-progress-top').textContent=`${count}/${missions.length}`;renderLab();
}

const route=()=>location.hash.replace(/^#\/?/,'').split('?')[0]||'';
const titleFor=id=>navItems.find(item=>item.id===id)?.label||'Operations Overview';
function renderNav(){const current=route();document.querySelector('#primary-nav').innerHTML=`<span class="nav-label">MISSION CONTROL</span>${navItems.map(item=>`<a href="#/${item.id}" class="${current===item.id?'active':''}">${icon(item.icon)}<span>${item.label}</span>${item.badge?`<b>${item.badge}</b>`:''}</a>`).join('')}`}
function render(){
  const id=route(),factory=pageFactories[id]||pageFactories[''],title=titleFor(id);document.title=`${title} · VANTAGE`;document.querySelector('#route-title').textContent=title;renderNav();
  document.querySelector('#main').innerHTML=factory({runtime,token,progress,totalPoints,presets});if(id==='console')wireConsole();window.scrollTo?.({top:0,behavior:'instant'});
}

const missionUnlocked=mission=>mission.requires.every(id=>progress.completed.includes(id));
function renderLab(){
  const summary=document.querySelector('#lab-summary'),container=document.querySelector('#lab-missions');if(!summary||!container)return;const percent=Math.round(progress.completed.length/missions.length*100);
  summary.innerHTML=`<div class="score-ring" style="--progress:${percent*3.6}deg"><span><b>${progress.completed.length}</b><small>/ ${missions.length}</small></span></div><div><span>CHAIN OBJECTIVES</span><b>${progress.points.toLocaleString()} / ${totalPoints.toLocaleString()} PTS</b><div class="progress-line"><i style="width:${percent}%"></i></div><small>${percent}% of the research matrix resolved</small></div>`;
  container.innerHTML=missionTracks.map(track=>`<section><header><span>${track.label}</span><b>${missions.filter(m=>m.track===track.id&&progress.completed.includes(m.id)).length}/${missions.filter(m=>m.track===track.id).length}</b></header>${missions.filter(m=>m.track===track.id).map(mission=>missionCard(mission)).join('')}</section>`).join('');
  container.querySelectorAll('.mission-toggle').forEach(button=>button.addEventListener('click',()=>button.closest('.mission-card').classList.toggle('expanded')));container.querySelectorAll('.load-console').forEach(link=>link.addEventListener('click',closeLab));
}
function missionCard(mission){
  const done=progress.completed.includes(mission.id),locked=!done&&!missionUnlocked(mission);
  return `<article class="mission-card ${done?'complete':locked?'locked':''}" data-mission="${mission.id}"><button class="mission-toggle" type="button" ${locked?'disabled':''}><span class="mission-state">${done?icon('check'):locked?icon('lock'):mission.number}</span><span><small>${mission.code}</small><b>${mission.title}</b><em>${mission.points} PTS · ${mission.cwe}</em></span><i>⌄</i></button><div class="mission-detail"><div><span>RESEARCH OBJECTIVE</span><p>${mission.target}</p></div><div><span>EXPECTED CONTROL</span><p>${mission.normal}</p></div><div class="evidence-needed"><span>EVIDENCE TO COLLECT</span><p>${mission.evidence}</p></div>${done?`<div class="finding"><span>ROOT CAUSE</span><p>${mission.root}</p></div><div class="remediation"><span>SECURE DESIGN</span><p>${mission.fix}</p></div>`:`<details><summary>Reveal one hint</summary><p>${mission.hint}</p></details>`}<a href="#/console" class="load-console">${done?'Review in console':'Open console'} ↗</a></div></article>`;
}

function openLab(){document.querySelector('#lab-backdrop').hidden=false;const drawer=document.querySelector('#lab-drawer');drawer.setAttribute('aria-hidden','false');drawer.classList.add('open');document.body.classList.add('drawer-open');document.querySelector('#lab-close').focus()}
function closeLab(){document.querySelector('#lab-backdrop').hidden=true;const drawer=document.querySelector('#lab-drawer');drawer.setAttribute('aria-hidden','true');drawer.classList.remove('open');document.body.classList.remove('drawer-open')}
function toast(title,message,type='success'){const node=document.createElement('div');node.className=`toast ${type}`;node.innerHTML=`<span>${type==='success'?'✓':'!'}</span><div><b>${escapeHTML(title)}</b><small>${escapeHTML(message)}</small></div>`;document.querySelector('#toast-region').append(node);setTimeout(()=>node.remove(),5000)}

function resolvePreset(index){const preset=presets[Number(index)];if(!preset)return null;return {...preset,path:typeof preset.path==='function'?preset.path():preset.path,body:typeof preset.body==='function'?preset.body():preset.body,headers:preset.headers||{}}}
function wireConsole(){
  document.querySelector('#preset-select').addEventListener('change',event=>{const preset=resolvePreset(event.target.value);if(!preset)return;document.querySelector('#request-method').value=preset.method;document.querySelector('#request-path').value=preset.path;document.querySelector('#request-headers').value=JSON.stringify(preset.headers,null,2);document.querySelector('#request-body').value=JSON.stringify(preset.body,null,2)});
  document.querySelector('#restore-token').addEventListener('click',()=>document.querySelector('#request-token').value=token);document.querySelector('#send-request').addEventListener('click',sendConsoleRequest);
  document.querySelector('#format-request').addEventListener('click',()=>{for(const id of ['request-headers','request-body']){const field=document.querySelector(`#${id}`);try{field.value=JSON.stringify(JSON.parse(field.value),null,2)}catch{toast('JSON 格式錯誤',`${id==='request-body'?'Body':'Headers'} 不是有效 JSON`,'error')}}});
  document.querySelector('#copy-response').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.querySelector('#response-body').textContent);toast('已複製','Response JSON 已複製到剪貼簿')}catch{toast('無法複製','請手動選取 response 內容','error')}});
}
async function sendConsoleRequest(){
  const send=document.querySelector('#send-request'),method=document.querySelector('#request-method').value,path=document.querySelector('#request-path').value.trim();let headers={},body={};
  try{headers=JSON.parse(document.querySelector('#request-headers').value||'{}');body=JSON.parse(document.querySelector('#request-body').value||'{}')}catch{toast('JSON 格式錯誤','請檢查 Headers 與 Body','error');return}
  const suppliedToken=document.querySelector('#request-token').value.trim();if(suppliedToken)headers.authorization=`Bearer ${suppliedToken}`;send.disabled=true;send.innerHTML='SENDING <span>···</span>';const started=performance.now();
  try{
    lastRequest={method,path,headers,body};lastResponse=await transport({method,path,headers,body});captureContext(lastResponse);const elapsed=Math.max(1,Math.round(performance.now()-started));
    document.querySelector('#response-body').textContent=JSON.stringify(lastResponse.body,null,2);document.querySelector('#response-meta').innerHTML=`<span class="http-status ${lastResponse.status<400?'ok':'bad'}">${lastResponse.status}</span><span>${elapsed} ms</span><span>${JSON.stringify(lastResponse.body).length} B</span>`;
    const proofs=lastResponse.proof||[];document.querySelector('#response-proof').textContent=proofs.length?`PROOF · ${proofs.join(' · ').toUpperCase()}`:'NO NEW PROOF SIGNAL';document.querySelector('#response-proof').className=proofs.length?'has-proof':'';document.querySelector('#resolver-trace').innerHTML=traceMarkup(lastResponse,path,headers);
    if(proofs.length){await refreshProgress();for(const id of proofs){const mission=missions.find(item=>item.id===id);toast('Research signal collected',`${mission?.code||id} · ${mission?.points||0} pts`)}render()}
    else if(lastResponse.status>=400)toast('Request rejected',lastResponse.body?.error||lastResponse.body?.errors?.[0]?.message||`HTTP ${lastResponse.status}`,'error');
  }catch(error){document.querySelector('#response-body').textContent=JSON.stringify({error:error.message},null,2);toast('Transport error',error.message,'error')}
  finally{const current=document.querySelector('#send-request');if(current){current.disabled=false;current.innerHTML='SEND <span>↗</span>'}}
}
function captureContext(result){const body=result.body||{};if(body.deviceCode){context.deviceCode=body.deviceCode;context.userCode=body.userCode}if(body.token&&body.audience==='mission.control'){token=body.token;context.researchToken=body.token}if(body.connectionId)context.connectionId=body.connectionId;if(body.capability)context.capability=body.capability;if(body.etag)context.approvalVersion=Number(body.etag)}
function traceMarkup(result,path,headers){const extensions=result.body?.extensions,proofs=result.proof||[],rows=[['REQUEST',`${lastRequest?.method||'GET'} ${path}`],['PRINCIPAL',headers.authorization?'synthetic bearer attached':'anonymous'],['TENANT CONTEXT',headers['X-Partner-Context']||headers['x-partner-context']||'token claim'],['POLICY',result.status<400?'allow / observe':'deny'],['PROOF SIGNAL',proofs.join(', ')||'none']];if(extensions?.cache)rows.push(['CACHE',`${extensions.cache} · ${extensions.cacheKey}`]);return rows.map(([label,value])=>`<div><span>${escapeHTML(label)}</span><small>${escapeHTML(value)}</small></div>`).join('')}

function openPalette(){const dialog=document.querySelector('#command-palette');renderPalette('');dialog.showModal();setTimeout(()=>document.querySelector('#palette-input').focus(),0)}
function renderPalette(query){const value=query.toLowerCase(),matches=navItems.filter(item=>item.label.toLowerCase().includes(value)||item.id.includes(value));document.querySelector('#palette-results').innerHTML=matches.map(item=>`<a href="#/${item.id}" data-close-palette>${icon(item.icon)}<span><b>${item.label}</b><small>Navigate to ${item.label}</small></span><kbd>↵</kbd></a>`).join('');document.querySelectorAll('[data-close-palette]').forEach(link=>link.addEventListener('click',()=>document.querySelector('#command-palette').close()))}
async function resetRange(){if(runtime==='browser'){service=new LabServiceClass();localStorage.removeItem(storageKey)}else{await api('POST','/api/lab/reset');sessionStorage.removeItem(connectionKey);token='';await ensureSession()}progress={completed:[],evidence:{},points:0,totalPoints,total:missions.length};Object.keys(context).forEach(key=>delete context[key]);await refreshProgress();render();toast('模擬已重設','所有 evidence 與臨時權杖已清除')}
function wireGlobal(){
  document.querySelectorAll('#lab-open,#lab-open-secondary').forEach(button=>button.addEventListener('click',openLab));document.querySelector('#lab-close').addEventListener('click',closeLab);document.querySelector('#lab-backdrop').addEventListener('click',closeLab);
  document.querySelector('#lab-reset').addEventListener('click',()=>document.querySelector('#confirm-reset').showModal());document.querySelector('#confirm-reset').addEventListener('close',event=>{if(event.target.returnValue==='confirm')resetRange()});
  document.querySelector('#global-search').addEventListener('click',openPalette);document.querySelector('#palette-input').addEventListener('input',event=>renderPalette(event.target.value));document.addEventListener('click',event=>{if(event.target.closest('[data-open-lab]'))openLab()});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openPalette()}if(event.key==='Escape'&&document.querySelector('#lab-drawer').classList.contains('open'))closeLab()});addEventListener('hashchange',render);
}
function updateClock(){document.querySelector('#utc-time').textContent=new Date().toISOString().slice(11,19)}

async function boot(){
  if(runtime==='browser'){const module=await import('./engine.mjs');LabServiceClass=module.LabService;let saved;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{saved=null}service=new LabServiceClass(saved)}
  document.querySelector('#runtime-label').textContent=runtime==='http'?'LOOPBACK HTTP':'BROWSER SIMULATION';await ensureSession();await refreshProgress();wireGlobal();render();updateClock();const clock=setInterval(updateClock,1000);clock?.unref?.();document.body.classList.add('ready');return true;
}

window.__vantageReady=boot();
