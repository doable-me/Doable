import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {usesContainerIsolation,runContainerCommand} from "./container-command.js";

test("only explicit consistent off/off selects container mode; prod never falls back",()=>{
 assert.equal(usesContainerIsolation("off","off"),true);
 for(const level of ["dev","staging","prod",""])assert.equal(usesContainerIsolation(level,"off"),false);
 for(const config of [undefined,"full","relaxed","invalid",""])assert.equal(usesContainerIsolation("off",config),false);
});
test("container command uses project cwd and filters server credentials",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"container-command-"));
 const key="DOABLE_TEST_SERVER_SECRET";const old=process.env[key];process.env[key]="test-only-secret";
 try {
  const r=await runContainerCommand('node -e \'console.log(JSON.stringify({cwd:process.cwd(),leaked:!!process.env.DOABLE_TEST_SERVER_SECRET}))\'',dir);
  assert.equal(r.exitCode,0);assert.equal(r.backendId,"container");assert.deepEqual(JSON.parse(r.stdout),{cwd:await realpath(dir),leaked:false});
 }finally{if(old===undefined)delete process.env[key];else process.env[key]=old;await rm(dir,{recursive:true,force:true});}
});
test("container command preserves failure and supervises timeout",async()=>{
 const fail=await runContainerCommand("exit 7",tmpdir());assert.equal(fail.exitCode,7);
 const timed=await runContainerCommand("sleep 30",tmpdir(),50);assert.equal(timed.timedOut,true);assert.notEqual(timed.exitCode,0);assert.ok(timed.durationMs<4000);
});
