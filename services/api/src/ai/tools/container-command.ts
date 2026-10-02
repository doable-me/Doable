import {spawn} from "node:child_process";
import {buildSafeEnv} from "../../projects/safe-env.js";

/** Only the operator's explicit, consistent Docker single-tenant setting opts
 * out of an additional process jail. Missing/unknown/mixed settings stay jailed. */
export function usesContainerIsolation(hardening: string, configured: string | undefined): boolean {
  return hardening === "off" && configured?.toLowerCase() === "off";
}

/** Execute within the existing API container for explicit off/off deployments.
 * This is NOT a per-project filesystem jail; do not report it as one. */
export async function runContainerCommand(command: string, cwd: string, timeoutMs = 60_000) {
  const start = Date.now();
  let stdout = "", stderr = "", timedOut = false;
  const result = await new Promise<{exitCode:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{
    const group = process.platform !== "win32";
    const child=spawn("/bin/sh",["-c",command],{cwd,env:buildSafeEnv(undefined,{FORCE_COLOR:"0"}),stdio:["ignore","pipe","pipe"],detached:group});
    let force:ReturnType<typeof setTimeout>|undefined;
    const kill=(signal:NodeJS.Signals)=>{try{if(group && child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch{/* already exited */}};
    const timer=setTimeout(()=>{timedOut=true;kill("SIGTERM");force=setTimeout(()=>kill("SIGKILL"),1000);},timeoutMs);
    const clear=()=>{clearTimeout(timer);if(force)clearTimeout(force);};
    child.stdout.on("data",d=>{stdout=(stdout+d.toString()).slice(-1_048_576);});
    child.stderr.on("data",d=>{stderr=(stderr+d.toString()).slice(-1_048_576);});
    child.on("error",e=>{clear();reject(e);});
    child.on("close",(exitCode,signal)=>{clear();resolve({exitCode,signal});});
  });
  return {...result,stdout,stderr,durationMs:Date.now()-start,timedOut,oomKilled:false,backendId:"container",profileId:"ai-bash",composers:[]};
}
