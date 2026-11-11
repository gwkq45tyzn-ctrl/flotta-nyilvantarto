/**
 * #184 executable shim. Firebase packages live under the locked staging
 * package.json, not in the repository root; the real SDK probes execute in
 * that package's module resolution scope. Local emulator ONLY.
 *
 * npm ci --prefix staging/imile-management/fleet --ignore-scripts
 * npx firebase-tools emulators:exec ... "node tools/v1-attestation-sdk-probes.mjs"
 */
import '../staging/imile-management/fleet/v1-attestation-sdk-probes.mjs';
