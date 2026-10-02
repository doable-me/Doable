import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

test("parallel SDK install handlers preserve both dependency sets",{skip:process.platform==="win32"},async()=>{
 const root=await mkdtemp(join(tmpdir(),"sdk-install-race-"));const before={root:process.env.DOABLE_PROJECTS_DIR,path:process.env.PATH};
 try {
  await mkdir(join(root,"project"));await mkdir(join(root,"bin"));await writeFile(join(root,"project/package.json"),"{}");
  // Simulate npm's read-modify-write transaction without network or packages.
  await writeFile(join(root,"bin/npm"),`#!/usr/bin/env node
const fs=require('node:fs'); const args=process.argv.slice(2);const data=JSON.parse(fs.readFileSync('package.json','utf8'));
setTimeout(()=>{const dev=args.includes('--save-dev'); data[dev?'devDependencies':'dependencies']={[dev?'types-package':'runtime-package']:'1.0.0'};fs.writeFileSync('package.json',JSON.stringify(data));},80);
`,{mode:0o755});
  process.env.DOABLE_PROJECTS_DIR=root;process.env.PATH=join(root,"bin")+":"+before.path;
  const {createDoableTools}=await import("./copilot-tools.js");
  const tool=createDoableTools("project").find(t=>t.name==="install_package");assert.ok(tool);
  const handler=(tool as unknown as {handler:(args:unknown)=>Promise<{success:boolean}>}).handler;
  const result=await Promise.all([handler({packages:"runtime-package"}),handler({packages:"types-package",dev:true})]);
  assert.ok(result.every(r=>r.success));
  assert.deepEqual(JSON.parse(await readFile(join(root,"project/package.json"),"utf8")),{dependencies:{"runtime-package":"1.0.0"},devDependencies:{"types-package":"1.0.0"}});
 } finally {
  if(before.root===undefined)delete process.env.DOABLE_PROJECTS_DIR;else process.env.DOABLE_PROJECTS_DIR=before.root;
  if(before.path===undefined)delete process.env.PATH;else process.env.PATH=before.path;
  await rm(root,{recursive:true,force:true});
 }
});
