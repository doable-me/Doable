import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {withDependencyLock} from "./dependency-lock.js";

test("concurrent production and dev installs preserve both manifest changes",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"dependency-race-"));const file=join(dir,"package.json");await writeFile(file,"{}");
 try {
  const install=(field:string,name:string)=>withDependencyLock(dir,async()=>{
   const manifest=JSON.parse(await readFile(file,"utf8"));
   await new Promise(resolve=>setTimeout(resolve,10));
   manifest[field]={[name]:"1.0.0"};await writeFile(file,JSON.stringify(manifest));
  });
  await Promise.all([install("dependencies","three"),install("devDependencies","@types/three")]);
  assert.deepEqual(JSON.parse(await readFile(file,"utf8")),{dependencies:{three:"1.0.0"},devDependencies:{"@types/three":"1.0.0"}});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("unrelated project proceeds and failed install does not poison the queue",async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);const events:string[]=[];
 const a=withDependencyLock("a",async()=>{await gate;throw Error("install failed");});
 const failed=assert.rejects(a,/install failed/);
 const queued=withDependencyLock("a",async()=>{events.push("a-next");});
 await withDependencyLock("b",async()=>{events.push("b");});assert.deepEqual(events,["b"]);
 release();await failed;await queued;assert.deepEqual(events,["b","a-next"]);
});
