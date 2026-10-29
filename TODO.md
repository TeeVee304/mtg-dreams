# TODO

Planned work for future releases. 

## Data Model and Storage 
**Relevant plugin(s):** `/ai-firstify:ai-firstify`, `/design:design-system`
- Major data model revisions (normal forms, etc.)
  - Normalize where the pain is (duplicated card/printing data in decks and wishlists, Universe/version relations), not for its own sake.
  - Keep portability in mind: heavily normalized data is harder to export as a single self-contained file.
- Schema versioning and a migration pipeline for saved files
  - Add a schema version to saved files now, before public release, regardless of the normalization outcome.

## Localization

- Support for different languages. App language and card language should be two separate settings.
  - App language: build on the existing `src/shared/text/` structure.
  - Card language: a property of the printing/version, not a global setting.
  - Hard part: name matching on search and import, so a localized name resolves to the same oracle card.

## Formats

- Broader support for other popular formats, such as Standard, Modern, Pioneer and Pauper (abstraction).
  - Introduce a `Format` abstraction: deck size, copy limit, commander zone, legality source.
  - Commander stays the reference implementation.
  - Store dated legality snapshots, so older decks do not show the wrong legality.
  - Pauper (commons only) is a good test case for the abstraction.
  - **NOTE:** This introduces significant challenges. EDHREC is the main inspiration and source of information for this app, and it applies only to Commander.

## Deck Customization

- More visual customization for decks. Currently we have Color Themes, the Commander banner and Universes, but most are Commander-specific.
  - Color themes for mixed color identities (derive from the color identity gradient).
  - Treat theme, banner and universe as optional, generic layers.
  - Non-Commander decks need a fallback banner (e.g., first card art or format symbol).

## Commander mechanics

- Add support for Companions and Rulebreaker, as Backgrounds and Partners are already implemented.
  - Companions are a deck-validation restriction, so they fit the Wizard as a validator.
  - Confirm Rulebreaker rules against the official rules text before designing.
- Add support for Dungeons (Venture into the Dungeon). This may have some nuances.
  - Dungeons are not deck cards in the usual sense. Confirm the rules first; the nuance is likely in modeling and Wizard suggestions rather than legality.
- Similar to Disguise or Poison support, Monarch mechanic should be associated with the respective token, and added. Undercity as well. 
- When a Commander has "Partner with", its Partner should be added automatically (be it Deck, Wishlist or Deck Wizard).

## Inventory and Wishlists

- When adding a card to the inventory, select the version first, similar to the wishlist process.
  - Remember the last version chosen per card to reduce friction.
- When a wishlist wants a specific version and you own a different one, flag it (?) instead of ticking it right away.
  - Three states: exact printing owned (tick); same card, different printing or foil status (substitute marker, user confirms); no owned copy (unticked).
  - Matching: a version-agnostic wishlist matches on oracle ID; a version-specific one matches on the printing.
  - A substitute reserves no copy unless the user confirms it (see "Wishlists reserve no copies").
- Game Changer flag for cards.
- In Statistics, of the graph showing "Creatures // Other spells", the bars should display color distributions among mana values. Colorless (number) mana should be different from Colorless.
- In Statistic, provide insights about Lands and Mana Rocks in the mana curve.
- In a Wishlists's Token view, the user must be able to browse token versions (even if considered free).
- I placed, in a Middle-earth wishlist, 'Ring of Barahir' and the tag below said 'Use Sword of the Animist'. Just do it, do not ask for permission, as the result will be the same - the original card name, but with the version the user wants.

## Card Scanner
**Relevant plugin(s):** `/design:design-system`, `/engineering:system-design`, `/engineering:testing-strategy`
- Scan cards with the camera to add them to the inventory, with live feedback (name, version, language, price).
  - Language-independent recognition is crucial: a player may scan a card in a language they can't read to learn what it is. Show the English name and the English card image beside the detected language.
  - Scans go to a tray first; one confirmed **Add N Cards to Inventory** writes them (one write, one undo step).
  - A sound on each match, with a remembered mute toggle.
