# Graph Report - .  (2026-06-12)

## Corpus Check
- 161 files · ~200,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 161 nodes · 198 edges · 13 communities (11 shown, 2 thin omitted)
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.82)
- Token cost: 0 input · 215,000 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth, Nav & i18n|Auth, Nav & i18n]]
- [[_COMMUNITY_Profile Editor (editor.html)|Profile Editor (editor.html)]]
- [[_COMMUNITY_Landing Bubble Physics|Landing Bubble Physics]]
- [[_COMMUNITY_Boost & Account Card|Boost & Account Card]]
- [[_COMMUNITY_Match & Likes Flow|Match & Likes Flow]]
- [[_COMMUNITY_Supabase Backend|Supabase Backend]]
- [[_COMMUNITY_Messages & Media Search|Messages & Media Search]]
- [[_COMMUNITY_Voice, Badges & Preview|Voice, Badges & Preview]]
- [[_COMMUNITY_v2 Landing Variant|v2 Landing Variant]]
- [[_COMMUNITY_Orb Covers & Music Fallbacks|Orb Covers & Music Fallbacks]]
- [[_COMMUNITY_Discord FAB|Discord FAB]]
- [[_COMMUNITY_Banner Upload|Banner Upload]]

## God Nodes (most connected - your core abstractions)
1. `Tindord Landing page` - 14 edges
2. `localStorage bridge (hydrateFromSite/writeState)` - 12 edges
3. `Swipe Deck & Drag` - 9 edges
4. `state.user (live user model)` - 9 edges
5. `Discord OAuth Module` - 8 edges
6. `Supabase backend` - 8 edges
7. `Tindord Application (v2 Landing)` - 7 edges
8. `Account Screen` - 7 edges
9. `Account Render & Preview` - 7 edges
10. `Profile Orbs (Bubbles)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Violet/Pink color palette (#0D0B1E/#9146FF/#FF7EB6)` --semantically_similar_to--> `Discord user webhook`  [INFERRED] [semantically similar]
  tindord/chats/chat1.md → supabase/README.md
- `Interest bubbles (orbs) — swipe-scale layout` --semantically_similar_to--> `Tindord main app — v2 variant (v2/index.html)`  [INFERRED] [semantically similar]
  editor.html → v2/index.html
- `Tindord Landing page` --shares_data_with--> `Supabase backend`  [INFERRED]
  tindord/project/Tindord Landing.html → supabase/README.md
- `localStorage bridge (hydrateFromSite/writeState)` --shares_data_with--> `Tindord main app — v2 variant (v2/index.html)`  [INFERRED]
  editor.html → v2/index.html
- `Tindord main app — v2 variant (v2/index.html)` --shares_data_with--> `tindord_state (shared localStorage key)`  [INFERRED]
  v2/index.html → editor.html

## Hyperedges (group relationships)
- **Bottom-row FAB stack (auth=in only)** — index_msg_fab, index_heart_fab, index_badge_fab [EXTRACTED 1.00]
- **Liker-to-Match Flow Pipeline** — index_liked_me_panel, index_liker_overlay, index_create_match_from_liker, index_match_overlay [EXTRACTED 1.00]
- **Bulles Physics Forces (3 systems)** — index_bulles_mouse_repulsion, index_bulles_pairwise_collision, index_forbidden_zones [EXTRACTED 1.00]
- **Editor↔app profile sync over tindord_state** — editorhtml_localstorage_bridge, editorhtml_tindord_state_key, editorhtml_state_object, v2index_main_app [EXTRACTED 1.00]
- **Profile card overlay layers (orbs + GIFs + placement zone)** — editorhtml_interest_orbs, editorhtml_gif_stickers, editorhtml_placement_zone [EXTRACTED 1.00]
- **Discord-derived profile (avatar/deco/resync)** — editorhtml_avatar_deco_layer, editorhtml_discord_resync, editorhtml_avatar_crop [EXTRACTED 1.00]
- **Notification pipeline (insert → trigger → webhook → edge fn → Discord)** — likes_table, reciprocal_match_trigger, database_webhooks, notify_edge_function, discord_user_webhook [EXTRACTED 1.00]
- **Bubble interaction system** — bubble_field, bubble_repulsion, bubble_explosion, bubble_collisions, bubble_respawn [EXTRACTED 1.00]
- **Visual design language** — color_palette, typography, glassmorphism, mesh_gradient_bg [EXTRACTED 1.00]

## Communities (13 total, 2 thin omitted)

### Community 0 - "Auth, Nav & i18n"
Cohesion: 0.11
Nodes (22): Auth Modal (Providers + Email), Badge Picker Panel, Header & Brand Nav, Language Switcher, Discord Badge Picker, Bubble Field (Landing Physics), Discord OAuth Module, i18n / Language Module (+14 more)

