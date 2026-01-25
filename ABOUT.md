# Mana Vault

A personal Magic: The Gathering collection and deck tracking application built with a mobile-first approach.

## Vision

Mana Vault solves the pain points of existing MTG tracking apps by providing:

- **Cross-deck card tracking**: Easily see which deck a card is currently in, and which decks want it
- **Complete trade history**: Never forget what you traded and to whom
- **Reliable sync**: Seamless data sync across all devices
- **Full-featured wishlists**: Prioritized, reorderable wishlists at both global and deck levels

## Core Features

### Card Collection Management

- Track cards you own with full details:
  - Specific set/printing
  - Condition (NM, LP, MP, HP, DMG)
  - Foil/non-foil status
  - Quantity
- Card lifecycle tracking: owned, previously owned, wanted
- Integration with Scryfall API for card data and images
- Input methods:
  - Search by name with autocomplete
  - Bulk import (deck lists, CSV)
  - Future: Camera recognition, barcode/QR scanning

### Comprehensive Tagging System

A hybrid tagging approach combining:

- **System tags**: Predefined status tags (owned, wanted, traded, in-deck, etc.)
- **Custom tags**: User-created tags for personal organization

Key capabilities:

- Track which deck(s) a card is currently assigned to
- See all decks that want a specific card
- View complete card history (owned, traded, acquired dates)
- Filter and search by any combination of tags

### Deck Management

Organize decks by multiple dimensions:

- **Format**: Commander, Standard, Modern, Legacy, Pioneer, Pauper, etc.
- **Status**: Active, retired, in-progress, theorycraft
- **Archetype**: Aggro, control, combo, midrange, tempo, etc.
- **Color identity**: Mono, two-color, three-color, four-color, five-color

Features:

- Link physical cards from collection to deck slots
- Track which cards are proxied vs owned
- Per-deck wishlists with priority ordering
- Deck statistics and mana curve visualization

### Deck Building Workflow

When building a new deck, easily assess card availability:

- **Ownership status**: For each card in the deck list, see if you own it or need to acquire it
- **Current location**: If owned, see whether the card is:
  - In your available pool (unassigned/miscellaneous cards)
  - Currently assigned to another active deck
  - In a retired or theorycraft deck
- **Conflict detection**: Quickly identify cards that would need to be pulled from other active decks
- **At-a-glance summary**: View deck completion stats (e.g., "42/100 owned, 15 in other decks, 43 needed")
- **Decision support**: Make informed choices about which cards to move, proxy, or add to wishlist

### Wishlist System

A first-class feature, not an afterthought:

- **Global wishlist**: Overall cards you want to acquire
- **Deck wishlists**: Cards wanted for specific decks
- **Priority ordering**: Drag-and-drop reordering within any wishlist
- **Smart suggestions**: See which wishlist cards would benefit multiple decks
- Price tracking and alerts (future enhancement)

### Virtual Lists (Snapshots)

Create preserved lists of cards independent of their physical location or deck assignment:

- **Historical snapshots**: Capture a collection at a point in time (e.g., "Cards from brother-in-law - Jan 2026")
- **Value tracking**: Record card values at the time of snapshot creation
- **Non-destructive**: Cards can move between decks, binders, and boxes while remaining on the virtual list
- **Source tracking**: Document where cards came from (gifts, purchases, trades, etc.)
- **Use cases**:
  - Gifts received (track who gave you what)
  - Bulk purchases (what was in that lot you bought)
  - Insurance records (document collection value at a point in time)
  - Sentimental groupings (cards from a specific era or event)
- **Current status view**: When viewing a virtual list, see where each card is now:
  - Which deck it's in (if any)
  - Which binder/box it's stored in
  - If it was traded (and to whom/when)
  - If it was sold or removed from collection
- **Summary statistics**: At-a-glance breakdown of list distribution (e.g., "45 in decks, 120 in storage, 12 traded, 3 sold")

### Physical Storage Tracking

Track where your cards physically live:

- **Storage containers**: Create and name binders, boxes, and other storage solutions
- **Card location**: Assign cards to specific containers (or mark as unassigned/loose)
- **Container views**: Browse contents of any binder or box
- **Bulk operations**: Easy multi-select to move cards between containers
  - Select multiple cards and move to a different binder/box
  - Move entire filtered results (e.g., "move all red cards to Box A")
  - Quick actions for common operations
- **Location search**: Find which container holds a specific card
- **Integration with decks**: Cards in active decks can optionally track their "home" storage location for when disassembled

### Trade Tracking

- Log trades with friends/other players
- Record what was traded and received
- Timestamp and notes for each trade
- View complete trade history per card
- Track trade partners

### Pricing System

Prices are modeled as separate entities linked to cards, not embedded directly:

- **Multiple price sources**: Support for different pricing providers (Scryfall, TCGPlayer, CardKingdom, etc.)
- **Independent update schedules**: Each source can sync on its own schedule
- **Price history**: Track price changes over time per source
- **Source selection**: Choose which price source to display by default, or compare across sources
- **Data model**: Price sources are first-class entities with their own update timestamps and metadata
- **Collection valuation**: Calculate total collection value using any configured price source

## User Scope

- Initial release: Personal use + friends (private, invite-based)
- Future: Option to expand to public registration
- Built on existing Better-Auth authentication system

## Platform Priority

**Mobile-first design** - Primary use cases:

- Quick lookups at game stores
- Collection updates at events
- Trading reference with friends
- Deck checking during games

Platforms:

- React Native (Expo) mobile app - primary
- Web app - full feature parity

## Technical Stack

- **Frontend**: React (web), React Native/Expo (mobile)
- **Backend**: Hono + oRPC
- **Database**: Drizzle ORM with SQLite/D1
- **Auth**: Better-Auth (already configured)
- **External API**: Scryfall for card data
- **Deployment**: Cloudflare

## MVP Scope

Full feature set from day one:

1. Card collection with detailed tracking
2. Virtual lists/snapshots for historical preservation
3. Physical storage tracking (binders, boxes) with bulk operations
4. Deck building and management
5. Global and deck-based wishlists with priority ordering
6. Trade logging and history
7. Comprehensive tagging system
8. Cross-device sync

## Out of Scope (Future Phases)

- Camera-based card recognition
- Barcode/QR scanning
- Public profiles and social features
- Price alerts and market tracking
- Tournament/event logging
- Deck sharing and public deck lists

## Success Metrics

- Can quickly answer: "Do I own this card? Which deck is it in?"
- Can easily reorder wishlist priorities on mobile
- Trade history is complete and searchable
- Zero sync conflicts between devices
