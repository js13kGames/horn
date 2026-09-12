"use strict";

// HORN. No engine, images, fonts, audio files, or network requests.
const $ = id => document.getElementById(id), canvas = $("world"), g = canvas.getContext("2d"), TAU = Math.PI * 2;

const rainbow = [ "#ff4d6d", "#ff963f", "#ffe66b", "#78de72", "#36d6d0", "#6986ff", "#bb77ff" ];

const keys = new Set, reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

let W = 1200, H = 800, scale = 1, mode = "title", ambient = 0, player, enemies = [], shots = [], bullets = [], pickups = [], particles = [], trails = [], rings = [], texts = [], score = 0, kills = 0, combo = 0, comboTime = 0, maxCombo = 0, elapsed = 0, spawnTimer = 0, wave = 0, shake = 0, freeze = 0, flash = 0, dashBuffer = 0, dashSerial = 0, moveDone = false, dashDone = false, firstKill = false, overdrive = 0, gunLevel = 1, trailLevel = 0, fireTimer = 0, boss = null, bossSpawned = false, bannerTime = 0, resultDelay = 0, lastFrame = 0, accumulator = 0, uiTimer = 0, muted = false, ac = null, best = {
    score: 0,
    kills: 0
}, firing = false, muzzle = 0, aim = {x: 0, y: 0, sx: 0, sy: 0, active: false};

try {
    const s = JSON.parse(localStorage.getItem("prism-panic-best-v1") || "{}");
    if (Number.isFinite(s.score) && s.score >= 0) best = s;
} catch {}

function resize() {
    const ww = innerWidth, hh = innerHeight;
    scale = Math.min(ww / 1e3, hh / 700);
    W = ww / scale;
    H = hh / scale;
    const d = .5;
    canvas.width = ww * d;
    canvas.height = hh * d;
    g.imageSmoothingEnabled = false;
    g.setTransform(d * scale, 0, 0, d * scale, 0, 0);
    $("banner").style.bottom = hh - (project(W / 2, 80, 36).y * scale - 12) + "px";
    if (player) {
        player.x = clamp(player.x, 60, W - 60);
        player.y = clamp(player.y, 110, H - 95);
    }
    if (mode === "playing") pauseGame();
}

function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
}

function rnd(a, b) {
    return a + Math.random() * (b - a);
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function audioInit() {
    try {
        if (!ac) ac = new (window.AudioContext || window.webkitAudioContext);
        if (ac.state === "suspended") ac.resume();
    } catch {}
}

function tone(freq, len = .12, type = "sine", vol = .035, end = 0, delay = 0) {
    if (muted || !ac) return;
    try {
        const o = ac.createOscillator(), v = ac.createGain(), now = ac.currentTime + delay;
        o.type = type;
        o.frequency.setValueAtTime(freq, now);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, end || freq * .45), now + len);
        v.gain.setValueAtTime(vol, now);
        v.gain.exponentialRampToValueAtTime(.001, now + len);
        o.connect(v);
        v.connect(ac.destination);
        o.start(now);
        o.stop(now + len);
    } catch {}
}

function burst(x, y, n, color, speed = 180) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = rnd(25, speed);
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: rnd(.22, .7),
            max: .7,
            size: rnd(1.5, 4.5),
            color: Array.isArray(color) ? color[i % color.length] : color
        });
    }
    if (particles.length > 650) particles.splice(0, particles.length - 650);
}

function ring(x, y, color, r = 70) {
    rings.push({
        x: x,
        y: y,
        color: color,
        r: r,
        life: .4,
        max: .4
    });
}

function text(x, y, value, color = "#91ffdc", size = 18) {
    texts.push({
        x: x,
        y: y,
        value: value,
        color: color,
        size: size,
        life: 1,
        max: 1
    });
}

function banner(title, sub = "", duration = 2) {
    $("banner-title").textContent = title;
    $("banner-sub").textContent = sub;
    $("banner").classList.add("show");
    bannerTime = duration;
}

// A tiny bitmap alphabet keeps menu lettering pixel-sharp without a font file.
function pixelHeading(id, value) {
    const c = document.createElement("canvas"), ctx = c.getContext("2d"), node = $(id);
    c.width = value.length * 6 - 1; c.height = 7;
    ctx.fillStyle = "#e5e4d1";
    const alphabet = 'HORN.YU DIEPASW', atlas = 'hhhvhhhehhhhheuhhukihhppljjh0000066hha4444hhhhhhe0000000uhhhhhuv44444vvgguggvuhhugggehhvhhhfgge11uhhhllrh';
    for (let i = 0; i < value.length; i++) for (let y = 0; y < 7; y++) {
        const row = parseInt(atlas[alphabet.indexOf(value[i]) * 7 + y], 32);
        for (let x = 0; x < 5; x++) if (row & 1 << (4 - x)) ctx.fillRect(i * 6 + x, y, 1, 1);
    }
    node.innerHTML = value;
    node.style.aspectRatio = c.width + "/7";
    node.style.backgroundImage = "url(" + c.toDataURL() + ")";
}

function showScreen(which) {
    $("screen").hidden = false;
    for (const id of [ "title-screen", "message-screen" ]) $(id).hidden = id !== which;
    $("hud").hidden = which === "title-screen";
}

function startGame() {
    audioInit();
    keys.clear();
    firing = false;
    mode = "playing";
    resultDelay = 0;
    $("resume").disabled = false;
    elapsed = 0;
    enemies = [];
    shots = [];
    bullets = [];
    pickups = [];
    particles = [];
    trails = [];
    rings = [];
    texts = [];
    score = 0;
    kills = 0;
    combo = 0;
    maxCombo = 0;
    comboTime = 0;
    spawnTimer = 2;
    wave = 0;
    shake = 0;
    freeze = 0;
    flash = 0;
    dashBuffer = 0;
    dashSerial = 0;
    moveDone = false;
    dashDone = false;
    firstKill = false;
    overdrive = 0;
    gunLevel = 1;
    trailLevel = 0;
    fireTimer = 0;
    muzzle = 0;
    aim.active = false;
    boss = null;
    bossSpawned = false;
    player = {
        x: W * .43,
        y: H * .54,
        vx: 0,
        vy: 0,
        angle: 0,
        hp: 5,
        dash: 0,
        cooldown: 0,
        inv: 2,
        dx: 1,
        dy: 0
    };
    $("screen").hidden = true;
    $("hud").hidden = false;
    $("boss-hud").hidden = true;
    dropPickup(3, player.x + 110, player.y + 85);
    spawnEnemy(0, player.x + 175, player.y, 1.1);
    spawnEnemy(0, player.x + 300, player.y - 65, 1.8);
    banner("ENTER THE PIT.", "WASD MOVE · MOUSE AIM · CLICK FIRE · SPACE DASH", 2.8);
    tone(220, .35, "sawtooth", .025, 660);
    canvas.focus({
        preventScroll: true
    });
    updateHUD();
    music(true);
}

