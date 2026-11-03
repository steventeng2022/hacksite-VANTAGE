import {currentOperator,seedState} from './fixtures.mjs';
import {missions,scoreFor,totalPoints} from './catalog.mjs';

const encoder=new TextEncoder();
const browserSecret='vantage-browser-training-secret-v2';
const b64=value=>{
  const bytes=typeof value==='string'?encoder.encode(value):value;
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const fromB64=value=>{
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');
  const binary=atob(normalized);return Uint8Array.from(binary,c=>c.charCodeAt(0));
};
async function sign(value,secret){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))));
}
export async function issueToken(claims,secret=browserSecret){
  const header=b64(JSON.stringify({alg:'HS256',typ:'JWT',kid:'range-2026'}));
  const payload=b64(JSON.stringify({...claims,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600}));
  return `${header}.${payload}.${await sign(`${header}.${payload}`,secret)}`;
}
export async function verifyToken(token,secret=browserSecret){
  try{
    const [header,payload,signature,...rest]=String(token||'').split('.');if(rest.length||!header||!payload||!signature)return null;
    if(await sign(`${header}.${payload}`,secret)!==signature)return null;
    const claims=JSON.parse(new TextDecoder().decode(fromB64(payload)));
    if(claims.exp<Math.floor(Date.now()/1000))return null;
    return claims;
  }catch{return null}
}
const clone=value=>JSON.parse(JSON.stringify(value));
const headerMap=headers=>Object.fromEntries(Object.entries(headers||{}).map(([key,value])=>[key.toLowerCase(),String(value)]));
const response=(status,body,proof=[])=>({status,body,proof});
const randomId=prefix=>`${prefix}_${crypto.randomUUID().replaceAll('-','').slice(0,12)}`;

function restoreState(saved){
  const state=seedState();
  if(!saved||saved.schemaVersion!==2)return state;
  state.completed=Array.isArray(saved.completed)?saved.completed.filter(id=>missions.some(item=>item.id===id)):[];
  state.evidence=saved.evidence&&typeof saved.evidence==='object'?clone(saved.evidence):{};
  state.issuedTokens=Array.isArray(saved.issuedTokens)?clone(saved.issuedTokens):[];
  state.deviceGrants=new Map(Array.isArray(saved.deviceGrants)?saved.deviceGrants:[]);
  state.queryCache=new Map(Array.isArray(saved.queryCache)?saved.queryCache:[]);
  state.processedEvents=new Set(Array.isArray(saved.processedEvents)?saved.processedEvents:['evt_mro_8841']);
  state.windows=saved.windows?clone(saved.windows):state.windows;
  state.approval=saved.approval?clone(saved.approval):state.approval;
  state.inheritedPolicy=Boolean(saved.inheritedPolicy);
  state.webhookAttempts=saved.webhookAttempts?clone(saved.webhookAttempts):state.webhookAttempts;
  state.requestCount=Number(saved.requestCount)||0;
  return state;
}

