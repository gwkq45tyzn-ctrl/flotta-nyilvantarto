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
  const MIGRATION_APPROVAL = 'flottaMigrationApproval/current';
  const LOCAL_CACHE = 'flotta_firestore_cache_v3';
  const PRIMARY_FLAG = 'flotta_firestore_primary';
  const IMPORT_VERIFIED = 'flotta_import_verified';

  let app, auth, db, unsub = null;
  let memberVerified = false;
  let migrationServerApproved = false;
  let savePatched = false;
  let legacySyncGated = false;
  let applyingRemote = false;
  let currentRevision = 0;
  let writeInFlight = false;
  let localDirty = false;
  // Keep the original Fleet modal's baseline separate from the canonical
  // Firestore snapshot. A stale open form must never overwrite a later,
  // independently committed field from another browser.
  let vehicleEditGuardPatched = false;
  let openVehicleEdit = null;
  const STALE_VEHICLE_DRAFT = 'flotta_stale_vehicle_draft_v1';
  let requeueCount = 0;
  const MAX_REQUEUE = 3;

  // Auth-state restoration and the login button can initialize Firebase at
  // the same time. A global firebase-app object alone does NOT mean auth and
  // firestore SDK modules have loaded. Share one complete initialization.
  let sdkLoading = null;
  let firebaseInitializing = null;
  function loadSdk() {
    const modules = [
      {ready: () => typeof window.firebase?.initializeApp === 'function',
        src: 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js'},
      {ready: () => typeof window.firebase?.auth === 'function',
        src: 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth-compat.js'},
      {ready: () => typeof window.firebase?.firestore === 'function',
        src: 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore-compat.js'}
    ];
    if (modules.every(m => m.ready())) return new Promise(resolve => resolve());
    if (sdkLoading) return sdkLoading;
    sdkLoading = new Promise((resolve, reject) => {
      let i = 0;
      function next() {
        if (i >= modules.length) {
          if (modules.every(m => m.ready())) resolve();
          else reject(new Error('Firebase compat modules not fully initialized'));
          return;
        }
        const m = modules[i++];
        if (m.ready()) { next(); return; }
        const script = document.createElement('script');
        script.src = m.src;
        script.onload = next;
        script.onerror = () => reject(new Error('Cannot load Firebase compat SDK'));
        document.head.appendChild(script);
      }
      next();
    }).catch(error => { sdkLoading = null; throw error; });
    return sdkLoading;
  }

  function initFirebase() {
    if (app && auth && db) return new Promise(resolve => resolve());
    if (firebaseInitializing) return firebaseInitializing;
    firebaseInitializing = (async () => {
      await loadSdk();
      const existing = Array.isArray(firebase.apps) && firebase.apps.length
        ? firebase.app() : null;
      if (existing && existing.options.projectId !== FIREBASE_CONFIG.projectId)
        throw new Error('Unexpected Firebase project in shared Fleet session');
      const initialized = existing || firebase.initializeApp(FIREBASE_CONFIG);
      const initializedAuth = firebase.auth();
      const initializedDb = firebase.firestore();
      initializedDb.settings({ ignoreUndefinedProperties: true });
      app = initialized;
      auth = initializedAuth;
      db = initializedDb;
    })().catch(error => {
      firebaseInitializing = null;
      throw error;
    });
    return firebaseInitializing;
  }

  function status(text, error = false) {
    const el = document.getElementById('syncStatus');
    if (el) {
      el.textContent = text;
      el.style.color = error ? '#b91c1c' : '#065f46';
    }
  }

  // Browser storage alone is NEVER an import authorization. A server-only
  // read of an immutable approval record and an existing imported Fleet
  // snapshot are required, in addition to the Firestore Rules write gate.
  function isPrimary() {
    return migrationServerApproved === true &&
           localStorage.getItem(PRIMARY_FLAG) === '1' &&
           localStorage.getItem(IMPORT_VERIFIED) === '1';
  }

  function setPrimary(on) {
    if (on) localStorage.setItem(PRIMARY_FLAG, '1');
    else localStorage.removeItem(PRIMARY_FLAG);
  }

  function clearVerifiedMigration() {
    migrationServerApproved = false;
    setPrimary(false);
    localStorage.removeItem(IMPORT_VERIFIED);
    // Clear insecure legacy token if a previous build created it.
    localStorage.removeItem('flotta_migration_token');
  }

  async function verifyMigrationApproval() {
    clearVerifiedMigration();
    if (!memberVerified || !auth || !auth.currentUser || !db) return false;
    try {
      const gate = await db.doc(MIGRATION_APPROVAL).get({ source: 'server' });
      const policy = gate.exists ? gate.data() : null;
      if (!policy || policy.status !== 'approved' ||
          policy.approvedUid !== auth.currentUser.uid ||
          !/^[a-f0-9]{64}$/.test(policy.sourceSha256)) return false;
      // A missing Fleet snapshot is NOT a permitted import target. The source
      // must already have been migrated by an authorized privileged process.
      const fleet = await db.doc(SHARED_STATE).get({ source: 'server' });
      const data = fleet.exists ? fleet.data() : null;
      if (!data || !Number.isSafeInteger(data.revision) || data.revision < 1 ||
          data.migrationSourceSha256 !== policy.sourceSha256 ||
          !['vehicles','drivers','fuelCards','contacts'].every(k => Array.isArray(data[k])))
        return false;
      if (!memberVerified || !auth.currentUser ||
          auth.currentUser.uid !== policy.approvedUid) return false;
      migrationServerApproved = true;
      localStorage.setItem(IMPORT_VERIFIED, '1');
      setPrimary(true);
      return true;
    } catch (error) {
      // No cache fallback, no local token workaround and no optimistic unlock.
      console.warn('Fleet migration approval unavailable', error?.code || 'server-read');
      clearVerifiedMigration();
      return false;
    }
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


  function projectStrictMasters(draft) {
    const plate = s => String(s || '').replace(/[\s-]/g, '').toUpperCase();
    const code = s => String(s || '').trim().toUpperCase();
    const drivers = (draft.drivers || []).map(d => {
      const id = code(d.daCode);
      if (!id) return null;
      return { id, data: { name: String(d.name || d.nev || '').trim(), daCode: id, vendor: String(d.agency || d.vendor || '').trim(), capacity: Number(d.kapacitas || d.capacity || 0), active: ['aktiv','aktív'].includes(String(d.status || '').toLowerCase()) } };
    }).filter(Boolean);
    const vehicles = (draft.vehicles || []).map(v => {
      const id = plate(v.rendszam);
      if (!id) return null;
      const model = [String(v.gyartmany || ''), String(v.modell || '')].filter(Boolean).join(' ');
      const st = String(v.status || '').toLowerCase();
      const status = ['aktiv','aktív'].includes(st) ? 'Elérhető' : st === 'szerviz' ? 'Szerviz' : 'Leállított';
      return { id, data: { plate: id, model, status } };
    }).filter(Boolean);
    return { drivers, vehicles };
  }

  async function pushTransactional() {
    if (applyingRemote || !auth.currentUser || !isPrimary()) return;
    if (typeof snapshot !== 'function') return;
    if (writeInFlight) {
      localDirty = true;
      return;
    }
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
        const existing = snap.exists ? snap.data() : {};
        const projected = projectStrictMasters(draft);
        const norm=s=>String(s||'').replace(/[\s-]/g,'').toUpperCase();
        const payload = {
          vehicles: (draft.vehicles||[]).map(v=>({...v,normalizedPlate:norm(v.rendszam)})),
          fuelCards: draft.fuelCards || [],
          drivers: draft.drivers || [],
          contacts: draft.contacts || [],
          revision: next,
          migrationSourceSha256: existing.migrationSourceSha256 || '',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: auth.currentUser.uid
        };
        if (!/^[a-f0-9]{64}$/.test(payload.migrationSourceSha256)) {
          // A missing source identity is a hard STOP, even in synthetic tests.
          // Do not remove this field to make a test harness pass.
          throw new Error('MISSING_MIGRATION_SOURCE');
        }
        // Preserve sealed flag if present; never clear it.
        if (typeof existing.sealed === 'boolean') {
          payload.sealed = existing.sealed;
        }
        // After seal, identity changes must go through keyed documents.
        // This bridge still writes the legacy arrays for pre-seal compatibility.
        // Post-seal array writes are denied by Rules.
        tx.set(ref, payload);
        // After seal, also write keyed documents for identity changes.
        if (existing.sealed === true) {
          const normDA = s => String(s||'').trim().toUpperCase();
          const normPlate = s => String(s||'').replace(/[ -]/g,'').toUpperCase();
          for (const d of (draft.drivers||[])) {
            const id = normDA(d.daCode);
            if (id) tx.set(db.doc('flottaDrivers/'+id), {daCode:d.daCode, status:d.status||'aktiv', kapacitas:d.kapacitas||0});
          }
          for (const v of (draft.vehicles||[])) {
            const id = normPlate(v.rendszam);
            if (id) tx.set(db.doc('flottaVehicles/'+id), {rendszam:v.rendszam, status:v.status||'aktiv'});
          }
        }
        // S7: flottaSharedState is the single canonical source.
        // Mirror writes removed to avoid 501-write budget and orphan risk.
        // Depó reads the projection from flottaSharedState via onSnapshot.
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

  function patchVehicleEditGuard() {
    if (vehicleEditGuardPatched || typeof window.editVehicle !== 'function' ||
        typeof window.closeModal !== 'function' ||
        typeof snapshot !== 'function') return;
    const form = document.getElementById('vehicleForm');
    if (!form) return;
    const originalEdit = window.editVehicle;
    const originalClose = window.closeModal;
    // The original click handler calls editVehicle(id). Capture the exact rich
    // in-memory vehicle that the operator began editing (not a cache label).
    window.editVehicle = function(id) {
      const current = snapshot().vehicles.find(v => v.id === id);
      openVehicleEdit = current
        ? {id, record:JSON.stringify(current), revision:currentRevision}
        : null;
      return originalEdit.apply(this,arguments);
    };
    window.closeModal = function() {
      openVehicleEdit = null;
      return originalClose.apply(this,arguments);
    };
    // Capturing submit runs BEFORE the original inline
    // onsubmit="saveVehicle(event)" writes a full rich Fleet snapshot.
    // On conflict it must STOP that original handler entirely.
    form.addEventListener('submit',function(event) {
      const id = document.getElementById('editId')?.value;
      if (!id || !openVehicleEdit || openVehicleEdit.id !== id) return;
      const now = snapshot().vehicles.find(v => v.id === id);
      if (now && JSON.stringify(now) === openVehicleEdit.record) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const fields = {};
      for (const input of form.querySelectorAll('input[id],select[id],textarea[id]')) {
        fields[input.id] = input.value;
      }
      // Keep this form draft explicitly SEPARATE from flotta_pending_v16:
      // that legacy key represents a whole Fleet snapshot and must never
      // be allowed to replay a stale vehicle into the canonical document.
      let saved = false;
      try {
        localStorage.setItem(STALE_VEHICLE_DRAFT,JSON.stringify({
          id,fields,openedRevision:openVehicleEdit.revision,
          currentRevision,savedAt:new Date().toISOString()
        }));
        saved = true;
      } catch (_) {}
      status(saved
        ? 'Ütközés: ezt az autót másik gépen módosították. A mentés letiltva; a megnyitott űrlap és a helyi piszkozat megőrizve. Az adatokat egyeztesd újranyitás előtt.'
        : 'Ütközés: ezt az autót másik gépen módosították. A mentés letiltva; az űrlapot ne zárd be, másold ki a beírt adatokat.',
        true);
    },true);
    vehicleEditGuardPatched = true;
  }

  function patchSave() {
    patchVehicleEditGuard();
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
        // Authentication only unlocks UI. Server-approved migration is a
        // separate prerequisite for remote writes and applying Fleet state.
        const approved = await verifyMigrationApproval();
        gateOldSync();
        patchSave();
        unlockUI();
        startListener();
        status(approved
          ? 'Bejelentkezve – migráció szerveroldalon jóváhagyva'
          : 'Bejelentkezve – írásvédett; jóváhagyott migráció még nincs');
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
      clearVerifiedMigration();
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
        clearVerifiedMigration();
        if (typeof fleetGateDisplay === 'function') fleetGateDisplay();
        if (user && user.email === SHARED_EMAIL) {
          const ok = await verifyMember(user.uid);
          if (ok) {
            memberVerified = true;
            const approved = await verifyMigrationApproval();
            gateOldSync();
            patchSave();
            unlockUI();
            startListener();
            status(approved
              ? 'Munkamenet folytatva – migráció szerveroldalon jóváhagyva'
              : 'Munkamenet folytatva – írásvédett, migráció még nem jóváhagyott');
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

  // Backward-compatible QA hook: request a fresh SERVER verification only.
  // The old constant token cannot authorize migration or a new Fleet import.
  window.flottaMarkImportVerified = async function () {
    await initFirebase();
    const approved = await verifyMigrationApproval();
    status(approved
      ? 'Szerveroldali migráció-jóváhagyás ellenőrizve'
      : 'Nincs jogosult szerveroldali migráció-jóváhagyás – írásvédelem aktív',
      !approved);
    return approved;
  };

  boot();
})();
