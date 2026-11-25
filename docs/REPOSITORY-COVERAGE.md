# Eidova repository map

Eidova contains the MCP service, component registry, guidance library and resource catalog.

| Path | Purpose |
| --- | --- |
| src/ | HTTP and stdio transports, tools, catalog, validation and storage |
| assets/registry/ | The 31 installable React component kits and their tokens |
| content/library.json | Editable UI, UX and specialist guidance and review rules |
| content/eidova/ | The 784 curated resource packages and their index |
| scripts/ | Builds, imports, checks and local verification workflows |
| tests/ | Protocol, data integrity, isolation, extraction and review regressions |
| docs/ | Setup, API contracts, operating boundaries and verification |
| vendor/upstream/ | Licensed source dependencies and their provenance records |

The sibling Eidova website is a separate repository. The MCP returns source,
commands and evidence-based reviews. Hosted installation, rendering and app
publication are outside its execution boundary. See [runtime boundaries](RUNTIME-BOUNDARIES.md).

Licenses, authors and source records are retained in [NOTICE](../NOTICE) and the
bundled license files. Reference catalogs describe their individual source packages.
