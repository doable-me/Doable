import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createInitialState} from "./types.js";
import {recordToolEventForTrace} from "./tool-event-bookkeeping.js";
import {mapEventToSSE,extractToolArguments} from "../../ai/sse-mapper.js";
import {buildToolActionsFromCalls} from "../../ai/tool-messages.js";

test("SDK argument aliases share one decoding contract",()=>{
  const expected={intent:"read_only",status:"completed"};
  for(const envelope of [{arguments:expected},{args:expected},{input:expected},{arguments:{arguments:expected}},{arguments:JSON.stringify(expected)}]) {
    assert.deepEqual(extractToolArguments(envelope),expected);
    const s=createInitialState();
    recordToolEventForTrace(s,{type:"tool.execution_start",data:{toolName:"report_task_status",toolCallId:"r",...envelope}},()=>{});
    recordToolEventForTrace(s,{type:"tool.execution_complete",data:{toolCallId:"r",success:true,result:{success:true}}},()=>{});
    assert.deepEqual(s.taskReport,expected);
    assert.equal(s.assistantToolCalls.length,1);
  }
  assert.equal(extractToolArguments({toolName:"read_file",toolCallId:"a"}),undefined);
});

test("external SDK requests complete with a single ledger row and visible card",()=>{
 const s=createInitialState();
 const start={type:"external_tool.requested",data:{toolName:"mcp_search",toolCallId:"external-1",input:{query:"中文"}}};
 const end={type:"external_tool.completed",data:{toolCallId:"external-1",success:true,result:{content:[{type:"text",text:"found"}]}}};
 recordToolEventForTrace(s,start,()=>{});recordToolEventForTrace(s,end,()=>{});
 assert.equal(s.assistantToolCalls.length,1);assert.equal(s.assistantToolCalls[0].status,"completed");
 assert.equal(mapEventToSSE(start)?.type,"tool_call");
 assert.deepEqual((mapEventToSSE(end)?.data as any).name,"mcp_search");
 assert.equal((mapEventToSSE(end)?.data as any).success,true);
});

test("task reports remain structured state without live or historical tool cards",()=>{
 const s=createInitialState();
 const start={type:"tool.execution_start",data:{toolName:"report_task_status",toolCallId:"r",arguments:{intent:"change",status:"completed"}}};
 const end={type:"tool.execution_complete",data:{toolCallId:"r",success:true,result:{success:true}}};
 recordToolEventForTrace(s,start,()=>{});recordToolEventForTrace(s,end,()=>{});
 assert.equal(s.taskReport?.status,"completed");assert.equal(mapEventToSSE(start),null);assert.equal(mapEventToSSE(end),null);
 assert.deepEqual(buildToolActionsFromCalls(s.assistantToolCalls,"m"),[]);
});

test("external failed output is not rendered as a success",()=>{
 const event={type:"external_tool.completed",data:{toolName:"external_write",toolCallId:"e",success:true,output:{success:false,error:"Denied"}}};
 assert.equal((mapEventToSSE(event)?.data as any).success,false);
});

test("supplemental hooks cannot create phantom invocations or duplicate cards",()=>{
 const source=readFileSync(new URL("./tool-callbacks.ts",import.meta.url),"utf8");
 const hooks=source.slice(source.indexOf("export function createToolProgressCallbacks"));
 assert.doesNotMatch(hooks,/\b(?:startTool|finishTool|recordAssistantToolCall)\s*\(/);
 assert.doesNotMatch(hooks,/traceCollector\?\.onTool(?:Start|End)\s*\(/);
 assert.doesNotMatch(hooks,/type:\s*["']tool_(?:call|result)["']/);
 for(const event of ["clarification","plan","integration_required","provision_supabase_required","mcp_ui_resource","artifact_ready"]) assert.ok(hooks.includes(`"${event}"`),event);
 assert.ok(hooks.includes("persistViewerToProject("));assert.ok(hooks.includes("pushArtifacts("));
});

test("dispatch mirrors count once; request-only acknowledgement is never a result",()=>{
 const s=createInitialState();let starts=0,ends=0;
 s.traceCollector={onToolStart(){starts++;},onToolEnd(){ends++;}} as any;
 const dispatch={type:"external_tool.requested",data:{requestId:"dispatch",sessionId:"session",toolCallId:"one",toolName:"read_file",arguments:{path:"src/App.tsx"}}};
 assert.equal(recordToolEventForTrace(s,dispatch,()=>{}).phase,"start");
 assert.equal(recordToolEventForTrace(s,{...dispatch,type:"tool.execution_start"},()=>{}).suppressDisplay,true);
 const ack={type:"external_tool.completed",data:{requestId:"dispatch"}};
 assert.equal(recordToolEventForTrace(s,ack,()=>{}).suppressDisplay,true);
 assert.equal(mapEventToSSE(ack),null);assert.equal(s.assistantToolCalls[0].status,"running");
 const end={type:"tool.execution_complete",data:{toolCallId:"one",success:true,result:{content:'{"success":true}'}}};
 assert.equal(recordToolEventForTrace(s,end,()=>{}).phase,"end");
 assert.equal(recordToolEventForTrace(s,end,()=>{}).suppressDisplay,true);
 assert.equal(starts,1);assert.equal(ends,1);assert.equal(s.assistantToolCalls.length,1);
});

test("late duplicate read start cannot reopen an already completed task",()=>{
 const s=createInitialState();
 const read={type:"tool.execution_start",data:{toolCallId:"read-late",toolName:"read_file",arguments:{path:"package.json"}}};
 recordToolEventForTrace(s,read,()=>{});
 recordToolEventForTrace(s,{type:"tool.execution_complete",data:{toolCallId:"read-late",success:true,result:{content:"ok"}}},()=>{});
 recordToolEventForTrace(s,{type:"tool.execution_start",data:{toolCallId:"report-last",toolName:"report_task_status",arguments:{intent:"read_only",status:"completed"}}},()=>{});
 recordToolEventForTrace(s,{type:"tool.execution_complete",data:{toolCallId:"report-last",success:true,result:{success:true}}},()=>{});
 assert.equal(s.taskReport?.status,"completed");
 assert.equal(recordToolEventForTrace(s,{...read,type:"external_tool.requested"},()=>{}).suppressDisplay,true);
 assert.equal(s.taskReport?.status,"completed");assert.equal(s.assistantToolCalls.length,2);
});


test("SDK JSON-string results preserve failures without interpreting file content as status", async () => {
  const {toolSucceeded} = await import("../../ai/tool-outcome.js");
  const failure = JSON.stringify({success:false,error:"Denied"});
  assert.equal(toolSucceeded({content:failure,detailedContent:failure},true),false);
  assert.equal(toolSucceeded({detailedContent:failure},true),false);
  const file = JSON.stringify({path:"fixture.json",content:failure});
  assert.equal(toolSucceeded({content:file,detailedContent:file},true),true);
});
