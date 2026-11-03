/**
 * Unified V1 staging identity policy. Frontend checks are only convenience:
 * Firestore Rules must separately validate the single authorized UID and role.
 */
export const SHARED_LOGIN_EMAIL='imilemanagement@imile-management-staging.firebaseapp.com';
export const validRoles=Object.freeze(['admin','editor','viewer']);

export function isSharedFirebaseUser(user) {
  return !!user && typeof user.email==='string' &&
    user.email.trim().toLowerCase()===SHARED_LOGIN_EMAIL;
}
export function allowedProfile(profile) {
  return !!profile && profile.active === true && validRoles.includes(profile.role);
}
export function menuEntries(profile) {
  if (!allowedProfile(profile)) return [];
  return [{id:'depo',enabled:true},{id:'fleet',enabled:true,editableByAdmin:true},
    {id:'reports',enabled:true}];
}
/** V1 has ONE shared existing Firebase account; never offer invited accounts. */
export function loginEmailForUsername(username) {
  if (typeof username!=='string') return null;
  const value=username.trim().toLowerCase();
  if(value==='imilemanagement'||value===SHARED_LOGIN_EMAIL)return SHARED_LOGIN_EMAIL;
  return null;
}
