/**
 * iMile Management – Firestore bridge for the original Flotta Nyilvántartó (v2).
 * Preserves the full original UI, logic and data model in index.html.
 * Single shared account, multi-computer real-time, transactional writes.
 * Firestore becomes the single source of truth; old Apps Script sync is gated.
 * Free Spark plan only.
 *
 * Auth account must already exist (imilemanagement@imile-management-staging.firebaseapp.com).
 * users/{uid} document with active:true and role admin/editor must exist.
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
  const LOCAL_CACHE = 'flotta_firestore_cache_v2';
  const PRIMARY_FLAG = 'flotta_firestore_primary';

  let app, auth, db, unsub = null;
  let applyingRemote = false;
  let currentRevision = 0;
  let writeInFlight = false;

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

  function toast(msg, error = false) {
    status(msg, error);
    if (typeof window.toast === 'function') window.toast(msg, error);
  }

  function isPrimary() {
    return localStorage.getItem(PRIMARY_FLAG) === '1';
  }

  
  function patchSessionGate() {
    // Original fleetGateSession only accepts the old fleetmanager hash user.
    // After Firebase Auth succeeds we treat the shared account as valid.
    if (typeof fleetGateSession !== 'function') return;
    const original = fleetGateSession;
    window.fleetGateSession = function () {
      if (auth && auth.currentUser && auth.currentUser.email === SHARED_EMAIL && isPrimary()) {
        return { user: 'imilemanagement', at: Date.now() };
      }
      return original.apply(this, arguments);
    };
  }

  function setPrimary(on) {
    if (on) localStorage.setItem(PRIMARY_FLAG, '1');
    else localStorage.removeItem(PRIMARY_FLAG);
  }

  function applyRemote(data, confirmed) {
    if (!data || applyingRemote) return;
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
      if (!snap.exists()) {
        status(confirmed ? 'Firestore üres – migráció szükséges' : 'Offline / cache – Firestore állapot ismeretlen');
        return;
      }
      const data = snap.data();
      // Only apply confirmed server data or our own pending if it matches local
      if (confirmed || (meta.hasPendingWrites && data.revision === currentRevision)) {
        applyRemote(data, confirmed);
      } else if (meta.fromCache) {
        status('Gyorsítótárazott kapcsolat – módosítás nem ajánlott');
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
      status('Mentés sikeres – rev ' + newRev);
      // Clear dirty flag if original exists
      if (typeof dirty !== 'undefined') window.dirty = false;
      try { localStorage.removeItem('flotta_pending_v16'); } catch (e) {}
    } catch (e) {
      if (e.message === 'REVISION_CONFLICT') {
        status('Ütközés: másik gépen módosították az adatot. Frissítsd az oldalt, vagy exportáld a helyi állapotot.', true);
        toast('Párhuzamos módosítás – adatvesztés elkerülése érdekében a mentés elutasítva. Exportáld a JSON-t.', true);
      } else {
        console.error(e);
        status('Mentési hiba: ' + (e.message || e), true);
      }
    } finally {
      writeInFlight = false;
    }
  }

  function gateOldSync() {
    // Disable old Apps Script push/pull when Firestore is primary
    if (typeof window.pushRemote === 'function') {
      const orig = window.pushRemote;
      window.pushRemote = function () {
        if (isPrimary()) {
          status('Apps Script szinkron letiltva – Firestore az elsődleges forrás');
          return;
        }
        return orig.apply(this, arguments);
      };
    }
    if (typeof window.pullRemote === 'function') {
      const orig = window.pullRemote;
      window.pullRemote = function () {
        if (isPrimary()) return;
        return orig.apply(this, arguments);
      };
    }
    // Also clear the interval if possible by overriding
    if (window.setInterval) {
      // Best-effort: the original sets interval on load; we can't easily clear unknown timers.
      // The pullRemote override is sufficient.
    }
  }

  function patchSave() {
    if (typeof save !== 'function') return;
    const originalSave = save;
    window.save = function () {
      if (!fleetGateSession()) return;
      // Always do localStorage save
      originalSave.apply(this, arguments);
      if (isPrimary() && auth && auth.currentUser) {
        pushTransactional();
      }
    };
  }

  async function verifyMember(uid) {
    try {
      const userDoc = await db.doc('users/' + uid).get();
      return userDoc.exists && userDoc.data().active === true &&
        ['admin', 'editor'].includes(userDoc.data().role);
    } catch (e) {
      return false;
    }
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
        sessionStorage.setItem('flotta_simple_session_v23', JSON.stringify({ user: 'imilemanagement', at: Date.now() }));
        document.getElementById('flottaPassword').value = '';
        if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
        setPrimary(true);
        gateOldSync();
        patchSave();
        startListener();
        status('Bejelentkezve – Firestore elsődleges, valós idejű kapcsolat aktív');
        // Trigger load if needed
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
      if (auth) await auth.signOut();
      if (unsub) { unsub(); unsub = null; }
      setPrimary(false);
      sessionStorage.removeItem('flotta_simple_session_v23');
      if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
      status('Kijelentkezve');
    };
  }

  function resumeIfSession() {
    if (typeof fleetGateSession !== 'function' || !fleetGateSession()) return;
    initFirebase().then(() => {
      auth.onAuthStateChanged(async (user) => {
        if (user && user.email === SHARED_EMAIL) {
          const ok = await verifyMember(user.uid);
          if (ok) {
            setPrimary(true);
            gateOldSync();
            patchSave();
            startListener();
            status('Munkamenet folytatva – Firestore elsődleges');
          }
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
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryPatch);
    } else {
      tryPatch();
    }
  }

  // Export helper for migration / backup
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

  boot();
})();
