export const currentOperator={id:'op_elena',name:'Elena Park',initials:'EP',role:'mission_operator',tenantId:'northstar',missionId:'aurora-7',email:'elena.park@northstar.invalid'};

export const tenants=[
  {id:'northstar',name:'Northstar Dynamics',code:'NSD',mission:'AURORA-7'},
  {id:'meridian',name:'Meridian Orbital',code:'MRO',mission:'PERIGEE-12'}
];

export const spacecraft=[
  {id:'sat_aurora_7',name:'AURORA-7',tenantId:'northstar',orbit:'SSO · 525 km',status:'nominal',latency:184,station:'Svalbard-3',battery:87,payload:'Spectral Mapper'},
  {id:'sat_lumen_2',name:'LUMEN-2',tenantId:'northstar',orbit:'LEO · 480 km',status:'nominal',latency:211,station:'Alaska-2',battery:74,payload:'Optical Relay'},
  {id:'sat_kepler_9',name:'KEPLER-9',tenantId:'northstar',orbit:'MEO · 9,600 km',status:'degraded',latency:392,station:'Canberra-1',battery:61,payload:'Navigation Clock'},
  {id:'sat_perigee_12',name:'PERIGEE-12',tenantId:'meridian',orbit:'SSO · 540 km',status:'restricted',latency:178,station:'Svalbard-3',battery:92,payload:'Synthetic Aperture Radar'}
];

export const stations=[
  {id:'gs_svalbard_3',name:'Svalbard-3',region:'NO · 78.2°N',provider:'Polar Link Cooperative',status:'active',trust:'shared',next:'08:24',spacecraft:['AURORA-7','PERIGEE-12']},
  {id:'gs_alaska_2',name:'Alaska-2',region:'US · 64.8°N',provider:'Northstar Ground',status:'standby',trust:'owned',next:'21:07',spacecraft:['LUMEN-2']},
  {id:'gs_canberra_1',name:'Canberra-1',region:'AU · 35.3°S',provider:'Deep Arc Networks',status:'maintenance',trust:'partner',next:'43:18',spacecraft:['KEPLER-9']}
];

export const commands=[
  {id:'cmd_4182',name:'CALIBRATE_SPECTROMETER',target:'AURORA-7',state:'armed',risk:'standard',approvers:['Elena Park','Jon Bell'],window:'08:24'},
  {id:'cmd_4183',name:'PATCH_NAV_FILTER',target:'KEPLER-9',state:'review',risk:'elevated',approvers:['Elena Park'],window:'43:18'},
  {id:'cmd_4184',name:'ROTATE_RELAY_KEYS',target:'LUMEN-2',state:'draft',risk:'standard',approvers:[],window:'02:11:36'}
];

export const timelineEvents=[
  {time:'20:39:14',type:'telemetry',title:'Attitude solution converged',detail:'AURORA-7 · ADCS',severity:'ok',correlation:'corr-a7-8821'},
  {time:'20:37:42',type:'command',title:'Command window armed',detail:'Svalbard-3 · Window cw_meridian_12',severity:'warn',correlation:'corr-p12-1024'},
  {time:'20:35:08',type:'webhook',title:'MAINTENANCE_WINDOW_APPROVED',detail:'Delivery evt_mro_8841 · processed',severity:'info',correlation:'corr-p12-1024'},
  {time:'20:32:55',type:'security',title:'Shared station policy evaluated',detail:'2 tenants · 3 active topics',severity:'warn',correlation:'corr-gs-5002'},
  {time:'20:28:11',type:'artifact',title:'Flight package verified',detail:'nav-patch-4.8.2 · sha256:71c8…a02e',severity:'ok',correlation:'corr-k9-2180'}
];

export function seedState(){
  return {
    schemaVersion:2,
    completed:[],
    evidence:{},
    issuedTokens:[],
    deviceGrants:new Map(),
    queryCache:new Map(),
    processedEvents:new Set(['evt_mro_8841']),
    windows:{northstar:{open:true,nonce:'win-ns-a7-9d2'},meridian:{open:false,nonce:'win-mro-p12-f7a'}},
    manifests:{northstar:{kid:'ops-2026',issuer:'https://keys.northstar.invalid'},meridian:{kid:'ops-2026',issuer:'https://keys.meridian.invalid'}},
    artifacts:{
      'northstar/aurora/calibration-v4.bin':{tenantId:'northstar',name:'calibration-v4.bin',digest:'sha256:ns-a7-41e2',size:842112},
      'meridian/perigee/flight-core-9.bin':{tenantId:'meridian',name:'flight-core-9.bin',digest:'sha256:mro-p12-88fd',size:1842112}
    },
    approval:{id:'apr_burn_72',version:7,state:'pending',approvers:[],capabilities:[]},
    inheritedPolicy:false,
    webhookAttempts:{evt_mro_8841:1},
    requestCount:0
  };
}
