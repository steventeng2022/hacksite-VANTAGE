import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {LabService} from '../public/engine.mjs';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};

export function createLabServer({httpMode=false}={}){
  const fresh=()=>new LabService(undefined,{secret:randomBytes(32).toString('hex')});
  let service=fresh();
  const server=createServer(async(req,res)=>{
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value))};
    try{
      const host=req.headers.host||'';
      if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return json(403,{status:403,body:{error:'Only loopback Host is accepted'}});
      const allowedOrigins=[`http://${host}`,`http://localhost:${server.address().port}`,`http://127.0.0.1:${server.address().port}`];
      if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin))return json(403,{status:403,body:{error:'Cross-origin requests are not enabled'}});
      const url=new URL(req.url,`http://${host}`);
      const pathname=decodeURIComponent(url.pathname).replace(/^\/hacksite-Vantage(?=\/|$)/i,'');
      const isTrainingEndpoint=pathname.startsWith('/api/')||pathname.startsWith('/oauth/')||pathname==='/graphql';
      if(isTrainingEndpoint){
        if(!httpMode)return json(404,{status:404,body:{error:'Static browser mode. Use npm run lab:api for HTTP endpoints.'}});
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)return json(413,{status:413,body:{error:'Request body exceeds 64 KB'}})}
        let body={};try{body=raw?JSON.parse(raw):{}}catch{return json(400,{status:400,body:{error:'Invalid JSON'}})}
        if(!body||Array.isArray(body)||typeof body!=='object')return json(400,{status:400,body:{error:'Body must be an object'}});
        if(pathname==='/api/lab/reset'&&req.method==='POST'){service=fresh();return json(200,{status:200,body:{reset:true},proof:[]})}
        const result=await service.request({method:req.method,path:pathname+url.search,headers:req.headers,body});return json(result.status,result);
      }
      if(pathname==='/runtime.json')return json(200,{mode:httpMode?'http':'browser',notice:'Synthetic orbital training data only.'});
      if(httpMode&&['/engine.mjs','/fixtures.mjs'].includes(pathname))return json(404,{error:'Server-side teaching engine is not served in HTTP mode'});
      let relative=pathname||'/';if(relative.endsWith('/'))relative+='index.html';
      const path=resolve(root,'.'+relative),resolvedRoot=resolve(root);
      if(!path.startsWith(resolvedRoot+sep))return json(403,{error:'Forbidden'});
      if(!(await stat(path)).isFile())throw Object.assign(new Error('Not found'),{code:'ENOENT'});
      let buffer=await readFile(path);
      if(httpMode&&extname(path)==='.html')buffer=Buffer.from(buffer.toString('utf8').replace('data-runtime="browser"','data-runtime="http"'));
      res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(buffer);
    }catch(error){if(!res.headersSent)json(error.code==='ENOENT'?404:400,{error:error.code==='ENOENT'?'Not found':'Invalid request'})}
  });
  return server;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const httpMode=process.argv.includes('--api'),port=Number(process.env.PORT||(httpMode?4280:4274));
  const server=createLabServer({httpMode});
  server.listen(port,'127.0.0.1',()=>console.log(`VANTAGE ${httpMode?'HTTP training API':'static preview'}: http://127.0.0.1:${port}/hacksite-Vantage/`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
