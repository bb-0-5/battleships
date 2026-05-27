const GRID = 8;
const CELL = 60;

const localCanvas = document.getElementById("localCanvas");
const probCanvas = document.getElementById("probCanvas");

const lctx = localCanvas.getContext("2d");
const pctx = probCanvas.getContext("2d");

const movesLeftEl = document.getElementById("movesLeft");
const signalStateEl = document.getElementById("signalState");
const turnTextEl = document.getElementById("turnText");
const selectedTextEl = document.getElementById("selectedText");
const matrixTextEl = document.getElementById("matrixText");
const logEl = document.getElementById("log");

const sonarBtn = document.getElementById("sonarBtn");
const sendIntelBtn = document.getElementById("sendIntelBtn");
const fireBtn = document.getElementById("fireBtn");
const endTurnBtn = document.getElementById("endTurnBtn");
const radioBtn = document.getElementById("radioBtn");
const radioInput = document.getElementById("radioInput");

let turn = 1;
let selectedFriendlyId = "scout";
let selectedTile = null;
let legalMoveTiles = [];
let lastSonar = null;
let radioUsed = false;
let gameOver = false;

const roleStats = {
  BASE: {
    move: 0,
    sight: 3,
    color: "#39ff88",
    canSonar: false,
    canFire: true
  },
  SCOUT: {
    move: 3,
    sight: 2,
    color: "#39d9ff",
    canSonar: true,
    canFire: false
  },
  MINE_SCOUT: {
    move: 2,
    sight: 2,
    color: "#ffff66",
    canSonar: true,
    canFire: false
  },
  SIGNAL: {
    move: 2,
    sight: 1,
    color: "#ff66ff",
    canSonar: false,
    canFire: false
  }
};

let friendlies = [
  {
    id: "base",
    role: "BASE",
    name: "BASE",
    x: 1,
    y: 1,
    alive: true,
    movesLeft: 0
  },
  {
    id: "scout",
    role: "SCOUT",
    name: "SCOUT",
    x: 1,
    y: 6,
    alive: true,
    movesLeft: 3
  },
  {
    id: "mineScout",
    role: "MINE_SCOUT",
    name: "MINE",
    x: 2,
    y: 6,
    alive: true,
    movesLeft: 2
  },
  {
    id: "signal",
    role: "SIGNAL",
    name: "SIG",
    x: 1,
    y: 5,
    alive: true,
    movesLeft: 2
  }
];

let enemies = [
  {
    id: "E1",
    type: "SUB",
    x: 6,
    y: 1,
    alive: true
  },
  {
    id: "E2",
    type: "DECOY",
    x: 5,
    y: 2,
    alive: true
  },
  {
    id: "E3",
    type: "EW",
    x: 6,
    y: 3,
    alive: true
  }
];

let land = [
  { x: 3, y: 1 },
  { x: 3, y: 2 },
  { x: 3, y: 3 },
  { x: 4, y: 3 },
  { x: 5, y: 5 },
  { x: 5, y: 6 }
];

let mines = [
  { x: 2, y: 4, active: true, team: "enemy" },
  { x: 4, y: 4, active: true, team: "enemy" },
  { x: 6, y: 5, active: true, team: "enemy" }
];

let messages = [];
let matrix = [];

function makeCell() {
  return {
    p: 1 / (GRID * GRID),
    source: "prior",
    age: 0,
    contradiction: 0
  };
}

function initMatrix() {
  matrix = [];

  for (let y = 0; y < GRID; y++) {
    matrix[y] = [];

    for (let x = 0; x < GRID; x++) {
      matrix[y][x] = makeCell();

      if (isLand(x, y)) {
        matrix[y][x].p = 0;
        matrix[y][x].source = "land";
      }
    }
  }

  normalizeMatrix();
}

