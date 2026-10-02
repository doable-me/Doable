import assert from "node:assert/strict";
import test from "node:test";
import {validateWriteArguments,isRejectedFileWrite} from "./file-tool-validation.js";
import {finishTool,startTool} from "../routes/chat/execution-state.js";
import {createInitialState} from "../routes/chat/types.js";
test("incomplete generated writes are rejected before effects, including empty SDK arguments",()=>{
  for(const args of [undefined,null,{}, {path:"x"}, {path:"",content:"x"}, {path:42,content:"x"}, {path:"x",content:null}]) {
    const failure=validateWriteArguments(args);assert.equal(failure?.effects,"none");assert.equal(failure?.code,"INVALID_FILE_ARGUMENTS");
  }
  assert.equal(validateWriteArguments({path:"src/App.tsx",content:""}),null);
});
test("structured rejection survives SDK envelopes while ordinary failures stay unsafe",()=>{
  const failure=validateWriteArguments({});
  for(const result of [failure,{content:JSON.stringify(failure)},{detailedContent:failure}]) {
    assert.equal(isRejectedFileWrite("create_file",result),true);
    const state=createInitialState();startTool(state,"create_file",{},"call");
    assert.equal(finishTool(state,"create_file",undefined,result,false,"call").rejectedWithoutEffects,true);
  }
  for(const result of [undefined,{error:"No file was written"},{success:false,code:"INVALID_FILE_ARGUMENTS"},{success:true,code:"INVALID_FILE_ARGUMENTS",effects:"none"}])assert.equal(isRejectedFileWrite("create_file",result),false);
  assert.equal(isRejectedFileWrite("bash",failure),false);
});
