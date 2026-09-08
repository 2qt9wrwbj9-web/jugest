# Authorized API checkpoint protocol

Approved explicitly by the user on 2026-09-08 after ordinary git push authentication could not be restored. Stop all CLI authentication/download work. The local branch remains authoritative; no history rewriting is required.

1. Read current local HEAD/status and expected remote feature ref. Ref must equal the previously verified remote checkpoint. On unexpected advancement STOP; never force or overwrite concurrent work.
2. Verify all protected-hashes.json entries. Only additive axis research/tests/docs and the final authorized tests/commands.json registration may differ from runtime273ed61.
3. For every new local commit, read its parent tree and changed file paths/modes/blob bytes directly from git objects, not working-tree files. Validate UTF-8 round trip before using API tree content; binary changes need separately verified blobs. Reject unexpected deletion/mode/scope changes.
4. Create a tree on the previously verified parent tree, including every changed entry. Require returned tree SHA to equal the complete local commit tree SHA. This includes every unchanged file by inheritance; it is not merely a changed-file comparison.
5. Create an API commit with the matching tree and the prior remote equivalent as its parent. Preserve original message and add Local-Equivalent: <local SHA>. Author/time identities may differ; content/tree must not.
6. Re-read remote feature ref immediately before update. Require expected previous SHA; update only astra/axis-auto-selector-shadow with force:false. Re-read ref and commit, require expected new SHA, exact tree equality, expected parent chain. Check main has not changed as part of these operations.
7. Record local/remote/tree mappings and task/test state in WORK-CHECKPOINT.md. Commit and persist documentation through the same guarded protocol. A checkpoint file cannot name its own commit hash; its correspondence is available through the next checkpoint or remote Local-Equivalent trailer.

The GitHub API is a connected, normally authenticated tool. Do not extract credentials, alter tokens, use content-equivalence to skip tests, touch Production/main, or import shadow code into visible runtime. A feature push may trigger existing Preview CI; that is not manual Production deployment or final verification evidence.

Original a128347 → local65be2ac was copied as four ordered equivalent commits, not squashed; all four full tree hashes matched. The original local commits remain intact.
