import assert from "node:assert/strict";
import test from "node:test";
import {handleTimeoutRecovery, handleEmptyResponseRetry, handleAutoContinue} from "./stream-recovery.js";
import {createInitialState} from "./types.js";
import type {CopilotEngine} from "../../ai/providers/copilot.js";
import type {SSEStreamingApi} from "hono/streaming";

function fixture() {
  const state=createInitialState();
  state.deferredError="AI timed out — no response for 304s.";
  state.deferredErrorCode="TIMEOUT";
  state.hadToolCalls=true;
  state.assistantThinking="检查现有项目";
  state.assistantToolCalls=[{name:"read_file",arguments:{path:"src/App.tsx"},status:"completed",cycle:0}];
  state.taskReport={intent:"change",status:"in_progress"};
  const calls:string[]=[];
  const stream={writeSSE:async()=>{}} as unknown as SSEStreamingApi;
  const pipeline={process:()=>{calls.push("event");},flush:async()=>{calls.push("flush");}};
  const engine={quiesceSession:async()=>{calls.push("cancelled");}, sendMessage:async(_id:string,prompt:string,_files:unknown,onEvent:()=>void)=>{
    calls.push("resume"); assert.match(prompt,/Do not repeat completed changes/); assert.match(prompt,/read-only/); onEvent();
    state.assistantContent="完成并验证";state.taskReport={intent:"change",status:"completed"};
  }} as unknown as CopilotEngine;
  return {state,calls,stream,pipeline,engine};
}
test("timeout after completed reads resumes only after cancellation, through same pipeline",async()=>{
  const f=fixture(); await handleTimeoutRecovery(f.stream,f.state,f.engine,"session",f.pipeline);
  assert.deepEqual(f.calls,["cancelled","resume","event","flush"]);
  assert.equal(f.state.assistantToolCalls.length,1);assert.equal(f.state.deferredError,undefined);
  assert.equal(f.state.taskReport?.status,"completed");
});
test("second timeout is cancelled and cannot enter empty retry or auto-continue",async()=>{
  const f=fixture();f.engine.sendMessage=async()=>{f.calls.push("resume");f.state.deferredError="AI timed out";};
  await handleTimeoutRecovery(f.stream,f.state,f.engine,"s",f.pipeline);
  await handleTimeoutRecovery(f.stream,f.state,f.engine,"s",f.pipeline);
  await handleEmptyResponseRetry(f.stream,f.state,f.engine,"s","p","original",[],f.pipeline);
  await handleAutoContinue(f.stream,f.state,f.engine,"s","p","agent",()=>{},"original",f.pipeline);
  assert.deepEqual(f.calls,["cancelled","resume","flush","cancelled"]);assert.equal(f.state.runOutcome,"error");
});
for(const status of ["running","unknown","failed"]) test(`uncertain ${status} tool is never replayed`,async()=>{
  const f=fixture();f.state.assistantToolCalls[0].status=status;await handleTimeoutRecovery(f.stream,f.state,f.engine,"s",f.pipeline);
  assert.deepEqual(f.calls,["cancelled"]);assert.ok(f.state.deferredError);
});
for(const code of ["AUTH","QUOTA","RATE_LIMIT","SERVER_ERROR"]) test(`${code} is not a timeout recovery`,async()=>{
  const f=fixture();f.state.deferredErrorCode=code;await handleTimeoutRecovery(f.stream,f.state,f.engine,"s",f.pipeline);assert.deepEqual(f.calls,[]);
});
for(const gate of ["awaitingMcpWidget","awaitingSupabaseProvision","awaitingIntegrationConnect"] as const) test(`respects ${gate}`,async()=>{
  const f=fixture();f.state[gate]=true;await handleTimeoutRecovery(f.stream,f.state,f.engine,"s",f.pipeline);assert.deepEqual(f.calls,["cancelled"]);
});
for(const status of ["waiting_for_input","completed"] as const) test(`respects ${status} report`,async()=>{
  const f=fixture();f.state.taskReport!.status=status;await handleTimeoutRecovery(f.stream,f.state,f.engine,"s",f.pipeline);assert.deepEqual(f.calls,["cancelled"]);
});
test("cancellation failure never resends",async()=>{
  const f=fixture();f.engine.quiesceSession=async()=>{throw Error("abort rejected");};
  await handleTimeoutRecovery(f.stream,f.state,f.engine,"s",f.pipeline);assert.deepEqual(f.calls,[]);assert.equal(f.state.runOutcome,"error");
});
test("user abort during cancellation cannot revive the task",async()=>{
  const f=fixture();f.engine.quiesceSession=async()=>{f.state.runOutcome="aborted";};
  await handleTimeoutRecovery(f.stream,f.state,f.engine,"s",f.pipeline);assert.deepEqual(f.calls,[]);assert.equal(f.state.runOutcome,"aborted");
});
test("confirmed no-effect argument rejection can resume, without relabeling it successful",async()=>{
  const f=fixture();f.state.assistantToolCalls.push({name:"create_file",arguments:{},status:"failed",cycle:0,rejectedWithoutEffects:true});
  await handleTimeoutRecovery(f.stream,f.state,f.engine,"s",f.pipeline);
  assert.ok(f.calls.includes("resume"));assert.equal(f.state.assistantToolCalls[1].status,"failed");
});