function log(text) {
  logEl.innerHTML =
    "[TURN " + turn + "] " +
    text +
    "<br>" +
    logEl.innerHTML;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function gridDist(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isLand(x, y) {
  return land.some(t => t.x === x && t.y === y);
}

function getFriendly(id) {
  return friendlies.find(f => f.id === id);
}

function selectedFriendly() {
  return getFriendly(selectedFriendlyId);
}

function aliveFriendlies() {
  return friendlies.filter(f => f.alive);
}

function aliveEnemies() {
  return enemies.filter(e => e.alive);
}

function friendlyAt(x, y) {
  return friendlies.find(
    f => f.alive && f.x === x && f.y === y
  );
}

function enemyAt(x, y) {
  return enemies.find(
    e => e.alive && e.x === x && e.y === y
  );
}

function activeMineAt(x, y) {
  return mines.find(
    m => m.active && m.x === x && m.y === y
  );
}

function signalShipAlive() {
  return friendlies.some(
    f => f.alive && f.role === "SIGNAL"
  );
}

function radioDelay() {
  let base = 2 + Math.floor(Math.random() * 3);

  if (signalShipAlive()) {
    base = Math.max(1, base - 1);
  }

  return base;
}

function visibleCells() {
  let visible = new Set();

  for (let f of aliveFriendlies()) {
    let sight = roleStats[f.role].sight;

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        let d =
          Math.abs(f.x - x) +
          Math.abs(f.y - y);

        if (d <= sight) {
          visible.add(x + "," + y);
        }
      }
    }
  }

  return visible;
}

function isVisible(x, y) {
  return visibleCells().has(x + "," + y);
}

function normalizeMatrix() {
  let total = 0;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!isLand(x, y)) {
        total += matrix[y][x].p;
      }
    }
  }

  if (total <= 0) {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        matrix[y][x].p = isLand(x, y) ? 0 : 1;
      }
    }

    normalizeMatrix();
    return;
  }

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (isLand(x, y)) {
        matrix[y][x].p = 0;
      } else {
        matrix[y][x].p /= total;
      }
    }
  }
}

function diffuseMatrix() {
  let next = [];

  for (let y = 0; y < GRID; y++) {
    next[y] = [];

    for (let x = 0; x < GRID; x++) {
      next[y][x] = {
        p: 0,
        source: matrix[y][x].source,
        age: matrix[y][x].age + 1,
        contradiction: matrix[y][x].contradiction * 0.92
      };
    }
  }

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (isLand(x, y)) {
        continue;
      }

      let cell = matrix[y][x];

      let moves = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];

      let valid = [];

      for (let m of moves) {
        let nx = x + m[0];
        let ny = y + m[1];

        if (
          nx >= 0 &&
          nx < GRID &&
          ny >= 0 &&
          ny < GRID &&
          !isLand(nx, ny)
        ) {
          valid.push([nx, ny]);
        }
      }

      let share = cell.p / valid.length;

      for (let v of valid) {
        next[v[1]][v[0]].p += share;
      }
    }
  }

  matrix = next;
  normalizeMatrix();
}

function computeLegalMoves(ship) {
  let legal = [];

  if (!ship || !ship.alive) {
    return legal;
  }

  if (ship.movesLeft <= 0) {
    return legal;
  }

  let dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (let d of dirs) {
    let nx = ship.x + d[0];
    let ny = ship.y + d[1];

    if (
      nx < 0 ||
      nx >= GRID ||
      ny < 0 ||
      ny >= GRID
    ) {
      continue;
    }

    if (isLand(nx, ny)) {
      continue;
    }

    if (friendlyAt(nx, ny)) {
      continue;
    }

    legal.push({
      x: nx,
      y: ny
    });
  }

  return legal;
}

function selectFriendly(ship) {
  selectedFriendlyId = ship.id;
  selectedTile = {
    x: ship.x,
    y: ship.y
  };
  legalMoveTiles = computeLegalMoves(ship);

  log("SELECTED " + ship.role);
  redraw();
}

function tileIsLegalMove(x, y) {
  return legalMoveTiles.some(
    t => t.x === x && t.y === y
  );
}