### Community 1 - "Profile Editor (editor.html)"
Cohesion: 0.12
Nodes (21): Avatar crop (zoom/pan), Avatar decoration layer (Discord), Background picker, Connections (app logos + username), Discord resync button, Entry music picker (scrub window), Entry snapshot (cancel baseline), Eye toggles (hide preview) (+13 more)

### Community 2 - "Landing Bubble Physics"
Cohesion: 0.11
Nodes (21): Bubble-bubble elastic collisions, Click explosion (flash/ring/shards/sparks/shockwave), Interactive floating bubble field, Mouse repulsion (~170px field), 15s respawn from left/right wall, Violet/Pink color palette (#0D0B1E/#9146FF/#FF7EB6), Fixed corner controls (Discord left / lang right), Discord CTA button (triple glow) (+13 more)

### Community 3 - "Boost & Account Card"
Cohesion: 0.14
Nodes (18): Boost Banner (outside acc-card), Boost Modal (2-col upsell), Age+Gender Badge Below Banner, Liked Me Panel (Boost), Account Render & Preview, Account Floating Save Bar, Boost Plan (Tindord Boost), Discord Resync Button (+10 more)

### Community 4 - "Match & Likes Flow"
Cohesion: 0.16
Nodes (15): Boost Tab (2-col layout), Bulles Mouse Repulsion, Bulles Pairwise Collision (elastic), Bulles Physics Simulation (drift+repulsion+collision), CONVOS Array (chat threads), createMatchFromLiker() Function, Fly-to-FAB Animation Pattern, Forbidden UI Zones (nav/FAB exclusion) (+7 more)

### Community 5 - "Supabase Backend"
Cohesion: 0.21
Nodes (15): Database Webhooks (notif_like/match/message), Discord user webhook, likes table (public.likes), matches table (public.matches), messages table (public.messages), --no-verify-jwt deploy flag, notify edge function, Reciprocal-like match trigger (+7 more)

### Community 6 - "Messages & Media Search"
Cohesion: 0.15
Nodes (14): Messages Panel & FAB, Anime/Wiki Search, iTunes Preview Fallback, Messages/Chat Module, Orb Music Player (fade), Profile Orbs (Bubbles), Spotify Search Integration, Swipe Background Music Player (+6 more)

### Community 7 - "Voice, Badges & Preview"
Cohesion: 0.18
Nodes (13): Account Live Profile Preview, Account Voice Player Widget, Archive/Restore on Discord Reconnect, Badge FAB (looking_for picker), Badge FAB Popup (chill/game/talk/sleep), Card Voice Playing State (data-playing), Swipe Card Voice Memo Widget, Dirty-State Tracking Pattern (+5 more)

### Community 8 - "v2 Landing Variant"
Cohesion: 0.29
Nodes (8): External API: Google OAuth2 (v2 only), Design Decision: v1 full SPA vs v2 landing-only, v2 Auth Modal (Discord + Google + Email), v2 Animated Bubble Field, v2 i18n Dictionary (FR/EN, landing-only), v2 Language Switcher, v2 Screen: Landing / Hero, Tindord Application (v2 Landing)

### Community 9 - "Orb Covers & Music Fallbacks"
Cohesion: 0.25
Nodes (8): Bulles Fullscreen Orbit Module, Deezer Preview Fallback (JSONP), GAME_COVER_OVERRIDES Map, Image Transparency Detection, iTunes Preview Fallback, Preview Fallback Chain (Spotify->Deezer->iTunes), Spotify Client Credentials Token, Wikidata Cover Fetcher (P18/P154/P2716)

## Knowledge Gaps
- **64 isolated node(s):** `v2 Screen: Landing / Hero`, `v2 Animated Bubble Field`, `v2 i18n Dictionary (FR/EN, landing-only)`, `v2 Language Switcher`, `Design Decision: v1 full SPA vs v2 landing-only` (+59 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `state.user (live user model)` connect `Boost & Account Card` to `Auth, Nav & i18n`, `Match & Likes Flow`, `Messages & Media Search`, `Voice, Badges & Preview`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `Match Animation Overlay` connect `Match & Likes Flow` to `Boost & Account Card`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `Forbidden UI Zones (nav/FAB exclusion)` connect `Match & Likes Flow` to `Voice, Badges & Preview`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Tindord Landing page` (e.g. with `Supabase backend` and `Read chat transcripts first`) actually correct?**
  _`Tindord Landing page` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `state.user (live user model)` (e.g. with `Onboarding Genre (3 options + skip link)` and `Age+Gender Badge Below Banner`) actually correct?**
  _`state.user (live user model)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `v2 Screen: Landing / Hero`, `v2 Animated Bubble Field`, `v2 i18n Dictionary (FR/EN, landing-only)` to the rest of the system?**
  _64 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth, Nav & i18n` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._