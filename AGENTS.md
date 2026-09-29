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

- Video playback always goes through `/api/public/stream?p=<route>`; absolute routes resolve independently of VIDEO_API_BASE_URL, while relative routes use it, and token/headers come from encrypted video settings. Why: keeps credentials private, permits signed CDN URLs, and restricts proxy hosts.