function moveFriendlyTo(ship, x, y) {
  if (!tileIsLegalMove(x, y)) {
    selectedTile = { x, y };
    log("TARGET SELECTED " + x + "," + y);
    redraw();
    return;
  }

  let enemy = enemyAt(x, y);

  ship.x = x;
  ship.y = y;
  ship.movesLeft--;

  if (enemy) {
    ship.alive = false;
    enemy.alive = false;

    log(
      "COLLISION: " +
      ship.role +
      " RAMMED " +
      enemy.type +
      ". BOTH DESTROYED."
    );
  }

  let mine = activeMineAt(x, y);

  if (mine) {
    if (ship.role === "MINE_SCOUT") {
      mine.active = false;
      log("MINE SCOUT CLEARED MINE AT " + x + "," + y);
    } else {
      mine.active = false;
      ship.alive = false;
      log(ship.role + " HIT MINE AT " + x + "," + y);
    }
  }

  selectedTile = { x, y };
  legalMoveTiles = computeLegalMoves(ship);

  redraw();
}

function closestEnemyDistanceFrom(origin) {
  let best = 999;

  for (let e of aliveEnemies()) {
    best = Math.min(
      best,
      gridDist(origin, e)
    );
  }

  return best;
}

function applySonarIntel(report) {
  let matches = [];

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (isLand(x, y)) {
        continue;
      }

      let d =
        Math.abs(report.originX - x) +
        Math.abs(report.originY - y);

      if (d === report.range) {
        matches.push({ x, y });
      }
    }
  }

  if (matches.length === 0) {
    log("SONAR INTEL USELESS");
    return;
  }

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (isLand(x, y)) {
        continue;
      }

      let cell = matrix[y][x];

      let onRing = matches.some(
        c => c.x === x && c.y === y
      );

      if (onRing) {
        cell.p *= 3.0;
        cell.source = "sonar";
        cell.age = 0;
      } else {
        if (cell.p > 0.035) {
          cell.contradiction += 0.08;
        }

        cell.p *= 0.72;
      }
    }
  }

  normalizeMatrix();

  matrixTextEl.textContent =
    "Matrix updated from sonar range " +
    report.range;

  log("COMMAND MATRIX UPDATED FROM SONAR");
}

function applyVisualIntel() {
  for (let e of aliveEnemies()) {
    if (!isVisible(e.x, e.y)) {
      continue;
    }

    let cell = matrix[e.y][e.x];

    cell.p += 2.5;
    cell.source = "visual";
    cell.age = 0;
    cell.contradiction = 0;

    log(
      "VISUAL CONTACT: " +
      e.type +
      " AT " +
      e.x +
      "," +
      e.y
    );
  }

  normalizeMatrix();
}

function applyTorpedoResult(msg) {
  let cell = matrix[msg.y][msg.x];

  if (msg.hit) {
    cell.p += 2.5;
    cell.source = "torpedo";
    cell.age = 0;

    log("CONFIRMED HIT AT " + msg.x + "," + msg.y);
  } else {
    cell.p *= 0.05;
    cell.source = "miss";
    cell.contradiction += 0.65;

    log("MISS CONFIRMED AT " + msg.x + "," + msg.y);
  }

  normalizeMatrix();
}

function resolveTorpedo(msg) {
  let enemy = enemyAt(msg.x, msg.y);
  let hit = false;

  if (enemy) {
    enemy.alive = false;
    hit = true;

    log(
      "CONTACT DESTROYED: " +
      enemy.type +
      " AT " +
      msg.x +
      "," +
      msg.y
    );

    if (enemy.type === "SUB") {
      gameOver = true;
      log("PRIMARY ENEMY SUB DESTROYED. WIN.");
    }
  }

  applyTorpedoResult({
    x: msg.x,
    y: msg.y,
    hit
  });
}

function processMessages() {
  for (let msg of messages) {
    if (msg.done) {
      continue;
    }

    if (msg.arriveTurn > turn) {
      continue;
    }

    msg.done = true;

    if (msg.jammed) {
      log("MESSAGE LOST TO JAMMING: " + msg.type);
      continue;
    }

    if (msg.type === "sonar") {
      applySonarIntel(msg);
    }

    if (msg.type === "torpedo") {
      resolveTorpedo(msg);
    }

    if (msg.type === "radio") {
      log("RADIO RECEIVED: '" + msg.text + "'");

      if (msg.intercepted) {
        log("WARNING: ENEMY INTERCEPTED RADIO TRAFFIC");
      }
    }
  }
}

