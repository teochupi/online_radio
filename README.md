# RadioBG Online

A Progressive Web App for streaming live Bulgarian radio stations directly in the browser, with mobile-friendly playback recovery and PWA support.

**Live:** https://teochupi.github.io/online_radio/

## Features

- Live directory of Bulgarian radio stations via the [Radio Browser API](https://www.radio-browser.info/)
- Adaptive reconnect and buffering logic for unstable connections
- Stream endpoint rotation on reconnect
- Media Session API integration for lock-screen controls
- Installable PWA support
- Fallback station list when the live API is unavailable

## Getting Started

Requirements: Node.js 18+ and npm

```sh
git clone https://github.com/teochupi/online_radio.git
cd online_radio
npm install
npm run dev
```

Open `http://localhost:8080`.

## Scripts

- `npm run dev` starts the development server
- `npm run build` creates a production build
- `npm run preview` previews the production build locally
- `npm run lint` runs ESLint
- `npm run test` runs the Vitest suite

## Notes

- The deployed GitHub Pages build only keeps `https` streams because browsers block mixed content.
- Known broken station URLs are filtered out in the app to avoid showing dead entries.
