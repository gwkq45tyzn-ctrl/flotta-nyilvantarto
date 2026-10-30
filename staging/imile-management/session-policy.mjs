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

// Public login identifier only; Firebase Authentication verifies the password.
export function loginEmailForUsername(username) {
  if (typeof username !== 'string') return null;
  return username.trim().toLowerCase() === 'imilemanagement'
    ? 'imilemanagement@imile-management-staging.firebaseapp.com'
    : null;
}
