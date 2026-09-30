<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Video playback always goes through `/api/public/stream?p=<route>`; absolute routes resolve independently of VIDEO_API_BASE_URL, relative routes use it, provider credentials stay on same-origin hops, and cross-origin signed CDN redirects receive only the browser Range header. Why: keeps credentials private, avoids invalidating signed CDN requests, and restricts proxy hosts.
- Lecture deep links resolve provider metadata and signed media only inside `resolveLecture`; the browser receives no provider credentials. Why: preserves `/watch/...` compatibility without exposing secrets.
- Any website may embed the player and read its stream responses, while upstream media hosts remain restricted by `VIDEO_ALLOWED_HOSTS`. Why: supports third-party playback without turning the server into an open proxy.
- Lecture decryption uses the provider's built-in AES key/IV by default; VIDEO_STREAM_KEY/VIDEO_STREAM_IV are optional overrides. Why: remixes lose secrets and playback must not depend on them.
