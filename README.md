# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## External player integration

The deployed player can be embedded only by these approved sites:

- `https://pwcacorner.vercel.app`
- `https://hrtgksgdjd.vercel.app`

### Lecture links

For a PW lecture, use the complete player URL as the iframe source. Replace
`PLAYER_ORIGIN` with this project's published origin:

```html
<iframe
  src="PLAYER_ORIGIN/watch/BATCH_ID/SUBJECT_ID/TOPIC_ID/LECTURE_ID"
  title="Lecture player"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen
  referrerpolicy="strict-origin-when-cross-origin"
  style="width:100%;aspect-ratio:16/9;border:0"
></iframe>
```

The player resolves the lecture and signed stream internally. The external
site must not send API credentials, tokens, or provider headers.

### Direct video routes

For a video route already known by the external site, either set the iframe
URL parameters:

```text
PLAYER_ORIGIN/?v=ENCODED_VIDEO_ROUTE&format=hls&autoplay=true
```

or wait for the iframe's readiness event and send the route:

```js
window.addEventListener("message", (event) => {
  if (event.origin !== "PLAYER_ORIGIN" || event.data?.type !== "player-ready") return;

  document.querySelector("iframe")?.contentWindow?.postMessage(
    {
      type: "play",
      route: "/video/master.m3u8",
      format: "hls",
      poster: "https://example.com/poster.jpg",
    },
    "PLAYER_ORIGIN",
  );
});
```

`format` may be `hls`, `dash`, or `mp4`. Always use the exact published
player origin as the `postMessage` target and expected event origin.
