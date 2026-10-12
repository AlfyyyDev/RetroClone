import { createGame } from './sim/game.js';
import { COLORS, CITIES, MASCOTS } from './sim/data.js';
import { RollbackSession, LocalSession } from './net/rollback.js';
import { connect, makeCode, normalizeCode } from './net/lobby.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input.js';
import { UI, esc } from './ui.js';
import { unlockAudio, play, toggleMute, isMuted } from './audio.js';

const VERSION = 1;
const STEP = 1000 / 60;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Profile

function loadProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem('rg-profile') || 'null'); } catch {}
  if (!p || typeof p.name !== 'string') {
    const r = (a) => a[Math.floor(Math.random() * a.length)];
    const name = `${r(CITIES)} ${r(MASCOTS)}`.slice(0, 16);
    p = { name, abbr: name.split(' ').map((w) => w[0]).join('').slice(0, 2) + r(MASCOTS)[0], color: Math.floor(Math.random() * COLORS.length) };
  }
  return p;
}
const profile = loadProfile();
const saveProfile = () => { try { localStorage.setItem('rg-profile', JSON.stringify(profile)); } catch {} };

function sanitizeTeam(t, fallbackColor) {
  const name = String((t && t.name) || 'Team').replace(/[^\w .'&-]/g, '').trim().slice(0, 16) || 'Team';
  const abbr = String((t && t.abbr) || name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'TM';
  let color = Number.isInteger(t && t.color) && t.color >= 0 && t.color < COLORS.length ? t.color : fallbackColor;
  return { name, abbr, color };
}
const teamDef = (t) => ({ name: t.name, abbr: t.abbr, c1: COLORS[t.color][0], c2: COLORS[t.color][1] });

// ---------------------------------------------------------------------------
// DOM setup

const canvas = $('field');
const renderer = new Renderer(canvas);
let ui;
const input = new Input(canvas, renderer, { showTouch: (on) => ui.showTouch(on), stickAt: (...a) => ui.stickAt(...a) });
ui = new UI(input, { click: () => play('click') });

function show(screen) {
  for (const id of ['screen-menu', 'screen-lobby']) $(id).classList.toggle('hidden', id !== screen);
}

function renderTeamEditor() {
  $('in-name').value = profile.name;
  $('in-abbr').value = profile.abbr;
  const sw = $('swatches');
  sw.innerHTML = COLORS.map(([c1, c2], i) => `<button class="swatch" role="radio" aria-label="Color ${i + 1}" aria-checked="${i === profile.color}" data-c="${i}" style="background:${c1};--c2:${c2}"></button>`).join('');
}
$('swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-c]');
  if (!b) return;
  profile.color = +b.dataset.c; saveProfile(); renderTeamEditor();
});
$('in-name').addEventListener('input', (e) => { profile.name = e.target.value.slice(0, 16); saveProfile(); });
$('in-abbr').addEventListener('input', (e) => { profile.abbr = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); e.target.value = profile.abbr; saveProfile(); });
$('in-code').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
$('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
renderTeamEditor();
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });
window.addEventListener('resize', () => renderer.resize());
$('btn-mute').textContent = isMuted() ? 'MUTED' : 'SND';
$('btn-mute').addEventListener('click', () => { $('btn-mute').textContent = toggleMute() ? 'MUTED' : 'SND'; });

// ---------------------------------------------------------------------------
// Lobby

let lobby = null; // { conn, transport, isHost, code, me, them }

function setStatus(t) { $('lobby-status').textContent = t; }
function renderLobbyTeams() {
  const el = $('lobby-teams');
  const teams = [lobby.me, lobby.them].filter(Boolean);
  el.innerHTML = teams.map((t, i) => `<div class="tcard"><span class="tdot" style="background:${COLORS[t.color][0]}"></span>${esc(t.name)} (${esc(t.abbr)})${i === 0 ? ' · YOU' : ''}</div>`).join('');
}

function leaveLobby() {
  if (lobby) {
    if (lobby.conn) lobby.conn.cancel();
    if (lobby.transport) lobby.transport.close();
  }
  lobby = null;
}

