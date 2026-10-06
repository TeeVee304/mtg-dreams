<p align="center">
  <img src="build/icon.png" width="96" alt="MTG Dreams icon">
</p>

<h1 align="center">MTG Dreams</h1>

<p align="center">
  Organize the *Magic: The Gathering* decks you own and plan wishlists, with Cardmarket prices in EUR.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white" alt="Electron 44">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9">
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A522.12-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22.12+">
  <img src="https://img.shields.io/badge/card%20data-Scryfall-8A2BE2" alt="Card data: Scryfall">
  <img src="https://img.shields.io/badge/prices-Cardmarket%20(EUR)-E3A94F" alt="Prices: Cardmarket (EUR)">
</p>

## Features

### Collection
- **Inventory**: the cards you own, by name and quantity.
- Optionally record which versions and foils you own; decks and wishlists then
  show your version for lines that don't ask for one. Owning any version of a card still counts as owning it.
- Each card shows which decks use it and which wishlists want it.
- **Inventory Value** estimates what your inventory is worth and ranks your most valuable cards. It also shows how the value changed this week or this month.

### Decks and Wishlists
- **Decks** are built from your inventory: you can only add cards you own, up to the copies you have.
- **Owned copies** (Settings) are *separate per list* by default: each deck and wishlist needs its own copies, as when
  decks stay built. Decks get your copies first (by name), then wishlists by priority. Choose *shared between lists*
  if you move cards between decks: then one copy counts for every list.
- **Wishlists** list the cards you want and what they still cost. Owned cards are ticked.
- A **Stats** panel shows the mana curve and the colors of the cards besides lands.
- A **Tokens** panel at the bottom lists the tokens, emblems and helpers the cards create, with which cards make each one.
- Give a wishlist a **priority** (High, Normal, Low) from its ⋯ menu: it weights its cards in Most Wanted and, with separate copies, decides which wishlists get your copies first.

### Most Wanted
- Every card your wishlists still miss, merged across lists. With separate copies, it buys a copy for each list; with shared copies, one copy you buy counts for every list that wants it.
- Ranked by **best value** (cost per list served, priority-weighted) by default; also by most wanted, closest to completing, cheapest, or card properties.
- Badges show cards that complete a list, got cheaper, or are on a friend's trade list.
- A **Budget planner** picks the cards that bring your lists furthest for a budget; with separate copies it can buy some of a card's copies, for the lists first in line.

### Precons
- Pick from about 3 000 official products: Commander decks, Challenger decks, Secret Lair drops and more.
- A precon you own becomes a deck, with its exact printings, and its cards join your inventory.

### Trades with friends
- **Share my trade list** saves a small `.mtgtrade` file, or copies it as text for a chat. It holds the cards you own and what your lists need (the cards Most Wanted lists).
- Import a friend's list to see what each of you can give the other, and what each side is worth.
- Friends without the app can send a plain card list or a Moxfield export instead.

## Getting started

### Run from the source code