function buildAIContext() {
  return {
    grid: GRID,
    friendlies,
    enemies,
    matrix,
    isLand,
    isVisible
  };
}

function rememberAI(type, note, data = {}) {
  if (!window.TruthShipsAI) {
    return;
  }

  window.TruthShipsAI.remember({
    turn,
    type,
    note,
    data
  });
}
function moveEnemies() {
  if (gameOver) {
    return;
  }

  for (let e of aliveEnemies()) {
    let move;

    if (window.TruthShipsAI) {
      move = window.TruthShipsAI.chooseEnemyMove(
        e,
        buildAIContext()
      );
    } else {
      let dirs = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];

      let d =
        dirs[Math.floor(Math.random() * dirs.length)];

      move = {
        dx: d[0],
        dy: d[1]
      };
    }

    let nx = clamp(e.x + move.dx, 0, GRID - 1);
    let ny = clamp(e.y + move.dy, 0, GRID - 1);

    if (!isLand(nx, ny)) {
      e.x = nx;
      e.y = ny;
    }

    rememberAI(
      "enemy_move",
      e.type + " moved",
      {
        enemy: e.id,
        x: e.x,
        y: e.y
      }
    );

    let friendly = friendlyAt(e.x, e.y);

    if (friendly) {
      friendly.alive = false;
      e.alive = false;

      log(
        "ENEMY COLLISION: " +
        e.type +
        " DESTROYED " +
        friendly.role +
        ". BOTH LOST."
      );

      rememberAI(
        "collision",
        "Enemy collided with friendly",
        {
          enemy: e.type,
          friendly: friendly.role,
          x: e.x,
          y: e.y
        }
      );
    }
  }
}

  for (let e of aliveEnemies()) {
    let dirs = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    let d =
      dirs[Math.floor(Math.random() * dirs.length)];

    let nx = clamp(e.x + d[0], 0, GRID - 1);
    let ny = clamp(e.y + d[1], 0, GRID - 1);

    if (!isLand(nx, ny)) {
      e.x = nx;
      e.y = ny;
    }

    let friendly = friendlyAt(e.x, e.y);

    if (friendly) {
      friendly.alive = false;
      e.alive = false;

      log(
        "ENEMY COLLISION: " +
        e.type +
        " DESTROYED " +
        friendly.role +
        ". BOTH LOST."
      );
    }
  }
}

function resetFriendlyMoves() {
  for (let f of friendlies) {
    f.movesLeft = f.alive ? roleStats[f.role].move : 0;
  }
}

function drawGrid(ctx) {
  ctx.clearRect(0, 0, GRID * CELL, GRID * CELL);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      ctx.strokeStyle = "rgba(57,255,136,0.42)";
      ctx.strokeRect(
        x * CELL,
        y * CELL,
        CELL,
        CELL
      );

      ctx.fillStyle = "rgba(57,255,136,0.7)";
      ctx.font = "10px monospace";
      ctx.fillText(
        x + "," + y,
        x * CELL + 16,
        y * CELL + 34
      );
    }
  }
}

function drawLand(ctx) {
  for (let t of land) {
    ctx.fillStyle = "#24441f";
    ctx.fillRect(
      t.x * CELL + 3,
      t.y * CELL + 3,
      CELL - 6,
      CELL - 6
    );

    ctx.fillStyle = "#b6ffd1";
    ctx.font = "10px monospace";
    ctx.fillText(
      "LAND",
      t.x * CELL + 14,
      t.y * CELL + 32
    );
  }
}

