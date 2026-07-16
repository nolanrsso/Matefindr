# Matefindr — Bot Discord Presence

Synchronise le **status** + **activités** Discord (Spotify, jeux…) vers `profiles.data.discordLive`.

Les Edge Functions Supabase ne peuvent **pas** garder une WebSocket Gateway ouverte → ce worker tourne à part (Railway / Fly / VPS / PC).

## Setup Discord (une fois)

1. [Discord Developer Portal](https://discord.com/developers/applications) → ton bot Matefindr  
2. **Bot** → Privileged Gateway Intents → activer **Presence Intent** (et **Server Members Intent** recommandé)  
3. Save Changes  
4. Le bot doit être sur le serveur Matefindr (`DISCORD_GUILD_ID`) — déjà le cas si auto-join marche  

## Variables d’environnement

| Var | Description |
|-----|-------------|
| `DISCORD_BOT_TOKEN` | Token du bot (même que `discord-join-dm` / `notify`) |
| `DISCORD_GUILD_ID` | ID du serveur Matefindr |
| `SUPABASE_URL` | `https://pdhffpxssagclexttfox.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé **service_role** (Dashboard → Settings → API) |

## Lancer en local

```bash
cd bot/discord-presence
npm install
set DISCORD_BOT_TOKEN=...
set DISCORD_GUILD_ID=...
set SUPABASE_URL=https://pdhffpxssagclexttfox.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=...
npm start
```

Logs attendus : `[presence] logged in as Matefindr#….` puis une ligne par update utile.

## Railway / Fly

- Root directory : `bot/discord-presence`
- Start command : `npm start`
- Coller les 4 env vars
- Processus **toujours allumé** (pas de sleep)

## Côté site

Le client lit déjà `data.discordLive` sur les cartes. Le sync profil **préserve** la valeur bot si elle est plus récente (évite d’écraser Spotify avec un `null` local).
