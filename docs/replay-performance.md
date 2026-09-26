# Replay performance — test demo

Measured on `1-5696bfd6-477d-422f-ab84-6914e9fc6d2e-1-1.dem.zst` (Mirage FACEIT SourceTV).

| Metric | Value |
|---|---|
| Upload size | 118.5 MB |
| Decompress time | 0.21 s |
| Decompressed size | 158.4 MB |
| Parse time (demoparser2, 8 Hz ticks) | 1.11 s |
| Normalise time | 2.01 s |
| Rounds | 17 |
| Score (CT–T) | 9–8 |
| Players | 10 |
| Sample frames (all rounds) | 6,593 |
| Events (all rounds) | 275 |
| Match metadata JSON | ≈3 KB |
| Round 1 replay JSON | ≈310 KB |
| All round replay JSON (sum) | ≈12.3 MB |

Round-scoped endpoints keep typical Radar payloads to a few hundred KB per round.