function openLobby(isHost, code) {
  leaveLobby();
  const me = sanitizeTeam(profile, profile.color);
  lobby = { isHost, code, me, them: null, transport: null };
  show('screen-lobby');
  $('lobby-title').textContent = isHost ? 'YOUR LOBBY' : 'JOINING LOBBY';
  $('lobby-code').textContent = code;
  $('lobby-share').classList.toggle('hidden', !isHost);
  $('btn-start').classList.add('hidden');
  renderLobbyTeams();
  const myLobby = lobby;
  if (!window.isSecureContext || !crypto.subtle) {
    setStatus('Online play needs HTTPS (or localhost). Open this page via an https:// URL.');
    return;
  }
  lobby.conn = connect(code, isHost, (s) => { if (lobby === myLobby) setStatus(s); });
  lobby.conn.promise.then((t) => {
    if (lobby !== myLobby) { t.close(); return; }
    lobby.transport = t;
    setStatus(`Connected (${t.via}). Exchanging teams...`);
    t.onRel = (msg) => onLobbyMsg(myLobby, msg);
    t.onClose = () => {
      if (game && game.transport === t) endGame('OPPONENT DISCONNECTED');
      else if (lobby === myLobby) { setStatus('Opponent left. Waiting...'); lobby.them = null; renderLobbyTeams(); $('btn-start').classList.add('hidden'); reconnect(myLobby); }
    };
    t.sendRel({ t: 'hello', v: VERSION, team: me });
  }).catch((e) => { if (lobby === myLobby) setStatus('Connection failed: ' + e.message + '. Try again.'); });
}

function reconnect(old) {
  if (lobby !== old) return;
  openLobby(old.isHost, old.code);
}

function onLobbyMsg(l, msg) {
  if (lobby !== l || !msg || typeof msg !== 'object') return;
  if (msg.t === 'hello') {
    if (msg.v !== VERSION) { setStatus('Version mismatch: both players need to reload the page.'); return; }
    l.them = sanitizeTeam(msg.team, (l.me.color + 1) % COLORS.length);
    renderLobbyTeams();
    if (l.isHost) {
      setStatus('Opponent connected! Start when ready.');
      $('btn-start').classList.remove('hidden');
    } else setStatus('Connected! Waiting for the host to start...');
  } else if (msg.t === 'start' && !l.isHost) {
    const teams = msg.teams.map((t, i) => sanitizeTeam(t, i));
    startGame({ seed: msg.seed >>> 0, qlen: [120, 180, 240].includes(msg.qlen) ? msg.qlen : 180, teams, local: 1, transport: l.transport });
  }
}

$('btn-create').addEventListener('click', () => openLobby(true, makeCode()));
$('btn-join').addEventListener('click', () => {
  const code = normalizeCode($('in-code').value);
  if (code.length !== 6) { $('in-code').focus(); return; }
  openLobby(false, code);
});
$('btn-cancel').addEventListener('click', () => { leaveLobby(); show('screen-menu'); history.replaceState(null, '', location.pathname); });
$('btn-copy-code').addEventListener('click', () => copy(lobby && lobby.code, $('btn-copy-code')));
$('btn-copy-link').addEventListener('click', () => copy(lobby && `${location.origin}${location.pathname}#join=${lobby.code}`, $('btn-copy-link')));
$('btn-start').addEventListener('click', () => {
  if (!lobby || !lobby.them || !lobby.transport) return;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const qlen = +$('in-qlen').value;
  const host = lobby.me, guest = { ...lobby.them };
  if (guest.color === host.color) guest.color = (host.color + 1) % COLORS.length;
  if (guest.abbr === host.abbr) guest.abbr = (guest.abbr.slice(0, 2) + '2');
  const teams = [host, guest];
  lobby.transport.sendRel({ t: 'start', seed, qlen, teams });
  startGame({ seed, qlen, teams, local: 0, transport: lobby.transport });
});
$('btn-cpu').addEventListener('click', () => {
  leaveLobby();
  const me = sanitizeTeam(profile, profile.color);
  const cpuColor = (me.color + 3) % COLORS.length;
  const cpu = { name: 'CPU Robots', abbr: me.abbr === 'CPU' ? 'BOT' : 'CPU', color: cpuColor };
  startGame({ seed: crypto.getRandomValues(new Uint32Array(1))[0], qlen: +$('in-qlen').value, teams: [me, cpu], local: 0, cpu: true });
});

