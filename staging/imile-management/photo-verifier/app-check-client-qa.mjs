import {initializeAppCheck,CustomProvider} from 'firebase/app-check';
export function attachQaAppCheck(app){
 if(app.options.projectId!=='demo-imile-quota')throw Error('DEMO_ONLY');
 return initializeAppCheck(app,{provider:new CustomProvider({getToken:async()=>{
  const response=await fetch('http://127.0.0.1:8181/token');if(!response.ok)throw Error('QA_AUTHORITY_UNAVAILABLE');return response.json();
 }}),isTokenAutoRefreshEnabled:false});
}