function drawLegalMoves(ctx) {
  for (let t of legalMoveTiles) {
    ctx.fillStyle = "rgba(255,255,102,0.25)";
    ctx.fillRect(
      t.x * CELL + 5,
      t.y * CELL + 5,
      CELL - 10,
      CELL - 10
    );

    ctx.strokeStyle = "#ffff66";
    ctx.strokeRect(
      t.x * CELL + 5,
      t.y * CELL + 5,
      CELL - 10,
      CELL - 10
    );
  }
}

function drawFog(ctx) {
  let visible = visibleCells();

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!visible.has(x + "," + y)) {
        ctx.fillStyle = "rgba(0,0,0,0.72)";
        ctx.fillRect(
          x * CELL,
          y * CELL,
          CELL,
          CELL
        );
      }
    }
  }
}

function drawFriendlies(ctx) {
  for (let f of friendlies) {
    if (!f.alive) {
      continue;
    }

    let stats = roleStats[f.role];

    ctx.strokeStyle = stats.color;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(
      f.x * CELL + CELL / 2,
      f.y * CELL + CELL / 2,
      stats.sight * CELL,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = stats.color;
    ctx.beginPath();
    ctx.arc(
      f.x * CELL + CELL / 2,
      f.y * CELL + CELL / 2,
      18,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = "#001006";
    ctx.font = "10px monospace";
    ctx.fillText(
      f.name,
      f.x * CELL + 12,
      f.y * CELL + 34
    );

    if (f.id === selectedFriendlyId) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.strokeRect(
        f.x * CELL + 7,
        f.y * CELL + 7,
        CELL - 14,
        CELL - 14
      );
      ctx.lineWidth = 1;
    }
  }
}

function drawVisibleEnemies(ctx) {
  for (let e of aliveEnemies()) {
    if (!isVisible(e.x, e.y)) {
      continue;
    }

    if (e.type === "SUB") ctx.fillStyle = "#ff4040";
    if (e.type === "DECOY") ctx.fillStyle = "#ffaa00";
    if (e.type === "EW") ctx.fillStyle = "#ff00ff";

    ctx.beginPath();
    ctx.arc(
      e.x * CELL + CELL / 2,
      e.y * CELL + CELL / 2,
      18,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "10px monospace";
    ctx.fillText(
      e.type,
      e.x * CELL + 8,
      e.y * CELL + 20
    );
  }
}

function drawVisibleMines(ctx) {
  let mineScout = friendlies.find(
    f => f.alive && f.role === "MINE_SCOUT"
  );

  if (!mineScout) {
    return;
  }

  for (let m of mines) {
    if (!m.active) {
      continue;
    }

    let d =
      Math.abs(mineScout.x - m.x) +
      Math.abs(mineScout.y - m.y);

    if (d <= roleStats.MINE_SCOUT.sight) {
      ctx.fillStyle = "#ffcc00";
      ctx.fillRect(
        m.x * CELL + 20,
        m.y * CELL + 20,
        20,
        20
      );

      ctx.fillStyle = "#000000";
      ctx.font = "10px monospace";
      ctx.fillText(
        "M",
        m.x * CELL + 27,
        m.y * CELL + 34
      );
    }
  }
}

function drawSelectedTarget(ctx) {
  if (!selectedTile) {
    return;
  }

  ctx.strokeStyle = "#ffff66";
  ctx.lineWidth = 4;
  ctx.strokeRect(
    selectedTile.x * CELL + 4,
    selectedTile.y * CELL + 4,
    CELL - 8,
    CELL - 8
  );
  ctx.lineWidth = 1;
}
function drawSonarRing(ctx) {
  if (!lastSonar) {
    return;
  }

  ctx.strokeStyle = "#ffff66";
  ctx.lineWidth = 3;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let d =
        Math.abs(lastSonar.originX - x) +
        Math.abs(lastSonar.originY - y);

      if (d === lastSonar.range && !isLand(x, y)) {
        ctx.fillStyle = "rgba(255,255,102,0.18)";
        ctx.fillRect(
          x * CELL + 5,
          y * CELL + 5,
          CELL - 10,
          CELL - 10
        );

        ctx.strokeRect(
          x * CELL + 5,
          y * CELL + 5,
          CELL - 10,
          CELL - 10
        );
      }
    }
  }

  ctx.lineWidth = 1;
}
function drawScoutView() {
  drawGrid(lctx);
  drawLand(lctx);
  drawSonarRing(lctx);
  drawLegalMoves(lctx);
  drawSelectedTarget(lctx);
  drawFriendlies(lctx);
  drawVisibleEnemies(lctx);
  drawVisibleMines(lctx);
  drawFog(lctx);
}
function drawProbabilityMatrix() {
  drawGrid(pctx);
  drawLand(pctx);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (isLand(x, y)) {
        continue;
      }

      let cell = matrix[y][x];
      let alpha = clamp(cell.p * 12, 0, 0.92);

      if (cell.contradiction > 0.35) {
        pctx.fillStyle =
          "rgba(255,0,255," + alpha + ")";
      } else {
        pctx.fillStyle =
          "rgba(255,40,40," + alpha + ")";
      }

      pctx.fillRect(
        x * CELL + 4,
        y * CELL + 4,
        CELL - 8,
        CELL - 8
      );

      if (cell.p > 0.01) {
        pctx.fillStyle = "#ffffff";
        pctx.font = "10px monospace";
        pctx.fillText(
          Math.round(cell.p * 100) + "%",
          x * CELL + 17,
          y * CELL + 24
        );

        pctx.fillStyle = "#7dffad";
        pctx.fillText(
          cell.source,
          x * CELL + 8,
          y * CELL + 42
        );
      }
    }
  }

  drawSelectedTarget(pctx);
}

