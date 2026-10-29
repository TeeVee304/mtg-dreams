# TODO

Planned work for future releases. 

## Data Model and Storage 
**Relevant plugin(s):** `/ai-firstify:ai-firstify`, `/design:design-system`
- Major data model revisions (normal forms, etc.)
  - Normalize where the pain is (duplicated card/printing data in decks and wishlists, Universe/version relations), not for its own sake.
  - Keep portability in mind: heavily normalized data is harder to export as a single self-contained file.
- Schema versioning and a migration pipeline for saved files
  - Add a schema version to saved files now, before public release, regardless of the normalization outcome.
  - The Card Scanner's art index needs a version too. It uses the same mechanism.

## Shared Foundation: Card Versions
A card version is a printing, a finish and a language.
Localization, Inventory and the Card Scanner all work with card versions.
They share three pieces, built in this order:
1. Schema versioning (*see "Data Model and Storage"*).
   - It comes first because it is the cheapest piece.
   - It protects the saved files before new version data reaches them.
2. One "choose version" step for every way of adding to the inventory.
   - It sets the printing, the finish, the language and the quantity.
   - It remembers the last version chosen per card.
   - Inventory search opens it with the last version chosen.
   - The Card Scanner tray opens it with the scanned version.
   - This is the "select the version first" item in "Inventory and Wishlists".
3. One card resolver in the main process.
   - It turns any input into an English card name, and a printing and a language when known.
   - Input can be a name in any language. Search and import use this.
   - Input can be a set code and a collector number. The Card Scanner and imports use this.
   - Input can be an art fingerprint. Only the Card Scanner uses this.
   - All inputs share one cache and one rate limiter.
   - This solves the "Hard part" in "Localization".

The Card Scanner comes last.
By then, most of what it needs already exists.

## Localization

- Support for different languages. App language and card language should be two separate settings.
  - App language: build on the existing `src/shared/text/` structure.
  - Card language: a property of the printing/version, not a global setting.
  - Hard part: name matching on search and import, so a localized name resolves to the same oracle card.
    - The shared card resolver handles this (see "Shared Foundation: Card Versions").
  - App language does not depend on the shared foundation. It can come at any time.
- In Settings, add a "Skip Phyrexian" option.

## Formats

- Broader support for other popular formats, such as Standard, Modern, Pioneer and Pauper (abstraction).
  - Introduce a `Format` abstraction: deck size, copy limit, commander zone, legality source.
  - Commander stays the reference implementation.
  - Store dated legality snapshots, so older decks do not show the wrong legality.
  - Pauper (commons only) is a good test case for the abstraction. So is Pauper Commander (*https://www.pdhrec.com/ could be useful.*)
  - **NOTE:** This introduces significant challenges. EDHREC is the main inspiration and source of information for this app, and it applies only to Commander.

## Commander mechanics

- Add support for *Companion* and *Rulebreaker*, as Backgrounds and Partners are already implemented.
  - Companions are a deck-validation restriction, so they fit the Wizard as a validator.
  - Confirm Rulebreaker rules against the official rules text before designing.
- Add support for Dungeons (Venture into the Dungeon). This may have some nuances.
  - Dungeons are not deck cards in the usual sense. Confirm the rules first; the nuance is likely in modeling and Wizard suggestions rather than legality.
- Similar to Disguise or Poison support, Monarch mechanic should be associated with the respective token, and added. Undercity as well. 
- When a Commander has "Partner with", its Partner should be added automatically (be it Deck, Wishlist or Deck Wizard).
- **To Consider:** On Energy decks, develop an "Energy Curve" on top of the Mana Curve.

## Inventory and Wishlists

- When adding a card to the Inventory, select the version first, similar to the wishlist process.
  - This is the shared "choose version" step (*see "Shared Foundation: Card Versions"*).
- When a wishlist wants a specific version and you own a different one, flag it instead of ticking it right away.
  - Three states: exact printing owned (tick); same card, different printing or foil status (substitute marker, [-]); no owned copy (unticked).
  - Matching: a version-agnostic wishlist matches on oracle ID; a version-specific one matches on the printing.
  - A substitute reserves no copy unless the user confirms it (*see "Wishlists reserve no copies"*).
- *Game Changer* flag for cards.
- In Statistics, of the graph showing "Creatures // Other spells", the bars should display color distributions among mana values. Colorless (number) mana should be different from Colorless (specific).
- In Statistics, provide insights about Lands and Mana Rocks in the mana curve.
- In a Wishlists's Token view, the user must be able to browse token versions (even if considered free).
- I placed, in a Middle-earth wishlist, 'Ring of Barahir' and the tag below said 'Use Sword of the Animist'. Just do it, do not ask for permission, as the result will be the same - the original card name, but with the version the user wants. (*Is this assumption correct?*)
- Replace term '***Five-Color***' with '***WUBRG***'.
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
- "*Commanders you own, not leading a Deck yet*" should just be eligible commanders- in use or not.
- Remove the "*Another Commander*" search bar, as it can be confusing when paired with the "*Partner*" search bar.
- When a Partner or Background is added, remove the "*Without*" portion of the display, as the X already indicates this.
- When a Background (or other non-Partners) are added in the *Partner* bar, the list shouldn't be named "[Commander] & [Background]".
- The *Partner* search bar should either dynamic or divided, accounting for Companions, Backgrounds or other such cases. Currently, to select a Background for a *Choose a Background* Commander, I need to select it as a Partner, which is misleading.

## Card view

- Overhaul the individual card view, taking https://gatherer.wizards.com/ as an example.
  - Use actual icons for mana value and type line, with the mana value implied (*e.g., replace "Instant · Mana value 2"*).
  - Show which rules text is displayed. Add a Settings option to choose Printed or Oracle rules text (Oracle by default).
  - Show relevant rulings. Decide whether they are fetched or bundled, since bundling adds size.
- The "Change Version" text and "List | Images" are in different boxes, occupying unnecessary vertical space.

## Visual Revision 

**Relevant plugin(s):** `/design`<br>
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

## Quality of Life

- Deckbuilding tools, such as per-tag, per-color card search - essentially, tools for users that want to learn to build a deck from scratch.
- Tool that may prepare a page for proxy printing. This option needs to be considered carefully, as it may be controversial.
- Include `/dist` installer in the repository.
- Explore support for offline use.
- Other quality of life features that should help players set up their dream decks.