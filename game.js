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
let selectedTile = null;
let lastSonar = null;
let radioUsed = false;
let gameOver = false;

let scout = {
  x: 1,
  y: 6,
  moves: 3
};

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
    }
  }
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

function aliveEnemies() {
  return enemies.filter(e => e.alive);
}

function closestEnemyDistance() {
  let best = 999;

  for (let e of aliveEnemies()) {
    best = Math.min(
      best,
      gridDist(scout, e)
    );
  }

  return best;
}

function normalizeMatrix() {
  let total = 0;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      total += matrix[y][x].p;
    }
  }

  if (total <= 0) {
    initMatrix();
    return;
  }

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      matrix[y][x].p /= total;
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
      let cell = matrix[y][x];

      let moves = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];

      let share = cell.p / moves.length;

      for (let m of moves) {
        let nx = x + m[0];
        let ny = y + m[1];

        if (
          nx >= 0 &&
          nx < GRID &&
          ny >= 0 &&
          ny < GRID
        ) {
          next[ny][nx].p += share;
        }
      }
    }
  }

  matrix = next;
  normalizeMatrix();
}

function applySonarIntel(report) {
  let matches = [];

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let d =
        Math.abs(report.scoutX - x) +
        Math.abs(report.scoutY - y);

      if (d === report.range) {
        matches.push({ x, y });
      }
    }
  }

  if (matches.length === 0) {
    log("SONAR INTEL USELESS: no valid cells");
    return;
  }

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let cell = matrix[y][x];

      let onRing = matches.some(
        c => c.x === x && c.y === y
      );

      if (onRing) {
        cell.p *= 2.8;
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
    "Matrix updated from delayed sonar range " +
    report.range;

  log(
    "COMMAND MATRIX UPDATED: sonar ring range " +
    report.range
  );
}

function applyTorpedoResult(msg) {
  let cell = matrix[msg.y][msg.x];

  if (msg.hit) {
    cell.p += 2;
    cell.source = "torpedo";
    cell.age = 0;

    matrixTextEl.textContent =
      "Confirmed hit at " +
      msg.x +
      "," +
      msg.y;

    log("CONFIRMED HIT AT " + msg.x + "," + msg.y);
  } else {
    cell.p *= 0.05;
    cell.contradiction += 0.6;
    cell.source = "miss";

    matrixTextEl.textContent =
      "Miss confirmed at " +
      msg.x +
      "," +
      msg.y;

    log("TORPEDO MISS CONFIRMED AT " + msg.x + "," + msg.y);
  }

  normalizeMatrix();
}