function copy(text, btn) {
  if (!text) return;
  const done = () => { const o = btn.textContent; btn.textContent = 'COPIED!'; setTimeout(() => (btn.textContent = o), 1200); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt('Copy:', text));
  else prompt('Copy:', text);
}

// ---------------------------------------------------------------------------
// Game

let game = null; // { sess, local, transport, raf }

function startGame({ seed, qlen, teams, local, transport, cpu }) {
  if (game) stopGame();
  const st = createGame({ seed, qlen, cpu: cpu ? [false, true] : [false, false], teams: teams.map(teamDef) });
  const sess = transport ? new RollbackSession({ state: st, localTeam: local, transport, inputDelay: 2 }) : new LocalSession({ state: st, localTeam: local });
  game = { sess, local, transport, acc: 0, last: performance.now(), raf: 0 };
  show(null);
  document.getElementById('rotate').classList.add('ingame');
  input.enabled = true;
  ui.showTouch(input.isTouch);
  if (transport) transport.onRel = (msg) => { if (msg && msg.t === 'bye') endGame('OPPONENT LEFT THE GAME'); };
  game.raf = requestAnimationFrame(loop);
}

function loop(now) {
  if (!game) return;
  const g = game;
  let dt = now - g.last;
  g.last = now;
  if (dt > 250) dt = 250;
  g.acc += dt;
  let n = 0;
  input.setContext(g.sess.state, g.local);
  while (g.acc >= STEP && n < 6) {
    g.sess.tick(() => input.sample());
    g.acc -= STEP;
    n++;
  }
  if (n >= 6) g.acc = 0;
  for (const e of g.sess.takeEvents()) play(e.k);
  const st = g.sess.state;
  renderer.draw(st, { local: g.local, aim: input.aim, showLabels: !input.isTouch });
  ui.update(st, g.local, g.transport ? g.sess : null);
  if (g.transport && g.sess.silenceMs > 12000) { endGame('CONNECTION LOST'); return; }
  g.raf = requestAnimationFrame(loop);
}

function stopGame() {
  if (!game) return;
  cancelAnimationFrame(game.raf);
  game.sess.destroy();
  game = null;
  input.enabled = false;
  ui.hideAll();
  document.getElementById('rotate').classList.remove('ingame');
  requestAnimationFrame(idle);
}

function endGame(reason) {
  const t = game && game.transport;
  stopGame();
  if (t) t.close();
  lobby = null;
  show('screen-menu');
  if (reason) setTimeout(() => alert(reason), 30);
}

$('btn-leave').addEventListener('click', () => {
  if (!game) return;
  if (!confirm('Leave the game?')) return;
  if (game.transport) game.transport.sendRel({ t: 'bye' });
  endGame('');
});

// Debug handle for automated browser tests.
window.__rg = { get st() { return game && game.sess.state; }, get sess() { return game && game.sess; } };

// Idle field behind the menu.
function idle() {
  if (game) return;
  renderer.draw({ ph: 'DRAFT', teams: [teamDef(sanitizeTeam(profile, 0)), teamDef({ name: 'Rivals', abbr: 'RIV', color: (profile.color + 3) % COLORS.length })], pl: null, g: null, kick: null }, { local: 0 });
  requestAnimationFrame(idle);
}
requestAnimationFrame(idle);

// Invite links: #join=CODE
const m = location.hash.match(/join=([A-Za-z0-9]{6})/);
if (m) { $('in-code').value = normalizeCode(m[1]); openLobby(false, normalizeCode(m[1])); }