export class LabService{
  constructor(saved,{secret=browserSecret}={}){this.secret=secret;this.state=restoreState(saved)}
  snapshot(){
    const state=this.state;
    return {schemaVersion:2,completed:[...state.completed],evidence:clone(state.evidence),issuedTokens:clone(state.issuedTokens),deviceGrants:[...state.deviceGrants.entries()],queryCache:[...state.queryCache.entries()],processedEvents:[...state.processedEvents],windows:clone(state.windows),approval:clone(state.approval),inheritedPolicy:state.inheritedPolicy,webhookAttempts:clone(state.webhookAttempts),requestCount:state.requestCount,points:scoreFor(state.completed),totalPoints};
  }
  complete(id,evidence){
    if(!this.state.completed.includes(id))this.state.completed.push(id);
    this.state.evidence[id]=clone(evidence);
    return [id];
  }
  async principal(headers){
    const authorization=headerMap(headers).authorization||'';
    if(!authorization.startsWith('Bearer '))return null;
    return verifyToken(authorization.slice(7),this.secret);
  }
  async request({method='GET',path='',headers={},body={}}={}){
    method=String(method).toUpperCase();
    if(typeof path!=='string'||path.includes('://')||(!path.startsWith('/api/')&&!path.startsWith('/oauth/')&&path!=='/graphql'))return response(400,{error:'Only relative VANTAGE training endpoints are accepted.'});
    let url;try{url=new URL(path,'https://range.vantage.invalid')}catch{return response(400,{error:'Invalid path'})}
    const clean=url.pathname;this.state.requestCount++;

    if(method==='POST'&&clean==='/api/demo/session'){
      const token=await issueToken({sub:currentOperator.id,tenantId:currentOperator.tenantId,missionId:currentOperator.missionId,role:currentOperator.role,aud:'telemetry.read'},this.secret);
      this.state.issuedTokens.push({kind:'session',token,tenantId:'northstar',aud:'telemetry.read'});
      return response(200,{token,user:currentOperator,expiresIn:3600});
    }
    if(method==='GET'&&clean==='/api/lab/progress')return response(200,{completed:[...this.state.completed],evidence:clone(this.state.evidence),points:scoreFor(this.state.completed),totalPoints,total:missions.length});

    const principal=await this.principal(headers);
    if(!principal)return response(401,{error:'A valid synthetic training token is required.'});
    if(method==='GET'&&clean==='/api/me')return response(200,{user:{...currentOperator,tenantId:principal.tenantId,role:principal.role},claims:principal});

    if(method==='POST'&&clean==='/oauth/device/code'){
      const clientId=String(body.clientId||'field-tablet');
      const audience=String(body.audience||'telemetry.read');
      const deviceCode=randomId('dev'),userCode=`ORBIT-${Math.floor(1000+Math.random()*9000)}`;
      this.state.deviceGrants.set(deviceCode,{deviceCode,userCode,clientId,audience,tenantId:principal.tenantId,approved:false,used:false});
      return response(200,{deviceCode,userCode,verificationUri:'https://login.vantage.invalid/device',clientId,audience,expiresIn:600});
    }
    if(method==='POST'&&clean==='/oauth/device/approve'){
      const grant=[...this.state.deviceGrants.values()].find(item=>item.userCode===body.userCode);
      if(!grant)return response(404,{error:'Unknown device code'});grant.approved=true;
      return response(200,{approved:true,userCode:grant.userCode,clientId:grant.clientId,audience:grant.audience});
    }
    if(method==='POST'&&clean==='/oauth/token'){
      const grant=this.state.deviceGrants.get(String(body.deviceCode||''));
      if(!grant||!grant.approved)return response(400,{error:'Grant is not approved'});
      if(grant.used)return response(409,{error:'Grant has already been consumed'});
      grant.used=true;
      const requestedClient=String(body.clientId||grant.clientId),requestedAudience=String(body.audience||grant.audience);
      const token=await issueToken({sub:principal.sub,tenantId:grant.tenantId,missionId:'aurora-7',role:'mission_operator',clientId:requestedClient,aud:requestedAudience},this.secret);
      this.state.issuedTokens.push({kind:'device',token,tenantId:grant.tenantId,aud:requestedAudience,clientId:requestedClient});
      const confused=requestedClient!==grant.clientId||requestedAudience!==grant.audience;
      const proof=confused?this.complete('ghost',{token,issuedAudience:requestedAudience,originalAudience:grant.audience,issuedClient:requestedClient,originalClient:grant.clientId}):[];
      return response(200,{token,tokenType:'Bearer',audience:requestedAudience,clientId:requestedClient,binding:{grantClient:grant.clientId,grantAudience:grant.audience}},proof);
    }

    if(method==='POST'&&clean==='/graphql'){
      if(body.id!=='pq-mission-snapshot-v1')return response(400,{errors:[{message:'Only registered training operations are available.'}]});
      const cacheKey=body.id;
      if(this.state.queryCache.has(cacheKey)){
        const cached=clone(this.state.queryCache.get(cacheKey));
        const leaked=cached.tenantId!==principal.tenantId;
        const proof=leaked?this.complete('cache',{missionId:cached.mission.id,tenantId:cached.tenantId,cacheKey,resolverTrace:cached.trace}):[];
        return response(200,{data:{missionSnapshot:cached.mission},extensions:{cache:'HIT',cacheKey,resolverTrace:cached.trace,principalTenant:principal.tenantId}},proof);
      }
      const partner=headerMap(headers)['x-partner-context'];
      const requested=body.variables?.missionId||'aurora-7';
      let mission;
      if(requested==='perigee-12'&&partner==='meridian'&&principal.aud==='mission.control')mission={id:'perigee-12',codename:'PERIGEE-12',tenantId:'meridian',classification:'PARTNER RESTRICTED',station:'Svalbard-3'};
      else if(requested==='aurora-7')mission={id:'aurora-7',codename:'AURORA-7',tenantId:'northstar',classification:'INTERNAL',station:'Svalbard-3'};
      else return response(403,{errors:[{message:'Mission context is outside this principal.'}]});
      const trace=[{resolver:'Query.missionSnapshot',tenant:partner||principal.tenantId,decision:'allow'},{resolver:'Mission.classification',tenantCheck:'inherited'}];
      this.state.queryCache.set(cacheKey,{tenantId:mission.tenantId,mission,trace});
      return response(200,{data:{missionSnapshot:mission},extensions:{cache:'MISS',cacheKey,resolverTrace:trace,principalTenant:principal.tenantId}});
    }

    if(method==='POST'&&clean==='/api/events/connect'){
      const connectionId=randomId('stream');
      this.state.evidence.connection={connectionId,tenantId:principal.tenantId,sub:principal.sub};
      return response(200,{connectionId,claims:{sub:principal.sub,tenantId:principal.tenantId},authorizedTopics:[`tenant/${principal.tenantId}/mission/aurora-7/telemetry`]});
    }
    if(method==='POST'&&clean==='/api/events/subscribe'){
      if(body.connectionId!==this.state.evidence.connection?.connectionId)return response(404,{error:'Connection is not active'});
      const topic=String(body.topic||'');
      const foreign=topic==='tenant/meridian/mission/perigee-12/commands';
      if(!foreign&&!topic.startsWith(`tenant/${principal.tenantId}/`))return response(403,{error:'Topic is outside this connection.'});
      if(foreign){
        const event={type:'COMMAND_WINDOW_OPEN',missionId:'perigee-12',tenantId:'meridian',windowNonce:this.state.windows.meridian.nonce,cursor:'mro:8841:02'};
        return response(200,{topic,policyDecision:'handshake-only',events:[event]},this.complete('echo',{topic,windowNonce:event.windowNonce,cursor:event.cursor}));
      }
      return response(200,{topic,policyDecision:'allow',events:[{type:'TELEMETRY_FRAME',missionId:'aurora-7',sequence:44182}]});
    }

    if(method==='POST'&&clean==='/api/telemetry/validate'){
      const raw=String(body.raw||'');
      if(body.signature!=='training-signature')return response(401,{error:'Synthetic signature did not match'});
      const values=[...raw.matchAll(/"thrust"\s*:\s*(-?\d+(?:\.\d+)?)/g)].map(match=>Number(match[1]));
      if(!values.length)return response(400,{error:'A thrust field is required'});
      let parsed;try{parsed=JSON.parse(raw)}catch{return response(400,{error:'Payload must be valid JSON'});}
      const verifiedValue=values[0],processedValue=parsed.thrust;
      const split=values.length>1&&verifiedValue!==processedValue;
      const proof=split?this.complete('canon',{verifiedValue,processedValue,duplicateFields:values.length,packetId:parsed.packetId||'pkt-unknown'}):[];
      return response(200,{signature:'valid',canonicalPreview:{thrust:verifiedValue},processorResult:{thrust:processedValue},duplicateFieldCount:values.length},proof);
    }

    if(method==='GET'&&clean==='/api/webhooks/deliveries')return response(200,{deliveries:[{eventId:'evt_mro_8841',type:'MAINTENANCE_WINDOW_APPROVED',tenantId:'meridian',processed:true,attempts:this.state.webhookAttempts.evt_mro_8841,timestamp:'2026-11-03T20:35:08Z'}]});
    if(method==='POST'&&clean==='/api/webhooks/replay'){
      const eventId=String(body.eventId||'');if(eventId!=='evt_mro_8841')return response(404,{error:'Delivery not found'});
      this.state.webhookAttempts[eventId]=(this.state.webhookAttempts[eventId]||1)+1;
      this.state.windows.meridian.open=true;
      const proof=this.state.processedEvents.has(eventId)?this.complete('replay',{eventId,attempts:this.state.webhookAttempts[eventId],windowNonce:this.state.windows.meridian.nonce}):[];
      return response(202,{accepted:true,eventId,attempt:this.state.webhookAttempts[eventId],sideEffect:{commandWindow:'open',tenantId:'meridian'}},proof);
    }

    if(method==='POST'&&clean==='/api/manifests/verify'){
      const kid=String(body.kid||''),issuer=String(body.issuer||''),targetTenant=String(body.targetTenant||'');
      if(kid!=='ops-2026')return response(400,{error:'Unknown key id'});
      const cachedKey={kid,issuer,tenantId:issuer.includes('northstar')?'northstar':'meridian',alg:'ES256'};
      const accepted=body.manifest?.missionId&&(targetTenant==='northstar'||targetTenant==='meridian');
      if(!accepted)return response(400,{error:'Invalid training manifest'});
      const confused=cachedKey.tenantId!==targetTenant;
      const proof=confused?this.complete('keydrift',{kid,issuer,targetTenant,cacheLookupKey:kid,manifestMission:body.manifest.missionId}):[];
      return response(200,{valid:true,targetTenant,keyResolution:{cacheKey:kid,resolvedIssuer:cachedKey.issuer,resolvedTenant:cachedKey.tenantId},manifest:body.manifest},proof);
    }

    if(method==='POST'&&clean==='/api/artifacts/capability'){
      const object=String(body.object||'');const artifact=this.state.artifacts[object];
      if(!artifact||artifact.tenantId!==principal.tenantId)return response(403,{error:'Artifact is outside this principal.'});
      const claims={bucket:'flight-packages',exp:Math.floor(Date.now()/1000)+900,method:'GET'};
      const payload=b64(JSON.stringify(claims)),signature=await sign(payload,this.secret),capability=`${payload}.${signature}`;
      this.state.evidence.artifactCapability={capability,originalObject:object,claims};
      return response(201,{capability,claims,object});
    }
    if(method==='GET'&&clean==='/api/artifacts/download'){
      const capability=url.searchParams.get('cap')||'',object=url.searchParams.get('object')||'';
      const [payload,signature]=capability.split('.');if(!payload||!signature||await sign(payload,this.secret)!==signature)return response(401,{error:'Capability signature is invalid'});
      const claims=JSON.parse(new TextDecoder().decode(fromB64(payload)));if(claims.exp<Math.floor(Date.now()/1000))return response(401,{error:'Capability expired'});
      const artifact=this.state.artifacts[object];if(!artifact)return response(404,{error:'Artifact not found'});
      const swapped=object!==this.state.evidence.artifactCapability?.originalObject;
      const proof=swapped?this.complete('cargo',{object,tenantId:artifact.tenantId,digest:artifact.digest,capabilityClaims:claims}):[];
      return response(200,{artifact:{...artifact,object},capabilityClaims:claims,download:'metadata-only-in-training-range'},proof);
    }

    if(method==='GET'&&clean==='/api/approvals/apr_burn_72')return response(200,{approval:clone(this.state.approval),etag:String(this.state.approval.version)});
    if(method==='POST'&&clean==='/api/approvals/apr_burn_72/parallel'){
      if(Number(body.version)!==this.state.approval.version)return response(409,{error:'Approval version changed',currentVersion:this.state.approval.version});
      const requests=Array.isArray(body.requests)?body.requests:[];if(requests.length!==2)return response(400,{error:'Parallel simulator requires exactly two requests'});
      const snapshotVersion=this.state.approval.version;
      const results=[];
      for(const item of requests){
        const operatorId=String(item.operatorId||principal.sub);const capability=`cmdcap_${snapshotVersion}_${operatorId}_${randomId('x').slice(-5)}`;
        results.push({status:201,operatorId,observedVersion:snapshotVersion,capability});this.state.approval.capabilities.push(capability);
      }
      this.state.approval.approvers.push(...requests.map(item=>String(item.operatorId||principal.sub)));
      this.state.approval.version++;this.state.approval.state='approved';
      const duplicate=new Set(this.state.approval.approvers).size<this.state.approval.approvers.length;
      const proof=duplicate&&results.length===2?this.complete('twin',{approvalId:this.state.approval.id,observedVersion:snapshotVersion,capabilities:results.map(item=>item.capability),approvers:this.state.approval.approvers}):[];
      return response(207,{parallel:true,results,approval:clone(this.state.approval)},proof);
    }

    if(method==='POST'&&clean==='/api/preferences/import'){
      let preferences=body.preferences;
      if(typeof preferences==='string'){try{preferences=JSON.parse(preferences)}catch{return response(400,{error:'Preferences must be valid JSON'})}}
      if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))return response(400,{error:'Preferences must be an object'});
      const polluted=Object.prototype.hasOwnProperty.call(preferences,'__proto__')&&preferences.__proto__?.allowUnattendedUplink===true;
      if(polluted)this.state.inheritedPolicy=true;
      const proof=polluted?this.complete('debris',{importedKeys:Object.keys(preferences),policyPreview:{allowUnattendedUplink:true,propertySource:'inherited'}}):[];
      return response(200,{imported:true,uiPreferences:{theme:preferences.theme||'orbital-dark'},policyPreview:{allowUnattendedUplink:this.state.inheritedPolicy,propertySource:this.state.inheritedPolicy?'inherited':'default'}},proof);
    }

    if(method==='POST'&&clean==='/api/uplink/authorize'){
      const needed=['echo','replay','cargo','twin','debris'];
      if(!needed.every(id=>this.state.completed.includes(id)))return response(412,{error:'Required evidence chains are incomplete',missing:needed.filter(id=>!this.state.completed.includes(id))});
      const checks={
        mission:Boolean(body.missionId&&body.missionId===this.state.evidence.cache?.missionId),
        window:Boolean(body.windowNonce&&body.windowNonce===this.state.evidence.echo?.windowNonce&&this.state.windows.meridian.open),
        artifact:Boolean(body.artifactDigest&&body.artifactDigest===this.state.evidence.cargo?.digest),
        approval:Boolean(this.state.approval.capabilities.includes(body.approvalCapability)),
        policy:Boolean(body.policyOverride===true&&this.state.inheritedPolicy),
        target:Boolean(body.targetSpacecraft)
      };
      if(!Object.values(checks).every(Boolean))return response(403,{error:'One or more evidence items failed individual validation',checks});
      const contextMismatch=body.targetSpacecraft==='AURORA-7'&&body.missionId==='perigee-12';
      if(!contextMismatch)return response(409,{error:'The finale expects individually valid evidence from conflicting contexts.'});
      const proof=this.complete('blacksky',{authorizationId:randomId('uplink'),checks,missionId:body.missionId,targetSpacecraft:body.targetSpacecraft,contextBinding:'not-enforced'});
      return response(202,{authorized:true,execution:'SIMULATION ONLY',flag:'VANTAGE{CONTEXT_IS_THE_CONTROL_PLANE}',checks,warning:'No command was sent to any external system.'},proof);
    }

    return response(404,{error:'Training endpoint not found'});
  }
}
