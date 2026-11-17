# Independent registry checkpoint: conditional antirollback, production NO-GO

Baseline: #387, `70cc778671cdadbbcce801d6658a8cabcb77b9be`.

## Attack and enforced boundary

A Firestore privileged writer can restore every old highwater/receipt, despite
Rules and valid Ed25519 signatures. The mandatory 440-pair emulator test retains
that successful attack against the database-only demo. Another Firebase document
under that writer's control does not solve it.

The strict content path adds `independentRegistryPath` and
`independentlyPinnedRegistrySha256` as verifier-constructor configuration. Both
must be supplied together. The file contains the EXACT approved root-signed
registry envelope. Its exact UTF-8 bytes are pinned in independently controlled
verifier deployment configuration; its Ed25519 root fingerprint remains separately
pinned. Every registry/source check rereads the bounded regular file, checks the
byte pin, requires canonical envelope equality, then retains the existing root
signature, project/audience, sequence, expiry, revocation and source signature
checks. The highwater adopter also enforces the checkpoint before each transaction
attempt. Both signed-source epoch binding and 440 chunk/aggregate checks forward
the constructor configuration. No per-request floor or authority override exists.

Only the approved snapshot is accepted, even for a higher signed sequence. This
conservative equality is a minimum AND maximum accepted state: sequence alone
cannot permit a same-sequence equivocation or a later revocation-set removal.
Missing, unreadable, changed, symlinked or old checkpoint files fail closed. There
is no automatic initialization from Firestore or fallback to an old checkpoint.
A new verifier process with the same independent configuration retains the rule.

## Required real deployment configuration (not performed here)

1. An owner/security operator authenticates the real Ed25519 root fingerprint
   out of band. The private root key remains offline, outside importer and CI.
   The operator approves the current registry, inclusive cumulative revocations,
   exact envelope bytes, project/audience, sequence and digest.
2. A DIFFERENT security principal owns verifier code, deployment configuration,
   checkpoint and ALL containing directories. The importer principal has no
   write/chmod/chown/rename rights there, cannot replace the mount or code, has
   no administrator/root/container-host capability, and cannot change the
   process environment, startup command, path, pin or root fingerprint. A
   read-only checkpoint mount alone is insufficient if that principal controls
   the host or deployment. Same-user mode 0400/0500 is insufficient: the owner
   can chmod it back.
3. Firestore migration credentials are scoped independently. Their holder must
   have no ability to impersonate the verifier/deployment/security principal,
   mint its tokens, change its IAM policy, update its secret/configuration or
   roll back its deployment. Live UID, credential grants, inherited/custom IAM,
   impersonation/delegation and deployed Rules require owner-side read-only
   evidence. Browser Rules cannot constrain an Admin SDK credential. No live
   role was inspected or changed by this patch.
4. Roll forward requires an explicit security-operator change: verify old pin,
   strictly greater sequence, preserved revoked fingerprints, intended root/key
   rotation and correct source context; install a new signed checkpoint and
   pin together. Stop admission during rollout, invalidate old running verifier
   instances/credentials and prohibit old deployment/config restore. Recovery
   of the database must retain the current independent checkpoint. Recovery of
   the security boundary requires its own monotonic release record; restoring
   both verifier configuration and checkpoint from an old backup reopens the
   attack. This patch does not provide a remote monotonic witness or enforce
   that operational procedure.
5. Demonstrate in a disposable, isolated deployment that the ACTUAL importer
   identity cannot modify/replace the checkpoint, pins, code or deployment,
   impersonate the security principal, or start an older admission service.
   Capture permissions and denied attempts without secrets. No new paid service
   is required by this design; available owner-controlled isolated infrastructure
   and its administration still need verification.

If the attacker controls BOTH datastore and verifier security boundary, there is
no software-only local antirollback guarantee: they can replace verifier code or
its floor. Even a signed old image remains valid cryptographically. An independent
monotonic deployment/admission authority or equivalent protected state is required.

## Evidence and remaining NO-GO

Offline tests use genuine ephemeral Ed25519 keys and a fresh OS process. They
verify approved-source acceptance and deny old registry replay after revocation,
valid old file substitution, changed bytes, deletion, symlinks, bad UTF-8, unknown
newer state, equivocation and invalid signature/context. The real Firebase test
performs privileged highwater restore/deletion and checks both restarted 440
chunk and aggregate paths deny the revoked registry with the independent pin.
It retains the unconstrained database-only counterexample.

Synthetic fixture files are writable by the test process. Therefore these tests
prove enforcement relative to trusted configuration, NOT independent deployment
ownership, actual owner identity, live IAM, trusted time, timely revocation,
closed legacy writers, production restore safety or full V1 readiness. Every
production authorization/provenance flag stays false. Omitting checkpoint options
still selects the explicitly legacy demo; it MUST NOT be an admission service.
The public release/import gates remain denied. No live Rules/IAM/script change,
production import, deploy or merge is included. #83 independent Grok and ChatGPT
same-version GO and subsequent explicit owner authorization remain mandatory.
