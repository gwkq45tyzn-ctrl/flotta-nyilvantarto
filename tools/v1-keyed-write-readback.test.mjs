/**
 * #213 corrected proof harness.
 * Never SKIP when no emulator is present. Never omit original full Rules.
 * Genuine SDK test+implementation resolve dependencies from staging.
 *
 * Run only under firebase-tools emulators:exec on demo project ID.
 * This wrapper is intentionally an import of the FULL test, not a
 * false-positive test using direct unguarded privileged writeBatch.
 */
import '../staging/imile-management/fleet/v1-fenced-rich-keyed-importer.test.mjs';
