# Context and latency benchmark

The SDK `InMemoryTransport` benchmark compares original discovery/handlers with the candidate. It measures anonymous/owner discovery, initialization, representative calls, cold/warm latency and six workflows: choose/install, preserve a brand, review a form, supplied spacing, owner rules and invalid input. Five public workflows also run through core using plain tools without resources/prompts or deferred discovery.

| Compact JSON UTF-8 bytes | Baseline | Candidate |
| --- | ---: | ---: |
| Public full discovery | 125,752 | 51,503 |
| Owner full discovery | 127,977 | 52,511 |
| Core discovery | — | 19,237 |
| Initialize instructions | 1,961 | 305 |
| Theme search response | 34,333 | 6,983 |
| Full choose/install workflow | 180,145 | 80,408 |
| Core choose/install workflow | — | 48,142 |

All six full workflows meet at least 50% byte reduction. Discovery includes schemas. Workflow counts include requests/responses and the text/structured representations carried by the protocol. Large explicit source and rendered evidence are outside small-response budgets.

These are **wire-size measurements**, not model token counts or actual host traces. Clients may inject schemas, expose both representations, cache or repeat content, or use different tokenizers. No tokenizer dependency or universal token-savings claim was added. HTTP caching reduces fetch/CPU cost separately from context cost.

```sh
npm run benchmark -- --check docs/BENCHMARK-CANDIDATE.json
```

Checks enforce core discovery ≤32 KiB, full ≤70 KiB, default search ≤8 KiB, focused guidance ≤4 KiB, six workflow reductions ≥50%, and local warm catalog/guidance p95 ≤200ms. Each warm measurement uses 20 successful calls after the public workflow; the nearest-rank p95 is the 19th sorted sample. Assert-based fixtures use disposable state and exclude credentials/source from reports.

The final local run measured warm catalog p95 **0.75ms** and guidance p95 **0.13ms**. Discovery and workflow byte totals remained unchanged.

Reference: Node 24.20.0, Windows, Intel Core 3 100U. Exact samples/timings are in [baseline](BENCHMARK-BASELINE.json) and [candidate](BENCHMARK-CANDIDATE.json). Hardware and concurrent work affect latency; these are not hosted uptime or latency guarantees.
