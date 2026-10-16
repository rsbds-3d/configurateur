import {createServer} from "node:http";
import {createContactService} from "./contact-service.mjs";
const service=createContactService();
const server=createServer(service.handler);
server.requestTimeout=45000;server.headersTimeout=15000;
server.listen(Number(process.env.PORT)||8787,process.env.HOST||'127.0.0.1',()=>console.log('Rosebuds contact API démarrée'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{service.close();process.exit(0);}));
