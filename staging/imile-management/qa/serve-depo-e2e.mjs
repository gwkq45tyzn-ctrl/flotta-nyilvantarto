import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'');if(!process.argv[2]||!(await fs.stat(path.join(root,'LOCAL_EMULATOR_ONLY.txt'))).isFile())throw Error('An explicitly prepared local emulator copy is required.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:8123'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(8123,'127.0.0.1',()=>console.log('Local emulator-only web UI: http://127.0.0.1:8123'));
