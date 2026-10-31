# TODO

Planned work for future releases. 

## Data Model and Storage 
**Relevant plugin(s):** `/engineering:system-design`, `/ai-firstify:ai-firstify`
- Major data model revisions (normal forms, etc.) ***DONE***
  - List and inventory files stay as they are. They hold names and printings only, so nothing in them is duplicated.
  - The Scryfall cache keeps the cards the files use, and at most 500 others for 7 days.
  - The Scryfall cache stores each card once. Other names of a card are aliases.
  - The image cache is capped at 150 MB.
  - The price guide is stored as whole cents in two number arrays.
- Schema versioning: ***DONE***. Steps live in `src/main/schema.ts`.
  - The Card Scanner's art index needs a version too. It uses the same helper.
  - A data folder saved by a newer app is read-only. It shows a banner and locks the controls. ***DONE***

## Shared Foundation: Card Versions
A card version is a printing, a finish and a language.
Localization, Inventory and the Card Scanner all work with card versions.
They share three pieces, built in this order:
1. Schema versioning (*see "Data Model and Storage"*). ***DONE***
2. One "choose version" step for every way of adding to the inventory. ***DONE***
   - It is the add panel lists use (`AddCardPanel`), with a language choice.
   - The Card Scanner tray opens it with the scanned version, through its `initial` prop.
   - Bulk adds (deck import, precons, Budget Planner) keep the versions they bring. They do not open it.
   - This is the "select the version first" item in "Inventory and Wishlists".
3. One card resolver in the main process (`src/main/cardResolver.ts`). ***DONE***
   - Names in any language and set code plus collector number work. Search, text imports and trade imports use them.
   - Input can be an art fingerprint. Only the Card Scanner uses this. It comes with the Card Scanner.

The Card Scanner comes last.
By then, most of what it needs already exists.

## Localization

- Support for different languages. App language and card language should be two separate settings.
  - App language: build on the existing `src/shared/text/` structure.
    - English and Portuguese (PT) only.
    - Both catalogs ship with the app. Portuguese adds about 80 KB to a 99 MB installer.
    - No loading on demand: the text must be ready before the first screen and the first error.
  - Card language: a property of the printing/version, not a global setting. ***DONE***
    - Inventory copies, list lines, the add panel and imports all keep it.
    - List rows show it as a flag.
    - Ticking a list line as owned adds a copy in its language.
  - Hard part: name matching on search and import, so a localized name resolves to the same oracle card. ***DONE***
    - The shared card resolver handles this (see "Shared Foundation: Card Versions").
  - App language does not depend on the shared foundation. It can come at any time.
- In Settings, add a "Skip Phyrexian" option. ***DONE***

## Formats

