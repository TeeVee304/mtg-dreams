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
   - Art fingerprints don't go through it. The Card Scanner's art index gives the name directly.

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
- Optional *Bracket* calculator, for Commander. ***DONE***

## Ordered
**Suggested by:** a user.<br>
**Relevant plugin(s):** `/engineering:system-design`, `/design:ux-copy`

A place for Cards that are paid for but not here yet. ***DONE***
It sits between Most Wanted and the Inventory.
Today, "Bought" puts Cards straight into the Inventory.
That is wrong while the order is still in the mail.

- What the user sees:
  - A new sidebar page, **Ordered**, between Most Wanted and Inventory.
  - It shows a count of Cards on the way.
  - It hides when nothing is on the way. *(To Discuss: hide it, or show an empty page?)*
  - Cards are grouped by order.
  - An order has a name, such as a seller or a shop. The name is optional.
  - An order has a date. It defaults to today.
  - Each order shows its Cards, their versions and what they cost.
  - Each order shows how many days it has been on the way.
- Getting Cards in:
  - In Most Wanted, the **Bought** button becomes **Ordered**.
  - It opens a small panel: pick an order or start a new one.
  - The panel offers the shared "choose version" step (*see "Shared Foundation: Card Versions"*).
  - The Budget Planner's "Mark all as bought" becomes "Mark all as ordered". It makes one order.
  - A Card can also be added by hand, with the usual card search.
  - Pasting a list works too, in the inventory text format.
  - *(To Discuss: keep a second "Already here" button that skips Ordered, for Cards bought in person?)*
- Getting Cards out:
  - **Arrived** on a Card moves it to the Inventory, with its version.
  - **Arrived** on an order moves the whole order. One write, one undo step.
  - A Card can arrive in part, e.g. 2 of 4.
  - **Cancel** removes a Card or an order. Its Cards go back to Most Wanted.
  - An order disappears when its last Card arrives or is cancelled.
  - *(Later:)* the Card Scanner tray can match scanned Cards with ordered ones.
- How ordered Cards count:
  - They are not owned. They are not in the Inventory.
  - They count as covered in Most Wanted. Its "To buy" subtracts them.
  - The Budget Planner leaves them out too.
  - In a list, a covered line shows an "on the way" marker instead of a tick.
  - The marker's tooltip names the order.
  - A list with only ordered Cards left shows "Complete when your orders arrive".
  - They stay out of the copy pool. A built Deck cannot hold a Card that is not here.
  - They stay out of Inventory Value.
  - They stay out of the Trade list.
  - They count once, like a bought copy: one ordered copy serves every Wishlist (*see "Wishlists reserve no copies"*).
- Prices:
  - Each ordered Card keeps the price it was ordered at.
  - The default is the current price. The user can type what they paid.
  - An order shows its total.
  - *(Later:)* the Inventory could show paid price against today's price. Not part of this feature.
- Storage:
  - One plain text file in the data folder: `ordered.txt`.
  - Same line format as `inventory.txt`, so versions, `{DE}` and foil work as they do there.
  - Each order starts with a header line, e.g. `// Order: Cardmarket · 2026-11-05`.
  - Paid prices go in a token on the line, e.g. `{Paid 1.20}`.
  - It joins the existing write guard and conflict check, like the inventory.
  - A schema step creates nothing. A missing file means no orders.
  - Undo and redo cover every change, like the inventory.
  - "Edit as text" works, like the inventory.
- Code:
  - A pure module, `src/shared/ordered.ts`: parse, serialize, add, arrive, cancel.
  - `mostWanted` takes the ordered quantities and subtracts them from `buy`.
  - `withAddedOwned` handles arrival. It already keeps versions and language.
  - Store actions in `libraryStore.ts`: `addOrdered`, `arrive`, `cancelOrdered`.
  - Text in a new `src/shared/text/en/ordered.ts`.
  - Tests: parse round trip, partial arrival, Most Wanted subtraction, undo of a whole order.
- Open questions:
  - The name: "Ordered", "On the Way" or "Incoming"?
  - Do Brews ignore ordered Cards, as they ignore the collection when that setting is on?
  - Should an old order warn the user? For example, after 30 days.

## Card Scanner
**Relevant plugin(s):** `/design:design-system`, `/engineering:system-design`, `/engineering:testing-strategy`
- Scan cards with the camera to add them to the inventory.
- The shared foundation is done. The scanner can start.
- It ships in two steps:
  1. Art match. It names the card and its artwork.
  2. Collector line reading. It adds the exact printing and the language.
  - Step 2 ships only if the spike shows webcams can read the collector line.
- What the user sees:
  - Each scan shows the English name and the English card image.
  - It also shows the version, language and price.
  - Recognition works in any language.
  - A player can scan a card in a language they can't read to learn what it is.
  - A card-shaped guide on the camera view shows where to hold the card.
  - Each match plays a sound.
  - A mute toggle turns the sound off. The app remembers it.
  - Scans go to a tray first.
  - The tray opens the shared "choose version" step to change a version.
  - One button, **Add N Cards to Inventory**, adds the whole tray.
  - That button makes one write and one undo step.
