/* Optional exploration, presentation and effects around the original game. */
window.createBorgenAdventure = function (game) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const { rooms, byId } = game;
  const roomIds = new Set(rooms.map((room) => room.id));
  const totalGlimts = rooms.length * 3;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefs = { calm: reducedMotion.matches, music: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem('borgenJulPreferences') || '{}')); } catch (_) {}
  let particles = [], dashLeft = 0, cooldown = 0, guide = false, guideTarget = null;
  let clock = 0, musicAt = 0, lastRoom = '', knownBadges = new Set(), rewardTimer = 0, arrivalTimer = 0;
  let score = -1, lastCharge = -1, finale = null, fireworkAt = 0, celebrationTime = 0;
  let rewardQueue = [], activeReward = false, winWasVisible = false;
  const positions = rooms.map((room, i) => [
    { id: room.id + ':0', x: 150 + i * 37 % 160, y: 330 + i * 23 % 100 },
    { id: room.id + ':1', x: 580 + i * 41 % 145, y: 290 + i * 19 % 135 },
    { id: room.id + ':2', x: 330 + i * 31 % 160, y: 470 + i * 7 % 36 }
  ]);
  const glimtIds = new Set(positions.flat().map((p) => p.id));
  const preferencesSave = () => {
    try { localStorage.setItem('borgenJulPreferences', JSON.stringify(prefs)); } catch (_) {}
  };
  const isVisible = (id) => !$('#' + id).classList.contains('hidden');
  const starsIn = (id) => (game.state().glimts || []).filter((key) => key.startsWith(id + ':')).length;
  const visitedCount = () => Object.keys(game.state().visited).filter((id) => roomIds.has(id) && game.state().visited[id]).length;
  const badges = [
    { id: 'first', title: 'Det første juleglimt', detail: 'Magien er vågnet.', test: () => score >= 1 },
    { id: 'collector', title: 'Stjernesamler', detail: '14 juleglimt fundet på Borgen.', test: () => score >= 14 },
    { id: 'explorer', title: 'Borgens opdagelsesrejsende', detail: 'Alle 14 steder er besøgt.', test: () => visitedCount() === rooms.length },
    { id: 'friends', title: 'Ingen bliver glemt', detail: 'Alle syv hemmelige beboere følger med.', test: () => game.countResidents() === 7 },
    { id: 'all', title: 'Mester i julemagi', detail: 'Alle 42 juleglimt er fundet!', test: () => score === totalGlimts },
    { id: 'hero', title: 'Borgens julehelt', detail: 'Du fik hele Borgen med.', test: () => game.state().won }
  ];

  function normalize() {
    const state = game.state();
    state.glimts = Array.isArray(state.glimts) ? [...new Set(state.glimts.filter((key) => glimtIds.has(key)))] : [];
  }

  function reward(title, detail, icon = '✦') {
    rewardQueue.push({ title, detail, icon });
  }

  function flushReward() {
    if (activeReward || !rewardQueue.length || !game.playing()) return;
    const item = rewardQueue.shift();
    $('#rewardTitle').textContent = item.title;
    $('#rewardDetail').textContent = item.detail;
    $('#rewardIcon').textContent = item.icon;
    $('#reward').classList.add('show');
    activeReward = true;
    clearTimeout(rewardTimer);
    rewardTimer = setTimeout(() => {
      $('#reward').classList.remove('show');
      activeReward = false;
    }, 3300);
  }

  function sync(announce = true) {
    normalize();
    score = game.state().glimts.length;
    $('#glimtCount').textContent = score + ' / ' + totalGlimts;
    $('#quickBook').textContent = 'Eventyrbog · ' + score + ' ✦';
    badges.forEach((badge) => {
      if (!badge.test() || knownBadges.has(badge.id)) return;
      knownBadges.add(badge.id);
      if (announce) reward(badge.title, badge.detail);
    });
    if (lastRoom !== game.state().room) {
      lastRoom = game.state().room;
      particles = [];
      dashLeft = 0;
      guideTarget = null;
      $('#arrivalName').textContent = byId[lastRoom].name;
      $('#arrivalChapter').textContent = 'Christiansborg · ' + visitedCount() + ' af 14 steder';
      $('#roomArrival').classList.add('show');
      clearTimeout(arrivalTimer);
      arrivalTimer = setTimeout(() => $('#roomArrival').classList.remove('show'), 2300);
    }
    if (isVisible('journal')) renderJournal();
  }

  function resetSession() {
    particles = []; dashLeft = 0; cooldown = 0; finale = null; lastRoom = '';
    rewardQueue = []; activeReward = false; knownBadges = new Set(); celebrationTime = 0;
    clearTimeout(rewardTimer); clearTimeout(arrivalTimer);
    $('#reward').classList.remove('show');
    sync(false);
  }

  function burst(x, y, amount = 24, color = '#ffdf8b') {
    if (prefs.calm) return;
    const count = Math.round(amount * game.quality());
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 28 + Math.random() * 115;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 22, life: 1, color, size: 1 + Math.random() * 2.4 });
    }
    if (particles.length > 180) particles.splice(0, particles.length - 180);
  }

  function dash() {
    if (!game.playing() || cooldown > 0) return;
    dashLeft = .32; cooldown = 2.8;
    const state = game.state();
    burst(state.x, state.y + 20, 12, '#a2f3e5');
    game.tone(740, .13, .055);
  }

  function guidePoint() {
    const state = game.state(), room = byId[state.room];
    const destination = (id) => {
      const item = byId[id];
      if (item.task && !state.tasks[id]) return game.taskPos(item);
      if (item.resident && !state.residents[id]) return { x: game.residentPos[id][0], y: game.residentPos[id][1] };
      if (id === 'taarn' && game.allReady() && !state.won) return game.taskPos(item);
      return null;
    };
    if (destination(room.id)) return destination(room.id);
    const queue = [{ id: room.id, first: null }], seen = new Set([room.id]);
    while (queue.length) {
      const current = queue.shift();
      if (current.first && destination(current.id)) {
        return { N: { x: 430, y: 48 }, S: { x: 430, y: 555 }, E: { x: 818, y: 310 }, W: { x: 42, y: 310 } }[current.first];
      }
      Object.entries(byId[current.id].exits).forEach(([direction, id]) => {
        if (!seen.has(id)) { seen.add(id); queue.push({ id, first: current.first || direction }); }
      });
    }
    return positions[rooms.findIndex((r) => r.id === room.id)].find((point) => !state.glimts.includes(point.id)) || null;
  }

  function toggleGuide() {
    if (!game.playing()) return;
    guide = !guide;
    $('#guideBtn').setAttribute('aria-pressed', String(guide));
    $('#quickGuide').setAttribute('aria-pressed', String(guide));
    game.toast(guide ? 'Følg de gyldne glimt til din næste opgave eller skjulte ven.' : 'Du finder selv vej igen.');
  }

  function renderJournal() {
    const state = game.state();
    $('#journalSummary').innerHTML = '<span>' + game.countTasks() + ' / 13 forberedelser</span><span>' + game.countResidents() + ' / 7 venner</span><span>' + score + ' / ' + totalGlimts + ' juleglimt</span>';
    const list = $('#journalRooms'); list.replaceChildren();
    rooms.forEach((room) => {
      const button = document.createElement('button');
      const visited = !!state.visited[room.id];
      button.className = 'journalRoom' + (state.room === room.id ? ' here' : '');
      button.disabled = !visited;
      button.setAttribute('aria-label', room.name + (visited ? '. Rejs hertil.' : '. Ikke besøgt endnu.'));
      const task = room.task ? (state.tasks[room.id] ? '✓ Klar til jul' : 'Forberedelse mangler') : (state.won ? '✓ Julen er reddet' : 'Juleklokken venter');
      const resident = room.resident && visited ? '<small>' + (state.residents[room.id] ? '✓ ' + room.residentName + ' følger med' : 'En beboer gemmer sig') + '</small>' : '';
      button.innerHTML = '<span class="roomIcon">' + room.icon + '</span><span><strong>' + room.name + '</strong><small>' + (visited ? task : 'Find vejen hertil') + '</small>' + resident + '<small class="roomGlimts" aria-label="' + starsIn(room.id) + ' af 3 juleglimt">' + '✦'.repeat(starsIn(room.id)) + '·'.repeat(3 - starsIn(room.id)) + '</small></span>';
      button.onclick = () => {
        game.travel(room.id);
        game.hideOverlays();
        sync();
        game.toast(room.name);
      };
      list.appendChild(button);
    });
    const earned = $('#badges'); earned.replaceChildren();
    badges.forEach((badge) => {
      const element = document.createElement('span');
      element.className = 'badge' + (badge.test() ? ' earned' : '');
      element.textContent = (badge.test() ? '✦ ' : '◇ ') + badge.title;
      element.title = badge.detail;
      earned.appendChild(element);
    });
  }

  function journal() {
    if (!game.playing()) return;
    renderJournal();
    game.showOverlay('journal');
    $('#journalClose').focus({ preventScroll: true });
  }

  function startHunt(room, body) {
    let found = 0;
    const counter = document.createElement('div'); counter.className = 'huntCount';
    const field = document.createElement('div'); field.className = 'tapestryHunt';
    field.setAttribute('role', 'group'); field.setAttribute('aria-label', 'Find seks gyldne stjerner i Riddersalen');
    const spots = [[14,33],[35,22],[61,39],[86,27],[23,70],[73,78]];
    const update = () => { counter.textContent = found + ' / 6 stjerner fundet'; };
    counter.setAttribute('role', 'status');
    spots.forEach(([x, y], i) => {
      const star = document.createElement('button');
      star.className = 'tapestryStar'; star.textContent = '✦';
      star.style.left = x + '%'; star.style.top = y + '%'; star.style.animationDelay = (-i * .47) + 's';
      star.setAttribute('aria-label', 'Julestjerne ' + (i + 1));
      star.onclick = () => {
        if (star.disabled) return;
        star.disabled = true; star.classList.add('found'); star.textContent = '✓';
        found++; update(); game.chime(523.25 * Math.pow(2, i / 12));
        if (found === spots.length) game.completeMission(room);
      };
      field.appendChild(star);
    });
    const hint = document.createElement('p'); hint.className = 'hint';
    hint.textContent = 'Kig i hele salen. Klik på de små stjerner, når du ser dem glimte.';
    body.append(counter, field, hint); update();
  }

  function startFinale() {
    if (game.state().won) { game.win(); return; }
    if (!game.allReady()) return;
    finale = { notes: 0, phase: 0, wait: .6, ready: false };
    $('#finaleNotes').textContent = '○ ○ ○';
    $('#finaleHint').textContent = prefs.calm ? 'Tre slag samler hele Borgen. Ring med klokken.' : 'Tryk, når den bevægelige ring rammer den gyldne cirkel.';
    $('#ringBellBtn').disabled = false;
    $('#ringBellBtn').textContent = 'Ring med klokken';
    game.showOverlay('finale');
    $('#ringBellBtn').focus({ preventScroll: true });
  }

  function ringBell() {
    if (!finale || !isVisible('finale') || finale.notes >= 3) return;
    if (finale.wait > 0) return;
    if (!prefs.calm && !finale.ready) {
      $('#finaleHint').textContent = 'Næsten! Vent, til ringene mødes. Du mister ikke dine slag.';
      game.tone(240, .12, .06); return;
    }
    finale.notes++;
    finale.wait = 1.05; finale.phase = 0;
    game.bell([587.33,739.99,880][finale.notes - 1], 2, .15);
    $('#finaleNotes').textContent = '● '.repeat(finale.notes) + '○ '.repeat(3 - finale.notes);
    $('#bellRhythm').classList.remove('hit');
    void $('#bellRhythm').offsetWidth;
    $('#bellRhythm').classList.add('hit');
    $('#finaleHint').textContent = ['Et slag for de folkevalgte.', 'Et slag for alle dem, der får huset til at fungere.', 'Og et slag for dem, der bor bag panelerne.'][finale.notes - 1];
    if (finale.notes === 3) { $('#ringBellBtn').disabled = true; $('#ringBellBtn').textContent = 'Hele Borgen er med'; }
  }

  function tickFinale(dt) {
    if (!finale || !isVisible('finale')) return;
    if (finale.wait > 0) {
      finale.wait = Math.max(0, finale.wait - dt);
      if (!finale.wait && finale.notes === 3) { finale = null; game.win(); return; }
    } else finale.phase = (finale.phase + dt / 2.6) % 1;
    // Radius .60 is the center of the visible target band at every screen size.
    const radius = 1 - finale.phase * .8;
    finale.ready = prefs.calm || (radius >= .52 && radius <= .68);
    $('#bellRhythm').style.setProperty('--ring', prefs.calm ? '.60' : radius.toFixed(3));
    $('#bellRhythm').classList.toggle('ready', finale.ready && !finale.wait);
  }

  function onWin() {
    celebrationTime = 0;
    const title = score === totalGlimts ? 'Mester i julemagi' : 'Borgens julehelt';
    $('#winExtraTitle').textContent = title + ' · ' + score + ' / ' + totalGlimts + ' juleglimt';
    $('#winExtraHint').textContent = score === totalGlimts ? 'Hver eneste lille stjerne er kommet hjem.' : 'Bliv på Borgen og find resten af de frivillige juleglimt.';
    sync();
  }

  const introCanvas = $('#startSnow'), introCtx = introCanvas.getContext('2d');
  const fireworksCanvas = $('#fireworks'), fireCtx = fireworksCanvas.getContext('2d');
  let fireworks = [];
  function fit(canvas) {
    // These decorative layers deliberately use a modest resolution on large displays.
    const width = Math.max(1, Math.round(canvas.clientWidth || 860));
    const height = Math.max(1, Math.round(canvas.clientHeight || 620));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }

  function drawIntro() {
    fit(introCanvas);
    const g = introCtx, w = introCanvas.width, h = introCanvas.height;
    g.clearRect(0, 0, w, h);
    if (prefs.calm) return;
    g.fillStyle = '#fff5d9';
    for (let i = 0; i < 60; i++) {
      const depth = 1 + i % 3;
      const x = ((i * 191 + clock * 7 * depth) % (w + 30)) - 15;
      const y = ((i * 79 + clock * 14 * depth) % (h + 30)) - 15;
      g.globalAlpha = .10 + depth * .12;
      g.beginPath(); g.arc(x + Math.sin(clock * .4 + i) * 12, y, .45 + depth * .5, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }

  function drawFireworks(dt) {
    fit(fireworksCanvas);
    const g = fireCtx, w = fireworksCanvas.width, h = fireworksCanvas.height;
    g.clearRect(0, 0, w, h);
    if (prefs.calm || celebrationTime > 22) { fireworks = []; return; }
    celebrationTime += dt; fireworkAt -= dt;
    if (fireworkAt <= 0) {
      fireworkAt = .9 + Math.random() * .55;
      const x = w * (.12 + Math.random() * .76), y = h * (.08 + Math.random() * .4);
      const color = ['#ffe29b', '#92e8d7', '#eb9a9a', '#d5c6ff'][Math.floor(Math.random() * 4)];
      for (let i = 0; i < 45; i++) {
        const angle = Math.PI * 2 * i / 45, speed = 45 + Math.random() * 100;
        fireworks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.8, color });
      }
    }
    fireworks = fireworks.filter((p) => p.life > 0);
    g.lineWidth = 2;
    fireworks.forEach((p) => {
      p.life -= dt; p.vy += dt * 32;
      const oldX = p.x, oldY = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = Math.max(0, Math.min(1, p.life)); g.strokeStyle = p.color;
      g.beginPath(); g.moveTo(oldX - p.vx * .04, oldY - p.vy * .04); g.lineTo(p.x, p.y); g.stroke();
    });
    g.globalAlpha = 1;
  }

  function ambientMusic() {
    if (!prefs.music || !game.sound() || !game.playing() || document.hidden || clock < musicAt) return;
    musicAt = clock + 4.8;
    const melodies = [[293.66,369.99,440,587.33],[329.63,392,493.88,659.25],[293.66,440,587.33,739.99]];
    const melody = melodies[Math.floor(clock / 4.8) % melodies.length];
    melody.forEach((freq, i) => game.bell(freq, 2.8, .014, i * .65));
  }

  function tick(dt) {
    clock += dt;
    if (isVisible('start')) drawIntro();
    if (isVisible('win')) {
      if (!winWasVisible) { celebrationTime = 0; fireworkAt = 0; fireworks = []; }
      drawFireworks(dt);
    }
    winWasVisible = isVisible('win');
    tickFinale(dt);
    if (!game.playing()) return;
    cooldown = Math.max(0, cooldown - dt); dashLeft = Math.max(0, dashLeft - dt);
    const charge = Math.round((1 - cooldown / 2.8) * 100);
    if (charge !== lastCharge) {
      lastCharge = charge;
      $('#dashBtn').style.setProperty('--charge', charge + '%');
      $('#dashLabel').textContent = cooldown > 0 ? 'Lader magi · ' + Math.ceil(cooldown) + ' s' : 'Nissedash';
      $('#quickDash').textContent = cooldown > 0 ? 'Dash · ' + Math.ceil(cooldown) + ' s' : 'Nissedash';
      $('#dashBtn').setAttribute('aria-disabled', String(cooldown > 0));
      $('#quickDash').setAttribute('aria-disabled', String(cooldown > 0));
    }
    const state = game.state();
    const points = positions[rooms.findIndex((room) => room.id === state.room)];
    let changed = false;
    points.forEach((point) => {
      if (!state.glimts.includes(point.id) && Math.hypot(state.x - point.x, state.y - point.y) < 35) {
        state.glimts.push(point.id); changed = true;
        burst(point.x, point.y, 28); game.chime(660 + state.glimts.length % 7 * 66);
      }
    });
    if (changed) { game.save(); sync(); }
    if (dashLeft > 0 && !prefs.calm && (game.keys().up || game.keys().down || game.keys().left || game.keys().right)) {
      particles.push({ x: state.x, y: state.y + 24, vx: (Math.random() - .5) * 18, vy: 10, life: .6, color: '#aff9e4', size: 2.5 });
    }
    particles.forEach((p) => { p.life -= dt * 1.2; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 30; });
    particles = particles.filter((p) => p.life > 0);
    guideTarget = guide ? guidePoint() : null;
    flushReward(); ambientMusic();
  }

  function drawWorld(ctx) {
    const state = game.state(), index = rooms.findIndex((room) => room.id === state.room);
    ctx.save();
    // Pools of warm light and slow dust give each finished room a warmer tone.
    if (state.tasks[state.room] && game.quality() > .5) {
      const light = ctx.createRadialGradient(430, 190, 10, 430, 230, 330);
      light.addColorStop(0, '#ffdd8912'); light.addColorStop(1, '#ffdd8900');
      ctx.fillStyle = light; ctx.fillRect(0, 0, 860, 620);
    }
    positions[index].forEach((point, i) => {
      if (state.glimts.includes(point.id)) return;
      const y = point.y + (prefs.calm ? 0 : Math.sin(clock * 2.2 + i * 2) * 5);
      const glow = ctx.createRadialGradient(point.x, y, 1, point.x, y, 29);
      glow.addColorStop(0, '#fff2b857'); glow.addColorStop(1, '#f9d77600');
      ctx.fillStyle = glow; ctx.fillRect(point.x - 29, y - 29, 58, 58);
      ctx.font = '26px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff1b1'; ctx.fillText('✦', point.x, y);
      ctx.strokeStyle = '#ebcf782a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(point.x, point.y + 20, 13, 4, 0, 0, Math.PI * 2); ctx.stroke();
    });
    if (guideTarget) {
      const dx = guideTarget.x - state.x, dy = guideTarget.y - state.y, distance = Math.hypot(dx, dy);
      const steps = Math.min(22, Math.floor(distance / 18));
      for (let i = 1; i <= steps; i++) {
        const fraction = i / (steps + 1);
        ctx.globalAlpha = prefs.calm ? .5 : .25 + .5 * (1 + Math.sin(clock * 4 - i * .55)) / 2;
        ctx.fillStyle = '#ffe1a1'; ctx.beginPath();
        ctx.arc(state.x + dx * fraction, state.y + 22 + dy * fraction, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawEffects(ctx) {
    ctx.save();
    particles.forEach((p) => {
      ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  function updatePreferences() {
    document.body.classList.toggle('calm', !!prefs.calm);
    $('#motionBtn').textContent = prefs.calm ? 'Rolige effekter: til' : 'Rolige effekter: fra';
    $('#motionBtn').setAttribute('aria-pressed', String(!!prefs.calm));
    $('#musicBtn').textContent = prefs.music ? 'Musik: til' : 'Musik: fra';
    $('#musicBtn').setAttribute('aria-pressed', String(!!prefs.music));
    preferencesSave();
  }

  $('#dashBtn').onclick = dash; $('#quickDash').onclick = dash;
  $('#journalBtn').onclick = journal; $('#quickBook').onclick = journal;
  $('#guideBtn').onclick = toggleGuide; $('#quickGuide').onclick = toggleGuide;
  $('#journalClose').onclick = () => { game.hideOverlays(); game.canvas.focus({ preventScroll: true }); };
  $('#ringBellBtn').onclick = ringBell;
  $('#finaleClose').onclick = () => { finale = null; game.hideOverlays(); };
  $('#motionBtn').onclick = () => { prefs.calm = !prefs.calm; updatePreferences(); };
  $('#musicBtn').onclick = () => { prefs.music = !prefs.music; musicAt = 0; updatePreferences(); };
  $('#quickPause').onclick = () => { if (game.playing()) game.showOverlay('info'); };
  const effectsBtn = document.createElement('button');
  effectsBtn.className = 'secondary';
  const updateEffectsLabel = () => {
    effectsBtn.textContent = game.sound() ? 'Lydeffekter: til' : 'Lydeffekter: fra';
    effectsBtn.setAttribute('aria-pressed', String(game.sound()));
  };
  effectsBtn.onclick = () => { $('#soundBtn').click(); updateEffectsLabel(); };
  $('#soundBtn').addEventListener('click', updateEffectsLabel);
  $('#musicBtn').before(effectsBtn);
  updateEffectsLabel();
  $('#fullscreenBtn').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('#shell').requestFullscreen) await $('#shell').requestFullscreen();
      else game.toast('Fuld skærm er ikke tilgængelig i denne browser.');
    } catch (_) { game.toast('Browseren kunne ikke åbne fuld skærm.'); }
  };
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !game.playing()) {
      const overlay = document.querySelector('.overlay:not(.hidden)');
      if (overlay) {
        const focusable = [...overlay.querySelectorAll('button:not([disabled]):not(.hidden),a[href],input')];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    if (event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (event.repeat) return;
    if (key === 'shift' && game.playing()) { event.preventDefault(); dash(); }
    if (key === 'm' && game.playing()) { event.preventDefault(); journal(); }
    if (key === 'g' && game.playing()) { event.preventDefault(); toggleGuide(); }
    if (key === 'escape') {
      if (game.playing()) game.showOverlay('info');
      else if (isVisible('journal') || isVisible('info')) game.hideOverlays();
      else if (isVisible('finale')) { finale = null; game.hideOverlays(); }
      else if (isVisible('mission')) $('#missionClose').click();
    }
    if ((key === ' ' || key === 'enter') && isVisible('finale') && event.target.tagName !== 'BUTTON') {
      event.preventDefault(); ringBell();
    }
  });
  updatePreferences();
  normalize(); sync(false);
  return {
    tick, drawWorld, drawEffects, sync, resetSession, startHunt, startFinale, onWin,
    speed: () => dashLeft > 0 ? 2.5 : 1,
    missionReward: (room) => { burst(game.taskPos(room).x, game.taskPos(room).y, 65); reward('En ny juleglød er tændt', room.name + ' er klar til jul.', '✧'); },
    calm: () => !!prefs.calm
  };
};
