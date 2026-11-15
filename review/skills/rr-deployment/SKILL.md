---
name: rr-deployment
description: Prepare or deploy a scoped Round Reviewer local-to-cloud configuration with a EUR 30 testing budget and separate local Windows recording worker.
---

# Round Reviewer deployment

Default project stage is personal local testing, then a limited public beta. Hardware is Ryzen 9 9950X, RTX 5080 16 GB and 64 GB RAM; testing cloud budget is EUR 30/month. Preserve user-managed context and memory.

For a planning request, produce reviewable configuration/costs without purchasing services. For an authorized deployment, act within the specified account/provider scope and spending limit. Verify current checkout prices, taxes, storage, networking and stopped-resource costs; do not reuse stale promotional rates.

Prefer local parsing/inference/recording initially. A small EU x86 VPS can serve API/web, with private object storage only when needed. Do not place native parsing or game recording in a request-limited frontend function. Linux inference rental does not automatically configure Windows HLAE/Steam recording.

Before public access, require ownership checks, bounded uploads/jobs, parser process limits, private clips, HTTPS, durable worker claims, retention/deletion and backup recovery. Keep databases/tracker/MCP private unless separately secured. Local workers poll outbound authenticated jobs; credentials permit only necessary artifacts and numeric work.

Include model/recorder availability and an explicit offline-worker state. Implement hard application job/spend limits plus alerts; provider alerts alone are insufficient. Validate cross-user denial, overload, restart, worker retry and restore. Report the local-host availability dependency and the actual deployed cost/configuration.