function spawnEnemy(type, x, y, delay = .65) {
    if (x === undefined) {
        const side = Math.floor(rnd(0, 4));
        x = side === 0 ? 60 : side === 1 ? W - 60 : rnd(100, W - 100);
        y = side === 2 ? 115 : side === 3 ? H - 100 : rnd(125, H - 115);
        if (player && Math.hypot(x - player.x, y - player.y) < 230) {
            x = W - x;
            y = H - y;
        }
    }
    enemies.push({
        type: type,
        x: clamp(x, 65, W - 65),
        y: clamp(y, 115, H - 105),
        hp: type === 0 ? 3 : 4,
        r: type === 0 ? 18 : type === 1 ? 22 : 26,
        born: delay,
        clock: type === 2 ? rnd(2, 3) : rnd(.5, 1.5),
        state: 0,
        angle: 0,
        lastDash: -1,
        hit: 0,
        dead: false,
        spin: rnd(0, TAU),
        targetX: 0,
        targetY: 0
    });
}

function dash() {
    if (player.cooldown > 0 || player.dash > 0) return;
    let dx = (keys.has("d") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("a") || keys.has("ArrowLeft") ? 1 : 0), dy = (keys.has("s") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("w") || keys.has("ArrowUp") ? 1 : 0);
    let length = Math.hypot(dx, dy);
    if (length < .1) {
        dx = Math.cos(player.angle);
        dy = Math.sin(player.angle);
    } else {
        dx /= length;
        dy /= length;
    }
    let target = null, nearest = 260;
    for (const e of enemies) {
        if (e.dead || e.born > 0) continue;
        const d = dist(e, player), dot = ((e.x - player.x) * dx + (e.y - player.y) * dy) / (d || 1);
        if (d < nearest && dot > .8) {
            target = e;
            nearest = d;
        }
    }
    if (target) {
        dx = (target.x - player.x) / nearest;
        dy = (target.y - player.y) / nearest;
    }
    player.dx = dx;
    player.dy = dy;
    player.angle = Math.atan2(dy, dx);
    player.dash = .19;
    player.cooldown = overdrive > 0 ? .42 : .9;
    player.inv = Math.max(player.inv, .34);
    dashSerial++;
    dashDone = true;
    dashBuffer = 0;
    ring(player.x, player.y, "#9dffdf", 38);
    tone(360, .2, "sawtooth", .03, 65);
}

function eliminate(e, byDash = false) {
    if (e.dead) return;
    e.dead = true;
    kills++;
    combo = comboTime > 0 ? Math.min(combo + 1, 25) : 1;
    maxCombo = Math.max(maxCombo, combo);
    comboTime = 3;
    const multiplier = Math.min(5, 1 + Math.floor(combo / 3)), points = (e.type + 1) * 100 * multiplier * (overdrive > 0 ? 2 : 1);
    score += points;
    burst(e.x, e.y, byDash ? 26 : 13, byDash ? rainbow : enemyColor(e), byDash ? 300 : 140);
    ring(e.x, e.y, byDash ? "#c6fff1" : enemyColor(e), byDash ? 60 : 30);
    if (combo > 1 && combo % 5 === 0) text(e.x, e.y, combo + " CHAIN", "#e2ddb8", 13);
    if (kills === 1) dropPickup(0, e.x, e.y);
    else if (kills % 10 === 0) dropPickup(2, e.x, e.y);
    else if (kills % 10 === 5) dropPickup([1, 3, 0][Math.floor(kills / 10) % 3], e.x, e.y);
    if (byDash) {
        player.cooldown = 0;
        shake = Math.max(shake, reduced ? 0 : 5);
        freeze = .035;
        tone(260 + combo * 35, .11, "triangle", .055);
        if (!firstKill) {
            firstKill = true;
            banner("DASH RECHARGED", "EVERY DASH KILL RECHARGES YOUR DASH", 2.2);
        }
    } else tone(180 + combo * 20, .065, "triangle", .022);
}

// Match enemy shots to the visible body, neck and head, not the ground anchor.
// The horn, mane and tail are decorative and can safely graze bullets.
function hitPlayer(b) {
    const p = project(b.x, b.y, 22), c = Math.cos(player.angle), s = Math.sin(player.angle);
    for (const [offset, z, w, d, h] of [[0, 26, 23 + Math.abs(c) * 19, 19 + Math.abs(s) * 19, 18], [15, 36.5, 13, 13, 15], [24, 43.5, 17, 16, 13]]) {
        const q = project(player.x + c * offset, player.y + s * offset, z), r = b.r;
        if (((p.x - q.x) / (w * .415 + d * .06 + r)) ** 2 + ((p.y - q.y) / (d * .36 + h / 2 + r)) ** 2 <= 1) return true;
    }
    return false;
}

function damagePlayer() {
    if (mode !== "playing" || player.inv > 0 || player.dash > 0) return;
    player.hp--;
    player.inv = 1.5;
    text(player.x, player.y, "-1 HEART", "#ff8aa9", 14);
    combo = 0;
    comboTime = 0;
    flash = .2;
    shake = reduced ? 0 : 13;
    burst(player.x, player.y, 30, "#ff8aa9", 270);
    ring(player.x, player.y, "#ff8aa9", 90);
    tone(105, .35, "sawtooth", .055, 25);
    for (const e of enemies) {
        if (dist(e, player) < 95) {
            const a = Math.atan2(e.y - player.y, e.x - player.x);
            e.x += Math.cos(a) * 65;
            e.y += Math.sin(a) * 65;
        }
    }
    bullets = bullets.filter(b => dist(b, player) > 100);
    if (player.hp <= 0) endGame(false);
}

function enemyColor(e) {
    return e.type === 0 ? "#ff6e9e" : e.type === 1 ? "#ffc18d" : "#c294ff";
}

function fire() {
    if (mode !== "playing" || fireTimer > 0 || player.dash > 0) return;
    fireTimer = overdrive > 0 ? .15 : .25;
    shootAt(aim.active ? aim : {x: player.x + Math.cos(player.angle) * 100, y: player.y + Math.sin(player.angle) * 100});
}

function shootAt(target) {
    const a = Math.atan2(target.y - player.y, target.x - player.x), spread = overdrive > 0 ? gunLevel + 2 : gunLevel;
    for (let i = 0; i < spread; i++) {
        const b = a + (i ? Math.ceil(i / 2) * .12 * (i % 2 ? 1 : -1) : 0);
        shots.push({
            x: player.x + Math.cos(b) * 18,
            y: player.y + Math.sin(b) * 18,
            vx: Math.cos(b) * 760,
            vy: Math.sin(b) * 760,
            life: .85
        });
    }
    muzzle = .06;
    shake = Math.max(shake, reduced ? 0 : 1.3);
    player.vx -= Math.cos(a) * 36;
    player.vy -= Math.sin(a) * 36;
    tone(220, .065, "square", .03, 55);
}

