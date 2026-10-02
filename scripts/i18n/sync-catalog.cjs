// Populate catalogs only from a completed offline translation artifact.
// Never invoke an external translation service from the running product.
const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../../apps/web/messages');
const source=JSON.parse(fs.readFileSync(path.join(dir,'source.json')));
const manual=JSON.parse(fs.readFileSync(path.join(__dirname,'manual-translations.json')));
const translated=Object.assign({},...process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p))));
const en={ui:{}},zh={ui:{}},missing=[];
for(const [key,item] of Object.entries(source)) {
 const t=translated[key];
 if(!t&&!manual[item.source]){missing.push(key);continue;}
 en.ui[key]=/[\u3400-\u9fff]/.test(item.source)?t.en:item.source;
 zh.ui[key]=manual[item.source]??t.zh;
}
if(missing.length)throw new Error(`Missing ${missing.length} translations: ${missing.slice(0,8).join(', ')}`);
for(const [locale,messages] of [['en',en],['zh-CN',zh]])fs.writeFileSync(path.join(dir,locale+'.json'),JSON.stringify(messages,null,2)+'\n');
console.log('Bilingual catalogs written:',Object.keys(source).length);
