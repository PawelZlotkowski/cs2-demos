---
name: rr-security
description: Audit or harden Round Reviewer uploads, authorization, parser isolation, model budgets and worker access for personal or public use.
---

# Round Reviewer security

Assess the requested deployment: personal loopback use, invited beta or untrusted public users. Preserve the user's context/memory setup and existing work. An audit request authorizes inspection and safe probes, not an unrelated implementation or deployment.

Trace upload bytes through multipart handling, storage, decompression and native parsing. Count streamed bytes before allocation, retain CS2 magic checks and decompressed limits, bound disk/queued jobs and enforce a killable parser deadline. A timed-out thread future does not stop native execution.

For hosted use, require identity and match ownership on every read/write, clip, retry, Ask, history and MCP operation. Random match IDs and CORS are not authorization. Workers claim numeric/structured jobs with scoped credentials; never accept model-generated commands or executable paths.

Bound inference tokens, total tool calls, tool-output bytes, concurrency and wall-clock cost. Treat uploaded names/questions/knowledge as untrusted data. Citation checks do not prove semantic truth.

Check resolved dependency versions, private caching, secrets handling, non-root services and dev-server exposure. Distinguish confirmed defects from configuration-dependent advisories. Prove access isolation and overload behavior with synthetic artifacts. Report source lines, trigger, consequence, mitigation and what was actually tested; never certify security from unit tests alone.
