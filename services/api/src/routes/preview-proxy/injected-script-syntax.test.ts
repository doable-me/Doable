import assert from "node:assert/strict";
import test from "node:test";
import {Script} from "node:vm";
import {VISUAL_EDIT_BRIDGE_INLINE} from "../../visual-edit-bridge-inline.js";
import {CONNECTOR_BRIDGE_SNIPPET,ERROR_CAPTURE_SNIPPET,RETRY_HTML,getReactRefreshPreambleSnippet,getStorageNamespaceSnippet} from "./injected-scripts.js";

// These are JS inside TS strings. TypeScript/build checks never parse them.
test("every classic preview bridge parses as the JavaScript delivered to a browser",()=>{
 assert.doesNotThrow(()=>new Script(VISUAL_EDIT_BRIDGE_INLINE,{filename:"visual-edit-bridge.js"}));
 const snippets=[CONNECTOR_BRIDGE_SNIPPET,ERROR_CAPTURE_SNIPPET,RETRY_HTML,getReactRefreshPreambleSnippet("test-project"),getStorageNamespaceSnippet("test-project")];
 for(const html of snippets){
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length>0);
  for(const [index,match] of scripts.entries())assert.doesNotThrow(()=>new Script(match[1]!, {filename:`injected-${index}.js`}));
 }
});