function enemyBullet(x, y, a, speed = 150, r = 5) {
    if (bullets.length >= 36) return;
    bullets.push({
        x: x,
        y: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 3.6,
        r: r
    });
}

function spawnBoss() {
    bossSpawned = true;
    enemies = [];
    bullets = [];
    boss = {
        x: W / 2,
        y: H * .27,
        hp: 180,
        max: 180,
        r: 49,
        clock: 2,
        phase: 0,
        angle: 0,
        spin: 0,
        hit: 0,
        lastDash: -1,
        born: 1.8
    };
    player.inv = Math.max(player.inv, 2);
    banner("THE WARDEN.", "DESTROY THE MACHINE GUARD TO WIN.", 3);
    $("boss-hud").hidden = false;
    music(true);
}

function updateBoss(dt) {
    if (!boss || mode !== "playing") return;
    boss.born -= dt;
    boss.hit = Math.max(0, boss.hit - dt);
    boss.spin += dt * .7;
    if (boss.born > 0) return;
    const rage = boss.hp <= boss.max / 2, follow = Math.min(1, dt * 2);
    boss.x += (W / 2 + Math.sin(elapsed * .6) * W * .26 - boss.x) * follow;
    boss.y += (H * .42 + Math.sin(elapsed * .9) * H * .14 - boss.y) * follow;
    boss.clock -= dt;
    if (boss.clock > .7) boss.angle = Math.atan2(player.y - boss.y, player.x - boss.x);
    if (boss.clock <= 0) {
        boss.phase++;
        boss.clock = rage ? 1.6 : 2.2;
        const aimed = boss.phase % 2, count = aimed ? rage ? 7 : 5 : rage ? 16 : 12;
        for (let i = 0; i < count; i++) enemyBullet(boss.x, boss.y,
            aimed ? boss.angle + (i - (count - 1) / 2) * .14 : i * TAU / count + boss.spin,
            aimed ? 220 : rage ? 195 : 165, 5);
        tone(100, .2, "triangle", .025);
    }
    if (dist(player, boss) < boss.r + 17) {
        if (player.dash > 0 && boss.lastDash !== dashSerial) {
            boss.lastDash = dashSerial;
            boss.hp -= 12 + trailLevel * 2;
            boss.hit = .15;
            shake = reduced ? 0 : 9;
            freeze = .04;
            burst(boss.x, boss.y, 30, rainbow, 300);
            tone(100, .22, "sawtooth", .045);
            ring(boss.x, boss.y, "#fff1de", 90);
        } else damagePlayer();
    }
    if (mode !== "playing") return;
    if (boss.hp <= 0) {
        score += 1e4;
        burst(boss.x, boss.y, 150, rainbow, 500);
        ring(boss.x, boss.y, "#9bffdf", W * .7);
        endGame(true);
    }
}

function beginOverdrive() {
    overdrive = 6;
    player.inv = Math.max(player.inv, .7);
    bullets = [];
    text(player.x, player.y + 100, "RAINBOW FIRE · 6s", rainbow[4], 16);
    ring(player.x, player.y, "#8affdf", 300);
    shake = reduced ? 0 : 5;
}

// Power is collected in the arena; the fight never pauses for a choice.
const pickupNames = ["SPLIT SHOT", "BURNING TRAIL", "+1 HEART", "RAINBOW"],
    pickupColors = [rainbow[4], rainbow[1], rainbow[0], rainbow[6]];

function dropPickup(type, x, y) {
    pickups.push({type, x: clamp(x, 70, W - 70), y: clamp(y, 135, H - 110), life: 30});
}

function collectPickup(p) {
    if (mode !== "playing" || p.life <= 0) return;
    if (p.type === 2 && player.hp >= 7) {
        if (!p.full) {
            texts = texts.filter(t => t.size !== 16);
            text(player.x, player.y + 100, "FULL HEALTH", "#edf1d1", 16);
            p.full = true;
        }
        return;
    }
    p.life = 0;
    if (p.type === 0) gunLevel = Math.min(5, gunLevel + 1);
    if (p.type === 1) trailLevel = Math.min(3, trailLevel + 1);
    if (p.type === 2) {
        player.hp++;
        player.inv = Math.max(player.inv, 1.2);
    }
    texts = texts.filter(t => t.size !== 16);
    if (p.type === 3) beginOverdrive();
    else text(player.x, player.y + 100, p.type === 2 ? player.hp + "/7 HEARTS" : pickupNames[p.type], pickupColors[p.type], 16);
    burst(p.x, p.y, 20, p.type === 3 ? rainbow : pickupColors[p.type]);
    ring(p.x, p.y, pickupColors[p.type], 55);
    pickupSound(p.type);
    updateHUD();
}

function endGame(victory) {
    if (mode !== "playing") return;
    mode = victory ? "victory" : "dead";
    resultDelay = .8;
    $("resume").disabled = true;
    keys.clear();
    firing = false;
    if (score > best.score) {
        best = {
            score: score,
            kills: kills
        };
        try {
            localStorage.setItem("prism-panic-best-v1", JSON.stringify(best));
        } catch {}
    }
    showScreen("message-screen");
    pixelHeading("message-title", victory ? "YOU WIN." : "YOU DIED.");
    $("message-copy").textContent = victory ? "WARDEN DOWN. +10,000 VICTORY BONUS." : bossSpawned ? "THE WARDEN GOT YOU. WATCH THE WARNING LINES." : "KEEP MOVING. KEEP FIRING. ONE MORE RUN.";
    $("result-stats").innerHTML = "<div><b>" + score.toLocaleString() + "</b><span>SCORE</span></div><div><b>" + Math.floor(elapsed) + "s</b><span>SURVIVED</span></div><div><b>" + maxCombo + "</b><span>BEST CHAIN</span></div>";
    $("resume").textContent = victory ? "REPLAY ↵" : "RETRY ↵";
    $("resume").onclick = () => { if (resultDelay <= 0) startGame(); };
    $("pause").textContent = "Ⅱ";
    tone(victory ? 660 : 180, .65, "triangle", .05, victory ? 990 : 35);
    updateHUD();
    music();
}

function pauseGame() {
    if (mode !== "playing") return;
    mode = "paused";
    keys.clear();
    firing = false;
    dashBuffer = 0;
    showScreen("message-screen");
    pixelHeading("message-title", "PAUSED.");
    $("message-copy").textContent = "TAKE A BREATH. THE PIT CAN WAIT.";
    $("result-stats").innerHTML = "";
    $("resume").textContent = "RESUME ↵";
    $("resume").onclick = resumeGame;
    $("pause").textContent = "▷";
    music();
}

