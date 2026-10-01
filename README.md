<p align="center">
  <img src="build/icon.png" width="96" alt="MTG Dreams icon">
</p>

<h1 align="center">MTG Dreams</h1>

<p align="center">
  Organize the Magic: The Gathering decks you own and plan wishlists, with Cardmarket prices in EUR.
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

### Your collection
- **Inventory**: the cards you own, by name and quantity.
- Optionally record which versions and foils you own (the versions button on each card); decks and wishlists then
  show your version for lines that don't ask for one. Owning any version of a card still counts as owning it.
- Each card shows which decks use it and which wishlists want it.
- **Inventory Value** estimates what your inventory is worth and ranks your most valuable cards, each copy at the
  version you recorded (the rest at the cheapest version).
- It also shows how the value changed this week or this month, with the biggest risers and fallers.

### Decks and wishlists
- **Decks** are built from your inventory: you can only add cards you own, up to the copies you have.
- The same card can be in several decks.
- **Wishlists** list the cards you want and what they still cost.
- Owned cards are ticked: a list that wants 4 while you own 2 shows `2/4`.
- A complete wishlist offers **Move to Decks**.
- Wishlist cards you still need are flagged once they're 15% cheaper than when you added them (adjustable in
  Settings), and the sidebar counts them.
- Both are grouped by card type, with a count and value per section.
- A **Stats** panel shows the mana curve and the colors of the cards besides lands.

### Formats and Commander
- Give a deck or wishlist a format: Standard, Pioneer, Modern, Commander, Pauper and more.
- Quantities stop at the format's copy limit; basic lands and cards like Relentless Rats are exempt.
- Cards that break the format get a red tag: banned, not legal, or over the limit.
- In Commander-style formats, **Choose Commander** lights up the cards that can lead the deck.
- The chosen card moves to a **Commander** section at the top.

### Cards and prices
- Card search has autocomplete, and typos are fuzzy-matched.
- Unless you pick a version, a card is priced at its cheapest paper printing.
- Prices come from Cardmarket: typical, lowest listing or 30-day average, your choice in Settings.
- The version picker shows every printing with its image and price.
- A picked version is saved in the file, e.g. `1 Ragavan, Nimble Pilferer <138> [MH2]`.
- Foil is set per line.
- Versions printed under another name (e.g. *Franklin's Finality*) show that name; files keep the official one.
- Click a card to see it large, with its legality in every format.
- Hover a card for a preview; `↗` opens it on Cardmarket.

### Precons
- Pick from about 3,000 official products: Commander decks, Challenger decks, Secret Lair drops and more.
- A precon you own becomes a deck, with its exact printings, and its cards join your inventory.
- Commander precons start with their commander chosen.

### Trades with friends
- **Share my trade list** saves a small `.mtgtrade` file, or copies it as text for a chat.
- It holds the cards you own and what your wishlists need; never prices, decks or file paths.
- Import a friend's list to see what each of you can give the other, and what each side is worth.
- Friends without the app can send a plain card list or a Moxfield/Deckbox export instead.

### Look and feel
- Filter by name, color identity, type, rarity and legendary.
- One sort applies to every deck, wishlist and the inventory, and is remembered.
- Six color themes, one per mana color, each with its own icon: White (gold, the default), Blue, Black, Red,
  Green and Colorless.
- Light, dark, or following Windows.
- **Ctrl+Z** undoes your latest edits to decks, wishlists and the inventory, one step at a time; removing a card
  shows an undo button too.
- **Bundle basic lands** (on by default) counts every version of the five basics as one free card, which keeps
  land-heavy decks fast.

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
- It adds Start Menu and Desktop shortcuts, and an uninstaller under *Settings → Apps*.
- The installer isn't code-signed, so Windows SmartScreen warns the first time: choose *More info → Run anyway*.
- Running a newer installer updates the app; your data is kept.
- `npm run dist:portable` builds `dist/mtg-dreams-portable-<version>.exe`, which runs without installing.

## Your data

Everything is stored per Windows user.

| What | Where |
| --- | --- |
| Decks, wishlists, inventory and trades | `Documents\MTG Dreams\` |
| Settings and caches | `%APPDATA%\MTG Dreams\` |
| The installed app | `%LOCALAPPDATA%\Programs\MTG Dreams\` |

```
Documents\MTG Dreams\
├── decks\Calling All Angels.txt
├── lists\Burn upgrades.txt
├── trades\Ana.mtgtrade
└── inventory.txt
```

- Your data is plain text: back it up, sync it, or edit it by hand.
- If Windows backs up Documents to OneDrive, your data syncs too.
- **Data folder → Change…** in the sidebar moves it anywhere.
- Edits made outside the app show up when you switch back to it.
- If a file changes outside the app while you're working on it (e.g. OneDrive syncing an edit from another PC),
  the app asks before saving over it.
- Uninstalling never deletes your data.
- The caches are safe to delete; they are downloaded again. The exception is `price-history.json`: deleting it
  starts the price history (and wishlist price drops) over.
- Data from the app's earlier names (*MTG Dream*, *MTG Wishlist Tracker*) is carried over on first launch.

### File format

```
// Format: Modern                     the format (optional)
// Commander: Mister Fantastic        the commander (Commander-style formats)
4 Lightning Bolt                      any version, priced at the cheapest
1 Lightning Bolt <141> [A25]          a specific printing: collector number and set
1 Sheoldred, the Apocalypse (F)       foil
```

- Comments, blank lines and headers such as `Sideboard` are kept.
- Imports also understand Arena/Moxfield lines (`4 Lightning Bolt (2XM) 141`, `*F*`) and `4x` quantities.
- `inventory.txt` uses the same format; a line without a version counts as any version.

## How prices work

- Prices come from Cardmarket's daily price guide, in EUR; they are not live listings.
- The guide is one file for every card: the app downloads it (about 26 MB) only when Cardmarket publishes a new
  one, and keeps a 5 MB copy.
- **Settings → Prices** picks which price counts (Inventory Value always uses the typical one):

  | Basis | What it is |
  | --- | --- |
  | Typical (default) | Cardmarket's price trend: what copies usually sell for |
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
e2e/            End-to-end tests, against local stand-ins for Scryfall, MTGJSON and Cardmarket
```

- Unit tests (`*.test.ts`) sit next to the code they test.
- Main-process modules get their folders and service addresses from `main/environment.ts`, so tests run them
  without Electron.
- End-to-end tests drive the built app with Playwright, each with its own temporary profile.
- Development builds read `MTG_DREAMS_SCRYFALL_API`, `MTG_DREAMS_MTGJSON_API` and `MTG_DREAMS_PRICE_GUIDE_URL` for
  the stand-ins; the installed app ignores them.

## Credits

Card data, images and mana symbols come from [Scryfall](https://scryfall.com). Prices come from
[Cardmarket](https://www.cardmarket.com)'s price guide. Official decklists come from [MTGJSON](https://mtgjson.com).

Magic: The Gathering is © Wizards of the Coast. This project is not affiliated with or endorsed by Scryfall,
MTGJSON, Cardmarket or Wizards of the Coast.

## License

[MIT](LICENSE), for the app's code. Card data, images and prices keep their owners' terms.