Install [Node.js](https://nodejs.org/) 22.12 or newer, then double-click **`mtg-dreams.bat`**.

- The first run installs the dependencies.
- Later runs rebuild the app only when the code has changed.
- For a shortcut, right-click the `.bat` → *Show more options* → *Send to → Desktop (create shortcut)*.

### Build an installer

```bash
npm run dist
```

- This creates `dist/mtg-dreams-setup-<version>.exe`, which runs on any Windows PC without Node.js.
- It installs for the current Windows user, without admin rights.
- It adds Start Menu and Desktop shortcuts, and an uninstaller: *Uninstall MTG Dreams* in the Start Menu, or under
  *Settings → Apps*.
- The installer isn't code-signed, so Windows SmartScreen warns the first time: choose *More info → Run anyway*.
- Running a newer installer updates the app; your data is kept.
- `npm run dist:portable` builds `dist/mtg-dreams-portable-<version>.exe`, which runs without installing.

## Data

Everything is stored per Windows user.

| What | Where |
| --- | --- |
| Decks, wishlists, inventory and trades | `Documents\MTG Dreams\` |
| Settings and caches | `%APPDATA%\MTG Dreams\` |
| The installed app | `%LOCALAPPDATA%\Programs\MTG Dreams\` |

```
Documents\MTG Dreams\
├── decks\deck.txt
├── lists\wishlist.txt
├── trades\friend.mtgtrade
└── inventory.txt
```

- If Windows backs up Documents to OneDrive, your data syncs too. 
- **Data folder → Change…** in the sidebar moves it anywhere.
- Uninstalling doesn't delete your data.
- The caches are safe to delete; they are downloaded again. The exception is `price-history.json`: deleting it
  resets the price history.

## How prices work

- Prices come from Cardmarket's daily price guide, in EUR.
- The guide is one file for every card: the app downloads it (about 26 MB) only when Cardmarket publishes a new one, and keeps a 5 MB copy.
- **Settings → Prices** picks which price counts:

  | Basis | What it is |
  | --- | --- |
  | Typical (*default*) | Cardmarket's price trend: what copies usually sell for |
  | Lowest listing | The cheapest copy on offer, in any condition or language |
  | 30-day average | What copies sold for over the last month |

- When the guide lacks a price, the typical one is used, then Scryfall's.
- Card versions come from Scryfall, which Cardmarket's product numbers link to the guide.
- The cheapest version ignores gold-bordered and other memorabilia printings.
- A foil-only printing counts at its foil price.
- **Refresh prices** checks for a newer guide; the app also checks hourly.
- Card versions are refreshed from Scryfall weekly, in the background.
- The guide only has today's prices, so the app keeps its own daily history for the versions in your inventory.
  Value changes appear from Cardmarket's next update after a card joins it.

## Development

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with hot reload |
| `npm test` | Unit tests (about 1 s) |
| `npm run e2e` | Build, then test the real app offline (about 20 s) |
| `npm run typecheck` | Type-check everything |
| `npm run build` | Type-check and build to `out/` |
| `npm start` | Run the build in `out/` |
| `npm run dist` | Build the installer |
| `npm run dist:portable` | Build the portable `.exe` |

```
src/
├── main/       Electron main process: window, file storage, Scryfall, MTGJSON and Cardmarket clients
├── preload/    The bridge exposing `window.api` to the UI
├── shared/     Pure logic: list parsing, pricing, formats, deck rules, trades
└── renderer/   React UI
    └── src/
        ├── components/   UI components
        ├── stores/       Session state: library, settings, printings, card data, price history
        ├── lib/          Helpers: formatting, valuation, list summaries, artwork
        └── hooks/        Reusable React hooks
e2e/            End-to-end tests, against local stand-ins for Scryfall, MTGJSON and Cardmarket
```

- Unit tests (`*.test.ts`) sit next to the code they test.
- Code outside `shared/` imports it as `@shared/...` (alias set in the tsconfigs, `electron.vite.config.ts` and
  `vitest.config.ts`).
- Main-process modules get their folders and service addresses from `main/environment.ts`, so tests run them
  without Electron.
- End-to-end tests drive the built app with Playwright, each with its own temporary profile.
- Development builds read `MTG_DREAMS_SCRYFALL_API`, `MTG_DREAMS_MTGJSON_API` and `MTG_DREAMS_PRICE_GUIDE_URL` for
  the stand-ins; the installed app ignores them.

## Credits

Card data, images and mana symbols come from [Scryfall](https://scryfall.com). Prices come from
[Cardmarket](https://www.cardmarket.com)'s price guide. Official decklists come from [MTGJSON](https://mtgjson.com).

*Magic: The Gathering* is © Wizards of the Coast. This project is not affiliated with or endorsed by Scryfall,
MTGJSON, Cardmarket or Wizards of the Coast.

## License

[MIT](LICENSE), for the app's code. Card data, images and prices keep their owners' terms.