function resumeGame() {
    if (mode !== "paused") return;
    audioInit();
    mode = "playing";
    keys.clear();
    firing = false;
    $("screen").hidden = true;
    $("pause").textContent = "Ⅱ";
    canvas.focus({
        preventScroll: true
    });
    music();
}

function title() {
    mode = "title";
    keys.clear();
    firing = false;
    showScreen("title-screen");
    $("boss-hud").hidden = true;
    $("pause").textContent = "Ⅱ";
    $("banner").classList.remove("show");
    music();
}

function updateHUD() {
    $("score").textContent = String(score).padStart(6, "0");
    $("hearts").textContent = "♥ ".repeat(Math.max(0, player?.hp ?? 5));
    $("best").textContent = "BEST " + best.score.toLocaleString();
    $("combo").textContent = combo > 1 ? "×" + Math.min(5, 1 + Math.floor(combo / 3)) + " MULTIPLIER / " + combo + " CHAIN" : "BUILD YOUR CHAIN";
    $("timer").textContent = String(Math.floor(elapsed / 60)).padStart(2, "0") + ":" + String(Math.floor(elapsed % 60)).padStart(2, "0");
    $("phase").textContent = boss ? "DEFEAT THE WARDEN" : "SURVIVE " + Math.max(0,Math.ceil(60-elapsed)) + "s";
    $("dash-fill").style.width = (1 - clamp(player?.cooldown || 0, 0, .9) / .9) * 100 + "%";
    $("overdrive-fill").style.width = Math.max(0, overdrive / 6 * 100) + "%";
    $("overdrive-label").textContent = overdrive > 0 ? "RAINBOW FIRE · " + Math.ceil(overdrive) + "s" : "FIND RAINBOW DROPS";
    if (boss) {
        $("boss-fill").style.width = clamp(boss.hp / boss.max * 100, 0, 100) + "%";
        $("boss-name").textContent = boss.hp <= boss.max / 2 ? "WARDEN / ENRAGED" : "THE WARDEN";
    }
    $("tutorial").textContent = boss ? "DEFEAT THE WARDEN · SPACE DODGES BULLETS" : !dashDone ? "WASD MOVE · MOUSE AIM · CLICK FIRE · SPACE DASH" : "SURVIVE 60s · DEFEAT THE WARDEN · HEART EVERY 10 KILLS";
    $("tutorial").style.opacity = "1";
}

function effects(dt) {
    for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-dt * 4);
        p.vy *= Math.exp(-dt * 4);
        p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
    for (const r of rings) r.life -= dt;
    rings = rings.filter(r => r.life > 0);
    for (const a of texts) {
        a.y -= 28 * dt;
        a.life -= dt;
    }
    texts = texts.filter(a => a.life > 0);
    for (const l of trails) l.life -= dt;
    trails = trails.filter(l => l.life > 0);
    shake = Math.max(0, shake - dt * 28);
    flash = Math.max(0, flash - dt);
}

