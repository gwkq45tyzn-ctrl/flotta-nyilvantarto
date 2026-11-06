// Creates a separate LOCAL-ONLY copy. Business logic and rules are unchanged.
// Only Firebase SDK connections/configuration are replaced; never publish this copy.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..'),source=path.join(root,'preview-imile-staging');
const destination=process.argv[2];
if(!destination||!path.isAbsolute(destination)||fs.existsSync(destination))throw Error('A new absolute local artifact directory is required.');
fs.cpSync(source,destination,{recursive:true,filter:p=>!path.basename(p).startsWith('.')&&path.basename(p)!=='firebase.json'});
fs.writeFileSync(path.join(destination,'depokapacitas/firebase-config.js'),"export const firebaseConfig={apiKey:'fake-api-key',authDomain:'localhost',projectId:'demo-imile-qa',appId:'1:123:web:localqa'};\n");
const sdk='https://www.gstatic.com/firebasejs/11.10.0/';
const imports="import {connectAuthEmulator} from '"+sdk+"firebase-auth.js';\nimport {connectFirestoreEmulator} from '"+sdk+"firebase-firestore.js';\n";
const connect="connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8787);";
for(const [file,marker]of [
 ['depokapacitas/app.js','const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);'],
 ['staging/imile-management/app.mjs','const auth=getAuth(firebase), db=getFirestore(firebase);'],
 ['depokapacitas/parcel-preview-app.mjs','const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);']
]){
 const p=path.join(destination,file);let code=fs.readFileSync(p,'utf8');
 if(code.split(marker).length!==2)throw Error('SDK initializer must occur exactly once: '+file);
 code=imports+code.replace(marker,()=>marker+connect);
 if(file.includes('parcel-preview-app'))code=code.replace("firebaseConfig.projectId!=='imile-management-staging'","firebaseConfig.projectId!=='demo-imile-qa'");
 fs.writeFileSync(p,code);
}
fs.writeFileSync(path.join(destination,'LOCAL_EMULATOR_ONLY.txt'),'Local Auth/Firestore emulator QA; never deploy.');
console.log('Prepared isolated demo-imile-qa web copy; SDK endpoints only were adapted.');
