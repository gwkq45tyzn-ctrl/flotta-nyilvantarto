/**
 * Frontend menu role check. Server-side authorization remains in Firestore Rules.
 */
export const validRoles=Object.freeze(['admin','editor','viewer']);
export function allowedProfile(profile) {
  return !!profile && profile.active === true && validRoles.includes(profile.role);
}
export function menuEntries(profile) {
  if (!allowedProfile(profile)) return [];
  // Read-only Fleet shares Firebase Auth; legacy Fleet backend migration remains pending.
  return [{id:'depo',enabled:true},{id:'fleet',enabled:true,readOnly:true}];
}
