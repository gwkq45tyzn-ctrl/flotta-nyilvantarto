# Apps Script and Firebase production access – 2026-11-13

**SHA:** `34bfa17931502c0af1515c8c6ac280945e952cb0`

## Still UNKNOWN (owner access only)
1. Apps Script project IDs, versions, owners, execution identities.
2. Active triggers (time-driven / installable) and linked Sheet IDs.
3. Webapp deployment URLs and actual write destinations.
4. Firebase production project IAM principals that can write sealed collections or highwater.
5. Whether any service account other than the intended privileged importer can write the sealed source.

## What is known from code
- Bridge gates old Apps Script sync after verified import.
- Legacy setup button is hidden; live Apps Script is not disabled remotely.
- No script IDs or production IAM policy is present in the repository.

**Do not invent IDs or modify live systems.**

**Full V1 NO-GO** until these are verified read-only.