function step(dt) {
    ambient += dt;
    effects(dt);
    if (resultDelay > 0) {
        resultDelay = Math.max(0, resultDelay - dt);
        if (!resultDelay) $("resume").disabled = false;
    }
    if (mode !== "playing") return;
    if (freeze > 0) {
        freeze -= dt;
        return;
    }
    elapsed += dt;
    if (bannerTime > 0) {
        bannerTime -= dt;
        if (bannerTime <= 0) $("banner").classList.remove("show");
    }
    if (comboTime > 0) {
        comboTime -= dt;
        if (comboTime <= 0) combo = 0;
    }
    player.cooldown = Math.max(0, player.cooldown - dt);
    player.inv = Math.max(0, player.inv - dt);
    if (overdrive > 0) overdrive -= dt;
    let mx = (keys.has("d") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("a") || keys.has("ArrowLeft") ? 1 : 0), my = (keys.has("s") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("w") || keys.has("ArrowUp") ? 1 : 0), n = Math.hypot(mx, my);
    if (n > .1) {
        mx /= Math.max(1, n);
        my /= Math.max(1, n);
        moveDone = true;
        if (player.dash <= 0 && !aim.active) player.angle = Math.atan2(my, mx);
    }
    if (aim.active && player.dash <= 0) player.angle = Math.atan2(aim.y - player.y, aim.x - player.x);
    muzzle = Math.max(0, muzzle - dt);
    if (dashBuffer > 0) {
        dashBuffer -= dt;
        if (player.cooldown <= 0 && player.dash <= 0) dash();
    }
    const ox = player.x, oy = player.y;
    if (player.dash > 0) {
        player.x += player.dx * 1120 * dt;
        player.y += player.dy * 1120 * dt;
        player.dash -= dt;
        trails.push({
            x: ox,
            y: oy,
            x2: player.x,
            y2: player.y,
            life: trailLevel || overdrive > 0 ? .75 + trailLevel * .25 : .9,
            max: trailLevel || overdrive > 0 ? .75 + trailLevel * .25 : .9,
            burn: trailLevel > 0 || overdrive > 0
        });
    } else {
        const smooth = 1 - Math.exp(-dt * 22), speed = 310 + (overdrive > 0 ? 40 : 0);
        player.vx += (mx * speed - player.vx) * smooth;
        player.vy += (my * speed - player.vy) * smooth;
        player.x += player.vx * dt;
        player.y += player.vy * dt;
        if (n > .1) trails.push({x:ox,y:oy,x2:player.x,y2:player.y,life:.38,max:.38,burn:false});
    }
    player.x = clamp(player.x, 48, W - 48);
    player.y = clamp(player.y, 105, H - 85);
    if (!bossSpawned && elapsed >= 60) spawnBoss();
    spawnTimer -= dt;
    if (!bossSpawned && spawnTimer <= 0) {
        spawnTimer = Math.max(.5, 1.05 - elapsed * .009);
        if (enemies.length < 30) {
            const shooters = enemies.filter(e => !e.dead && e.type === 2).length;
            const type = elapsed > 25 && shooters < 3 && Math.random() < .2 ? 2 : elapsed > 15 && Math.random() < .24 ? 1 : 0;
            spawnEnemy(type);
            if (elapsed > 20 && enemies.length < 30 && Math.random() < .3) spawnEnemy(0);
        }
    }
    if (wave < 1 && elapsed >= 20) {
        wave = 1;
        banner("THE HUNT.", "KEEP YOUR CHAIN ALIVE.", 2);
    }
    if (wave < 2 && elapsed >= 40) {
        wave = 2;
        banner("COLOR RIOT.", "THE WARDEN IS WAKING UP.", 2);
    }
    for (const e of enemies) {
        if (e.dead) continue;
        e.hit = Math.max(0, e.hit - dt);
        if (e.born > 0) {
            e.born -= dt;
            continue;
        }
        const a = Math.atan2(player.y - e.y, player.x - e.x), d = dist(e, player);
        e.spin += dt;
        if (e.type === 0) {
            e.x += Math.cos(a) * (70 + Math.min(55, elapsed * .7)) * dt;
            e.y += Math.sin(a) * (70 + Math.min(55, elapsed * .7)) * dt;
            e.angle = a;
        } else if (e.type === 1) {
            e.clock -= dt;
            if (e.state === 0) {
                e.x += Math.cos(a) * 45 * dt;
                e.y += Math.sin(a) * 45 * dt;
                e.angle = a;
                if (e.clock <= 0) {
                    e.state = 1;
                    e.clock = .7;
                    e.targetX = player.x;
                    e.targetY = player.y;
                    e.angle = a;
                }
            } else if (e.state === 1) {
                if (e.clock <= 0) {
                    e.state = 2;
                    e.clock = .65;
                    tone(170, .07, "triangle", .012);
                }
            } else {
                e.x += Math.cos(e.angle) * 470 * dt;
                e.y += Math.sin(e.angle) * 470 * dt;
                if (e.clock <= 0) {
                    e.state = 0;
                    e.clock = 1.4;
                }
            }
        } else {
            e.clock -= dt;
            if (d > 290) {
                e.x += Math.cos(a) * 45 * dt;
                e.y += Math.sin(a) * 45 * dt;
            }
            if (e.clock > .7) e.angle = a;
            if (e.clock <= 0) {
                e.clock = 2.6;
                for (const offset of [0, e.state ? -.16 : .16]) enemyBullet(e.x, e.y, e.angle + offset, 160, 5);
                e.state ^= 1;
                ring(e.x, e.y, "#bc94ff", 40);
                tone(220, .1, "triangle", .012);
            }
        }
        e.x = clamp(e.x, 48, W - 48);
        e.y = clamp(e.y, 105, H - 85);
        if (dist(e, player) < e.r + 19) {
            if (player.dash > 0 && e.lastDash !== dashSerial) {
                e.lastDash = dashSerial;
                eliminate(e, true);
            } else damagePlayer();
        }
        if (mode !== "playing") return;
        if (e.dead) continue;
        for (const l of trails) {
            if (!l.burn) continue;
            const vx = l.x2 - l.x, vy = l.y2 - l.y, u = clamp(((e.x - l.x) * vx + (e.y - l.y) * vy) / (vx * vx + vy * vy || 1), 0, 1);
            if (Math.hypot(e.x - l.x - vx * u, e.y - l.y - vy * u) < e.r + 7) {
                e.hp -= dt * 18;
                if (e.hp <= 0) {
                    eliminate(e, false);
                    break;
                }
            }
        }
    }
    enemies = enemies.filter(e => !e.dead);
    fireTimer = Math.max(0, fireTimer - dt);
    if (firing || keys.has("x")) fire();
    for (const s of shots) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        for (const e of enemies) {
            if (e.dead || e.born > 0) continue;
            if (dist(s, e) < e.r + 5) {
                s.life = 0;
                e.hp -= 1;
                e.hit = .09;
                if (e.hp <= 0) eliminate(e);
                break;
            }
        }
        if (s.life > 0 && boss && boss.born <= 0 && dist(s, boss) < boss.r + 5) {
            s.life = 0;
            boss.hp -= 1;
            boss.hit = .07;
        }
    }
    shots = shots.filter(s => s.life > 0);
    for (const b of bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (hitPlayer(b)) {
            if (player.inv > 0 || player.dash > 0) {
                b.life = 0;
                burst(b.x, b.y, 4, "#a6ffeb");
            } else {
                damagePlayer();
                b.life = 0;
            }
        }
        if (mode !== "playing") return;
    }
    bullets = bullets.filter(b => b.life > 0 && b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30);
    for (const p of pickups) {
        p.life -= dt;
        if (p.life > 0 && dist(p, player) < 28) collectPickup(p);
        else p.full = false;
    }
    pickups = pickups.filter(p => p.life > 0);
    updateBoss(dt);
    if (mode !== "playing") return;
    uiTimer += dt;
    if (uiTimer > .05) {
        updateHUD();
        uiTimer = 0;
    }
}

// Low-resolution oblique rendering. World axes stay aligned with WASD.
function project(x, y, z = 0) {
    return {
        x: W / 2 + (x - W / 2) * .83 + (y - H * .51) * .12,
        y: H * .51 + (y - H * .51) * .72 - z
    };
}

function polygon(points, color) {
    g.beginPath();
    points.forEach((p, i) => i ? g.lineTo(Math.round(p.x), Math.round(p.y)) : g.moveTo(Math.round(p.x), Math.round(p.y)));
    g.closePath();
    g.fillStyle = color;
    g.fill();
}

function floorLine(x, y, x2, y2, color, width = 1, z = 0) {
    const a = project(x, y, z), b = project(x2, y2, z);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
}

function box(x, y, w, d, z, h, top = "#aeb6a0", front = "#626c5c", side = "#828d78") {
    const a = project(x - w / 2, y - d / 2, z + h), b = project(x + w / 2, y - d / 2, z + h), c = project(x + w / 2, y + d / 2, z + h), v = project(x - w / 2, y + d / 2, z + h), br = project(x + w / 2, y - d / 2, z), cr = project(x + w / 2, y + d / 2, z), vr = project(x - w / 2, y + d / 2, z);
    polygon([ b, br, cr, c ], side);
    polygon([ v, c, cr, vr ], front);
    polygon([ a, b, c, v ], top);
}

function hardShadow(x, y, w = 40, d = 25) {
    g.save();
    g.globalAlpha = .28;
    polygon([ project(x - 10, y - 5), project(x + w, y + d - 5), project(x + w + 9, y + d + 10), project(x - 2, y + 12) ], "#101918");
    g.restore();
}

