---
phase: 2
title: "Update FE Image Convention"
status: completed
priority: P1
effort: "0.5h"
dependencies: [1]
---

# Phase 2: Update FE Image Convention

## Overview

Sua docs upload image de khop voi FE reverse proxy: browser nen render `/uploads/...` relative qua FE/Next rewrite, khong mac dinh prefix `http://localhost:3000`.

## Requirements

- Functional: docs phan Upload Image phai noi ro 2 mode render anh.
- Non-functional: khong doi API response; BE van tra `url` dang `/uploads/evidence/...`.

## Architecture

Current BE response:

```ts
type ImageDto = {
  id: string
  url: string // "/uploads/evidence/..."
  fileName: string | null
  mimeType: string | null
}
```

Preferred FE convention when reverse proxy exists:

```ts
export function resolveImageUrl(url: string) {
  return url.startsWith("http") ? url : url
}
```

Fallback when no proxy:

```ts
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"
export function resolveImageUrl(url: string) {
  return url.startsWith("http") ? url : `${API_ORIGIN}${url}`
}
```

## Related Code Files

- Modify: `docs/audit-results-action-plans-fe-handoff.md`

## Implementation Steps

1. Replace current "Neu FE chay khac origin..." default guidance.
2. Add "Mode A - FE has rewrite/proxy" as recommended.
3. Add "Mode B - no proxy" as fallback only.
4. State API does not change; this is FE rendering convention only.
5. Mention mobile/local demo should prefer same-origin relative path when FE proxy is configured.

## Success Criteria

- [ ] Docs no longer recommend prefixing `localhost:3000` as default.
- [ ] Docs still explain fallback for direct BE origin.
- [ ] FE can render upload images with `/uploads/...` under reverse proxy.

## Risk Assessment

| Risk | Mitigation |
| --- | --- |
| FE has no rewrite configured | Keep fallback BE-origin helper documented. |
| Existing FE already prefixes BE origin | This still works; docs mark it fallback, not invalid. |
| Browser cache stale image | Out of scope; FE can cache-bust if needed. |
