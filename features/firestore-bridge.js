/**
 * iMile Management – Firestore bridge for the original Flotta Nyilvántartó (v3).
 * Preserves the full original UI, logic and data model in index.html.
 * Single shared account, multi-computer real-time, transactional writes.
 * Firestore becomes the single source of truth; old Apps Script sync is gated.
 * Free Spark plan only.
 *
 * Fixes v2 blockers:
 * - UI unlocks only after successful Auth + member check (correct order)
 * - Page refresh resumes Firebase session; old fleetmanager session alone is insufficient
 * - onSnapshot never overwrites dirty local changes
 * - dirty flag and pending local changes stay until confirmed successful write
 * - Primary mode only after explicit verified import
 * - Conflict and offline fail closed
 */
(function () {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBlCd-zedtGN8By47Ks__5O8ssDNRH7xKA",
    authDomain: "imile-management-staging.firebaseapp.com",
    projectId: "imile-management-staging",
    storageBucket: "imile-management-staging.firebasestorage.app",
    messagingSenderId: "91967139054",
    appId: "1:91967139054:web:37d68fd04cc9238e0857ff"
  };

  const SHARED_EMAIL = 'imilemanagement@imile-management-staging.firebaseapp.com';
  const SHARED_STATE = 'flottaSharedState/current';
  const LOCAL_CACHE = 'flotta_firestore_cache_v3';
  const PRIMARY_FLAG = 'flotta_firestore_primary';
  const IMPORT_VERIFIED = 'flotta_import_verified';

  let app, auth, db, unsub = null;
  let memberVerified = false;
  let savePatched = false;
  let legacySyncGated = false;
  let applyingRemote = false;
  let currentRevision = 0;
  let writeInFlight = false;
  let localDirty = false;
  let requeueCount = 0;
  const MAX_REQUEUE = 3;

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.firebase) return resolve();
      const scripts = [
        'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth-compat.js',
        'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore-compat.js'
      ];
      let i = 0;
      function next() {
        if (i >= scripts.length) return resolve();
        const s = document.createElement('script');
        s.src = scripts[i++];
        s.onload = next;
        s.onerror = reject;
        document.head.appendChild(s);
      }
      next();
    });
  }

  async function initFirebase() {
    if (app) return;
    await loadSdk();
    app = firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    db.settings({ ignoreUndefinedProperties: true });
  }

  function status(text, error = false) {
    const el = document.getElementById('syncStatus');
    if (el) {
      el.textContent = text;
      el.style.color = error ? '#b91c1c' : '#065f46';
    }
  }

  function isPrimary() {
    return localStorage.getItem(PRIMARY_FLAG) === '1' &&
           localStorage.getItem(IMPORT_VERIFIED) === '1' &&
           localStorage.getItem('flotta_migration_token') === 'verified-import';
  }

  function setPrimary(on) {
    if (on) {
      localStorage.setItem(PRIMARY_FLAG, '1');
    } else {
      localStorage.removeItem(PRIMARY_FLAG);
    }
  }

  function markImportVerified() {
    localStorage.setItem(IMPORT_VERIFIED, '1');
  }

  function applyRemote(data, confirmed) {
    // Critical: never overwrite local Flotta data before verified import.
    if (!isPrimary()) {
      status('Import előtt – távoli Firestore állapot nem írja felül a helyi Flotta adatot');
      return;
    }
    if (!data || applyingRemote || localDirty) {
      if (localDirty) status('Helyi nem mentett módosítás van – távoli frissítés várakozik');
      return;
    }
    applyingRemote = true;
    try {
      if (typeof applySnapshot === 'function') {
        applySnapshot({
          vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
          fuelCards: Array.isArray(data.fuelCards) ? data.fuelCards : [],
          drivers: Array.isArray(data.drivers) ? data.drivers : [],
          contacts: Array.isArray(data.contacts) ? data.contacts : []
        });
      }
      currentRevision = Number(data.revision) || 0;
      if (confirmed) {
        localStorage.setItem(LOCAL_CACHE, JSON.stringify({ ...data, revision: currentRevision }));
        status('Élő Firestore kapcsolat – közös állapot (rev ' + currentRevision + ')');
      } else {
        status('Gyorsítótárazott / visszaigazolásra váró adat – ne ments, amíg nem élő');
      }
    } finally {
      applyingRemote = false;
    }
  }

  function startListener() {
    if (unsub) unsub();
    const ref = db.doc(SHARED_STATE);
    unsub = ref.onSnapshot({ includeMetadataChanges: true }, (snap) => {
      const meta = snap.metadata;
      const confirmed = !meta.fromCache && !meta.hasPendingWrites;
      // Firestore compat DocumentSnapshot.exists is a BOOLEAN property;
      // the modular SDK exposes exists() as a method. Support both safely.
      const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists === true;
      if (!exists) {
        status(confirmed ? 'Firestore üres – ellenőrzött import szükséges a primary módhoz' : 'Offline / cache – Firestore állapot ismeretlen');
        return;
      }
      const data = snap.data();
      if (confirmed) {
        // Firestore cache / pending local writes are not server-confirmed and
        // must never replace the original Fleet snapshot and localStorage.
        applyRemote(data, true);
      } else {
        status(meta.fromCache
          ? 'Offline / gyorsítótár – távoli adat nem alkalmazható'
          : 'Firestore írás még nem igazolt – helyi adatot nem írjuk felül', true);
      }
    }, (err) => {
      console.error(err);
      status('Adatkapcsolati hiba: ' + (err.message || err), true);
    });
  }

  async function pushTransactional() {
    if (applyingRemote || writeInFlight || !auth.currentUser || !isPrimary()) return;
    if (typeof snapshot !== 'function') return;
    writeInFlight = true;
    const draft = snapshot();
    const draftKey = JSON.stringify(draft);
    try {
      const newRev = await db.runTransaction(async (tx) => {
        const ref = db.doc(SHARED_STATE);
        const snap = await tx.get(ref);
        const serverRev = snap.exists ? (Number(snap.data().revision) || 0) : 0;
        if (serverRev !== currentRevision) {
          throw new Error('REVISION_CONFLICT');
        }
        const next = serverRev + 1;
        const payload = {
          vehicles: draft.vehicles || [],
          fuelCards: draft.fuelCards || [],
          drivers: draft.drivers || [],
          contacts: draft.contacts || [],
          revision: next,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: auth.currentUser.uid
        };
        tx.set(ref, payload);
        return next;
      });
      currentRevision = newRev;
      const latest = snapshot();
      const latestKey = JSON.stringify(latest);
      if (latestKey === draftKey) {
        localDirty = false;
        requeueCount = 0;
        status('Mentés sikeres – rev ' + newRev);
        try { localStorage.removeItem('flotta_pending_v16'); } catch (e) {}
      } else {
        localDirty = true;
        status('Mentés folyamatban – újabb helyi módosítás várakozik');
      }
    } catch (e) {
      localDirty = true;
      if (e.message === 'REVISION_CONFLICT') {
        status('Ütközés: másik gépen módosították az adatot. Frissítsd az oldalt, vagy exportáld a helyi állapotot.', true);
      } else {
        console.error(e);
        status('Mentési hiba: ' + (e.message || e) + ' – helyi módosítás megőrizve', true);
      }
    } finally {
      writeInFlight = false;
      // If a newer edit arrived while we were writing, push the latest snapshot
      if (localDirty && isPrimary() && auth && auth.currentUser && requeueCount < MAX_REQUEUE) {
        requeueCount++;
        Promise.resolve().then(() => pushTransactional());
      } else if (requeueCount >= MAX_REQUEUE) {
        status('Túl sok újrapróbálkozás – exportáld a helyi állapotot és frissítsd az oldalt.', true);
        requeueCount = 0;
      }
    }
  }

  function gateOldSync() {
    // The integrated V1 browser must never fall back to legacy JSONP sync,
    // including before sign-in or on cached/expired sessions. The old central
    // export is obtained privately before cutover and the original deployed
    // Fleet remains untouched until that migration is approved.
    if (legacySyncGated) return;
    legacySyncGated = true;
    if (typeof window.pushRemote === 'function')
      window.pushRemote = function () {
        status('Régi Apps Script írás letiltva – csak ellenőrzött Firebase-átállás');
      };
    if (typeof window.pullRemote === 'function')
      window.pullRemote = function () {
        status('Régi Apps Script olvasás letiltva ezen az integrált V1 felületen');
      };
  }

  function patchSave() {
    if (savePatched || typeof save !== 'function') return;
    const originalSave = save;
    savePatched = true;
    window.save = function () {
      if (typeof fleetGateSession !== 'function' || !fleetGateSession()) return;
      // Pre-import: strictly read-only. Do not call original save or stage pending.
      if (!isPrimary()) {
        status('Import ellenőrzés előtt csak olvasás – mentés letiltva', true);
        return;
      }
      localDirty = true;
      originalSave.apply(this, arguments);
      if (auth && auth.currentUser) {
        pushTransactional();
      }
    };
  }

  async function verifyMember(uid) {
    // Server-only read. Retry once on transient emulator/network errors.
    // A missing or inactive profile is a hard failure, not a retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const userDoc = await db.doc('users/' + uid).get({ source: 'server' });
        const data = userDoc.exists ? userDoc.data() : null;
        if (!data) return false;
        return data.active === true && ['admin', 'editor'].includes(data.role);
      } catch (e) {
        if (attempt === 1) {
          console.error('verifyMember failed', e && e.code ? e.code : e);
          return false;
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }
    return false;
  }

  function unlockUI() {
    sessionStorage.setItem('flotta_simple_session_v23', JSON.stringify({ user: 'imilemanagement', at: Date.now() }));
    if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
  }

  function isAuthenticated() {
    return !!(memberVerified && auth && auth.currentUser && auth.currentUser.email === SHARED_EMAIL);
  }

  function patchSessionGate() {
    if (typeof fleetGateSession !== 'function') return;
    window.fleetGateSession = function () {
      // FAIL CLOSED: any legacy sessionStorage user (including forged
      // imilemanagement) is irrelevant without fresh SERVER-verified role.
      return isAuthenticated()
        ? { user: 'imilemanagement', at: Date.now() }
        : null;
    };
  }

  function patchLogin() {
    window.fleetSimpleLogin = async function (event) {
      event.preventDefault();
      const name = (document.getElementById('flottaUsername').value || '').trim().toLowerCase();
      const password = document.getElementById('flottaPassword').value;
      const error = document.getElementById('flottaLoginMessage');
      const button = document.getElementById('flottaLoginSubmit');
      if (name !== 'imilemanagement') {
        error.textContent = 'Csak a közös imilemanagement fiók használható.';
        return;
      }
      button.disabled = true;
      error.textContent = '';
      try {
        await initFirebase();
        const cred = await auth.signInWithEmailAndPassword(SHARED_EMAIL, password);
        const ok = await verifyMember(cred.user.uid);
        if (!ok) {
          await auth.signOut();
          throw new Error('Nincs érvényes admin/editor profil a users gyűjteményben.');
        }
        // Fresh server profile is mandatory even when Firebase Auth has a cached user.
        memberVerified = true;
        // Pre-import still remains read-only until independent migration approval.
        setPrimary(true);
        // Primary is only fully active after import verified; for login we allow session but gate writes until import
        gateOldSync();
        patchSave();
        unlockUI();
        startListener();
        status('Bejelentkezve – Firestore kapcsolat aktív. Primary mód csak ellenőrzött import után.');
        if (typeof load === 'function' && !window.flottaHasLoaded) {
          window.flottaHasLoaded = true;
          load();
        }
      } catch (err) {
        console.error(err);
        error.textContent = 'Bejelentkezés sikertelen. Ellenőrizd a jelszót és hogy a fiók (imilemanagement@imile-management-staging.firebaseapp.com) létezik és aktív profilja van.';
      } finally {
        button.disabled = false;
      }
    };

    window.fleetSimpleLogout = async function () {
      memberVerified = false;
      if (auth) await auth.signOut();
      if (unsub) { unsub(); unsub = null; }
      setPrimary(false);
      localDirty = false;
      sessionStorage.removeItem('flotta_simple_session_v23');
      if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
      status('Kijelentkezve');
    };
  }

  function resumeIfSession() {
    initFirebase().then(() => {
      auth.onAuthStateChanged(async (user) => {
        memberVerified = false;
        if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
        if (user && user.email === SHARED_EMAIL) {
          const ok = await verifyMember(user.uid);
          if (ok) {
            memberVerified = true;
            setPrimary(true);
            gateOldSync();
            patchSave();
            unlockUI();
            startListener();
            status('Munkamenet folytatva – Firebase Auth érvényes');
          } else {
            memberVerified = false;
            await auth.signOut();
            status('Érvénytelen profil – kijelentkeztetve', true);
          }
        } else {
          setPrimary(false);
          if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
        }
      });
    }).catch(console.error);
  }

  function boot() {
    const tryPatch = () => {
      if (typeof fleetSimpleLogin === 'function' && typeof save === 'function') {
        patchLogin();
        patchSessionGate();
        gateOldSync();
        resumeIfSession();
      } else {
        setTimeout(tryPatch, 40);
      }
    };
    // Script loads after all original Fleet function definitions. Patch NOW,
    // before the subsequent inline legacy gate evaluates sessionStorage.
    // Waiting for DOMContentLoaded created a pre-Auth legacy unlock window.
    if (typeof fleetSimpleLogin === 'function' && typeof save === 'function') {
      tryPatch();
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryPatch);
    } else {
      tryPatch();
    }
  }

  window.flottaExportShared = function () {
    if (typeof snapshot !== 'function') return null;
    const data = snapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flotta-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    return data;
  };

  window.flottaMarkImportVerified = function (token) {
    if (token !== 'verified-import') {
      status('Érvénytelen migrációs token – primary mód nem engedélyezve', true);
      return false;
    }
    markImportVerified();
    localStorage.setItem('flotta_migration_token', 'verified-import');
    status('Ellenőrzött import token elfogadva – Firestore primary mód engedélyezve');
    return true;
  };

  boot();
})();
