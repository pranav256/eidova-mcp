# Eidova verification

## Current local checks - 25 November 2026

The current service uses EIDOVA_* settings, design://eidova resource URIs,
the component input for scoped kits and explicit first-visit steps. Only /mcp
and /mcp/full serve the protocol. Superseded aliases and redundant resource
wrappers have been removed.

The library contains 784 active packages. Remaining source files retain their
recorded hashes and licenses. Resource reads validate paths, sizes and hashes.
Generated guidance and file namespaces use Eidova branding. Source attribution
and copyright notices remain in NOTICE and the licensed source records.

Run the following from the MCP repository:

    npm run build:upstream
    npm run check
    npm test
    npm run build
    npm run smoke:stdio
    npm run smoke:package
    npm run benchmark -- --check

Completed locally on 25 November 2026: 121 service tests, type checks and production
builds for both repositories, deterministic runtime generation, built stdio and a
clean 9,494-file package installation. All 11 missing/corrupt-asset diagnostic cases
pass. Discovery and workflow benchmark budgets pass; see [benchmark](BENCHMARK.md).

Website verification passed 24 page/appearance combinations with no accessibility
violations or page errors, six client setup formats, core/full switching, reflow and
text zoom. Source review and two fresh hero copy/rendered-spacing states passed with no
critical or serious findings. Stdio checks cover catalog downloads, local custom
themes and an explicitly configured registry origin. Local HTTP checks cover
both tool profiles and durable, owner-isolated rules/configuration. All 31
theme audits pass. Both complete dependency audits report zero known advisories.

These checks cover local protocol behavior, isolation, validation, resource
integrity and website behavior. Docker and hosted/client-app acceptance were not
rerun for this revision. No deployment or publication was performed.

## Release boundary

The changes are local until explicitly deployed. A successful local build does
not update a running or hosted server. Follow [deployment](DEPLOYMENT.md) for
coordinated API and website promotion, persistence checks and rollback.
Publishing a package or changing production requires a separate release action.

The service returns source, commands and supplied-evidence reviews. It does not
claim hosted installation, app publication, trusted dashboard capture or
accessibility certification. See [runtime boundaries](RUNTIME-BOUNDARIES.md).
