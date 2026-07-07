# Matefindr — Stockage des avatars/bannières (Supabase Storage)

Avant : avatar/bannière uploadés étaient encodés en **base64 et stockés directement dans la table `profiles`** (colonnes `avatar_url`/`banner_url` + dupliqués dans la colonne `data`). Avec très peu d'utilisateurs, ça a fait exploser la taille de la base (193% du quota gratuit à ~20 comptes).

Depuis, `index.html` compresse l'image côté client puis l'envoie dans le bucket Storage `profile-media` (`{user_id}/avatar-*.jpg`, `{user_id}/banner-*.jpg`) et ne stocke plus qu'une **URL** en base.

## Setup (une fois)

Exécuter `storage-profile-media.sql` dans **Supabase Dashboard → SQL Editor** — crée le bucket `profile-media` (public en lecture) + policies (chaque user ne peut écrire que dans son propre dossier).

⚠️ Tant que ce SQL n'est pas exécuté, les nouveaux uploads d'avatar/bannière échouent proprement (toast d'erreur, l'ancienne image reste affichée) — rien de cassé, juste la fonctionnalité indisponible.

## Nettoyer les données déjà stockées en base64

`admin.html` (outil local) a un bouton **🧹 Migrer images → Storage** (visible en mode `service_role`) qui repère les profils avec des images encore en base64, les recompresse, les upload dans Storage, et met à jour les lignes `profiles`. Utile pour faire redescendre la taille de la base sous le quota.

---

# Matefindr — Auto-join du serveur Discord à la création de compte

Quand un utilisateur se connecte avec Discord, le **bot l'ajoute automatiquement au serveur** (puis lui envoie un DM de bienvenue). C'est l'Edge Function `discord-join-dm`.

## Comment ça marche

```
[login Discord (scope guilds.join)]  →  provider_token de l'utilisateur
            │
            ▼  window.__discordJoinDM()  (POST {access_token, user_id})
[Edge Function /functions/v1/discord-join-dm]
            │  PUT /guilds/{GUILD_ID}/members/{user_id}  (Authorization: Bot)
            │       body: { access_token }   ← c'est le scope guilds.join qui autorise ça
            ▼
[utilisateur ajouté au serveur]  +  DM de bienvenue (best-effort)
```

Le bot token reste **uniquement côté serveur** (secret Supabase) — jamais dans le client.

## Setup (une fois)

1. **Scope OAuth** : déjà fait côté code — `signInWithOAuth({ scopes: '... guilds.join' })`.
   ⚠️ Les utilisateurs déjà connectés doivent **se reconnecter** pour que leur token contienne `guilds.join`.

2. **Bot Discord** : sur la **même** application Discord que le login (Developer Portal → onglet *Bot*), créer le bot et copier le **Bot Token**.

3. **Inviter le bot sur le serveur** avec au minimum la permission **Créer une invitation** (CREATE_INSTANT_INVITE — c'est elle qui autorise l'ajout de membres via OAuth) :
   `https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot&permissions=1`