function drawBackground() {
    g.fillStyle = "#171a1b";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#1e2221";
    for (let i = 0; i < 90; i++) {
        const x = i * 193.3 % W, y = i * 327.7 % H;
        g.fillRect(x, y, 2, 2);
    }
    const left = 34, right = W - 34, back = 94, front = H - 77;
    box(W / 2, (back + front) / 2, right - left, front - back, -46, 46, "#757b69", "#373f39", "#555e4f");
    // Broad concrete panels and tiny deterministic chips replace glows and stars.
        for (let y = back + 80; y < front; y += 92) floorLine(left, y, right, y, "#5e675a", 1.6);
    for (let x = left + 110; x < right; x += 125) floorLine(x, back, x, front, "#5e675a", 1.6);
    g.fillStyle = "#919580";
    for (let i = 0; i < 210; i++) {
        const p = project(left + i * 217.73 % (right - left), back + i * 157.31 % (front - back));
        g.fillRect(p.x, p.y, i % 3 === 0 ? 3 : 1.5, 1.5);
    }
    floorLine(left + 27, back + 25, right - 27, back + 25, "#a4a588", 2);
    floorLine(left + 27, front - 25, right - 27, front - 25, "#a4a588", 2);
    for (let x = left + 35; x < right - 20; x += 23) {
        floorLine(x, back + 5, x + 10, back + 18, "#292f2b", 6);
        floorLine(x, front - 15, x + 10, front - 2, "#292f2b", 6);
    }
    // The back parapet and side rails sit outside the collision plane.
        box(W / 2, back - 7, right - left + 12, 16, 0, 18, "#a0a68d", "#454f45", "#79816c");
    box(left - 5, (back + front) / 2, 12, front - back, 0, 12, "#9ba28a", "#535f4e", "#525e4f");
    box(right + 5, (back + front) / 2, 12, front - back, 0, 12, "#9ba28a", "#535f4e", "#525e4f");
    for (const [x, y] of [ [ left, back ], [ right, back ], [ left, front ], [ right, front ] ]) {
        box(x, y, 27, 27, -4, 35, "#b2b5a0", "#5b6255", "#7b8470");
        box(x, y, 16, 16, 31, 5, "#484f47", "#353d37", "#343b33");
    }
    const label = project(W / 2, back + 59);
    g.textAlign = "center";
    g.font = "bold 13px monospace";
    g.fillStyle = "#4f584c";
    g.fillText("SECTOR 13", label.x, label.y);
}

function drawUnicorn(x, y, angle, dashing = false) {
    const c=Math.cos(angle),sn=Math.sin(angle),walk=mode==="playing"?Math.sin(ambient*22)*3:0;
    hardShadow(x,y,48,27);
    // Four separate dark hooves, an elongated body, raised neck, and muzzle.
    for(const [dx,dy] of [[-14,-9],[14,-9],[-14,9],[14,9]]) {
        const lx=x+dx*c-dy*sn,ly=y+dx*sn+dy*c,z=Math.max(0,walk*(dx*dy>0?1:-1));
        box(lx,ly,6,6,z,5,"#575c57","#343b39","#464d46");
        box(lx,ly,5,5,z+5,14,"#fff9e9","#bfc9b8","#dce1ce");
    }
    box(x,y,23+Math.abs(c)*19,19+Math.abs(sn)*19,17,18,"#fff9e9","#becbb8","#dfe5ce");
    const hx=x+c*24,hy=y+sn*24;
    box(x+c*15,y+sn*15,13,13,29,15,"#fff9e9","#becbb8","#dfe5ce");
    box(hx,hy,17,16,37,13,"#fff9e9","#becbb8","#dfe5ce");
    box(hx+c*10,hy+sn*10,12,12,34,8,"#e5dece","#aab8a7","#d4dbc7");
    for(const side of [-1,1]) box(hx+sn*7*side,hy-c*7*side,4,4,50,8,"#fff9e9","#d4a6b5","#dfe5ce");
    const base=project(hx,hy,48),tip=project(hx+c*(dashing?42:13),hy+sn*(dashing?42:13),dashing?64:77);
    polygon([{x:base.x-5,y:base.y},{x:base.x+5,y:base.y},tip],"#ffe181");
    const eye=project(hx,hy+8,43);g.fillStyle="#30383c";g.fillRect(eye.x-5,eye.y,3,3);g.fillRect(eye.x+4,eye.y,3,3);
    for(let i=0;i<7;i++) box(x-c*(i*4-10),y-sn*(i*4-10),6,7,35,6,rainbow[i],rainbow[i],rainbow[i]);
    if (muzzle > 0 && mode === "playing") {
        const p = project(x + Math.cos(angle) * 30, y + Math.sin(angle) * 30, 25);
        polygon([{x:p.x-10,y:p.y},{x:p.x,y:p.y-9},{x:p.x+10,y:p.y},{x:p.x,y:p.y+9}], "#fff0b8");
    }
    const tx=x-c*25,ty=y-sn*25;
    for(let i=0;i<7;i++){const o=(i-3)*2;floorLine(tx-sn*o,ty+c*o,tx-c*28-sn*o,ty-sn*28+c*o,rainbow[i],3,19);}

}

function drawPickup(p) {
    const color = pickupColors[p.type], bob = Math.sin(ambient * 4 + p.x) * 2;
    g.save();
    if (p.life < 4 && Math.sin(ambient * 12) > 0) g.globalAlpha = .4;
    hardShadow(p.x, p.y, 24, 12);
    box(p.x, p.y, 36, 32, 0, 3, "#343c36", "#222a26", color);
    const q = project(p.x, p.y, 12 + bob);
    g.fillStyle = color;
    if (p.type === 2) {
        ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"].forEach((row,y) => {
            for (let x=0; x<7; x++) if (row[x] === "1") g.fillRect(q.x + x*4-14, q.y+y*4-22, 4, 4);
        });
    } else if (p.type === 3) {
        for (let i=0; i<7; i++) {
            g.beginPath();
            g.arc(q.x, q.y, 23-i*2.6, Math.PI, TAU);
            g.strokeStyle = rainbow[i];
            g.lineWidth = 3;
            g.stroke();
        }
    } else if (p.type === 0) {
        for (let i=-1; i<=1; i++) {
            g.fillRect(q.x+i*9-2, q.y-23+Math.abs(i)*6, 4, 17);
            g.fillRect(q.x+i*9-4, q.y-23+Math.abs(i)*6, 8, 4);
        }
    } else {
        for (let i=0; i<7; i++) {
            g.fillStyle = rainbow[i];
            g.fillRect(q.x+i*4-14, q.y-10, 4, 11);
            g.fillRect(q.x+i*4-11, q.y-19+Math.abs(i-3)*2, 4, 10);
        }
    }
    // Only label the closest drop, so a pile cannot obscure the fight.
    if (!player || dist(p, player) > 100 || p !== pickups.reduce((a, b) => dist(a, player) <= dist(b, player) ? a : b)) {
        g.restore();
        return;
    }
    const label = p.type === 2 && player.hp >= 7 ? "FULL HEALTH" : pickupNames[p.type];
    g.font = "bold 14px monospace";
    g.textAlign = "center";
    g.fillStyle = "#222a26";
    g.fillRect(q.x-label.length*4.2-5, q.y+11, label.length*8.4+10, 19);
    g.fillStyle = "#edf1d1";
    g.fillText(label, q.x, q.y+26);
    g.restore();
}

