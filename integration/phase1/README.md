# Phase 1 improvements — integration pending

**25 October local checkpoint:** narrow improvements have now been implemented in Studio: asynchronous moment capture, bounded/validated moment windows, ffprobe validation before real clips become ready, and explicit real-capture defaults. These are not a wholesale application of the patches below. Full recorder provenance, bounded parser subprocesses, durable recovery, remote workers and remaining replay corrections are still pending. Fresh local evidence is in the [V1 runbook](../../docs/LOCAL-V1-RUNBOOK.md).

These patches preserve the useful differences from the hardened Phase 1 source without duplicating a second application. **They are review material, not applied fixes.** The active app is still the existing Studio baseline, with its accounts, roles, Lab and review features intact.

Each patch compares the recorded Studio working-tree version to the recorded Phase 1 version. No patch deletes Studio-only files. However, applying entire replacements could still remove account-aware behaviour inside shared files. Review and port individual changes; passing `git apply --check` proves only textual compatibility.

Source hashes and file lists: [source inventory](../../docs/consolidation/source-inventory.json), [import manifest](../../docs/consolidation/import-manifest.json). Historical validation: [Phase 1 results](../../docs/reference/phase1/PHASE1-RESULTS.md). Those results are not fresh tests of the combined product.

## Integration order

These are subtasks of RR01/RR03/RR05 and their dependent delivery tasks, not a new backlog.

| Order / owner | Patch | Keep and reconcile | Required evidence |
|---|---|---|---|
| 1 · Pawel, Aleksander reviews contracts | [API reliability](api-reliability.patch) | Upload byte/admission limits; bounded parser subprocess; restart/atomic persistence; recording provenance and ffprobe checks; bounded inference. Preserve Studio sessions, roles, owner checks and existing routes. Phase 1's access middleware is a reference, not a replacement identity system. | Studio account/ownership tests plus ported limits, timeout, recovery, clip and inference tests; one real-demo run. |
| 2 · Pawel | [Replay correctness](replay-correctness.patch) | Stable team identity through side switches, selected-player results, discrete life/HP and exact death timing on reverse seek. Preserve the current shared clock and source contracts. | Replay unit checks, side-switch/overtime fixtures, forward/reverse seek and clip/radar alignment. |
| 3 · Aleksander, Pawel owns contracts | [Coach and contracts](coach-and-contracts.patch) | Honest generated/template presentation and supporting contract changes. Coordinate with API defaults, cache invalidation and player/owner context. | EN/PL fixture answers, provenance and fallback states; no fabricated factual-verification claims. |
| 4 · Pawel, Aleksander checks tools | [MCP access](mcp-access.patch) | Transport restrictions and access tests. Reconcile Phase 1's restrictions with Studio's existing scoped token gate. | Anonymous/foreign-owner denial and intended owner access through every supported transport. |
| 5 · Pawel | [Dependencies and runtime](dependencies-and-runtime.patch) | Patched packages/lockfiles, non-root containers, same-origin routing and configuration examples. Regenerate merged locks with all Studio requirements, including accounts dependencies. | Clean install, type/lint/build, API/MCP tests, Docker configuration and isolated data-directory smoke. |

## Deliberately excluded variants

Keep Studio's current routing, sign-in and layout. Do not import the Phase 1 token-login page, older root/processing/Studio/upload screens, typography/styles or navigation as a replacement UI. The original label README is also retained in its source; its older format must not silently replace the current labelling contract.

The manifest records every selected and excluded Phase 1 path. Omitted source remains at `C:/Users/pawel/Documents/cs2-demos-phase1-source/cs2-demos`.

## Completion rule

A domain is integrated only after the runtime changes, contract compatibility and relevant checks pass together. Update the RR task with actual paths and evidence. Do not mark the cloud or invited-user release ready merely because these files are now collected in one folder.