- Recognition:
  - Primary: art fingerprint (perceptual hash of the art) matched against an index of every illustration (~50k). Works in any language and any era. Close matches are offered as card images, so no reading is needed.
  - Exact printing and language: OCR of the collector line only (`0123 · MKM · JA`, Latin letters and digits, English OCR data). Older cards without it get a manual version pick.
  - No title OCR: it can't read other scripts, and the art match makes it redundant.
  - The index ships with each release; newer cards are fingerprinted locally in the background when the scanner opens.
- Architecture: a feature module like the Deck Wizard (`window.scanner`, `scanner:*` IPC, one `index.tsx` entry, loaded on first use).
  - Camera → steadiness gate (pure, ~8 Hz) → worker (fingerprint + OCR) → main `identify` (collector lookup through the existing Scryfall queue) → existing printings store for prices → tray → `actions.addOwned`.
  - `ScanSession` state machine with injected camera, reader and clock, so it is unit-tested with fakes.
  - Reuse, don't duplicate: Scryfall queue, `cachedFetch`, `validate.ts`, `usePrintingsFor`, `priceOf`, `VersionPicker`, `Price`, `Stepper`, `CardThumb`, `FoilSheen`, `LanguageFlag`, existing color tokens. The card ratio (63:88) is defined once in TS.
- Prerequisites:
  - Allow only video `media` permission from the app's own origin (today every permission is denied).
  - CSP: `'wasm-unsafe-eval'` and `worker-src 'self'`.
  - `withAddedOwned` drops `lang`; pass it through so scanned languages are saved.
- Reliability: worker restarts with a budget, OCR timeout, distinct camera errors (denied, missing, busy, unplugged) with a fix each, cooldown until the card is removed (no double counts), tray draft survives a crash or accidental close.
- Expected cost (to confirm in the spike): about +5 MB on the 103 MB installer; about 5–15% of one core and 70–90 MB of memory while scanning; nothing when closed.
- Phase 0 spike first (outside the repo): worker and WASM load from `file://` in the packaged build; art-match accuracy on ~30 real cards (foils, sleeves, two non-English). Below ~85% first-try accuracy, add card-edge detection before building the rest.
- Open: foil can't be told reliably by camera, so it is a manual toggle (off by default).


## Deck Wizard
- "Commanders you own, not leading a Deck yet" should just be eligible commanders- in use or not.
- Remove the "Another Commander" search bar, as it can be confusing when paired with the "Partner" search bar.
- When a Partner or Background is added, remove the added "Without" portion of the display, as the X already signifies this.
- When a Background (or other non-Partners) are added in the Partner bar, the list shouldn't be named "Commander & Background", as it doesn't consist of 2 characters.
- The Partner search bar should be dynamic or be divided, accounting for Companions, Backgrounds or other such cases. Currently, to select a Background for a "Choose a Background" Commander, I need to select it as a Partner, which is misleading.

## Card view

- Overhaul the individual card view, taking https://gatherer.wizards.com/ as an example.
  - Use actual icons for mana value and type line, with the mana value implied (e.g., replace "Instant · Mana value 2").
  - Show which rules text is displayed. Add a Settings option to choose Printed or Oracle rules text (Oracle by default).
  - Show relevant rulings. Decide whether they are fetched or bundled, since bundling adds size.
- The "Change Version" text and "List | Images" are in different boxes, occupying unnecessary vertical space.

## Documentation
**Relevant plugin(s):** `/humanizer:humanizer`
- Update README for more simplicity.
- LaTeX user guide (code not pushed to GitHub, only the final PDF) covering the data model, files and advanced options.
- Transparency about Claude intervention (vibe coding).

## Quality of life

- Other quality of life features that should help players set up their dream decks.
- Deckbuilding tools, such as per-tag, per-color card search - essentially, tools for users that want to learn to build a deck from scratch.
- Tool that may prepare a page for proxy printing. This option needs to be considered carefully, as it may be controversial.
- Explore support for offline use.
