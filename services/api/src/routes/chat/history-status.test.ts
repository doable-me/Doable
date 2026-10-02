import test,{mock} from "node:test";
import assert from "node:assert/strict";
import {Hono} from "hono";
let rows:Record<string,unknown>[]=[];
let queries:Array<{text:string;values:unknown[]}>=[];
let history=false;
mock.module("../../db/index.js",{namedExports:{sql:(strings:TemplateStringsArray,...values:unknown[])=>{
 if(!strings.raw)return strings;
 const text=strings.join('?');queries.push({text,values});
 if(history){
  if(text.includes('FROM ai_sessions'))return Promise.resolve([{id:'session'}]);
  if(text.includes('FROM ai_messages'))return Promise.resolve(rows);
  if(text.includes('FROM chat_traces'))return Promise.resolve([{message_id:'partial',status:'error',error_message:'AI timed out'},{message_id:'empty',status:'error',error_message:null}]);
 }
 return Promise.resolve(text.includes('DELETE')?[]:rows);
}}});
const {registerMiscRoutes}=await import('./misc-routes.js');
const {activeRequests}=await import('./session-state.js');
const app=new Hono<any>();registerMiscRoutes(app);
for(const [name,age,active,streaming,deletes] of [
 ['long-running',10*60_000,true,true,0],
 ['orphaned',10*60_000,false,false,1],
 ['recent',10_000,false,true,0],
] as const)test(`stream status ${name}`,async()=>{
 history=false;queries=[];rows=[{message_id:'message',started_at:new Date(Date.now()-age)}];
 if(active)activeRequests.set('project',{mode:'agent',startedAt:Date.now()-age});
 try{
  const res=await app.request('/projects/project/chat/status');assert.equal(res.status,200);
  const body=await res.json() as {streaming:boolean;messageId?:string};assert.equal(body.streaming,streaming);
  if(streaming)assert.equal(body.messageId,'message');
  assert.equal(queries.filter(q=>q.text.includes('DELETE')).length,deletes);
 }finally{activeRequests.delete('project');}
});
test('history retains empty/partial failed turns without changing stored content or successful tool facts',async()=>{
 history=true;queries=[];
 rows=[{id:'user',role:'user',content:'Make an app'},
 {id:'partial',role:'assistant',content:'Partial answer',tool_actions:[{toolName:'read_file',status:'completed'}]},
 {id:'empty',role:'assistant',content:''}];
 const original=JSON.stringify(rows);
 const res=await app.request('/projects/project/chat/history?all=true');assert.equal(res.status,200);
 const {data}=await res.json() as {data:Array<Record<string,any>>};
 assert.equal(data.length,3);assert.ok(data[0] && data[1] && data[2]);
 assert.equal(data[1].content,'Partial answer');assert.equal(data[1].run_status,'error');assert.equal(data[1].run_error,'AI timed out');
 assert.equal(data[1].tool_actions[0].status,'completed');assert.equal(data[2].content,'');assert.equal(data[2].run_status,'error');
 assert.equal(data[0].run_status,undefined);assert.equal(JSON.stringify(rows),original);
 const batches=queries.filter(q=>q.text.includes('FROM chat_traces'));assert.equal(batches.length,1);
 const batch=batches[0];assert.ok(batch);
 assert.equal(batch.values[0],'project');assert.deepEqual(batch.values[1],['partial','empty']);
});