function drawEnemy(e) {
    if (e.born > 0) {
        const color = Math.sin(ambient * 17) > 0 ? "#d5b28a" : "#8d594d";
        floorLine(e.x - 19, e.y - 19, e.x + 19, e.y + 19, color, 3);
        floorLine(e.x + 19, e.y - 19, e.x - 19, e.y + 19, color, 3);
        return;
    }
    const white = e.hit > 0 ? "#fff4db" : null;
    hardShadow(e.x, e.y, e.r * 2.2, 25);
    if (e.type === 2 && e.clock < .7) floorLine(e.x, e.y, e.x + Math.cos(e.angle) * 230, e.y + Math.sin(e.angle) * 230, "#ebc58c", 2, 2);
    if (e.type === 1 && e.state === 1) {
        for (let i = 0; i < 10; i++) floorLine(e.x + Math.cos(e.angle) * i * 33, e.y + Math.sin(e.angle) * i * 33, e.x + Math.cos(e.angle) * (i * 33 + 15), e.y + Math.sin(e.angle) * (i * 33 + 15), "#c8a569", 2);
    }
    for (let i = -1; i <= 1; i += 2) {
        box(e.x + i * e.r * .7, e.y, 7, 22, 0, 9, "#595f50", "#303a31", "#464e3e");
    }
    if (e.type === 0) {
        box(e.x, e.y, 29, 25, 8, 23, white || "#b67c61", "#754f41", "#935f4d");
        const p = project(e.x, e.y + 13, 24);
        g.fillStyle = "#d9c194";
        g.fillRect(p.x - 9, p.y, 5, 4);
        g.fillRect(p.x + 5, p.y, 5, 4);
        g.fillStyle = "#413e31";
        g.fillRect(p.x - 5, p.y + 7, 10, 3);
    } else if (e.type === 1) {
        box(e.x, e.y, 35, 27, 7, 20, white || "#c1a674", "#746544", "#958457");
        const b = project(e.x + Math.cos(e.angle) * 20, e.y + Math.sin(e.angle) * 20, 25), tip = project(e.x + Math.cos(e.angle) * 42, e.y + Math.sin(e.angle) * 42, 29);
        polygon([ {
            x: b.x - 5,
            y: b.y + 4
        }, {
            x: b.x + 5,
            y: b.y - 4
        }, tip ], "#e6d3a5");
        box(e.x, e.y, 13, 12, 27, 8, "#343e36", "#263028", "#4a5546");
    } else {
        box(e.x, e.y, 33, 29, 7, 12, white || "#99918c", "#575559", "#6b6970");
        box(e.x, e.y, 22, 23, 19, 29, white || "#a79b9b", "#615761", "#8e7d8b");
        const p = project(e.x, e.y + 12, 34);
        g.fillStyle = e.clock < .7 ? "#fff0b8" : "#392e3f";
        g.fillRect(p.x - 8, p.y, 16, 5);
        box(e.x, e.y, 28, 28, 48, 5, "#c2b6ad", "#736b71", "#897b85");
    }
}

function drawBoss() {
    if (!boss) return;
    g.save();
    if (boss.born > 0) g.globalAlpha = clamp(1 - boss.born / 1.8, .1, 1);
    const rage = boss.hp <= boss.max / 2;
    if (boss.born <= 0 && boss.clock < .7) {
        g.save();
        polygon([project(34,94), project(W-34,94), project(W-34,H-77), project(34,H-77)], "#0000");
        g.clip();
        if (boss.phase % 2 === 0) {
            for (const side of [-1, 1]) {
                const a = boss.angle + side * (rage ? .42 : .28);
                floorLine(boss.x, boss.y, boss.x + Math.cos(a) * 650, boss.y + Math.sin(a) * 650, "#ffe181", 2, 2);
            }
        }
        else {
            const q = project(boss.x, boss.y);
            g.beginPath();
            g.ellipse(q.x, q.y, 90, 65, 0, 0, TAU);
            g.strokeStyle = "#ffe181"; g.lineWidth = 3; g.stroke();
        }
        g.restore();
    }
    hardShadow(boss.x, boss.y, 110, 70);
    box(boss.x, boss.y, 94, 69, 0, 16, "#54584e", "#282e2a", "#3d4439");
    box(boss.x, boss.y, 82, 58, 16, 69, boss.hit > 0 ? "#f0e1cd" : rage ? "#a5634d" : "#7d7970", "#484547", "#686162");
    box(boss.x - 38, boss.y, 13, 23, 70, 31, "#c2b59b", "#706352", "#95866f");
    box(boss.x + 38, boss.y, 13, 23, 70, 31, "#c2b59b", "#706352", "#95866f");
    const p = project(boss.x, boss.y + 30, 56);
    g.fillStyle = "#242629";
    g.fillRect(p.x - 28, p.y - 3, 56, 19);
    g.fillStyle = boss.clock < .7 ? "#ffe181" : rage ? "#f09263" : "#a56660";
    g.fillRect(p.x - 22, p.y + 1, 44, 10);
    g.fillStyle = "#262b29";
    g.fillRect(p.x - 4 + Math.sin(ambient) * 6, p.y, 8, 13);
    g.restore();
}

