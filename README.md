# RadioBG Online

A Progressive Web App (PWA) for streaming live Bulgarian radio stations directly in the browser — with full mobile support and adaptive playback for both Wi-Fi and mobile data connections.

**Live:** https://teochupi.github.io/online_radio/

---

## Features

- Live directory of Bulgarian radio stations via the [Radio Browser API](https://www.radio-browser.info/)
- Adaptive reconnect and buffering logic optimized for mobile data connections
- Stream endpoint rotation on reconnect — automatically tries alternative URLs for the same station
- Data saver mode — automatically activates on slow/cellular connections (2G/3G/4G), limiting bitrate to 128 kbps
- Media Session API integration — lock screen controls and metadata on mobile devices
- Background playback auto-resume when the tab becomes visible again
- PWA-installable — works as a standalone app on Android and iOS
- Fallback station list when the API is unavailable

---

## Tech Stack

| Technology | Role |
|---|---|
| [React](https://react.dev/) | UI framework |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [Vite](https://vitejs.dev/) | Build tool & dev server |
| [Tailwind CSS](https://tailwindcss.com/) | Styling |
| [shadcn/ui](https://ui.shadcn.com/) | UI components |
| [Vite PWA Plugin](https://vite-pwa-org.netlify.app/) | PWA / service worker |

---

## Getting Started

**Requirements:** Node.js 18+ and npm

```sh
# Clone the repository
git clone https://github.com/teochupi/online_radio.git
cd online_radio

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests (Vitest) |

---

## Deployment

The project is configured for automatic deployment to **GitHub Pages** via GitHub Actions on every push to `main`.

To deploy manually:

```sh
npm run build
# then push — the workflow in .github/workflows/ handles the rest
```

---

## Project Structure

```
src/
  App.tsx        # Main application logic and audio playback engine
  main.tsx       # Entry point
  index.css      # Global styles
public/          # Static assets (PWA icons, manifest)
```

---

## License

MIT
