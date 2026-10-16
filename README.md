# Retro Gridiron

A browser-based, peer-to-peer retro pixel football game, built in the spirit of Retro Bowl.
There are no accounts and no game server. One player creates a lobby and shares a
6-character code or an invite link. The other player joins, and the two browsers talk
directly over WebRTC.

## Features

- **Snake draft.** Both players draft 11 players each (QB, RB, 2 WR, TE, O-line, D-line, LB, CB, S, K)
  from a shared, randomly generated pool with star ratings and traits.
- **"Pick 6" play cards, roguelite style.** Before every snap each side is dealt 6 cards.
  - Offense always gets one each of **Run / Pass / Play Action / Option**, plus 2 wildcards.
  - Defense always gets one each of **Run Stop / Blitz / Zone / Man**, plus 2 wildcards.
  - Rare and epic cards show up occasionally, such as Hail Mary, Flea Flicker and Lockdown. Used cards cool down for 2 plays.
  - Every category beats exactly one category and loses to exactly one. The edge is revealed after the play.

    |            | Run Stop | Blitz | Zone | Man |
    |------------|:--------:|:-----:|:----:|:---:|
    | Run        | D        | =     | O    | =   |
    | Pass       | =        | =     | D    | O   |
    | Play Action| O        | D     | =    | =   |
    | Option     | =        | O     | =    | D   |

- **Real control for both players.** The offense plays QB, ball carrier and receivers. The defense
  controls one defender live (shown by the yellow arrow) and can switch to whoever is closest to the ball.
- **Option football.** On zone read and RPO plays, the backside end is left unblocked. Read him correctly
  and he is out of the play.
- **Special teams.** Kickoffs and punts with live returns, field goals, extra points and 2-point tries,
  all using a two-press power/accuracy meter.
- 4 quarters with a running game clock. After a tackle in bounds, up to 25s of runoff ticks away in real time during the huddle, so calling your play fast saves clock.
- **Timeouts:** 2 per team per half (1 in overtime), called during play selection with **T** or the button. A timeout stops the running clock.
- A halftime team perk pick (roguelite boons), sudden-death overtime and rematches.
- **Feel.** Screen shake and dust on hits, touchdown confetti, ball trails, and callouts (JUKE!, SACK!, PICKED!, SWATTED!). Both players can tap to skip the result screen. Phones vibrate on big hits.
- **Play anywhere.** Keyboard, mouse, touch (virtual stick plus A/B buttons) and gamepad. Phones work in landscape.
- Synthesized chiptune sound effects. There are no asset files except the pixel font.

## Run locally

```bash
npm install
npm run dev      # http://localhost:8080 with rebuild on change
```

To play online locally, open two browser windows (or two machines) on `http://localhost:8080`.
In one, click **CREATE LOBBY**. In the other, enter the code and click **JOIN**.

## Deploy (static hosting)

```bash
npm run build    # outputs dist/ (index.html, game.js, styles.css, fonts/)
```

Upload `dist/` to any static host, such as GitHub Pages, Netlify, Cloudflare Pages, itch.io or S3.
**It must be served over HTTPS.** The signaling layer uses WebCrypto, which browsers only allow in
secure contexts (HTTPS or `localhost`). A plain `http://192.168.x.x` LAN address will not work for
online play.

Invite links look like `https://your.site/#join=K7QF2M`.

## How the networking works

