# Fix deployed lecture playback

## What will change
- Add the missing `/watch/:batchId/:subjectId/:topicId/:lectureId` page so the supplied lecture URL resolves instead of returning 404.
- Resolve that lecture’s signed media URL on the server, keeping provider credentials private.
- Route all manifests, segments, keys, redirects, and range requests through the existing secure stream endpoint.
- Correct the iframe allow-list to include both requested sites: `pwcacorner.vercel.app` and `hrtgksgdjd.vercel.app`.
- Improve startup and recovery behavior by caching short-lived tokens, retrying temporary upstream failures, and preserving seek/range support.

## External-site integration
- Support embedding the published player URL in an iframe.
- Support passing the full `/watch/...` lecture path directly; the external site will not need provider tokens or secret headers.
- Document the exact iframe attributes and optional message format after the deployed-style test passes.

## Verification
- Confirm the supplied lecture path resolves to a real media source.
- Verify the manifest and at least one media segment load through the proxy.
- Verify seeking/range responses and both allowed origins.
- Check the page in a real browser and confirm the latest build has no errors.

## Technical details
- Use TanStack Start server boundaries for upstream API and signed-player resolution.
- Keep all secret reads inside request handlers and use Worker-compatible Web APIs.
- Validate all route IDs and enforce the existing upstream host allow-list.
