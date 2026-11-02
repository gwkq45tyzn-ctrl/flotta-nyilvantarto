// Legacy isolated rule/verifier fixtures ONLY. The dedicated quota integration
// test uses real callable Functions and never uses this fixture to mint permits.
export const permitFixture=(uid,driverId,sessionId)=>({source:'upload-quota-v1',version:1,status:'open',uid,driverId,sessionId,
 requestId:'0'.repeat(32),requestCount:1,policyRevision:1,quotaDay:'2026-11-02',createdAt:new Date(Date.now()-1000),
 inExpiresAt:new Date(Date.now()+86400000),outExpiresAt:new Date(Date.now()+86400000),resumeUntil:new Date(Date.now()+2*86400000)});
