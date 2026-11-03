/**
 * iMile Management – Firestore bridge for the original Flotta Nyilvántartó.
 * Keeps the full original UI, logic and data model.
 * Single shared account, multi-computer real-time via one shared state document.
 * Free Spark plan only. No paid services.
 *
 * Requires the Firebase project to have an Auth user created in the Console
 * (email: imilemanagement@imile.internal or similar) and matching Security Rules.
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

  const SHARED_EMAIL = 'imilemanagement@imile.internal';
  const SHARED_STATE_PATH = 'flottaSharedState/current';
  const LOCAL_CACHE_KEY = 'flotta_firestore_cache_v1';

  let app, auth, db, unsubState = null;
  let applyingRemote = false;
  let lastWrittenVersion = 0;

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.firebase) return resolve();
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js';
      s.onload = () => {
        const a = document.createElement('script');
        a.src = 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth-compat.js';
        a.onload = () => {
          const f = document.createElement('script');
          f.src = 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore-compat.js';
          f.onload = resolve;
          f.onerror = reject;
          document.head.appendChild(f);
        };
        a.onerror = reject;
        document.head.appendChild(a);
      };
      s.onerror = reject;
      document.head.appendChild(s);
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

  function applyRemoteSnapshot(data) {
    if (!data || applyingRemote) return;
    applyingRemote = true;
    try {
      if (typeof applySnapshot === 'function') {
        applySnapshot({
          vehicles: data.vehicles || [],
          fuelCards: data.fuelCards || [],
          drivers: data.drivers || [],
          contacts: data.contacts || []
        });
      }
      lastWrittenVersion = data.version || 0;
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data));
      status('Élő Firestore kapcsolat – közös állapot betöltve');
    } finally {
      applyingRemote = false;
    }
  }

  function startListener() {
    if (unsubState) unsubState();
    const ref = db.doc(SHARED_STATE_PATH);
    unsubState = ref.onSnapshot({ includeMetadataChanges: true }, (snap) => {
      const meta = snap.metadata;
      if (meta.fromCache && !snap.exists()) {
        status('Gyorsítótárazott / offline – helyi cache');
        return;
      }
      if (snap.exists()) {
        const data = snap.data();
        if (data.version && data.version === lastWrittenVersion && !meta.hasPendingWrites) return;
        applyRemoteSnapshot(data);
      }
      if (meta.hasPendingWrites) status('Helyi módosítás visszaigazolásra vár…');
      else if (!meta.fromCache) status('Élő Firestore kapcsolat');
    }, (err) => {
      console.error('Firestore listener error', err);
      status('Adatkapcsolati hiba: ' + (err.message || err), true);
    });
  }

  async function pushState() {
    if (applyingRemote || !auth.currentUser) return;
    const snap = typeof snapshot === 'function' ? snapshot() : null;
    if (!snap) return;
    const version = Date.now();
    const payload = {
      ...snap,
      version,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: auth.currentUser.uid
    };
    try {
      await db.doc(SHARED_STATE_PATH).set(payload, { merge: true });
      lastWrittenVersion = version;
      status('Mentés sikeres – közös állapot frissítve');
    } catch (e) {
      console.error(e);
      status('Mentési hiba: ' + e.message, true);
    }
  }

  // Patch original save() so every local change is pushed to Firestore
  function patchSave() {
    if (typeof save !== 'function') return;
    const originalSave = save;
    window.save = function () {
      originalSave.apply(this, arguments);
      if (!applyingRemote) pushState();
    };
  }

  // Override login to use the single shared Firebase account
  function patchLogin() {
    const originalLogin = window.fleetSimpleLogin;
    window.fleetSimpleLogin = async function (event) {
      event.preventDefault();
      const name = document.getElementById('flottaUsername').value.trim().toLowerCase();
      const password = document.getElementById('flottaPassword').value;
      const error = document.getElementById('flottaLoginMessage');
      const button = document.getElementById('flottaLoginSubmit');
      if (name !== 'imilemanagement' && name !== 'fleetmanager') {
        error.textContent = 'Csak a közös imilemanagement fiók használható.';
        return;
      }
      button.disabled = true;
      error.textContent = '';
      try {
        await initFirebase();
        await auth.signInWithEmailAndPassword(SHARED_EMAIL, password);
        // Keep original session gate happy
        sessionStorage.setItem('flotta_simple_session_v23', JSON.stringify({ user: 'imilemanagement', at: Date.now() }));
        document.getElementById('flottaPassword').value = '';
        if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
        if (typeof flottaHasLoaded !== 'undefined' && !flottaHasLoaded) {
          window.flottaHasLoaded = true;
          if (typeof load === 'function') load();
        }
        startListener();
        patchSave();
        status('Bejelentkezve – valós idejű közös kapcsolat aktív');
      } catch (err) {
        console.error(err);
        error.textContent = 'Bejelentkezés sikertelen. Ellenőrizd a jelszót, vagy hozd létre a fiókot a Firebase Console-ban (imilemanagement@imile.internal).';
      } finally {
        button.disabled = false;
      }
    };

    const originalLogout = window.fleetSimpleLogout;
    window.fleetSimpleLogout = async function () {
      if (auth) await auth.signOut();
      if (unsubState) { unsubState(); unsubState = null; }
      if (originalLogout) originalLogout();
      status('Kijelentkezve');
    };
  }

  function boot() {
    // Wait until original functions exist
    const tryPatch = () => {
      if (typeof fleetSimpleLogin === 'function' && typeof save === 'function') {
        patchLogin();
        // If already has a session, try to resume
        if (typeof fleetGateSession === 'function' && fleetGateSession()) {
          initFirebase().then(() => {
            auth.onAuthStateChanged((user) => {
              if (user) {
                startListener();
                patchSave();
              }
            });
          }).catch(console.error);
        }
      } else {
        setTimeout(tryPatch, 50);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryPatch);
    } else {
      tryPatch();
    }
  }

  boot();
})();