function redraw() {
  let f = selectedFriendly();

  drawScoutView();
  drawProbabilityMatrix();

  movesLeftEl.textContent = f ? f.movesLeft : 0;
  signalStateEl.textContent = radioUsed ? "USED" : "READY";
  turnTextEl.textContent = "TURN " + turn;

  if (selectedTile) {
    selectedTextEl.textContent =
      "Selected: " +
      selectedTile.x +
      "," +
      selectedTile.y;
  } else {
    selectedTextEl.textContent = "Selected: none";
  }
}

function canvasTileFromClick(canvas, event) {
  let rect = canvas.getBoundingClientRect();

  let scaleX = canvas.width / rect.width;
  let scaleY = canvas.height / rect.height;

  let mx = (event.clientX - rect.left) * scaleX;
  let my = (event.clientY - rect.top) * scaleY;

  return {
    x: Math.floor(mx / CELL),
    y: Math.floor(my / CELL)
  };
}

function handleLocalTap(event) {
  if (gameOver) {
    return;
  }

  let tile = canvasTileFromClick(localCanvas, event);

  if (
    tile.x < 0 ||
    tile.x >= GRID ||
    tile.y < 0 ||
    tile.y >= GRID
  ) {
    return;
  }

  let friendly = friendlyAt(tile.x, tile.y);

  if (friendly) {
    selectFriendly(friendly);
    return;
  }

  let ship = selectedFriendly();

  if (!ship || !ship.alive) {
    selectedTile = tile;
    redraw();
    return;
  }

  moveFriendlyTo(ship, tile.x, tile.y);
}

function handleProbTap(event) {
  let tile = canvasTileFromClick(probCanvas, event);

  selectedTile = tile;

  log("COMMAND TARGET MARKED " + tile.x + "," + tile.y);

  redraw();
}

function sonarPing() {
  if (gameOver) {
    return;
  }

  let ship = selectedFriendly();

  if (!ship || !ship.alive) {
    log("NO SELECTED SHIP");
    return;
  }

  if (!roleStats[ship.role].canSonar) {
    log(ship.role + " HAS NO SONAR ACTION");
    return;
  }

  let trueRange = closestEnemyDistanceFrom(ship);

  let noise =
    Math.floor(Math.random() * 3) - 1;

  if (Math.random() < 0.25) {
    noise += 2 + Math.floor(Math.random() * 3);
    log("WARNING: POSSIBLE FALSE ECHO");
  }

  let measured = Math.max(0, trueRange + noise);

  lastSonar = {
    range: measured,
    originX: ship.x,
    originY: ship.y,
    source: ship.role,
    turn
  };

  log(
    ship.role +
    " SONAR RETURN RANGE ≈ " +
    measured
  );

  redraw();
}

