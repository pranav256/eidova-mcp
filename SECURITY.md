# Security policy

Before public release, enable GitHub private vulnerability reporting. Use that private channel for suspected vulnerabilities, or privately contact the repository owner if unavailable. Include version, transport, reproduction and impact without posting real keys or private content. No response-time SLA is currently promised.

Locally tested boundaries:

- Source review requires inline content; hosted tools cannot read arbitrary server paths or execute submitted projects.
- External fetches validate/pin public DNS, revalidate redirects, limit size/time and support cancellation. Credentials are not forwarded to extracted pages.
- Private edits require owner keys. Replacement is explicit; tested atomic/conditional writes preserve saved data on failures.
- Private/MCP responses are uncached. Catalogs and custom registries are intentionally public. Logs contain bounded metadata, not source, rules or keys.
- JSON bodies are limited to 4 MB. A process cap of 16 covers MCP and REST URL extraction before body parsing, returns 429/retry guidance and releases slots on cancellation.

Keys have no email recovery, rotation or revocation. Lost keys lose access; leaked keys cannot be invalidated by this version. Move trusted data to a new workspace and restrict the old deployment when needed. [Deployment](docs/DEPLOYMENT.md) covers persistence and release controls.

The process cap is not a global serverless rate limit. Configure host-level abuse/rate controls before claiming hosted capacity. Browser workers and OAuth/credential administration need separate boundaries and remain later milestones. Audits/reviews have defined scope and do not certify the entire service.