4. **Secrets Supabase** :
   ```bash
   supabase secrets set DISCORD_BOT_TOKEN="ton_bot_token" DISCORD_GUILD_ID="id_du_serveur"
   # optionnel : DISCORD_WELCOME_MESSAGE="Bienvenue sur Matefindr ! 🎉"
   ```
   (ID du serveur : Discord → Paramètres avancés → Mode développeur, puis clic droit sur le serveur → Copier l'identifiant.)

5. **Déployer** :
   ```bash
   supabase functions deploy discord-join-dm --no-verify-jwt
   ```

## Tester

```bash
curl -X POST https://<project>.supabase.co/functions/v1/discord-join-dm \
  -H "Content-Type: application/json" \
  -d '{"access_token":"<provider_token>","user_id":"<discord_id>"}'
# → { ok:true, joined:true|already:true, dm:true }
```

Erreur `join_echoue` status 403 = le bot n'a pas la permission *Créer une invitation*, ou le token n'a pas le scope `guilds.join` (l'utilisateur doit se reconnecter).

---

# Matefindr — Notifications Discord en prod

## Pourquoi ça ne marche pas tel quel

Le client envoie le webhook lui-même. Si l'utilisateur n'a pas l'onglet ouvert au moment de l'événement, **rien ne part**. Pour que ça marche pour de vrai, les notifs doivent partir du serveur.

## Architecture cible

```
[client A swipe]
    │
    │ insert into public.likes
    ▼
[Supabase Postgres]
    │
    │ trigger: si réciproque → insert into public.matches
    │
    │ Database Webhook (sur INSERT likes/matches/messages)
    ▼
[Edge Function /functions/v1/notify]
    │
    │ lit user_notif_prefs du destinataire
    │ POST embed JSON
    ▼
[Webhook Discord du user]
```

Avantage : ça marche même si tous les onglets sont fermés.

### MP direct par le bot (recommandé — plus besoin de webhook)

Depuis que le bot ajoute chaque utilisateur au serveur (auto-join), il peut lui envoyer un **MP** pour chaque notif (like / match / message). La fonction `notify` récupère le `discord_id` du destinataire dans `profiles` et envoie l'embed en DM via le bot.

- **Aucune config utilisateur** : pas de webhook à créer, ça marche pour tout le monde dès qu'ils se sont connectés.
- **Pré-requis** : le secret `DISCORD_BOT_TOKEN` doit être défini (même bot que `discord-join-dm`) → `supabase secrets set DISCORD_BOT_TOKEN="..."`, puis redéployer `notify`.
- Le MP est *best-effort* : si l'utilisateur a fermé ses MP, il est simplement ignoré.
- Le webhook perso (ci-dessus) reste géré en plus, pour qui en a configuré un.

## Setup (une fois)

### 1. Tables + trigger + RLS

Dans **Supabase Dashboard → SQL Editor**, exécuter `schema.sql`.

### 2. Déployer l'Edge Function

```bash
supabase functions deploy notify --no-verify-jwt
```

`--no-verify-jwt` parce que c'est appelé par les Database Webhooks (pas par un user authentifié).

### 3. Brancher 3 Database Webhooks

Dashboard → Database → Webhooks → Create.

| # | Name           | Table             | Events  | URL                                      |
|---|----------------|-------------------|---------|------------------------------------------|
| 1 | notif_like     | public.likes      | Insert  | `https://<project>.supabase.co/functions/v1/notify` |
| 2 | notif_match    | public.matches    | Insert  | `https://<project>.supabase.co/functions/v1/notify` |
| 3 | notif_message  | public.messages   | Insert  | `https://<project>.supabase.co/functions/v1/notify` |

Method **POST**, payload par défaut (table + record).

## Côté client

Quand l'utilisateur configure son webhook + toggles dans Paramètres, faire un upsert dans `user_notif_prefs` (le code actuel le stocke juste en `state.user.discordWebhook`, il faut ajouter le sync DB) :

```js
async function syncNotifPrefs() {
  const u = state.user || {};
  if (!u.discordId) return;
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return;
  const t = u.notifTypes || {};
  await supa.from('user_notif_prefs').upsert({
    user_id:        user.id,
    discord_webhook: u.discordWebhook || null,
    notif_like:    !!t.like,
    notif_match:   !!t.match,
    notif_message: !!t.message,
    display_name:  u.displayName || null,
    avatar_url:    u.avatarUrl || null,
    c1:            u.profileColor || '#9146FF',
  });
}
```

Et pour les vraies actions :

- **Swipe LIKE** : `await supa.from('likes').insert({ from_user: me, to_user: target })`
- **Envoi message** : `await supa.from('messages').insert({ match_id, sender: me, content })`

Le trigger SQL crée le match auto si réciproque, et les Database Webhooks s'occupent du reste.

## Tester en local

```bash
supabase functions serve notify
```

Puis simuler un payload :

```bash
curl -X POST http://localhost:54321/functions/v1/notify \
  -H "Content-Type: application/json" \
  -d '{"type":"INSERT","table":"likes","record":{"from_user":"...","to_user":"..."}}'
```

## Limites de cette approche

- **Spam protection** : Discord webhooks ont un rate-limit (~30/min). Si un user reçoit 100 likes d'un coup, certaines notifs seront perdues. Ajouter un debounce/aggregation côté Edge Function pour la prod sérieuse.
- **Pas de bouton "marquer comme lu"** : la notif Discord est juste un signal, l'app reste source de vérité.
- **Webhook URL leak** : l'URL est stockée en DB. RLS empêche les autres users de la lire. Mais si la DB leak, les webhooks sont exposés (l'attaquant peut spammer ces channels). Rotation manuelle si compromise.
