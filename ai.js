const TruthShipsAI = {
  memoryKey: "truthships_ai_memory_v1",

  loadMemory() {
    try {
      return JSON.parse(
        localStorage.getItem(this.memoryKey)
      ) || [];
    } catch {
      return [];
    }
  },

  saveMemory(memory) {
    localStorage.setItem(
      this.memoryKey,
      JSON.stringify(memory.slice(-100))
    );
  },

  remember(event) {
    let memory = this.loadMemory();

    memory.push({
      turn: event.turn,
      type: event.type,
      note: event.note,
      data: event.data || {},
      time: Date.now()
    });

    this.saveMemory(memory);
  },

  chooseEnemyMove(enemy, context) {
    const dirs = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    let best = {
      dx: 0,
      dy: 0,
      score: -999
    };

    for (let d of dirs) {
      let nx = enemy.x + d[0];
      let ny = enemy.y + d[1];

      if (
        nx < 0 ||
        nx >= context.grid ||
        ny < 0 ||
        ny >= context.grid
      ) {
        continue;
      }

      if (context.isLand(nx, ny)) {
        continue;
      }

      let score = Math.random();

      // Prefer fog / unseen cells
      if (!context.isVisible(nx, ny)) {
        score += 2;
      }

      // Prefer moving away from friendlies
      for (let f of context.friendlies) {
        if (!f.alive) continue;

        let dist =
          Math.abs(nx - f.x) +
          Math.abs(ny - f.y);

        score += dist * 0.12;
      }

      // EW ships like staying close enough to interfere
      if (enemy.type === "EW") {
        for (let f of context.friendlies) {
          if (!f.alive) continue;

          let dist =
            Math.abs(nx - f.x) +
            Math.abs(ny - f.y);

          if (dist <= 3) {
            score += 0.6;
          }
        }
      }

      if (score > best.score) {
        best = {
          dx: d[0],
          dy: d[1],
          score
        };
      }
    }

    return best;
  },

  suggestFriendlyAction(context) {
    let highest = {
      x: 0,
      y: 0,
      p: 0
    };

    for (let y = 0; y < context.grid; y++) {
      for (let x = 0; x < context.grid; x++) {
        let cell = context.matrix[y][x];

        if (cell.p > highest.p) {
          highest = {
            x,
            y,
            p: cell.p
          };
        }
      }
    }

    if (highest.p > 0.08) {
      return {
        type: "FIRE_SUGGESTION",
        text:
          "Command AI suggests firing near " +
          highest.x +
          "," +
          highest.y +
          " probability " +
          Math.round(highest.p * 100) +
          "%"
      };
    }

    return {
      type: "SCOUT_SUGGESTION",
      text: "Command AI suggests more sonar intel before firing."
    };
  }
};

window.TruthShipsAI = TruthShipsAI;