function processMessages() {
  for (let msg of messages) {
    if (msg.done) continue;
    if (msg.arriveTurn > turn) continue;

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

function resolveTorpedo(msg) {
  let hit = false;

  for (let e of aliveEnemies()) {
    if (
      e.x === msg.x &&
      e.y === msg.y
    ) {
      e.alive = false;
      hit = true;

      log(
        "CONTACT DESTROYED: " +
        e.type +
        " at " +
        msg.x +
        "," +
        msg.y
      );

      if (e.type === "SUB") {
        gameOver = true;
        log("PRIMARY ENEMY SUB DESTROYED. WIN.");
      }

      break;
    }
  }

  applyTorpedoResult({
    x: msg.x,
    y: msg.y,
    hit
  });
}

function moveEnemies() {
  if (gameOver) return;

  for (let e of aliveEnemies()) {
    let dirs = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    let d = dirs[
      Math.floor(Math.random() * dirs.length)
    ];

    e.x = clamp(e.x + d[0], 0, GRID - 1);
    e.y = clamp(e.y + d[1], 0, GRID - 1);
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

function drawScoutView() {
  drawGrid(lctx);

  if (lastSonar) {
    lctx.strokeStyle = "#ffff66";
    lctx.lineWidth = 3;

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        let d =
          Math.abs(scout.x - x) +
          Math.abs(scout.y - y);

        if (d === lastSonar.range) {
          lctx.strokeRect(
            x * CELL + 5,
            y * CELL + 5,
            CELL - 10,
            CELL - 10
          );
        }
      }
    }

    lctx.lineWidth = 1;
  }

  if (selectedTile) {
    lctx.strokeStyle = "#ffff66";
    lctx.lineWidth = 4;
    lctx.strokeRect(
      selectedTile.x * CELL + 4,
      selectedTile.y * CELL + 4,
      CELL - 8,
      CELL - 8
    );
    lctx.lineWidth = 1;
  }

  lctx.fillStyle = "#39d9ff";
  lctx.beginPath();
  lctx.arc(
    scout.x * CELL + CELL / 2,
    scout.y * CELL + CELL / 2,
    18,
    0,
    Math.PI * 2
  );
  lctx.fill();

  lctx.fillStyle = "#001006";
  lctx.fillText(
    "S",
    scout.x * CELL + 27,
    scout.y * CELL + 34
  );

  for (let e of aliveEnemies()) {
    let d = gridDist(scout, e);

    if (d <= 1) {
      if (e.type === "SUB") lctx.fillStyle = "#ff4040";
      if (e.type === "DECOY") lctx.fillStyle = "#ffaa00";
      if (e.type === "EW") lctx.fillStyle = "#ff00ff";

      lctx.beginPath();
      lctx.arc(
        e.x * CELL + CELL / 2,
        e.y * CELL + CELL / 2,
        18,
        0,
        Math.PI * 2
      );
      lctx.fill();

      lctx.fillStyle = "#ffffff";
      lctx.font = "10px monospace";
      lctx.fillText(
        e.type,
        e.x * CELL + 8,
        e.y * CELL + 20
      );
    }
  }
}

function drawProbabilityMatrix() {
  drawGrid(pctx);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
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
}

function redraw() {
  drawScoutView();
  drawProbabilityMatrix();

  movesLeftEl.textContent = scout.moves;
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

function handleScoutTap(event) {
  if (gameOver) return;

  let tile = canvasTileFromClick(localCanvas, event);

  if (
    tile.x < 0 ||
    tile.x >= GRID ||
    tile.y < 0 ||
    tile.y >= GRID
  ) {
    return;
  }

  selectedTile = tile;

  let d =
    Math.abs(tile.x - scout.x) +
    Math.abs(tile.y - scout.y);

  if (d === 1 && scout.moves > 0) {
    scout.x = tile.x;
    scout.y = tile.y;
    scout.moves--;

    log("SCOUT MOVED TO " + tile.x + "," + tile.y);
  } else {
    log("TARGET SELECTED " + tile.x + "," + tile.y);
  }

  redraw();
}

function sonarPing() {
  if (gameOver) return;

  let trueRange = closestEnemyDistance();

  let noise =
    Math.floor(Math.random() * 3) - 1;

  if (Math.random() < 0.25) {
    noise += 2 + Math.floor(Math.random() * 3);
    log("WARNING: POSSIBLE FALSE ECHO");
  }

  let measured = Math.max(0, trueRange + noise);

  lastSonar = {
    range: measured,
    scoutX: scout.x,
    scoutY: scout.y,
    turn
  };

  log("SONAR RETURN RANGE ≈ " + measured);
  redraw();
}

function sendIntel() {
  if (!lastSonar) {
    log("NO SONAR DATA TO SEND");
    return;
  }

  let delay = 2 + Math.floor(Math.random() * 3);
  let jammed = Math.random() < 0.12;
  let intercepted = Math.random() < 0.25;

  messages.push({
    type: "sonar",
    range: lastSonar.range,
    scoutX: lastSonar.scoutX,
    scoutY: lastSonar.scoutY,
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

  let delay = 1 + Math.floor(Math.random() * 4);
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
  if (gameOver) return;

  if (!selectedTile) {
    log("NO TARGET SELECTED");
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
    "TORPEDO LAUNCHED AT " +
    selectedTile.x +
    "," +
    selectedTile.y +
    ". IMPACT ETA " +
    delay
  );
}

function endTurn() {
  if (gameOver) {
    log("GAME COMPLETE");
    return;
  }

  turn++;
  scout.moves = 3;
  radioUsed = false;

  diffuseMatrix();
  moveEnemies();
  processMessages();

  log("TURN ADVANCED. REALITY MOVED.");
  redraw();
}

function bindUI() {
  localCanvas.addEventListener("click", handleScoutTap);

  sonarBtn.addEventListener("click", sonarPing);
  sendIntelBtn.addEventListener("click", sendIntel);
  fireBtn.addEventListener("click", fireTorpedo);
  endTurnBtn.addEventListener("click", endTurn);
  radioBtn.addEventListener("click", sendRadio);
}

initMatrix();
bindUI();
redraw();

log("TRUTHSHIPS ONLINE.");
log("Scout sees locally. Command receives delayed probability.");
