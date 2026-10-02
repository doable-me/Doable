import test from "node:test";
import assert from "node:assert/strict";
import {createInitialState} from "./types.js";
import {createProcessEvent} from "./event-processor.js";
import {ChannelTokenRouter} from "../../ai/sse-mapper.js";
import {finalizeLeadingResponse} from "./final-response.js";
import {handleTimeoutRecovery} from "./stream-recovery.js";
import {runOutcome} from "./execution-state.js";
import type {CopilotEngine} from "../../ai/providers/copilot.js";
import type {SSEStreamingApi} from "hono/streaming";

test("production pipeline resumes timed-out tool progress and keeps verified results and final answer",async()=>{
 const state=createInitialState();const frames:any[]=[];
 const stream={writeSSE:async({data}:{data:string})=>{frames.push(JSON.parse(data));}} as SSEStreamingApi;
 const router=new ChannelTokenRouter();
 const process=createProcessEvent(stream,state,router,"test-project","test-user","test-message","agent",()=>{},()=>{},()=>"session");
 const emit=(type:string,data:Record<string,unknown>)=>process({type,data} as any);
 const tool=(id:string,name:string,args:Record<string,unknown>)=>{
  emit("tool.execution_start",{toolCallId:id,toolName:name,arguments:args});
  emit("tool.execution_complete",{toolCallId:id,toolName:name,success:true,result:{success:true}});
 };
 tool("read","read_file",{path:"src/App.tsx"});
 tool("initial-report","report_task_status",{intent:"change",status:"in_progress"});
 emit("session.error",{message:"AI timed out — no response for 304s."});
 assert.equal(state.deferredErrorCode,"TIMEOUT");assert.equal(state.assistantContent,"");
 let cancelled=false;
 const engine={quiesceSession:async()=>{cancelled=true;},sendMessage:async()=>{
  assert.equal(cancelled,true);
  tool("write","create_file",{path:"src/App.tsx",content:"export default function App(){return <div>Simulation</div>}"});
  tool("final-report","report_task_status",{intent:"change",status:"completed"});
  emit("assistant.message",{messageId:"answer",content:"已生成应用，请打开预览。"});
  emit("session.idle",{});
 }} as unknown as CopilotEngine;
 await handleTimeoutRecovery(stream,state,engine,"session",{process,flush:async()=>{
  for(const chunk of router.flush()) if(chunk.type==='text')state.assistantContent+=chunk.content;
  finalizeLeadingResponse(state);
 }});
 assert.equal(state.deferredError,undefined);assert.equal(runOutcome(state),"completed");
 assert.equal(state.assistantContent,"已生成应用，请打开预览。");
 assert.equal(state.assistantToolCalls.filter(t=>t.name==='read_file').length,1);
 assert.equal(state.assistantToolCalls.find(t=>t.name==='create_file')?.status,'completed');
 assert.equal(frames.filter(f=>f.type==='error').length,0);
});