function draw() {
    drawBackground();
    g.save();
    if (shake && !reduced) g.translate(Math.round(rnd(-shake, shake)), Math.round(rnd(-shake, shake)));
    if (mode === "title") {
        drawEnemy({
            x: W * .77,
            y: H * .36,
            type: 2,
            r: 26,
            born: 0,
            angle: 0,
            state: 0,
            clock: 1,
            hit: 0
        });
        drawUnicorn(W * .67, H * .61, -.7);
        drawEnemy({
            x: W * .84,
            y: H * .68,
            type: 0,
            r: 18,
            born: 0,
            angle: 0,
            state: 0,
            clock: 1,
            hit: 0
        });
        drawEnemy({
            x: W * .54,
            y: H * .78,
            type: 1,
            r: 22,
            born: 0,
            angle: -1.1,
            state: 0,
            clock: 1,
            hit: 0
        });
        g.restore();
        return;
    }
    for (const l of trails) {
        g.globalAlpha = clamp(l.life / l.max, 0, 1);
        const dx = l.x2 - l.x, dy = l.y2 - l.y, n = Math.hypot(dx, dy) || 1;
        for (let i = 0; i < 7; i++) {
            const o = (i - 3) * 3;
            floorLine(l.x - dy / n * o, l.y + dx / n * o, l.x2 - dy / n * o, l.y2 + dx / n * o, rainbow[i], 4, 2);
        }
    }
    g.globalAlpha = 1;
    const actors = enemies.filter(e => !e.dead).map(e => ({
        y: e.y,
        draw: () => drawEnemy(e)
    }));
    for (const p of pickups) actors.push({y:p.y, draw:()=>drawPickup(p)});
    if (boss) actors.push({
        y: boss.y,
        draw: drawBoss
    });
    if (player && mode !== "dead") actors.push({
        y: player.y,
        draw: () => {
            g.save();
            if (player.inv > 0 && player.dash <= 0 && Math.sin(ambient * 25) > 0) g.globalAlpha = .25;
            drawUnicorn(player.x, player.y, player.angle, player.dash > 0);
            g.restore();
            if (player.inv > 0) {
                const p = project(player.x, player.y, 100);
                g.font = "bold 11px monospace";
                g.textAlign = "center";
                g.fillStyle = "#a6ffeb";
                g.fillText("SHIELD", p.x, p.y);
            }
            if (player.cooldown <= 0) {
                const p = project(player.x, player.y, 72);
                g.fillStyle = "#d1ddb0";
                g.fillRect(p.x - 7, p.y, 14, 2);
            }
        }
    });
    actors.sort((a, b) => a.y - b.y).forEach(a => a.draw());
    for (const s of shots) {
        floorLine(s.x - s.vx * .017, s.y - s.vy * .017, s.x, s.y, overdrive > 0 ? rainbow[Math.floor(ambient * 15) % 7] : "#eddfad", 3, 25);
    }
    for (const b of bullets) {
        const p = project(b.x, b.y, 22);
        g.fillStyle = "#603d3a";
        g.fillRect(p.x - b.r - 2, p.y - b.r - 2, b.r * 2 + 4, b.r * 2 + 4);
        g.fillStyle = "#dba282";
        g.fillRect(p.x - b.r, p.y - b.r, b.r * 2, b.r * 2);
        g.fillStyle = "#ecd5a2";
        g.fillRect(p.x - 2, p.y - 2, 3, 3);
    }
    for (const r of rings) {
        const p = project(r.x, r.y);
        g.globalAlpha = r.life / r.max;
        g.beginPath();
        g.ellipse(p.x, p.y, r.r * (1 - r.life / r.max), r.r * .72 * (1 - r.life / r.max), 0, 0, TAU);
        g.strokeStyle = r.color;
        g.lineWidth = 2;
        g.stroke();
    }
    g.globalAlpha = 1;
    for (const p of particles) {
        const a = project(p.x, p.y, 18);
        g.globalAlpha = Math.max(0, p.life / p.max);
        g.fillStyle = p.color;
        g.fillRect(a.x, a.y, Math.ceil(p.size * 1.3), Math.ceil(p.size * 1.3));
    }
    g.globalAlpha = 1;
    for (const a of texts) {
        const p = project(a.x, a.y, 50);
        g.globalAlpha = Math.min(1, a.life * 2);
        g.font = "bold " + a.size + "px monospace";
        g.textAlign = "center";
        g.fillStyle = "#20291e";
        g.fillText(a.value, p.x + 2, p.y + 2);
        g.fillStyle = a.color;
        g.fillText(a.value, p.x, p.y);
    }
    g.globalAlpha = 1;
    g.restore();
    if (aim.active && mode === "playing") {
        g.fillStyle = "#eee4bf";
        g.fillRect(aim.sx - 9, aim.sy - 1, 5, 2); g.fillRect(aim.sx + 4, aim.sy - 1, 5, 2);
        g.fillRect(aim.sx - 1, aim.sy - 9, 2, 5); g.fillRect(aim.sx - 1, aim.sy + 4, 2, 5);
    }
    if (flash > 0) {
        g.strokeStyle = "#a45443";
        g.lineWidth = 12;
        g.strokeRect(6, 6, W - 12, H - 12);
    }
}

function frame(now) {
    if (!lastFrame) lastFrame = now;
    const delta = Math.min(.05, (now - lastFrame) / 1e3);
    lastFrame = now;
    accumulator += delta;
    while (accumulator >= 1 / 120) {
        step(1 / 120);
        accumulator -= 1 / 120;
    }
    draw();
    requestAnimationFrame(frame);
}

const moveKeys = [ "w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight" ];

window.addEventListener("keydown", e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ([ " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab" ].includes(k) && k !== "Tab") e.preventDefault();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === "m" && !e.repeat) {
        toggleMute();
        return;
    }
    if (k === "f" && !e.repeat) {
        fullscreen();
        return;
    }
    if (k === "r" && !e.repeat && mode !== "title" && resultDelay <= 0) {
        startGame();
        return;
    }
    if ([ "p", "Escape" ].includes(k) && !e.repeat) {
        if (mode === "playing") pauseGame(); else if (mode === "paused") resumeGame();
        return;
    }
    if (mode === "title" && (k === "Enter" || k === " " || moveKeys.includes(k))) {
        startGame();
        if (moveKeys.includes(k)) keys.add(k);
        return;
    }
    if ([ "dead", "victory" ].includes(mode) && k === "Enter") {
        if (!e.repeat && resultDelay <= 0) startGame();
        return;
    }
    if (mode === "paused" && k === "Enter") {
        resumeGame();
        return;
    }
    if (mode !== "playing") return;
    keys.add(k);
    if (k === "x" && !e.repeat) fire();
    if ((k === " " || k === "Shift") && !e.repeat) dashBuffer = .16;
});

window.addEventListener("keyup", e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));

window.addEventListener("blur", () => {
    keys.clear();
    firing = false;
    if (mode === "playing") pauseGame();
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden && mode === "playing") pauseGame();
});

window.addEventListener("resize", resize);

function toggleMute() {
    muted = !muted;
    $("mute").textContent = muted ? "♪" : "♫";
    $("mute").style.opacity = muted ? .45 : 1;
    $("mute").setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    if (!muted) {
        audioInit();
        tone(660);
    }
    music();
}

function fullscreen() {
    try {
        const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        p?.catch(() => {});
    } catch {}
}

$("start").onclick = startGame;

$("back").onclick = title;

$("mute").onclick = toggleMute;

$("pause").onclick = () => mode === "playing" ? pauseGame() : mode === "paused" ? resumeGame() : null;

$("fullscreen").onclick = fullscreen;

// Convert the cursor from the oblique display into the projectile plane.
function setAim(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / scale, sy = (e.clientY - rect.top) / scale;
    const y = H * .51 + (sy + 25 - H * .51) / .72;
    aim = { sx, sy, x: W / 2 + (sx - W / 2 - (y - H * .51) * .12) / .83, y, active: true };
}
canvas.addEventListener("pointermove", setAim);
canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0 || mode !== "playing") return;
    setAim(e); firing = true; audioInit(); fire(); canvas.focus({preventScroll: true});
});
window.addEventListener("pointerup", () => { firing = false; });
canvas.addEventListener("pointercancel", () => { firing = false; });
canvas.addEventListener("pointerleave", () => { firing = false; });

pixelHeading("logo", "HORN.");
resize();

requestAnimationFrame(frame);
