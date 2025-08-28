(() => {
  // ===== CONFIG =====
  const cfg = {
    gravity: 1800,
    playerSpeed: 520,
    playerWidth: 90,
    playerHeight: 90,
    lanePadding: 24,
    spawnMin: 0.55,
    spawnMax: 1.15,
    itemRadius: 32,
    goal: 200,
    levels: [
      {time: 0,    fallMin: 240, fallMax: 340, weights: {dollar:6, bill:4}},
      {time: 20,   fallMin: 280, fallMax: 380, weights: {dollar:6, bill:5}},
      {time: 40,   fallMin: 320, fallMax: 420, weights: {dollar:5, bill:6}},
      {time: 65,   fallMin: 360, fallMax: 460, weights: {dollar:4, bill:7}},
      {time: 90,   fallMin: 400, fallMax: 520, weights: {dollar:3, bill:8}},
    ],
    scores: {dollar: 10, bill: -20},
    maxStrikes: 3,
    hitConfetti: 40,
    missShake: 8,
    floorFriction: 0.9,
    billCollectorSpeed: 180 // px/s
  };

  // ===== DOM =====
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const dWallet = document.getElementById("wallet");
  const dBest  = document.getElementById("best");
  const btnReset  = document.getElementById("btnReset");
  const btnMute   = document.getElementById("btnMute");
  const charSel   = document.getElementById("characterSelect");
  const charOpts  = document.querySelectorAll(".character-option");
  const billCollectorImg = document.getElementById("billCollectorImg");
  const dRound = document.getElementById("round");
  const dTimer = document.getElementById("timer");
  const roundMsg = document.getElementById("roundMsg");
  const pauseMsg = document.createElement('div');
  pauseMsg.className = 'round-msg';
  pauseMsg.textContent = 'Paused';
  pauseMsg.style.display = 'none';
  document.body.appendChild(pauseMsg);
  const progressBar = document.getElementById("progressBar");
  const progressNow = document.getElementById("progressNow");
  const progressGoal = document.getElementById("progressGoal");
  progressGoal.textContent = RENT_GOAL;

  let best = Number(localStorage.getItem("billcollector_best")||0);
  dBest.textContent = best;

  // ===== IMAGES =====
  const charImgs = {
    danny: new Image(),
    trey: new Image(),
    black: new Image()
  };
  charImgs.danny.src = "danny catch.png";
  charImgs.trey.src = "trey catch.png";
  charImgs.black.src = "black catch.png";
  const billCollector = new Image();
  billCollector.src = "bill collector.png";

  // ===== ROUND CONFIG =====
  const rounds = [
    { time: 30,  fallMin: 340, fallMax: 440, weights: {dollar: 7, bill: 3} }, // Round 1
    { time: 25,  fallMin: 300, fallMax: 400, weights: {dollar: 6, bill: 4} }, // Round 2
    { time: 20,  fallMin: 260, fallMax: 360, weights: {dollar: 5, bill: 5} }, // Round 3
    { time: 15,  fallMin: 220, fallMax: 320, weights: {dollar: 4, bill: 6} }, // Round 4
    { time: 10,  fallMin: 180, fallMax: 260, weights: {dollar: 3, bill: 7} }, // Round 5
  ];
  const TOTAL_ROUNDS = 5;
  const RENT_GOAL = 1500;

  // ===== STATE =====
  const state = {
    running: false,
    paused: false,
    time: 0,
    lastT: 0,
    worldShake: 0,
    muted: false,
    wallet: 0,
    best: best,
    spawnTimer: 0,
    nextSpawn: 0.9,
    items: [],
    particles: [],
    keys: new Set(),
    player: null,
    selectedChar: null,
    billCollector: {
      x: 0, // center x
      y: 10,
      w: 120,
      h: 100,
      vx: cfg.billCollectorSpeed,
      dir: 1 // 1:right, -1:left
    },
    round: 1,
    roundTime: rounds[0].time,
    roundTimer: rounds[0].time,
    betweenRounds: false,
    gameOver: false
  };

  // ===== CHARACTER SELECTION =====
  charOpts.forEach(opt => {
    opt.onclick = () => {
      charOpts.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      state.selectedChar = opt.getAttribute('data-char');
      btnStart.disabled = false;
    };
  });

  const btnStart = document.getElementById("btnStart");
  btnStart.addEventListener("click", () => {
    if (state.selectedChar) {
      charSel.style.display = 'none';
      startGameFlow();
    }
  });

  // ===== AUDIO (no files) =====
  const AudioKit = (() => {
    const ACtx = window.AudioContext || window.webkitAudioContext;
    const ac = new ACtx();
    const out = ac.createGain(); out.gain.value = 0.25; out.connect(ac.destination);
    const beep = (f=440,d=0.08,type="sine",v=0.35) => {
      if (state.muted) return;
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = v;
      o.connect(g); g.connect(out);
      const t = ac.currentTime; o.start(t);
      g.gain.exponentialRampToValueAtTime(0.0001, t+d);
      o.stop(t+d+0.05);
    };
    return { ac, beep };
  })();

  // ===== FLOW CONTROL =====
  function showCharacterSelect() {
    charSel.style.display = "flex";
  }
  function startGameFlow() {
    charSel.style.display = "none";
    resetGame(true);
    state.round = 1;
    state.roundTime = rounds[0].time;
    state.roundTimer = rounds[0].time;
    state.betweenRounds = false;
    state.gameOver = false;
    updateHUD();
    showRoundMsg(`Round 1`);
    setTimeout(()=>{
      hideRoundMsg();
      state.running = true; state.paused = false;
      state.lastT = performance.now();
      requestAnimationFrame(loop);
    }, 1200);
  }

  function showRoundMsg(msg) {
    roundMsg.textContent = msg;
    roundMsg.style.display = "block";
  }
  function hideRoundMsg() {
    roundMsg.style.display = "none";
  }

  // ===== INIT / RESET =====
  function resetGame(preserveChar){
    state.running = false; state.paused = false;
    state.time = 0; state.lastT = 0; state.worldShake = 0;
    state.wallet = 0;
    state.spawnTimer = 0; state.nextSpawn = 0.9;
    state.items = []; state.particles = []; state.keys.clear();
    state.player = {
      x: canvas.width/2, y: canvas.height - 100,
      w: cfg.playerWidth, h: cfg.playerHeight,
      vx: 0
    };
    // Reset bill collector position
    state.billCollector.x = canvas.width/2;
    state.billCollector.vx = cfg.billCollectorSpeed;
    state.billCollector.dir = 1;
    state.round = 1;
    state.roundTime = rounds[0].time;
    state.roundTimer = rounds[0].time;
    state.betweenRounds = false;
    state.gameOver = false;
    if (!preserveChar) {
      state.selectedChar = null;
      charOpts.forEach(o => o.classList.remove('selected'));
    }
    updateHUD();
    draw(0);
  }

  // ===== INPUT =====
  window.addEventListener("keydown", (e)=>{
    const k = e.key.toLowerCase();
    if (k === " "){ e.preventDefault(); togglePause(); return; }
    state.keys.add(k);
  });
  window.addEventListener("keyup", (e)=> state.keys.delete(e.key.toLowerCase()));

  // Pointer move to steer
  canvas.addEventListener("pointermove", e=>{
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left)/rect.width*canvas.width;
    state.player.x = clamp(px, cfg.lanePadding, canvas.width - cfg.lanePadding);
  });
  // Tap/drag to “grab” control on mobile
  canvas.addEventListener("pointerdown", e=>{
    if (!state.running && state.selectedChar) startGameFlow();
  });

  btnReset.addEventListener("click", () => {
    // Stop the game and clear all state
    state.running = false;
    state.paused = false;
    state.gameOver = false;
    state.betweenRounds = false;
    // Hide overlays
    hideRoundMsg();
    pauseMsg.style.display = 'none';
    // Reset state and UI
    resetGame(false); // false = clear selectedChar
    charSel.style.display = 'flex';
    btnStart.disabled = true;
  });
  btnMute.addEventListener("click", ()=>{
    state.muted = !state.muted;
    btnMute.textContent = state.muted ? "🔇 Sound: Off" : "🔊 Sound: On";
    if (!state.muted) AudioKit.beep(700,.05,"triangle",0.25);
  });

  function startGame(){
    if (state.running) return;
    state.running = true; state.paused = false;
    state.lastT = performance.now();
    requestAnimationFrame(loop);
  }
  function togglePause(){
    if (!state.running) return;
    state.paused = !state.paused;
    if (!state.paused){ state.lastT = performance.now(); requestAnimationFrame(loop); }
  }

  // ===== GAME LOOP =====
  function loop(t){
    if (!state.running || state.paused) return;
    const dt = Math.min(0.02, Math.max(0, (t - state.lastT)/1000));
    state.lastT = t; state.time += dt;
    if (!state.betweenRounds && !state.gameOver) {
      state.roundTimer -= dt;
      if (state.roundTimer <= 0) {
        state.roundTimer = 0;
        nextRoundOrEnd();
        return;
      }
    }
    handleInput(dt);
    updateBillCollector(dt);
    spawnLogic(dt);
    updateItems(dt);
    updateParticles(dt);
    state.worldShake *= 0.9;
    draw(dt);
    updateHUD();
    if (!state.paused) requestAnimationFrame(loop);
  }

  function nextRoundOrEnd() {
    state.running = false;
    if (state.wallet >= RENT_GOAL) {
      showRoundMsg("🏆 Rent Paid! You Win!");
      state.gameOver = true;
      return;
    }
    if (state.round < TOTAL_ROUNDS) {
      state.betweenRounds = true;
      state.round++;
      state.roundTime = rounds[state.round-1].time;
      state.roundTimer = state.roundTime;
      showRoundMsg(`Round ${state.round}`);
      setTimeout(()=>{
        hideRoundMsg();
        state.betweenRounds = false;
        state.running = true;
        state.lastT = performance.now();
        requestAnimationFrame(loop);
      }, 1200);
    } else {
      showRoundMsg("Game Over!\nRent Not Paid");
      state.gameOver = true;
    }
  }

  function handleInput(dt){
    const left = state.keys.has("a") || state.keys.has("arrowleft");
    const right= state.keys.has("d") || state.keys.has("arrowright");
    let dir = (left?-1:0) + (right?1:0);
    state.player.vx = dir * cfg.playerSpeed;
    state.player.x += state.player.vx * dt;
    state.player.x = clamp(state.player.x, cfg.lanePadding, canvas.width - cfg.lanePadding);
  }

  // ===== BILL COLLECTOR MOVEMENT =====
  function updateBillCollector(dt){
    const bc = state.billCollector;
    bc.x += bc.vx * dt * bc.dir;
    // Bounce at edges
    if (bc.x - bc.w/2 < cfg.lanePadding) {
      bc.x = cfg.lanePadding + bc.w/2;
      bc.dir = 1;
    }
    if (bc.x + bc.w/2 > canvas.width - cfg.lanePadding) {
      bc.x = canvas.width - cfg.lanePadding - bc.w/2;
      bc.dir = -1;
    }
  }

  // ===== SPAWN & DIFFICULTY =====
  function currentLevel(){
    let L = cfg.levels[0];
    for (let i=0;i<cfg.levels.length;i++){
      if (state.time >= cfg.levels[i].time) L = cfg.levels[i];
    }
    return L;
  }
  function spawnLogic(dt){
    if (state.betweenRounds || state.gameOver) return;
    state.spawnTimer += dt;
    const roundCfg = rounds[state.round-1];
    // dynamic spawn rate: faster each round
    const rate = lerp(cfg.spawnMax, cfg.spawnMin, state.round/TOTAL_ROUNDS);
    if (state.spawnTimer >= rate){
      state.spawnTimer = 0;
      state.nextSpawn = rate;
      spawnItem();
    }
  }
  function spawnItem(){
    const roundCfg = rounds[state.round-1];
    const bc = state.billCollector;
    const x = bc.x;
    const y = bc.y + bc.h - 10;
    const vy = randRange(roundCfg.fallMin, roundCfg.fallMax);
    const t = weightedPick(roundCfg.weights);
    const item = {
      type: t,
      x, y, vy,
      r: cfg.itemRadius,
      rot: Math.random()*Math.PI*2,
      caught: false
    };
    state.items.push(item);
  }

  // ===== UPDATE =====
  function updateItems(dt){
    const P = state.player;
    for (let i=state.items.length-1;i>=0;i--){
      const it = state.items[i];
      it.y += it.vy * dt;
      it.rot += 2.5 * dt * (i%2?-1:1);
      // Collision with player (AABB vs circle)
      if (!it.caught && circleRectOverlap(it.x, it.y, it.r, P.x-P.w/2, P.y-P.h/2, P.w, P.h)){
        it.caught = true;
        onCatch(it);
        state.items.splice(i,1);
        continue;
      }
      // Missed (bottom)
      if (it.y - it.r > canvas.height){
        state.items.splice(i,1);
      }
    }
  }

  function onCatch(it){
    let gain = 0;
    if (it.type === "dollar") gain = 10;
    if (it.type === "bill") gain = -20;
    state.wallet += gain;
    if (state.wallet > best){ best = state.wallet; localStorage.setItem("billcollector_best", String(best)); dBest.textContent = best; }
    AudioKit.beep(gain>0?520:220,.05,gain>0?"square":"sine",0.28);
    for (let i=0;i<cfg.hitConfetti;i++) spawnParticle(it.x,it.y,gain>0?"confetti":"red");
    updateHUD();
    if (state.wallet >= RENT_GOAL && !state.gameOver) {
      showRoundMsg("🏆 Rent Paid! You Win!");
      state.running = false;
      state.gameOver = true;
    }
  }

  function updateParticles(dt){
    for (let i=state.particles.length-1;i>=0;i--){
      const p = state.particles[i];
      p.vx += p.ax*dt; p.vy += p.ay*dt;
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i,1);
    }
  }

  // ===== RENDER =====
  function draw(){
    ctx.save();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.translate((Math.random()*2-1)*state.worldShake,(Math.random()*2-1)*state.worldShake);
    drawBackdrop();
    drawBillCollector();
    drawPlayer();
    state.items.forEach(drawItem);
    state.particles.forEach(drawParticle);
    ctx.restore();
  }

  function drawBackdrop(){
    // Optionally add a soft vignette or background
  }

  function drawBillCollector(){
    ctx.save();
    const bc = state.billCollector;
    ctx.drawImage(billCollector, bc.x-bc.w/2, bc.y, bc.w, bc.h);
    ctx.restore();
  }

  function drawPlayer(){
    if (!state.selectedChar) return;
    const p = state.player;
    const img = charImgs[state.selectedChar];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.drawImage(img, -p.w/2, -p.h/2, p.w, p.h);
    ctx.restore();
  }

  function drawItem(it){
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    if (it.type === "dollar"){
      // Draw a green bill with $ symbol
      ctx.fillStyle = "#2ecc40";
      ctx.strokeStyle = "#145c23";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-28,-16); ctx.lineTo(28,-16); ctx.lineTo(28,16); ctx.lineTo(-28,16); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px ui-sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$",0,2);
      // bill details
      ctx.strokeStyle = "#b2f7c1";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-20,-10); ctx.lineTo(20,-10); ctx.moveTo(-20,10); ctx.lineTo(20,10); ctx.stroke();
    } else if (it.type === "bill"){
      // Draw a white paper with red 'RENT DUE' stamp
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e74c3c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22,-30); ctx.lineTo(22,-30); ctx.lineTo(22,30); ctx.lineTo(-22,30); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.rotate(-0.1);
      ctx.fillStyle = "#e74c3c";
      ctx.font = "bold 15px ui-sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("RENT DUE",0,0);
      ctx.restore();
      // lines for paper
      ctx.strokeStyle = "#e0e0e0";
      ctx.lineWidth = 1;
      for(let i=-18;i<=18;i+=8){ ctx.beginPath(); ctx.moveTo(-18,i); ctx.lineTo(18,i); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawParticle(p){
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size*1.6);
    ctx.globalAlpha = 1;
  }

  // ===== PARTICLES, EFFECTS =====
  function spawnParticle(x,y, kind="confetti"){
    let color = "#7cc3ff";
    if (kind==="red") color = "#ff6b6b";
    if (kind==="confetti"){
      const palette = ["#7cc3ff","#72ffa6","#ffd166","#ff82c9","#9afff1"];
      color = palette[Math.floor(Math.random()*palette.length)];
    }
    state.particles.push({
      x, y,
      vx: (Math.random()*2-1)*240,
      vy: (Math.random()*2-1)*240 - 40,
      ax: 0, ay: 900,
      life: .8 + Math.random()*.6,
      size: 2 + Math.random()*3,
      color
    });
  }

  // ===== HUD =====
  function updateHUD(){
    dWallet.textContent = `$${state.wallet}`;
    dRound.textContent = state.round;
    dTimer.textContent = Math.ceil(state.roundTimer);
    progressNow.textContent = state.wallet;
    const pct = Math.max(0, Math.min(1, state.wallet / RENT_GOAL));
    progressBar.style.width = (pct * 100) + "%";
  }

  // ===== RESIZE / DPR =====
  function resize(){
    // Make the board less tall (e.g. 1.1:1 aspect ratio)
    const targetW = Math.min(720, Math.floor(window.innerWidth - 28));
    const targetH = Math.floor(targetW * 1.1); // less tall
    const ratio = window.devicePixelRatio || 1;
    canvas.style.width = targetW + "px";
    canvas.style.height = targetH + "px";
    canvas.width = Math.floor(targetW * ratio);
    canvas.height = Math.floor(targetH * ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    if (state.player){
      state.player.y = canvas.height - 100;
      state.player.x = clamp(state.player.x || canvas.width/2, cfg.lanePadding, canvas.width - cfg.lanePadding);
    }
    // Also reset bill collector to center if needed
    state.billCollector.x = canvas.width/2;
    draw(0);
  }
  window.addEventListener("resize", resize);

  // ===== MATH & UTIL =====
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function randRange(a,b){ return a + Math.random()*(b-a); }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function weightedPick(weights){
    let total = 0; for (const k in weights) total += weights[k];
    let r = Math.random()*total;
    for (const k in weights){ r -= weights[k]; if (r<=0) return k; }
    return Object.keys(weights)[0];
  }
  function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh){
    const closestX = clamp(cx, rx, rx+rw);
    const closestY = clamp(cy, ry, ry+rh);
    const dx = cx - closestX, dy = cy - closestY;
    return (dx*dx + dy*dy) <= cr*cr;
  }

  // ===== STARTUP =====
  charSel.style.display = 'flex';
  btnStart.disabled = true;
  resize();
})();