- Broader support for other popular formats, such as Standard, Modern, Pioneer and Pauper (abstraction). ***DONE***
  - Introduce a `Format` abstraction: deck size, copy limit, commander zone, legality source.
  - Commander stays the reference implementation.
  - Pauper (commons only) is a good test case for the abstraction. So is Pauper Commander (*https://www.pdhrec.com/ could be useful.*)
  - **NOTE:** This introduces significant challenges. EDHREC is the main inspiration and source of information for this app, and it applies only to Commander.

## Commander mechanics

- Add support for *Companion* and *Rulebreaker*, as Backgrounds and Partners are already implemented. ***DONE***
  - Companions are a deck-validation restriction, so they fit the Wizard as a validator.
  - Confirm Rulebreaker rules against the official rules text before designing.
- Add support for Dungeons (Venture into the Dungeon). This may have some nuances. ***DONE***
  - Dungeons are not deck cards in the usual sense. Confirm the rules first; the nuance is likely in modeling and Wizard suggestions rather than legality.
- Similar to Disguise or Poison support, Monarch mechanic should be associated with the respective token, and added. Undercity as well. ***DONE***
- When a Commander has "Partner with", its Partner should be added automatically (be it Deck, Wishlist or Deck Wizard). ***DONE***
- **To Consider:** On Energy decks, develop an "Energy Curve" on top of the Mana Curve. ***DONE***

## Inventory and Wishlists

- When adding a card to the Inventory, select the version first, similar to the wishlist process. ***DONE***
  - This is the shared "choose version" step (*see "Shared Foundation: Card Versions"*).
- When a wishlist wants a specific version and you own a different one, flag it instead of ticking it right away. ***DONE***
  - Three states: exact printing owned (tick); same card, different printing or foil status (substitute marker, [-]); no owned copy (unticked).
  - Matching: a version-agnostic wishlist matches on oracle ID; a version-specific one matches on the printing.
  - A substitute reserves no copy unless the user confirms it (*see "Wishlists reserve no copies"*).
- *Game Changer* flag for cards. ***DONE***
- In Statistics, of the graph showing "Creatures // Other spells", the bars should display color distributions among mana values. Colorless (number) mana should be different from Colorless (specific). ***DONE***
- In Statistics, provide insights about Lands and Mana Rocks in the mana curve. ***DONE***
- In a Wishlists's Token view, the user must be able to browse token versions (even if considered free). ***DONE***
- I placed, in a Middle-earth wishlist, 'Ring of Barahir' and the tag below said 'Use Sword of the Animist'. Just do it, do not ask for permission, as the result will be the same - the original card name, but with the version the user wants. (*Is this assumption correct?*) ***DONE***
- Replace term '***Five-Color***' with '***WUBRG***'. ***DONE***
- Optional *Bracket* calculator, for Commander. To Discuss.

## Card Scanner
**Relevant plugin(s):** `/design:design-system`, `/engineering:system-design`, `/engineering:testing-strategy`
- Scan cards with the camera to add them to the inventory.
- Build it after the shared foundation (*see "Shared Foundation: Card Versions"*).
- What the user sees:
  - Each scan shows the card's name, version, language and price.
  - Recognition works in any language.
  - A player can scan a card in a language they can't read to learn what it is.
  - The scan shows the English name and the English card image.
  - The scan shows the detected language beside them.
  - Each match plays a sound.
  - A mute toggle turns the sound off. The app remembers it.
  - Scans go to a tray first.
  - The tray opens the shared "choose version" step to change a version.
  - One button, **Add N Cards to Inventory**, adds the whole tray.
  - That button makes one write and one undo step.
  - Foil is a manual toggle, off by default. A camera can't reliably tell foils apart.
- Recognition:
  - The art identifies the card. Art is the same in every language.
  - The scanner turns the art into a small fingerprint.
  - It compares the fingerprint with an index of every illustration (about 50,000).
  - Close matches are shown as card images. Picking one needs no reading.
  - The collector line gives the exact printing and the language (for example `0123 · MKM · JA`).
  - OCR reads the collector line only. It uses English OCR data, since the line uses Latin letters and digits.
  - Cards older than about 2014 have no such line. The user picks their version.
  - The scanner never reads the title. OCR can't read other scripts, and the art match makes it unnecessary.
  - Each release ships an updated index.
  - The scanner adds newer cards to the index in the background.
- Architecture:
  - The scanner is a feature module, like the Deck Wizard.
  - The rest of the app imports only its `index.tsx`.
  - It talks to the main process through `window.scanner` and `scanner:*` IPC.
  - Its code loads the first time the scanner opens.
  - Flow: camera → steadiness check → worker (fingerprint and OCR) → shared card resolver → prices → tray → inventory.
  - The steadiness check runs about 8 times a second on a tiny image.
  - The fingerprint and OCR run in a background worker, off the UI thread.
  - Prices come from the existing printings store.
  - The tray saves through the existing `actions.addOwned`.
  - A `ScanSession` state machine drives the scanner.
  - Its camera, reader and clock are passed in. Tests replace them with fakes.
  - It reuses existing pieces: the Scryfall queue, `cachedFetch`, `validate.ts`, `usePrintingsFor`, `priceOf`, `Price`, `Stepper`, `CardThumb`, `FoilSheen`, `LanguageFlag` and the color tokens.
  - The card ratio (63:88) is defined once, in TS.
- Prerequisites:
  - Electron must allow the camera. Today it denies every permission.
  - Allow only video, and only for the app itself.
  - The CSP must allow WASM (`'wasm-unsafe-eval'`).
  - The CSP must allow the app's own workers (`worker-src 'self'`).
  - `withAddedOwned` drops the language today. It must save it.
- Reliability:
  - A crashed worker restarts, up to 3 times a minute.
  - An OCR read gives up after 5 seconds.
  - Each camera error has its own message: denied, missing, busy or unplugged.
  - Each camera error message offers its own fix.
  - After a match, the scanner waits until the card is taken away. This prevents double counts.
  - The tray survives a crash or an accidental close.
- Expected cost (to confirm in the spike):
  - About +5 MB on the 103 MB installer.
  - About 5–15% of one CPU core while scanning.
  - About 70–90 MB of extra memory while scanning.
  - Nothing when the scanner is closed.
- Spike first, outside the repo:
  - Check that the worker and the WASM load in the packaged build.
  - Measure art-match accuracy on about 30 real cards.
  - Include foils, sleeved cards and two non-English cards.
  - Below about 85% correct on the first try, add card-edge detection before building the rest.


## Deck Wizard
- "*Commanders you own, not leading a Deck yet*" should just be eligible commanders- in use or not. ***DONE***
- Remove the "*Another Commander*" search bar, as it can be confusing when paired with the "*Partner*" search bar. ***DONE***
- When a Partner or Background is added, remove the "*Without*" portion of the display, as the X already indicates this. ***DONE***
- When a Background (or other non-Partners) are added in the *Partner* bar, the list shouldn't be named "[Commander] & [Background]". ***DONE***
- The *Partner* search bar should either dynamic or divided, accounting for Companions, Backgrounds or other such cases. Currently, to select a Background for a *Choose a Background* Commander, I need to select it as a Partner, which is misleading. ***DONE***

## Card view

- Overhaul the individual card view, taking https://gatherer.wizards.com/ as an example. ***DONE***
  - Use actual icons for mana value and type line, with the mana value implied (*e.g., replace "Instant · Mana value 2"*). ***DONE***
    - Battles and Kindred have no type icon. The Mana font has no file for them.
  - Show which rules text is displayed. Add a Settings option to choose Printed or Oracle rules text (Oracle by default). ***DONE***
    - Scryfall has printed text only for other languages. English printings show Oracle text.
  - Show relevant rulings. Decide whether they are fetched or bundled, since bundling adds size. ***DONE***
    - Fetched when the dialog opens. Cached for 30 days, so they also work offline.
- The "Change Version" text and "List | Images" are in different boxes, occupying unnecessary vertical space. ***DONE***

## Visual Revision 

**Relevant plugin(s):** `/frontend-design`<br>
**Scope:** Deck pages.<br>
**Inspiration:** *A Dictionary of Color Combinations* (Sanzo Wada).<br>
**Repository:** https://github.com/mattdesl/dictionary-of-colour-combinations

- Principles:
  - Ma: whitespace is a design element.
  - Restraint: one palette, one display typeface and one icon set per deck.
  - Layers: depth comes from translucent washes, not gradients or shadows.
  - Legibility: text contrast of at least 4.5:1, or 3:1 for large text. A validator enforces it.
  - Light and dark modes are designed separately.
- Palette:
  - Each color identity (32 in total) picks a family of combinations from the book. 
    - Sometimes, this will not be possible. For example, Grull (Red-Green) does not have a clear match. In cases like this, alternatives shall be discussed.
  - Mono-color decks use tints and shades of one hue.
  - Colorless decks use paper and ink tones.
- Typography: one display face per preset. One neutral body face for all card text and numbers.

**Note:** This update should likely replace light and dark themes, as trying to combine unique color harmony with such broad restrictions would degrade the desing in the end. *Comments?*

## Deck Customization

- More visual customization for decks. Currently we have Color Themes, the Commander banner and Universes, but most are Commander-specific.
  - Color themes for mixed color identities (*see Visual Revision*).
  - Treat theme, banner and universe as optional, generic layers.
  - Non-Commander decks need a fallback banner (*e.g., first card art or format symbol*).
  

## Documentation
**Relevant plugin(s):** `/humanizer:humanizer`
- Update README for more simplicity.
- LaTeX user guide (code not pushed to GitHub, only the final PDF) covering the data model, files and advanced options.
- Transparency about Claude intervention (vibe coding).

## Offline Support
Most of the app already works offline. Lists, inventory and trades are local files. Card data, prices, precons, set groups and tokens come from caches.
These steps close the gaps:
- An end-to-end test that runs the app with no internet. ***DONE***
  - It confirms what works offline.
  - It keeps it working.
- One calm offline indicator, e.g. beside "Prices from…". ***DONE***
  - It replaces the repeated "Could not reach Scryfall" errors.
  - The app tries again when the internet comes back.
- Keep small images of the cards the files use, in the app's own folder. ***DONE***
  - The Scryfall cache keeps these cards the same way.
  - Today their images live only in the browser's cache, capped at 150 MB. They can go missing offline.
- No full Scryfall card database.
  - It would make adding any card work offline.
  - It costs hundreds of MB on disk and large memory spikes.
- Some things stay online only: the Deck Wizard (EDHREC), new precons and price refreshes.
- Opt-in: "Download card data for offline search". For the few who want card research offline.
  - It comes after the online card research tool (*see "Quality of Life"*). Only if players ask for it.
  - Use Scryfall's "Oracle Cards" file: one entry per card, about 160 MB.
  - Read it in pieces. Never load it whole: that is a memory spike near 1 GB.
  - Keep only what search needs: name, cost, colors, type, rules text, keywords, legalities. About 10–15 MB.
  - Load it only while the search page is open.
  - Refresh it at most once a day, as Scryfall asks.
  - Scryfall's tags ("ramp", "removal") are not in the file. Tag search stays online.

## Storage Settings
A place in Settings to see and clear what the app stores. ***DONE***
- Show the size of each cache: card data, price guide, images, precons, EDHREC decks, tokens, set groups.
- One button clears them all.
  - Never clear the price history. It is a record of prices over time and cannot be downloaded again.
  - Never clear settings or the data folder.
- Say what clearing costs before it runs.
  - Prices download again: about 5 MB.
  - Card data comes back slowly: about 2 requests a second, so several minutes for 1,400 cards.

## Quality of Life

- Deckbuilding tools, such as per-tag, per-color card search - essentially, tools for users that want to learn to build a deck from scratch.
  - Card research: search cards for their own sake. Build it on Scryfall's online search, which has colors, types and tags.
- Tool that may prepare a page for proxy printing. This option needs to be considered carefully, as it may be controversial.
- Include `/dist` installer in the repository.
- FIX: The Foil animation on the card image does not loop.
- FIX: In card view, the "Show back" / "Show front" button should just be a circle button, on the bottom of the card art, with a flip icon. When pressed, there should be a flip animation.
- Other quality of life features that should help players set up their dream decks.