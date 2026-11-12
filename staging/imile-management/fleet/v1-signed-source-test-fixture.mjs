/** Exactly equal synthetic-only Fleet snapshot in parent and OS workers. */
export const PROJECT_ID='demo-imile-v1-source-epoch-binding';
export const REGISTRY_AUDIENCE='demo-imile-v1-owner-registry';
export const SIGNER_ID='local-test-owner';
export function makeSyntheticSignedFleet(){
  return {
    drivers:[
      {id:'synthetic-driver-1',daCode:'DA0001',name:'NO_REAL_PERSON_A',
        status:'aktiv',kapacitas:80,
        history:[{kind:'hire',metadata:{nested:[{unicode:'Árvíztűrő'}]}}]},
      {id:'synthetic-driver-2',daCode:'DA0002',name:'NO_REAL_PERSON_B',
        status:'aktiv',kapacitas:40,
        history:[{kind:'handoff',metadata:{hours:[4,5]}}]}
    ],
    vehicles:[{id:'synthetic-car-1',rendszam:'ABC-123',
      status:'aktiv',history:[{parts:{alpha:1,beta:true}}],
      metadata:{future:{preserve:true}}}],
    fuelCards:[{id:'synthetic-fuel-1',history:[{limit:0}]}],
    contacts:[{id:'synthetic-no-contact-1',notes:'NO_REAL_PERSONAL_DATA'}],
    newFields:{deep:{keep:['this',{exact:true}]}}
  };
}