function sendIntel() {
  if (!lastSonar) {
    log("NO SONAR DATA TO SEND");
    return;
  }

  let delay = radioDelay();
  let jammed = Math.random() < 0.12;
  let intercepted = Math.random() < 0.25;

  messages.push({
    type: "sonar",
    range: lastSonar.range,
    originX: lastSonar.originX,
    originY: lastSonar.originY,
    sentTurn: turn,
    arriveTurn: turn + delay,
    jammed,
    intercepted,
    done: false
  });

  log("SONAR INTEL SENT. ETA " + delay + " TURNS");

  if (intercepted) {
    log("WARNING: SONAR INTEL MAY BE INTERCEPTED");
  }
}

function sendRadio() {
  if (radioUsed) {
    log("RADIO ALREADY USED THIS TURN");
    return;
  }

  let text = radioInput.value.trim();

  if (!text) {
    log("EMPTY RADIO MESSAGE");
    return;
  }

  let delay = radioDelay();
  let jammed = Math.random() < 0.2;
  let intercepted = Math.random() < 0.35;

  messages.push({
    type: "radio",
    text,
    sentTurn: turn,
    arriveTurn: turn + delay,
    jammed,
    intercepted,
    done: false
  });

  radioUsed = true;
  radioInput.value = "";

  log("RADIO SENT: '" + text + "' ETA " + delay);

  if (intercepted) {
    log("WARNING: RADIO MAY BE INTERCEPTED");
  }

  redraw();
}

function fireTorpedo() {
  if (gameOver) {
    return;
  }

  if (!selectedTile) {
    log("NO TARGET SELECTED");
    return;
  }

  let base = friendlies.find(
    f => f.alive && f.role === "BASE"
  );

  if (!base) {
    log("BASE DESTROYED. CANNOT FIRE.");
    return;
  }

  let delay = 2 + Math.floor(Math.random() * 2);

  messages.push({
    type: "torpedo",
    x: selectedTile.x,
    y: selectedTile.y,
    sentTurn: turn,
    arriveTurn: turn + delay,
    done: false
  });

  log(
    "BASE FIRED TORPEDO AT " +
    selectedTile.x +
    "," +
    selectedTile.y +
    ". IMPACT ETA " +
    delay
  );
}
function runCommandAI() {
  if (!window.TruthShipsAI) {
    return;
  }

  let suggestion =
    window.TruthShipsAI.suggestFriendlyAction(
      buildAIContext()
    );

  if (!suggestion) {
    return;
  }

  log("AI COMMAND: " + suggestion.text);

  rememberAI(
    "command_suggestion",
    suggestion.text,
    suggestion
  );
}
function endTurn() {
  if (gameOver) {
    log("GAME COMPLETE");
    return;
  }

  turn++;

  resetFriendlyMoves();
  radioUsed = false;

  diffuseMatrix();
  moveEnemies();
  processMessages();
  applyVisualIntel();
  runCommandAI();

  legalMoveTiles = computeLegalMoves(selectedFriendly());

  log("TURN ADVANCED. REALITY MOVED.");
  redraw();
}

function bindUI() {
  localCanvas.addEventListener("click", handleLocalTap);
  probCanvas.addEventListener("click", handleProbTap);

  sonarBtn.addEventListener("click", sonarPing);
  sendIntelBtn.addEventListener("click", sendIntel);
  fireBtn.addEventListener("click", fireTorpedo);
  endTurnBtn.addEventListener("click", endTurn);
  radioBtn.addEventListener("click", sendRadio);
}

initMatrix();
resetFriendlyMoves();
legalMoveTiles = computeLegalMoves(selectedFriendly());
bindUI();
redraw();

log("TRUTHSHIPS ONLINE.");
log("Tap friendly ship to select. Yellow tiles are legal moves.");
log("Mine scout detects and clears mines. Land blocks movement.");