- Session choices:
  - Set, language and foil are picked once. They apply to every scan until changed.
  - Most piles share a set, a language or a finish.
  - Set: a scan takes that set's printing when the art has one there.
  - Language: English by default. Step 2 reads it from the card instead.
  - Foil: off by default. A camera can't reliably tell foils apart.
  - Each tray line can still be changed on its own.
  - *(To Discuss: in step 1 the language comes from this choice, not from the card. Is that enough until step 2?)*
- When the scanner is sure:
  - The closest art must be close enough.
  - It must also be clearly closer than the next art.
  - Then the scan goes straight to the tray.
  - Otherwise the 5 closest arts are shown as card images.
  - Picking one needs no reading.
  - One art often has many printings. The session set picks one.
  - Without a session set, the scan takes the cheapest printing with that art. The "choose version" step does the same.
  - The tray marks that line "Version guessed".
- When nothing matches:
  - The tray has the usual card search. A name can always be typed.
  - Tokens and Art Series cards are not in the index. They go this way.
  - So do cards newer than the index.
- Inputs:
  - The camera.
  - A photo file with one card. It can be dropped on the scanner or picked from a file dialog.
  - Photos help players without a webcam.
  - Photos also feed the tests.
  - A phone used as a webcam shows up as a camera. It needs no extra work.
- Recognition:
  - The art identifies the card. Art is the same in every language.
  - The scanner never reads the title. OCR can't read other scripts.
  - The scanner cuts out the card inside the guide.
  - It takes a fixed region of the card.
  - That region sits inside the art in most frames: old, modern, borderless and full-art.
  - Sagas, Classes, Battles and split cards place the art elsewhere. Each layout gets its own region.
  - The scanner tries every region and keeps the closest match.
  - Each region becomes a 256-bit fingerprint.
  - A 64-bit fingerprint is too coarse for about 50,000 arts. Wrong arts come too close.
  - The search compares against every fingerprint in the index. That takes a few milliseconds.
- The art index:
  - One entry per artwork and frame style. A borderless frame shows more of the art than a regular one.
  - Each entry holds a fingerprint, the card name and the illustration id.
  - Printings already carry `illustrationId`.
  - `usePrintingsFor` and the illustration id give the printings with that art.
  - Back faces of two-sided cards get their own entries.
  - The index is made from Scryfall's full card images, not from `art_crop`.
  - So the index and the camera cut the same region.
  - One fingerprint function, in `src/shared`, serves both. It takes raw pixels.
  - A local script builds the index. It stays out of the repo, like other dev tools.
  - The script keeps the images it downloads. Each release downloads only new cards.
  - The index file ships with the app, in `resources`.
  - The index has a schema version. It uses the shared helper.
  - *(Later:)* the app adds new sets to the index itself.
- Architecture:
  - The scanner is a feature module, like the Deck Wizard.
  - The rest of the app imports only its `index.tsx`.
  - Its code loads the first time the scanner opens.
  - It talks to the main process through `window.scanner` and `scanner:*` IPC.
  - The main process reads the index file. The scanner gets it once, when it opens.
  - Flow: camera → steadiness check → cut out the card → fingerprint → index search → printings → tray → inventory.
  - The steadiness check runs about 8 times a second on a tiny image.
  - The fingerprint and the search run only once the card holds still.
  - They take a few milliseconds. Step 1 needs no worker.
  - The card resolver stays as it is. The index already gives the name.
  - Prices come from the existing printings store.
  - The tray saves through the existing `actions.addOwned`.
  - A `ScanSession` state machine drives the scanner.
  - Its camera, matcher and clock are passed in. Tests replace them with fakes.
  - It reuses existing pieces: the Scryfall queue, `cachedFetch`, `validate.ts`, `usePrintingsFor`, `priceOf`, `Price`, `Stepper`, `CardThumb`, `FoilSheen`, `LanguageFlag`, `AddCardPanel` and the color tokens.
  - The card ratio (63:88) is defined once, in TS.
- Prerequisites:
  - Electron must allow the camera. Today it denies every permission.
  - Allow only video, and only for the app's own page.
  - Both the permission request handler and the permission check handler need it.
  - Windows can block the camera for all desktop apps. The "denied" message opens that privacy setting.
  - Step 1 needs no CSP change. Workers from the app already pass `script-src 'self'`.
- Reliability:
  - After a match, the scanner waits until the card is taken away. This prevents double counts.
  - Two copies of one card each count. The first is taken away before the second is shown.
  - Each camera error has its own message: denied, missing, busy or unplugged.
  - Each camera error message offers its own fix.
  - The tray survives a crash or an accidental close.
  - It is saved in the user data folder after each change, with the cache file helpers.
- Expected cost of step 1 (to confirm in the spike):
  - About +3–4 MB on the 103 MB installer, for the index.
  - Fingerprints don't compress, so the installer grows by the full size.
  - About 3–8% of one CPU core while scanning. The camera itself is most of it.
  - About 10–15 ms of work per card.
  - About 20–40 MB of extra memory while scanning.
  - Nothing when the scanner is closed.
