# Archive: Fix absent projection archive refusal

**Change ID:** fixAbsentProjectionArchive
**Archived:** 2026-08-08T17:11:43.731Z
**Created:** 2026-08-08T07:01:44.685Z

## Tasks Completed

- ✅ Split MANIFEST_UNREADABLE into MANIFEST_ABSENT | MANIFEST_INVALID via structural git probe
- ✅ Route MANIFEST_ABSENT to reconcile instead of hard refusal in handlers-archive.ts
- ✅ Integrity guards: corrupt/mismatched manifests still refuse; exhaustiveness compiles
- ✅ Integration verification: synthetic stuck change archives to terminal; full suite green

## Specs Modified

- **advance-workflow**: 2 delta(s)
