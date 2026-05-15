# Graph Report - .  (2026-05-16)

## Corpus Check
- Corpus is ~21,240 words - fits in a single context window. You may not need a graph.

## Summary
- 79 nodes · 110 edges · 11 communities (8 shown, 3 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.88)
- Token cost: 18,000 input · 4,500 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth and Account System|Auth and Account System]]
- [[_COMMUNITY_Media API and Orb Sourcing|Media API and Orb Sourcing]]
- [[_COMMUNITY_Boost and Premium Features|Boost and Premium Features]]
- [[_COMMUNITY_Orb Playback and Animation|Orb Playback and Animation]]
- [[_COMMUNITY_V2 App and Internationalization|V2 App and Internationalization]]
- [[_COMMUNITY_Swipe Core Logic|Swipe Core Logic]]
- [[_COMMUNITY_Swipe Screen and Navigation|Swipe Screen and Navigation]]
- [[_COMMUNITY_Landing and Visual FX|Landing and Visual FX]]
- [[_COMMUNITY_Messaging Panel|Messaging Panel]]
- [[_COMMUNITY_Conversations Data|Conversations Data]]
- [[_COMMUNITY_Boost Modal|Boost Modal]]

## God Nodes (most connected - your core abstractions)
1. `Tindord Application (v1)` - 12 edges
2. `Function: setScreen()` - 9 edges
3. `Tindord Application (v2 Landing)` - 8 edges
4. `Orb Data Structure` - 7 edges
5. `Boost Premium System` - 7 edges
6. `Screen: Swipe Deck` - 6 edges
7. `Function: ensureDeck()` - 6 edges
8. `CSS: Animated Bubble Field (.bubbles)` - 5 edges
9. `App State Object (state.user / state.profile)` - 5 edges
10. `Function: searchSpotifyTracks()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `v2 Animated Bubble Field` --semantically_similar_to--> `CSS: Animated Bubble Field (.bubbles)`  [INFERRED] [semantically similar]
  v2/index.html → index.html
- `Design Decision: v1 full SPA vs v2 landing-only` --rationale_for--> `Tindord Application (v1)`  [INFERRED]
  v2/index.html → index.html
- `v2 i18n Dictionary (FR/EN, landing-only)` --semantically_similar_to--> `i18n Dictionary (FR/EN)`  [INFERRED] [semantically similar]
  v2/index.html → index.html
- `v2 Language Switcher` --semantically_similar_to--> `Language Switcher Widget`  [INFERRED] [semantically similar]
  v2/index.html → index.html
- `Tindord Application (v2 Landing)` --references--> `External API: Discord OAuth2`  [EXTRACTED]
  v2/index.html → index.html

## Hyperedges (group relationships)
- **Swipe Flow: drag -> commit -> advance deck -> render orbs** — index_fn_attachdrag, index_fn_commitswipe, index_fn_ensuredeck, index_fn_renderorbs [EXTRACTED 1.00]
- **Orb Media Pipeline: search APIs -> orb data -> playback** — index_fn_searchspotify, index_fn_searchanime, index_fn_searchwiki, index_fn_playorb, index_orb_structure [EXTRACTED 1.00]
- **Boost Gate: premium features locked behind state.user.boost** — index_boost_system, index_liked_panel, index_gif_system, index_swipe_music_player [EXTRACTED 1.00]

## Communities (11 total, 3 thin omitted)

### Community 0 - "Auth and Account System"
Cohesion: 0.2
Nodes (11): External API: Discord OAuth2, External API: Giphy Search, External API: Supabase (Auth + DB), Account Tabs UI (Profil/Bulles/Boost/Comptes/Infos), Auth Modal (Discord + Email), Function: signInWithDiscord(), Function: userFromSupabaseSession(), Onboarding Draft State (gender/age/looking) (+3 more)

### Community 1 - "Media API and Orb Sourcing"
Cohesion: 0.29
Nodes (11): External API: Jikan (MyAnimeList), External API: Spotify Web API, External API: Wikipedia REST API, Function: addOrb(), Function: backfillCovers(), Function: getSpotifyToken(), Function: searchAnime(), Function: searchSpotifyTracks() (+3 more)

### Community 2 - "Boost and Premium Features"
Cohesion: 0.24
Nodes (10): Boost Premium System, Function: refreshBoostUI(), Function: renderAccount(), Function: renderGifStage(), Function: renderLikedMe(), Function: renderUserOrbs(), GIF Placement System (Boost), LIKED_ME Mock Data (+2 more)

### Community 3 - "Orb Playback and Animation"
Cohesion: 0.22
Nodes (9): Function: fadeIn() audio, Function: fadeOutAndStop() audio, Function: playOrb(), Function: renderOrbs(), CSS: Orb Orbit Layer (.orbit), CSS: Discord-style swipe-card, CSS: swipe-stage layout, CSS: swipe-wrap card container (+1 more)

### Community 4 - "V2 App and Internationalization"
Cohesion: 0.25
Nodes (9): External API: Google OAuth2 (v2 only), i18n Dictionary (FR/EN), Language Switcher Widget, Design Decision: v1 full SPA vs v2 landing-only, v2 Auth Modal (Discord + Google + Email), v2 i18n Dictionary (FR/EN, landing-only), v2 Language Switcher, v2 Screen: Landing / Hero (+1 more)

### Community 5 - "Swipe Core Logic"
Cohesion: 0.32
Nodes (7): Function: attachDrag(), Function: buildCard(), Function: commitSwipe(), Function: ensureDeck(), Function: refreshMyStatusUI(), Profile Data Structure (PROFILES array), App State Object (state.user / state.profile)

### Community 6 - "Swipe Screen and Navigation"
Cohesion: 0.32
Nodes (7): Function: refreshSwipeTools(), Function: setScreen(), Function: startSwipeMusic(), My Status Floating Control, Screen: Swipe Deck, Ambient Swipe Music Player (Boost), CSS: Swipe Toolbar (.swipe-tools)

### Community 7 - "Landing and Visual FX"
Cohesion: 0.29
Nodes (7): CSS: Animated Bubble Field (.bubbles), Function: explode() bubble, Function: spawn() bubble, Function: step() bubble physics loop, CSS: Background mesh scene (.scene + .blob), Screen: Landing / Hero, v2 Animated Bubble Field

## Knowledge Gaps
- **18 isolated node(s):** `Auth Modal (Discord + Email)`, `Boost Pricing Modal`, `Messages Slide-out Panel`, `Liked-Me Panel (Boost only)`, `CSS: Background mesh scene (.scene + .blob)` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Tindord Application (v1)` connect `Auth and Account System` to `Media API and Orb Sourcing`, `V2 App and Internationalization`, `Swipe Screen and Navigation`, `Landing and Visual FX`?**
  _High betweenness centrality (0.405) - this node is a cross-community bridge._
- **Why does `Function: setScreen()` connect `Swipe Screen and Navigation` to `Auth and Account System`, `Boost and Premium Features`, `Swipe Core Logic`, `Landing and Visual FX`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Why does `Screen: Swipe Deck` connect `Swipe Screen and Navigation` to `Auth and Account System`, `Orb Playback and Animation`?**
  _High betweenness centrality (0.169) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Orb Data Structure` (e.g. with `External API: Jikan (MyAnimeList)` and `External API: Wikipedia REST API`) actually correct?**
  _`Orb Data Structure` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Auth Modal (Discord + Email)`, `Boost Pricing Modal`, `Messages Slide-out Panel` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._