- Spike first, outside the repo:
  - Build the full index. Wrong matches only show at full size.
  - Scan about 100 real cards. 30 cards can't tell 80% from 90% apart.
  - Include old frames, borderless, showcase, foils, sleeved cards, two-sided cards, Sagas and non-English cards.
  - Try two cameras: a laptop webcam and a phone used as a webcam.
  - Measure three things: right on the first try, right among the 5 closest, and the gap to the next art.
  - The gap sets "close enough" and "clearly closer".
  - At 85% or more on the first try, build step 1.
  - Below that, add card-edge detection and measure again.
  - Below 95% among the 5 closest, change the fingerprint before building anything.
  - Also try OCR on the collector lines of the same scans. That decides step 2.
- Step 2, the collector line:
  - The collector line gives the exact printing and the language (for example `0123 · MKM · JA`).
  - OCR reads that line only. It uses English OCR data, since the line uses Latin letters and digits.
  - Cards older than about 2014 have no such line. The session choices apply to them.
  - The risk: the line is about 1 mm tall.
  - On a 720p webcam that is about 6–10 pixels. OCR needs more.
  - Many webcams can't focus that close either.
  - OCR runs in a background worker, off the UI thread.
  - The CSP must then allow WASM (`'wasm-unsafe-eval'`).
  - A crashed worker restarts, up to 3 times a minute.
  - An OCR read gives up after 5 seconds.
  - It adds about 4–5 MB to the installer and 40–50 MB of memory while scanning.
- *(Later:)* the tray can match scanned Cards with ordered ones (*see "Ordered"*).


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
  - Ma: whitespace is a design element. ***DONE***
  - Restraint: one palette, one display typeface and one icon set per deck. ***DONE***
  - Layers: depth comes from translucent washes, not gradients or shadows. ***DONE***
    - One exception: the Commander art still fades into the banner.
  - Legibility: text contrast of at least 4.5:1, or 3:1 for large text. A validator enforces it. ***DONE***
    - The validator checks all 32 palettes in both modes.
  - Light and dark modes are designed separately. ***DONE***
- Palette:
  - Each color identity (32 in total) picks a family of combinations from the book. ***DONE***
    - Sometimes, this will not be possible. For example, Grull (Red-Green) does not have a clear match. In cases like this, alternatives shall be discussed.
    - Two more sources fill the gaps: Vanderpoel's *Color Problems* (1902) and Le Corbusier's architectural colors.
  - Mono-color decks use tints and shades of one hue. ***DONE***
  - Colorless decks use paper and ink tones. ***DONE***
    - They use grey and pink instead, desaturated.
- Typography: one display face per preset. One neutral body face for all card text and numbers. ***DONE***
  - The user picks the display face in the Style dialog. Nothing is picked from the Commander's Themes.
  - Eleven faces to pick from: Cinzel, IM Fell English, Anton, Uncial Antiqua, Bodoni Moda, Archivo Expanded, Silkscreen, Pirata One, Rye, Limelight and Henny Penny.
  - Without a pick, the title uses the app's face, Fraunces.
- Decoration: ***DONE***
  - A watermark behind the cards, for mono-color, guild and five-color Decks. ***DONE***
  - A banner texture, picked by the user. None by default. ***DONE***
  - The Commander's flavor text under the title. ***DONE***
  - Card type symbols on the sections. ***DONE***
  - Background and Companion badges as a circle, square or diamond. ***DONE***
  - Cards settle in when a Deck opens. A Settings switch turns motion off. ***DONE***
- Statistics keep every feature, restyled in the Deck's palette. ***DONE***

**Note:** This update should likely replace light and dark themes, as trying to combine unique color harmony with such broad restrictions would degrade the desing in the end. *Comments?*
- Light and dark stay. Each palette is tuned for both modes.

## Deck Customization

- More visual customization for decks. Currently we have Color Themes, the Commander banner and Universes, but most are Commander-specific. ***DONE***
  - Color themes for mixed color identities (*see Visual Revision*). ***DONE***
    - The Color menu offers all 32 palettes, grouped.
    - By default, a Deck follows its color identity.
    - Without a Commander, a color counts if it is on at least 10% of the colored nonland Cards.
  - Treat theme, banner and universe as optional, generic layers. ***DONE***
    - Any Deck, or Wishlist with a format, gets a palette.
  - Non-Commander decks need a fallback banner (*e.g., first card art or format symbol*). ***DONE***
    - It shows the nonland Card with the highest mana value.
    - "Use as Banner" in a Card's dialog picks another.

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
- Show the size of each cache: card data, price guide, images, precons, EDHREC decks, bracket data, tokens, set groups.
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
- Include `/dist` installer in the repository. ***DONE***
- FIX: The Foil animation on the card image does not loop. ***DONE***
- FIX: In card view, the "Show back" / "Show front" button should just be a circle button, on the bottom of the card art, with a flip icon. When pressed, there should be a flip animation. ***DONE***
- Other quality of life features that should help players set up their dream decks.