1. **Signaling (one time, a few KB).** Both browsers join a room named after the lobby code on
   public **Nostr relays** and **WebTorrent trackers** at the same time, using
   [Trystero](https://github.com/dmotz/trystero). The handshake is encrypted with the lobby code.
   Whichever network connects first wins, and the host tells the guest which one to use.
2. **Direct WebRTC.** All gameplay traffic goes browser-to-browser over a negotiated
   **unreliable, unordered** data channel, so packets are never held up waiting for a lost one.
   A reliable channel is used only for lobby messages.
3. **Rollback netcode (GGPO style).** The whole game is one deterministic state machine at a fixed
   60 Hz: draft, play calls, live plays, kicks and the clock. Only inputs are sent, 8 bytes per frame,
   with up to 40 frames of redundancy per packet. The opponent's input is predicted. When a real
   input disagrees with the prediction, the sim rewinds and replays. There is a 2-frame local input
   delay, a 14-frame prediction window, and time sync so neither peer drifts ahead. Both peers
   exchange state hashes every second.
4. **Desync recovery.** If the hashes ever disagree, the host is authoritative. It sends its newest fully confirmed state snapshot over the reliable channel. The guest loads it and replays the few frames since then with the inputs it already has, so the game continues without a restart. An epoch counter in the hash packets discards stale comparisons. The top-left readout shows `RESYNC n` if this has happened.

Determinism comes from the simulation code under `src/sim`. It uses only `+ - * /`, `sqrt` and
integer math (no trig and no `Math.random`) and a seeded RNG stored in the state, so Chrome,
Firefox and Safari compute bit-identical results.

### Strict NATs / TURN

Most home connections connect directly. Some carrier-grade or corporate NATs need a TURN relay.
If you have one, add this before the game script in `index.html`:

```html
<script>window.RG_TURN = [{ urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }];</script>
```

## Controls

| Action | Keyboard / mouse | Touch | Gamepad |
|---|---|---|---|
| Move | WASD / arrows | left-side stick | left stick / d-pad |
| Throw | click or drag on the field, then release | drag on the field, then release | quick throw buttons |
| Quick throw to receiver 1-4 (auto lead) | 1 2 3 4 | tap where you want the ball | X / Y / LB / RB |
| Juke (ball carrier) / dive or rip (defender) / kick meter | Space | A | A |
| Take over the receiver while a pass is in the air (otherwise he runs his route) | Space | A | A |
| Give / pitch on options; switch defender | E or Shift | B | B |
| Pick a card / draft / perk | click, or 1-6 | tap | |
| Punt / field goal on 4th down | P / F | tap | |
| Timeout (during play selection) | T | tap TIMEOUT | |
| Skip the result screen (both players) | Space / Enter / click | tap | A |

## Development

```bash
npm test                         # determinism, full CPU games, rollback sync under lag/loss, desync recovery
node test/balance.mjs 40         # matchup grid + per-card stats (CPU vs CPU)
node test/trace.mjs iz c3        # frame-by-frame trace of one play (offense id, defense id)
node test/returns.mjs 300        # kickoff / punt return averages
node build.mjs && node test/browser.mjs shots         # headless Chrome playthrough with screenshots
node build.mjs && node test/p2p.mjs shots-p2p 60      # two browsers over the REAL relays
LAG="lag=60&jitter=30&loss=8" node test/p2p.mjs shots-p2p 60
CORRUPT=1 node test/p2p.mjs shots-p2p 40    # inject a desync on the guest and watch it recover
```

To simulate a bad network in a normal browser, add `?lag=80&jitter=30&loss=5` to the URL.
This affects outgoing packets on that side only.

### Layout

```
src/sim/core.js      deterministic RNG, math, clone, state hash
src/sim/data.js      names, positions, traits, perks, colors, draft pool generation
src/sim/plays.js     formations, routes, offense/defense cards, matchup matrix
src/sim/live.js      live play engine: AI, blocking, tackling, passing, options, returns
src/sim/game.js      game state machine: draft, play calls, kicks, clock, scoring, OT
src/net/rollback.js  rollback session + local (vs CPU) session
src/net/lobby.js     Trystero signaling (Nostr + torrent) and WebRTC channels
src/render/*         canvas renderer, procedural pixel sprites, 3x5 pixel font
src/ui.js            DOM overlays (draft board, play cards, kick meter, banners)
src/input.js         keyboard / mouse / touch / gamepad -> 8-byte input
src/audio.js         WebAudio chiptune SFX
```

Note: the defense's play call travels in the input stream, so a determined player could read it
with devtools. That is the usual trade-off for serverless lockstep and rollback games.
