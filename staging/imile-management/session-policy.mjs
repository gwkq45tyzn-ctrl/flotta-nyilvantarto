/**
 * Frontend menu role check. Server-side authorization remains in Firestore Rules.
 */
export const validRoles=Object.freeze(['admin','editor','viewer']);
export function allowedProfile(profile) {
  return !!profile && profile.active === true && validRoles.includes(profile.role);
}
export function menuEntries(profile) {
  if (!allowedProfile(profile)) return [];
  // Staging Fleet master maintenance is admin-only; full legacy Fleet remains unmigrated.
  return [{id:'depo',enabled:true},{id:'fleet',enabled:true,editableByAdmin:true}];
}

// Public login identifier; Firebase Auth still verifies the password.
export function loginEmailForUsername(username) {
  if (typeof username !== 'string') return null;
  const value=username.trim().toLowerCase();
  if(value==='imilemanagement')return 'imilemanagement@imile-management-staging.firebaseapp.com';
  // Invited users sign in with their own account email, guarded by Firestore user roles.
  if(value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return value;
  return null;
}
