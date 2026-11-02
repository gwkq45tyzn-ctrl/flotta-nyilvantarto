import {initializeAppCheck,ReCaptchaEnterpriseProvider,getToken} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js';
import {appCheckSiteKey} from './app-check-config.mjs';
export function createAppCheckGate(app){
 let instance;
 return async()=>{
  if(!appCheckSiteKey)throw Object.assign(Error('Az alkalmazáshitelesítés még nincs jóváhagyva és beállítva. Fotófeltöltés nem indítható.'),{code:'app-check/not-configured'});
  instance??=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:true});
  const result=await getToken(instance,false);
  if(!result?.token)throw Error('Az alkalmazáshitelesítés sikertelen. Próbáld újra.');
 };
}
