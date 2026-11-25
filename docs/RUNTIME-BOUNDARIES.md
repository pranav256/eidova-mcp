# Eidova runtime boundaries

Eidova provides HTTP and local stdio transports. The full profile exposes 41
public tools and 42 with an owner workspace; core exposes 13 read-only tools.
Use the discovered schemas as the current input contract.

## Tools and execution

- Catalog tools return component source, registry commands, tokens and design context.
- Guidance tools return locally stored instructions and examples.
- Source review accepts complete inline file contents; paths are labels.
- Spacing review evaluates caller-supplied rendered geometry and styles.
- First-visit review ranks supplied walk reports; it does not conduct user research.
- Video and listing tools return guidance or source, without rendering or publication.
- Feature-map tools process supplied paths or map text and return changes for the caller to save.

The MCP does not install components, run submitted code, write caller-selected
server paths, install editor hooks or provide a separate listing CLI.
The local review-browser command captures a loopback preview; preview-install
checks an inventory and diff-tokens compares supplied token files.

## Network and storage

Public URL extraction uses bounded, DNS-pinned fetching and rejects unsafe
addresses and redirects. Registry and icon reads resolve through local adapters.
Submitted source and resource files are data; they are not executed by the service.

Persistent theme mutations and private rules require an owner capability key.
Theme configuration and registry output are public by design. Rules are owner-scoped
and uncached. Keep keys out of URLs, logs and public files.

Local state uses .eidova/state or EIDOVA_STATE_DIR. Hosted state requires durable
private storage. An optional local archive serves the owner's saved content;
HTTP does not load that archive or expose its captured payloads.

## Evidence and limits

Source review is not visual approval. Caller-supplied reports do not prove that
a browser or person performed a task. Missing trusted browser capture remains an
explicit limitation. Automated checks do not certify accessibility.

See [API](API.md), [security policy](../SECURITY.md) and [NOTICE](../NOTICE) for
current contracts, reporting boundaries and required source attribution.
