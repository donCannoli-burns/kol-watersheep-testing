import http from "node:http";
import { URL } from "node:url";
import { MockKolRuntime } from "./runtime.ts";
import { SCENARIOS } from "./scenarios.ts";
import { classifyWithWaterSheep, waterSheepRequest } from "./watersheep.ts";
import { charpanePage, inventoryPage, mainPage } from "./relay.ts";

function json(res: http.ServerResponse, code: number, body: unknown): void {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(code, {"content-type":"application/json; charset=utf-8","content-length":Buffer.byteLength(data),"x-kol-runtime":"mock-only","cache-control":"no-store"});
  res.end(data);
}
function html(res: http.ServerResponse, code: number, body: string): void {
  res.writeHead(code, {"content-type":"text/html; charset=utf-8","content-length":Buffer.byteLength(body),"x-kol-runtime":"mock-only","cache-control":"no-store"});
  res.end(body);
}
async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createMockServer(runtime = new MockKolRuntime()): http.Server {
  return http.createServer(async (req,res)=>{
    const method=req.method||"GET"; const url=new URL(req.url||"/","http://mock.local");
    try {
      if(method==="GET"&&url.pathname==="/") return json(res,200,{name:"KoL Mock Runtime Lab",version:"0.1.2",mockOnly:true,liveFallback:false,endpoints:["GET /health","GET /v1/observation","GET /v1/state/raw","GET /v1/scenarios","POST /v1/sim/reset","POST /v1/sim/step","POST /v1/watersheep/classify","GET /v1/recorder/status","GET /v1/recorder/recent","GET /relay/main.php","GET /relay/charpane.php","GET /relay/inventory.php"]});
      if(method==="GET"&&url.pathname==="/health") return json(res,200,{status:"ok",mockOnly:true,liveNetworkEnabled:false,liveFallback:false,scenario:runtime.state.scenarioId,tick:runtime.state.tick,recorder:runtime.recorder.status()});
      if(method==="GET"&&url.pathname==="/v1/scenarios") return json(res,200,SCENARIOS);
      if(method==="GET"&&url.pathname==="/v1/state/raw") return json(res,200,runtime.state);
      if(method==="GET"&&url.pathname==="/v1/observation"){const observation=runtime.observation();runtime.recorder.append(runtime.state,"observation.emitted",{observationId:observation.observationId,stateDigest:observation.stateDigest});return json(res,200,observation);}
      if(method==="POST"&&url.pathname==="/v1/sim/reset"){const body=await readBody(req);const scenario=String(body.scenario||"hidden-temple");const seed=Number(body.seed||7);if(!Number.isSafeInteger(seed)||seed===0)return json(res,400,{error:"seed must be a non-zero safe integer"});return json(res,200,runtime.reset(scenario,seed));}
      if(method==="POST"&&url.pathname==="/v1/sim/step"){const body=await readBody(req);return json(res,200,runtime.step(String(body.action||"inspect")));}
      if(method==="POST"&&url.pathname==="/v1/watersheep/classify"){const observation=runtime.observation();const result=await classifyWithWaterSheep(observation);runtime.recorder.append(runtime.state,"watersheep.classified",{observationId:observation.observationId,request:waterSheepRequest(observation),response:result});return json(res,200,result);}
      if(method==="GET"&&url.pathname==="/v1/recorder/status") return json(res,200,runtime.recorder.status());
      if(method==="GET"&&url.pathname==="/v1/recorder/recent") return json(res,200,runtime.recorder.recent(Number(url.searchParams.get("limit")||20)));
      if(method==="GET"&&url.pathname==="/relay/main.php") return html(res,200,mainPage(runtime.state));
      if(method==="GET"&&url.pathname==="/relay/charpane.php") return html(res,200,charpanePage(runtime.state));
      if(method==="GET"&&url.pathname==="/relay/inventory.php") return html(res,200,inventoryPage(runtime.state));
      return json(res,404,{error:"not_found",path:url.pathname});
    } catch(error){return json(res,400,{error:"mock_runtime_error",detail:error instanceof Error?error.message:String(error)});}
  });
}
if(import.meta.url===`file://${process.argv[1]}`){const port=Number(process.env.PORT||10425);const host=process.env.HOST||"127.0.0.1";const server=createMockServer();server.listen(port,host,()=>{console.log(`KoL Mock Runtime Lab v0.1.2 listening on http://${host}:${port}`);console.log("MOCK ONLY · live fallback disabled · recorder RECORD_ONLY");});}
