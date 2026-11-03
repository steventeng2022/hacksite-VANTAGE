import test from 'node:test';
import assert from 'node:assert/strict';
import {LabService,issueToken,verifyToken} from '../public/engine.mjs';
import {missions,totalPoints} from '../public/catalog.mjs';
import {createLabServer} from '../scripts/server.mjs';

async function exerciseAll(request){
  const session=await request({method:'POST',path:'/api/demo/session'});assert.equal(session.status,200);
  let token=session.body.token;
  const call=(method,path,body={},headers={})=>request({method,path,body,headers:{authorization:`Bearer ${token}`,...headers}});
  assert.equal((await call('GET','/api/me')).body.user.role,'mission_operator');

  const device=await call('POST','/oauth/device/code',{clientId:'field-tablet',audience:'telemetry.read'});
  await call('POST','/oauth/device/approve',{userCode:device.body.userCode});
  const ghost=await call('POST','/oauth/token',{deviceCode:device.body.deviceCode,clientId:'orbital-console',audience:'mission.control'});
  assert.ok(ghost.proof.includes('ghost'));assert.equal(ghost.body.audience,'mission.control');token=ghost.body.token;

  const warm=await call('POST','/graphql',{id:'pq-mission-snapshot-v1',variables:{missionId:'perigee-12'}},{'X-Partner-Context':'meridian'});
  assert.equal(warm.body.extensions.cache,'MISS');
  const cached=await call('POST','/graphql',{id:'pq-mission-snapshot-v1',variables:{missionId:'aurora-7'}});
  assert.ok(cached.proof.includes('cache'));assert.equal(cached.body.data.missionSnapshot.tenantId,'meridian');

  const connection=await call('POST','/api/events/connect');
  const echo=await call('POST','/api/events/subscribe',{connectionId:connection.body.connectionId,topic:'tenant/meridian/mission/perigee-12/commands'});
  assert.ok(echo.proof.includes('echo'));assert.match(echo.body.events[0].windowNonce,/win-mro/);

  const canonical=await call('POST','/api/telemetry/validate',{signature:'training-signature',raw:'{"packetId":"pkt-4418","thrust":2,"thrust":9}'});
  assert.ok(canonical.proof.includes('canon'));assert.equal(canonical.body.canonicalPreview.thrust,2);assert.equal(canonical.body.processorResult.thrust,9);
  const replay=await call('POST','/api/webhooks/replay',{eventId:'evt_mro_8841'});
  assert.ok(replay.proof.includes('replay'));assert.equal(replay.body.attempt,2);

  const key=await call('POST','/api/manifests/verify',{issuer:'https://keys.northstar.invalid',kid:'ops-2026',targetTenant:'meridian',manifest:{missionId:'perigee-12'}});
  assert.ok(key.proof.includes('keydrift'));assert.equal(key.body.keyResolution.resolvedTenant,'northstar');
  const capability=await call('POST','/api/artifacts/capability',{object:'northstar/aurora/calibration-v4.bin'});
  const artifact=await call('GET',`/api/artifacts/download?cap=${encodeURIComponent(capability.body.capability)}&object=meridian%2Fperigee%2Fflight-core-9.bin`);
  assert.ok(artifact.proof.includes('cargo'));assert.equal(artifact.body.artifact.tenantId,'meridian');

  const approval=await call('GET','/api/approvals/apr_burn_72');
  const twin=await call('POST','/api/approvals/apr_burn_72/parallel',{version:Number(approval.body.etag),requests:[{operatorId:'op_elena'},{operatorId:'op_elena'}]});
  assert.ok(twin.proof.includes('twin'));assert.equal(twin.body.results.length,2);
  const debris=await call('POST','/api/preferences/import',{preferences:'{"theme":"orbital-dark","__proto__":{"allowUnattendedUplink":true}}'});
  assert.ok(debris.proof.includes('debris'));assert.equal(debris.body.policyPreview.propertySource,'inherited');

  const progress=await call('GET','/api/lab/progress');
  const finale=await call('POST','/api/uplink/authorize',{missionId:progress.body.evidence.cache.missionId,targetSpacecraft:'AURORA-7',windowNonce:progress.body.evidence.echo.windowNonce,artifactDigest:progress.body.evidence.cargo.digest,approvalCapability:progress.body.evidence.twin.capabilities[0],policyOverride:true});
  assert.ok(finale.proof.includes('blacksky'));assert.equal(finale.body.execution,'SIMULATION ONLY');
  const finished=await call('GET','/api/lab/progress');
  assert.deepEqual(new Set(finished.body.completed),new Set(missions.map(item=>item.id)));assert.equal(finished.body.points,totalPoints);
  return token;
}

test('all ten chained lessons reproduce inside the bounded engine',async()=>{const service=new LabService();await exerciseAll(args=>service.request(args))});

test('normal controls and token verification remain visible',async()=>{
  const service=new LabService();assert.equal((await service.request({path:'/api/me'})).status,401);
  assert.equal((await service.request({path:'https://unrelated.invalid/api/me'})).status,400);
  assert.equal((await service.request({path:'/outside'})).status,400);
  const token=await issueToken({sub:'operator',tenantId:'northstar'},'one-secret');assert.equal((await verifyToken(token,'one-secret')).sub,'operator');assert.equal(await verifyToken(token,'wrong-secret'),null);
});

test('state is isolated and serializable without modifying global prototypes',async()=>{
  const first=new LabService(),second=new LabService();const session=await first.request({method:'POST',path:'/api/demo/session'});const auth={authorization:`Bearer ${session.body.token}`};
  await first.request({method:'POST',path:'/api/preferences/import',headers:auth,body:{preferences:'{"__proto__":{"allowUnattendedUplink":true}}'}});
  assert.equal({}.allowUnattendedUplink,undefined);assert.equal(first.snapshot().inheritedPolicy,true);assert.equal(second.snapshot().inheritedPolicy,false);
  const restored=new LabService(first.snapshot());assert.equal(restored.snapshot().inheritedPolicy,true);
});

test('loopback HTTP adapter supports the complete chain and hides engine internals',async()=>{
  const server=createLabServer({httpMode:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/hacksite-Vantage`;
  const request=async({method='GET',path,headers={},body={}})=>{const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});const result=await response.json();assert.equal(response.status,result.status);return result};
  try{assert.match(await (await fetch(base+'/')).text(),/data-runtime="http"/);assert.equal((await fetch(base+'/engine.mjs')).status,404);assert.equal((await fetch(base+'/fixtures.mjs')).status,404);assert.equal((await fetch(base+'/api/me',{headers:{Origin:'https://outside.invalid'}})).status,403);await exerciseAll(request)}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
