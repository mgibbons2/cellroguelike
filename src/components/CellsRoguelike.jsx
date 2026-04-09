import { useReducer, useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════════
// CONSTANTS & THEME
// ═══════════════════════════════════════════════════════════
const COLORS = ["#e74c3c","#3498db","#2ecc71","#f1c40f","#9b59b6","#e67e22","#1abc9c","#fd79a8"];
const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const ALL_DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const MAX_TAPS = 3;
const MAP_LAYERS = 6;
const TOTAL_FLOORS = 3;

const T = {
  bg: "#0a0a0f", panel: "#141420", border: "#222238", dim: "#666",
  text: "#e0e0e0", bright: "#fff", accent: "#3498db", danger: "#e74c3c",
  gold: "#f1c40f", success: "#2ecc71", warn: "#e67e22",
};

// ═══════════════════════════════════════════════════════════
// BOARD UTILITIES
// ═══════════════════════════════════════════════════════════
const uid = () => Math.random().toString(36).slice(2, 8);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { const s=[...a]; for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];} return s; };
const cloneBoard = b => b.map(r => [...r]);
const inB = (r, c, sz) => r >= 0 && r < sz && c >= 0 && c < sz;

const isSolved = board => {
  const sz = board.length, v = board[0][0];
  for (let r = 0; r < sz; r++) for (let c = 0; c < sz; c++) if (board[r][c] !== v) return false;
  return true;
};

const getFlood = (board, r, c) => {
  const sz = board.length, color = board[r][c];
  const visited = new Set([`${r},${c}`]), stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    for (const [dr, dc] of DIRS) {
      const nr = cr+dr, nc = cc+dc, key = `${nr},${nc}`;
      if (inB(nr, nc, sz) && !visited.has(key) && board[nr][nc] === color) { visited.add(key); stack.push([nr, nc]); }
    }
  }
  return visited;
};

const mostCommonColor = board => {
  const sz = board.length, counts = {};
  for (let r=0;r<sz;r++) for (let c=0;c<sz;c++) counts[board[r][c]] = (counts[board[r][c]]||0)+1;
  return Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
};

const nextColor = (color, cycle) => cycle[(cycle.indexOf(color) + 1) % cycle.length];

const generateBoard = (size, numColors, lockedCount = 0) => {
  const colorCycle = shuffle(COLORS.slice(0, numColors));
  const board = Array.from({ length: size }, () => Array.from({ length: size }, () => pick(colorCycle)));
  const locked = Array.from({ length: size }, () => Array(size).fill(false));
  let placed = 0, attempts = 0;
  while (placed < lockedCount && attempts < size * size * 10) {
    attempts++;
    const r = Math.floor(Math.random()*size), c = Math.floor(Math.random()*size);
    if (locked[r][c]) continue;
    // Ensure minimum 2 spaces from any other lock (Manhattan distance > 2)
    let tooClose = false;
    for (let dr = -2; dr <= 2 && !tooClose; dr++) {
      for (let dc = -2; dc <= 2 && !tooClose; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (inB(nr, nc, size) && locked[nr][nc] && (Math.abs(dr) + Math.abs(dc)) <= 2) tooClose = true;
      }
    }
    if (!tooClose) { locked[r][c] = true; placed++; }
  }
  return { board, locked, colorCycle };
};

// ═══════════════════════════════════════════════════════════
// CARD EFFECT BUILDERS
// ═══════════════════════════════════════════════════════════
const paintCells = (board, locked, cells, color) => {
  const sz = board.length, b = cloneBoard(board);
  for (const key of cells) {
    const [r, c] = typeof key === "string" ? key.split(",").map(Number) : key;
    if (inB(r, c, sz) && !locked[r][c]) b[r][c] = color;
  }
  return b;
};
const paintArea = (radius) => (board, locked, { cell, color }) => {
  const cells = [];
  for (let dr=-radius;dr<=radius;dr++) for (let dc=-radius;dc<=radius;dc++) cells.push([cell[0]+dr,cell[1]+dc]);
  return paintCells(board, locked, cells, color);
};
const floodEffect = (board, locked, { cell, color }) =>
  paintCells(board, locked, getFlood(board, cell[0], cell[1]), color);
const cascadeEffect = (board, locked, { cell, color }) => {
  const flood = getFlood(board, cell[0], cell[1]);
  const sz = board.length, expanded = new Set(flood);
  for (const key of flood) { const [r,c]=key.split(",").map(Number); for (const [dr,dc] of DIRS) { const nr=r+dr,nc=c+dc; if(inB(nr,nc,sz)) expanded.add(`${nr},${nc}`); } }
  return paintCells(board, locked, expanded, color);
};
const swapCells = (board, locked, { cell, cell2 }) => {
  const b = cloneBoard(board);
  const [r1,c1] = cell, [r2,c2] = cell2;
  if (!locked[r1][c1] && !locked[r2][c2]) { const tmp = b[r1][c1]; b[r1][c1] = b[r2][c2]; b[r2][c2] = tmp; }
  return b;
};
const drainColor = (board, locked, { color, color2 }) => {
  const sz = board.length, b = cloneBoard(board);
  for (let r=0;r<sz;r++) for (let c=0;c<sz;c++) if (b[r][c]===color && !locked[r][c]) b[r][c]=color2;
  return b;
};
const rowEffect = (board, locked, { row, color }) => { const cells=[]; for(let c=0;c<board.length;c++) cells.push([row,c]); return paintCells(board,locked,cells,color); };
const colEffect = (board, locked, { col, color }) => { const cells=[]; for(let r=0;r<board.length;r++) cells.push([r,col]); return paintCells(board,locked,cells,color); };
const crossEffect = (board, locked, { cell, color }) => {
  const sz=board.length, cells=[]; for(let i=0;i<sz;i++){cells.push([cell[0],i]);cells.push([i,cell[1]]);} return paintCells(board,locked,cells,color);
};
const diagonalEffect = (board, locked, { cell, color }) => {
  const sz=board.length, cells=[]; for(let d=-sz;d<=sz;d++){cells.push([cell[0]+d,cell[1]+d]);cells.push([cell[0]+d,cell[1]-d]);} return paintCells(board,locked,cells,color);
};
const tsunamiEffect = (board, locked, { color }) => drainColor(board, locked, { color: mostCommonColor(board), color2: color });

// ═══════════════════════════════════════════════════════════
// CARD DEFINITIONS
// ═══════════════════════════════════════════════════════════
const CARDS = {
  flood_fill:     { name:"Flood Fill",     cost:1, rarity:"starter",   target:"cell+color",  effect:floodEffect,     desc:"Connected same-color cells become chosen color." },
  paint:          { name:"Paint",          cost:1, rarity:"starter",   target:"cell+color",  effect:paintArea(0),    desc:"Change one cell to any color." },
  color_swap:     { name:"Color Swap",     cost:2, rarity:"starter",   target:"2cell",       effect:swapCells,       desc:"Swap the colors of two cells." },
  row_wash:       { name:"Row Wash",       cost:2, rarity:"starter",   target:"row+color",   effect:rowEffect,       desc:"Paint an entire row one color." },
  col_wash:       { name:"Column Wash",    cost:2, rarity:"starter",   target:"col+color",   effect:colEffect,       desc:"Paint an entire column one color." },
  snipe:          { name:"Snipe",          cost:0, rarity:"starter",   target:"cell+color",  effect:paintArea(0),    desc:"Change one cell. Free and surgical." },
  energize:       { name:"Energize",       cost:0, rarity:"starter",   target:"none",        special:"energize",     desc:"Gain +1 energy this turn." },
  paint_bomb:     { name:"Paint Bomb",     cost:2, rarity:"common",    target:"cell+color",  effect:paintArea(1),    desc:"Paint a 3×3 area one color." },
  refresh:        { name:"Refresh",        cost:1, rarity:"common",    target:"none",        special:"refresh",      desc:"Discard hand, draw a new hand." },
  overtime:       { name:"Overtime",       cost:1, rarity:"common",    target:"none",        special:"overtime",     desc:"Draw 2 extra cards." },
  cascade:        { name:"Cascade",        cost:2, rarity:"uncommon",  target:"cell+color",  effect:cascadeEffect,   desc:"Flood fill + spread one extra step." },
  cross_wash:     { name:"Cross Wash",     cost:2, rarity:"uncommon",  target:"cell+color",  effect:crossEffect,     desc:"Paint a + shape through a cell." },
  diagonal_slash: { name:"Diagonal Slash", cost:2, rarity:"uncommon",  target:"cell+color",  effect:diagonalEffect,  desc:"Paint both diagonals through a cell." },
  battery:        { name:"Battery",        cost:0, rarity:"uncommon",  target:"none",        special:"battery",      desc:"Gain +2 energy this turn." },
  mirror:         { name:"Mirror",         cost:1, rarity:"uncommon",  target:"none",        special:"mirror",       desc:"Replay the last card's effect with a new target." },
  purify:         { name:"Purify",         cost:1, rarity:"uncommon",  target:"none",        special:"purify",       desc:"Unlock all locked cells." },
  color_drain:    { name:"Color Drain",    cost:3, rarity:"rare",      target:"2color",      effect:drainColor,      desc:"Convert all of one color to another." },
  mega_bomb:      { name:"Mega Bomb",      cost:3, rarity:"rare",      target:"cell+color",  effect:paintArea(2),    desc:"Paint a 5×5 area one color." },
  tsunami:        { name:"Tsunami",        cost:3, rarity:"rare",      target:"color",       effect:tsunamiEffect,   desc:"Most common color becomes your pick." },
};
const STARTER_DECK = ["flood_fill","flood_fill","flood_fill","paint","paint","color_swap","row_wash","col_wash","energize","snipe"];
const makeCard = id => ({ ...CARDS[id], id, uid: uid() });

// ═══════════════════════════════════════════════════════════
// ENEMY DEFINITIONS
// ═══════════════════════════════════════════════════════════
const ENEMY_ABILITIES = {
  row_paint:    { name:"Row Paint",   icon:"🎨", desc:"Paints a random row a random color",
    exec: (board, locked, enemy, colorCycle) => { const sz=board.length, b=cloneBoard(board), row=enemy.r, color=pick(colorCycle); for(let c=0;c<sz;c++) if(!locked[row][c]) b[row][c]=color; return b; },
    preview: (enemy, sz) => { const cells=[]; for(let c=0;c<sz;c++) cells.push(`${enemy.r},${c}`); return cells; },
  },
  col_paint:    { name:"Col Paint",   icon:"🖌", desc:"Paints a random column a random color",
    exec: (board, locked, enemy, colorCycle) => { const sz=board.length, b=cloneBoard(board), col=enemy.c, color=pick(colorCycle); for(let r=0;r<sz;r++) if(!locked[r][col]) b[r][col]=color; return b; },
    preview: (enemy, sz) => { const cells=[]; for(let r=0;r<sz;r++) cells.push(`${r},${enemy.c}`); return cells; },
  },
  spread:       { name:"Spread",      icon:"🟢", desc:"Paints adjacent cells a random color",
    exec: (board, locked, enemy, colorCycle) => { const sz=board.length, b=cloneBoard(board), color=pick(colorCycle); for(const [dr,dc] of DIRS){ const nr=enemy.r+dr,nc=enemy.c+dc; if(inB(nr,nc,sz)&&!locked[nr][nc]) b[nr][nc]=color; } return b; },
    preview: (enemy, sz) => { const cells=[]; for(const [dr,dc] of DIRS){ const nr=enemy.r+dr,nc=enemy.c+dc; if(inB(nr,nc,sz)) cells.push(`${nr},${nc}`); } return cells; },
  },
  scramble:     { name:"Scramble",    icon:"🎲", desc:"Randomizes colors of nearby cells",
    exec: (board, locked, enemy, colorCycle) => { const sz=board.length, b=cloneBoard(board); for(const [dr,dc] of ALL_DIRS){ const nr=enemy.r+dr,nc=enemy.c+dc; if(inB(nr,nc,sz)&&!locked[nr][nc]) b[nr][nc]=pick(colorCycle); } return b; },
    preview: (enemy, sz) => { const cells=[]; for(const [dr,dc] of ALL_DIRS){ const nr=enemy.r+dr,nc=enemy.c+dc; if(inB(nr,nc,sz)) cells.push(`${nr},${nc}`); } return cells; },
  },
  freeze:       { name:"Freeze",      icon:"🧊", desc:"Locks a random nearby cell",
    exec: (board, locked, enemy) => { const sz=board.length, targets=[]; for(const [dr,dc] of DIRS){ const nr=enemy.r+dr,nc=enemy.c+dc; if(inB(nr,nc,sz)&&!locked[nr][nc]) targets.push([nr,nc]); } if(targets.length){ const [r,c]=pick(targets); const nl=locked.map(r=>[...r]); nl[r][c]=true; return { board, locked:nl }; } return null; },
    preview: (enemy, sz) => { const cells=[]; for(const [dr,dc] of DIRS){ const nr=enemy.r+dr,nc=enemy.c+dc; if(inB(nr,nc,sz)) cells.push(`${nr},${nc}`); } return cells; },
    modifiesLocked: true,
  },
  shift_paint:  { name:"Shift Paint", icon:"👣", desc:"Paints its trail when moving",
    exec: (board, locked, enemy, colorCycle) => { const b=cloneBoard(board); if(enemy._prevR!==undefined && !locked[enemy._prevR][enemy._prevC]) b[enemy._prevR][enemy._prevC]=pick(colorCycle); return b; },
    preview: (enemy) => enemy._prevR!==undefined ? [`${enemy._prevR},${enemy._prevC}`] : [],
  },
};

const ENEMY_DEFS = {
  // Normal (1 ability, chain length 1)
  goblin:    { name:"Goblin",    sprite:"goblin",    abilities:["row_paint"],          chainLen:1 },
  slime:     { name:"Slime",     sprite:"slime",     abilities:["spread"],             chainLen:1 },
  trickster: { name:"Trickster", sprite:"trickster",  abilities:["scramble"],            chainLen:1 },
  sprite_e:  { name:"Sprite",    sprite:"sprite",    abilities:["col_paint"],           chainLen:1 },
  blob:      { name:"Blob",      sprite:"blob",      abilities:["shift_paint"],         chainLen:1 },
  // Elite (2 abilities, chain length 2-3)
  frost_mage:{ name:"Frost Mage",sprite:"frost_mage",abilities:["freeze","spread"],     chainLen:2 },
  brute:     { name:"Brute",     sprite:"brute",     abilities:["row_paint","scramble"], chainLen:2 },
  warden:    { name:"Warden",    sprite:"warden",    abilities:["freeze","col_paint"],   chainLen:3 },
  // Boss (2 abilities, chain length 3-4)
  overlord:  { name:"Overlord",  sprite:"overlord",  abilities:["scramble","freeze"],    chainLen:3 },
  destroyer: { name:"Destroyer", sprite:"destroyer",  abilities:["row_paint","col_paint"],chainLen:4 },
};

const NORMAL_ENEMIES = ["goblin","slime","trickster","sprite_e","blob"];
const ELITE_ENEMIES = ["frost_mage","brute","warden"];
const BOSS_ENEMIES = ["overlord","destroyer"];

const spawnEnemies = (board, locked, layer, nodeType, colorCycle, floor = 1) => {
  const sz = board.length;
  const gl = (floor - 1) * MAP_LAYERS + layer; // global progression
  // Determine count: starts at 1, scales with global layer
  let count = 1;
  if (nodeType === "boss") count = floor >= 2 ? 2 : 1;
  else if (nodeType === "elite") count = gl >= 6 ? 2 : 1;
  else count = gl >= 8 ? 2 : 1;
  if (count === 0) return [];

  const pool = nodeType === "boss" ? BOSS_ENEMIES : nodeType === "elite" ? ELITE_ENEMIES : NORMAL_ENEMIES;
  const enemies = [];
  const occupied = new Set();
  // Avoid edges for better gameplay
  for (let i = 0; i < count; i++) {
    let attempts = 0, r, c;
    do {
      r = 1 + Math.floor(Math.random() * (sz - 2));
      c = 1 + Math.floor(Math.random() * (sz - 2));
      attempts++;
    } while ((occupied.has(`${r},${c}`) || locked[r][c]) && attempts < 50);
    if (attempts >= 50) continue;
    occupied.add(`${r},${c}`);
    const defId = pick(pool);
    const def = ENEMY_DEFS[defId];
    // Build color chain — base length + floor scaling
    const chainLen = def.chainLen + (floor - 1);
    const chain = [];
    const available = colorCycle.filter(co => co !== board[r][c]);
    for (let j = 0; j < chainLen; j++) chain.push(pick(available.length ? available : colorCycle));
    enemies.push({ id: uid(), defId, r, c, chain, chainIdx: 0, turnCooldown: 0 });
  }
  return enemies;
};

const moveEnemy = (enemy, board, locked, enemies) => {
  const sz = board.length;
  const occupied = new Set(enemies.map(e => `${e.r},${e.c}`));
  const dirs = shuffle([...DIRS]);
  for (const [dr, dc] of dirs) {
    const nr = enemy.r + dr, nc = enemy.c + dc;
    if (inB(nr, nc, sz) && !locked[nr][nc] && !occupied.has(`${nr},${nc}`)) {
      return { ...enemy, r: nr, c: nc, _prevR: enemy.r, _prevC: enemy.c };
    }
  }
  return { ...enemy, _prevR: undefined, _prevC: undefined }; // stuck
};

// Split enemy turn into movement and abilities for animation
const processEnemyMove = (s) => {
  if (!s.enemies || s.enemies.length === 0) return s;
  let enemies = [...s.enemies];
  enemies = enemies.map(e => { const moved = moveEnemy(e, s.board, s.locked, enemies); return { ...moved, _spawning: false }; });
  return { ...s, enemies, enemyTurnPhase: "moving" };
};

const processEnemyAbilities = (s) => {
  if (!s.enemies || s.enemies.length === 0) return s;
  let board = cloneBoard(s.board);
  let locked = s.locked;
  const enemies = s.enemies;
  const affectedCells = new Set(); // track cells changed by abilities

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const def = ENEMY_DEFS[e.defId];
    const abilId = def.abilities[s.turn % def.abilities.length];
    const abil = ENEMY_ABILITIES[abilId];
    // Collect preview cells for visual flash
    if (abil.preview) {
      const preview = abil.preview(e, board.length);
      for (const cell of preview) affectedCells.add(cell);
    }
    if (abil.modifiesLocked) {
      const result = abil.exec(board, locked, e, s.colorCycle);
      if (result) { board = result.board || board; locked = result.locked || locked; }
    } else {
      board = abil.exec(board, locked, e, s.colorCycle);
    }
  }

  return { ...s, board, locked, enemyTurnPhase: "ability", _enemyAffectedCells: affectedCells };
};

// Spawn a reinforcement enemy mid-puzzle
const spawnReinforcement = (s) => {
  const { board, locked, enemies, colorCycle, currentNodeType, mapLayer } = s;
  if (!board || !enemies) return s;
  const sz = board.length;
  // Determine max enemies for this node type
  const maxEnemies = currentNodeType === "boss" ? 3 : currentNodeType === "elite" ? 3 : 2;
  if (enemies.length >= maxEnemies) return s;
  // Spawn interval: every 3 turns normally, every 2 for elite/boss
  const interval = (currentNodeType === "elite" || currentNodeType === "boss") ? 2 : 3;
  if (s.turn < interval || s.turn % interval !== 0) return s;
  const pool = currentNodeType === "boss" ? BOSS_ENEMIES : currentNodeType === "elite" ? ELITE_ENEMIES : NORMAL_ENEMIES;
  const occupied = new Set(enemies.map(e => `${e.r},${e.c}`));
  let attempts = 0, r, c;
  do {
    r = 1 + Math.floor(Math.random() * (sz - 2));
    c = 1 + Math.floor(Math.random() * (sz - 2));
    attempts++;
  } while ((occupied.has(`${r},${c}`) || locked[r][c]) && attempts < 50);
  if (attempts >= 50) return s;
  const defId = pick(pool);
  const def = ENEMY_DEFS[defId];
  const floorBonus = (s.floor || 1) - 1;
  const chainLen = def.chainLen + floorBonus;
  const chain = [];
  const available = colorCycle.filter(co => co !== board[r][c]);
  for (let j = 0; j < chainLen; j++) chain.push(pick(available.length ? available : colorCycle));
  const newEnemy = { id: uid(), defId, r, c, chain, chainIdx: 0, turnCooldown: 0, _spawning: true };
  return { ...s, enemies: [...enemies, newEnemy], message: `A ${def.name} appeared!` };
};

const finishEnemyTurn = (s) => {
  const afterSpawn = spawnReinforcement(s);
  const { deck, discard, drawn } = drawFrom(afterSpawn.deck, [...afterSpawn.discard, ...afterSpawn.hand], afterSpawn.handSize);
  return { ...afterSpawn, deck, discard, hand: drawn, energy: afterSpawn.maxEnergy, turn: afterSpawn.turn+1, taps: MAX_TAPS, targeting: null, highlight: new Set(), enemyTurnPhase: null, _enemyAffectedCells: null };
};

const checkEnemyDefeat = (s) => {
  if (!s.enemies || s.enemies.length === 0) return s;
  let gold = s.gold, enemies = [], message = s.message;
  for (const e of s.enemies) {
    const cellColor = s.board[e.r][e.c];
    if (e.chainIdx < e.chain.length && cellColor === e.chain[e.chainIdx]) {
      // Color matches the next step in the chain — advance!
      const next = { ...e, chainIdx: e.chainIdx + 1, _lastChainColor: cellColor };
      if (next.chainIdx >= next.chain.length) {
        // Defeated!
        const reward = 10 + Math.floor(Math.random() * 15);
        gold += reward;
        message = `Defeated ${ENEMY_DEFS[e.defId].name}! +${reward}g`;
      } else {
        enemies.push(next);
      }
    } else if (e.chainIdx > 0 && cellColor !== e._lastChainColor) {
      // Cell color was actively changed away from the last matched color — chain broken
      enemies.push({ ...e, chainIdx: 0, _lastChainColor: undefined });
    } else {
      enemies.push(e);
    }
  }
  return { ...s, enemies, gold, message };
};

const rollRewards = (layer, count = 3, guaranteeRare = false) => {
  const pool = Object.entries(CARDS).filter(([, c]) => c.rarity !== "starter");
  const w = { common: 10, uncommon: layer >= 4 ? 8 : 3, rare: layer >= 6 ? 6 : 1 };
  const weighted = pool.flatMap(([id, c]) => Array(w[c.rarity] || 1).fill(id));
  const picked = new Set(), result = [];
  if (guaranteeRare) { const rares = pool.filter(([,c])=>c.rarity==="rare").map(([id])=>id); if(rares.length){const r=pick(rares);picked.add(r);result.push(r);} }
  while (result.length < count && picked.size < pool.length) { const id=pick(weighted); if(!picked.has(id)){picked.add(id);result.push(id);} }
  return result;
};

// ═══════════════════════════════════════════════════════════
// NODE MAP
// ═══════════════════════════════════════════════════════════
const NODE_TYPES = {
  puzzle: { icon:"⚔", color:T.accent,  label:"Puzzle" },
  elite:  { icon:"★", color:T.danger,  label:"Elite" },
  reward: { icon:"◆", color:T.gold,    label:"Reward" },
  rest:   { icon:"♥", color:T.success, label:"Rest" },
  shop:   { icon:"$", color:T.warn,    label:"Shop" },
  boss:   { icon:"☠", color:"#ff6b6b", label:"Boss" },
};

const getNodeConfig = (layer, type, hard = false, floor = 1) => {
  const h = hard ? 1 : 0;
  // Global difficulty scales with floor: treat it as if progressing through more layers
  const gl = (floor - 1) * MAP_LAYERS + layer; // global layer for scaling
  return {
    size:      Math.min(5 + Math.floor(gl / 3) + h, 9),
    numColors: Math.min(3 + Math.floor((gl + 1) / 2) + h, 8),
    maxTurns:  Math.max(2, (type==="elite" ? 7 : type==="boss" ? 6 : 9 - h) - Math.floor(gl / 3)),
    locked:    (hard ? (gl >= 4 ? Math.min((gl - 3) * 2, 16) : 0) : (gl >= 5 ? Math.min((gl - 4) * 2, 12) : 0)),
  };
};

const generateMap = () => {
  // Tree structure: start(1) → combat(2) → combat/elite(2) → rest/shop(2) → combat(2) → boss(1)
  const layers = [];
  for (let i = 0; i < MAP_LAYERS; i++) {
    let count, typePool;
    if (i===0)                { count=1; typePool=["puzzle"]; }
    else if(i===MAP_LAYERS-1) { count=1; typePool=["boss"]; }
    else if(i===MAP_LAYERS-3) { count=2; typePool=["rest","shop"]; }
    else                      { count=2; typePool=null; }
    const nodes = [];
    for (let j=0;j<count;j++) {
      let type;
      if (typePool) type = typePool[j % typePool.length];
      else type = Math.random() < 0.2 ? "elite" : "puzzle";
      nodes.push({ type, conns:[] });
    }
    layers.push(nodes);
  }
  // Tree-like connections: each node connects to 1 next node, ensure all reachable
  for (let i=0;i<layers.length-1;i++) {
    const curr=layers[i], next=layers[i+1];
    for (const node of curr) {
      node.conns = [Math.floor(Math.random() * next.length)];
    }
    for (let j=0;j<next.length;j++) {
      if (!curr.some(n => n.conns.includes(j))) {
        pick(curr).conns.push(j);
      }
    }
    for (const node of curr) node.conns=[...new Set(node.conns)].sort();
  }
  return layers;
};

// ═══════════════════════════════════════════════════════════
// TARGETING HIGHLIGHT
// ═══════════════════════════════════════════════════════════
const computeHighlight = (step, board, r, c, card) => {
  const sz = board?.length || 0;
  if (step==="cell" && board) {
    // Use card-aware preview if card is provided
    if (card) {
      const cells = new Set();
      if (card.id === "flood_fill" || card.id === "cascade") {
        const flood = getFlood(board, r, c);
        for (const k of flood) cells.add(k);
        if (card.id === "cascade") {
          for (const key of flood) {
            const [fr,fc] = key.split(",").map(Number);
            for (const [dr,dc] of DIRS) { const nr=fr+dr,nc=fc+dc; if(inB(nr,nc,sz)) cells.add(`${nr},${nc}`); }
          }
        }
      } else if (card.id === "cross_wash") {
        for (let i=0;i<sz;i++) { cells.add(`${r},${i}`); cells.add(`${i},${c}`); }
      } else if (card.id === "diagonal_slash") {
        for (let d=-sz;d<=sz;d++) { if(inB(r+d,c+d,sz)) cells.add(`${r+d},${c+d}`); if(inB(r+d,c-d,sz)) cells.add(`${r+d},${c-d}`); }
      } else {
        const radius = card.id==="mega_bomb" ? 2 : card.id==="paint_bomb" ? 1 : 0;
        for (let dr=-radius;dr<=radius;dr++) for (let dc=-radius;dc<=radius;dc++) {
          if (inB(r+dr,c+dc,sz)) cells.add(`${r+dr},${c+dc}`);
        }
      }
      return cells;
    }
    return getFlood(board, r, c);
  }
  if (step==="row") { const s=new Set(); for(let i=0;i<sz;i++) s.add(`${r},${i}`); return s; }
  if (step==="col") { const s=new Set(); for(let i=0;i<sz;i++) s.add(`${i},${c}`); return s; }
  return new Set();
};

// ═══════════════════════════════════════════════════════════
// GAME STATE & REDUCER
// ═══════════════════════════════════════════════════════════
const P = { TITLE:0, MAP:1, PLAY:2, WIN:3, REWARD:4, LEVEL_UP:5, REMOVE:6, DECK_VIEW:7, GAME_OVER:8, VICTORY:9, SHOP:10 };

// ── Relics ──
const RELICS = {
  tap_ring:   { name:"Tap Ring",    desc:"+1 tap per turn",         cost:80,  icon:"💍" },
  energy_orb: { name:"Energy Orb",  desc:"+1 max energy",           cost:100, icon:"🔮" },
  draw_charm: { name:"Draw Charm",  desc:"+1 hand size",            cost:100, icon:"📿" },
  shield:     { name:"Shield",      desc:"+2 extra turns per board", cost:120, icon:"🛡" },
  lucky_coin: { name:"Lucky Coin",  desc:"Start each board +1 tap", cost:60,  icon:"🪙" },
};

const initState = () => ({
  phase: P.TITLE, score: 0, gold: 0, relics: [], hardMode: false,
  floor: 1, mapData: [], mapLayer: 0, mapPrevNode: -1,
  board: null, locked: null, numColors: 4, colorCycle: [], boardSize: 5,
  deck: [], hand: [], discard: [], maxEnergy: 3, handSize: 5,
  energy: 3, turn: 1, maxTurns: 8, taps: MAX_TAPS,
  targeting: null, highlight: new Set(), message: "",
  lastPlayed: null, rewards: [], currentNodeType: null,
  shopCards: [], shopRelics: [],
  enemies: [], enemyTurnPhase: null, _enemyAffectedCells: null,
});

const drawFrom = (deck, discard, count) => {
  let d=[...deck], disc=[...discard]; const drawn=[];
  for (let i=0;i<count;i++) { if(!d.length){if(!disc.length)break; d=shuffle(disc); disc=[];} drawn.push(d.pop()); }
  return { deck: d, discard: disc, drawn };
};

const hasRelic = (s, id) => s.relics.includes(id);

const buildPuzzle = (s, layer, nodeType) => {
  const cfg = getNodeConfig(layer, nodeType, s.hardMode, s.floor);
  const { board, locked, colorCycle } = generateBoard(cfg.size, cfg.numColors, cfg.locked);
  const hs = s.handSize + (hasRelic(s,"draw_charm") ? 1 : 0);
  const me = s.maxEnergy + (hasRelic(s,"energy_orb") ? 1 : 0);
  const mt = cfg.maxTurns + (hasRelic(s,"shield") ? 2 : 0);
  const tp = MAX_TAPS + (hasRelic(s,"tap_ring") ? 1 : 0) + (hasRelic(s,"lucky_coin") ? 1 : 0);
  const all = shuffle([...s.deck, ...s.hand, ...s.discard]);
  const hand = all.splice(0, hs);
  const enemies = spawnEnemies(board, locked, layer, nodeType, colorCycle, s.floor);
  return {
    ...s, phase: P.PLAY, board, locked, colorCycle, boardSize: cfg.size,
    numColors: cfg.numColors, maxTurns: mt, currentNodeType: nodeType,
    deck: all, hand, discard: [], energy: me, maxEnergy: me,
    turn: 1, taps: tp, enemies,
    targeting: null, highlight: new Set(), message: "", lastPlayed: null,
  };
};

// Auto-unlock: if every neighbor of a locked cell matches the locked cell's color, unlock it
const autoUnlock = (board, locked) => {
  const sz = board.length;
  let changed = false;
  const newLocked = locked.map(r => [...r]);
  for (let r = 0; r < sz; r++) {
    for (let c = 0; c < sz; c++) {
      if (!newLocked[r][c]) continue;
      const color = board[r][c];
      let allMatch = true;
      let hasNeighbor = false;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!inB(nr, nc, sz)) continue;
        hasNeighbor = true;
        if (board[nr][nc] !== color) { allMatch = false; break; }
      }
      if (hasNeighbor && allMatch) { newLocked[r][c] = false; changed = true; }
    }
  }
  return changed ? newLocked : locked;
};

const checkWin = (s, newBoard) => {
  const newLocked = autoUnlock(newBoard, s.locked);
  let ns = newLocked !== s.locked ? { ...s, locked: newLocked } : s;
  ns = { ...ns, board: newBoard };
  ns = checkEnemyDefeat(ns);
  if (isSolved(newBoard)) {
    const gl = (ns.floor - 1) * MAP_LAYERS + ns.mapLayer;
    const bonus = (ns.maxTurns - ns.turn + 1) * 100 * (gl + 1);
    const goldEarned = 15 + Math.floor(Math.random() * 10) + gl * 5;
    return { ...ns, score: ns.score + bonus, gold: ns.gold + goldEarned, phase: P.WIN, _goldEarned: goldEarned };
  }
  return ns;
};

const afterCardPlayed = (s, cardIdx, newBoard, args) => {
  const card = s.hand[cardIdx];
  const hand = s.hand.filter((_, i) => i !== cardIdx);
  return checkWin({
    ...s, hand, discard: [...s.discard, card], energy: s.energy - card.cost,
    targeting: null, highlight: new Set(),
    lastPlayed: { card, args }, message: `Played ${card.name}!`,
  }, newBoard);
};

const discardFromHand = (s, idx) => ({ hand: s.hand.filter((_,i)=>i!==idx), discard: [...s.discard, s.hand[idx]] });

// Advance to next layer — or next floor if floor complete — or victory
const advanceAfterNode = (s) => {
  const nl = s.mapLayer + 1;
  if (nl < MAP_LAYERS) return { ...s, phase: P.MAP, mapLayer: nl };
  // Floor complete
  if (s.floor < TOTAL_FLOORS) {
    return { ...s, phase: P.MAP, floor: s.floor + 1, mapData: generateMap(), mapLayer: 1, mapPrevNode: 0 };
  }
  return { ...s, phase: P.VICTORY };
};

const reducer = (s, a) => {
  switch (a.type) {
    case "START_RUN": {
      const hard = !!a.hard;
      const deck = shuffle(STARTER_DECK.map(makeCard));
      return { ...initState(), phase: P.MAP, deck, mapData: generateMap(), maxEnergy: 3, handSize: hard ? 4 : 5, gold: hard ? 30 : 50, mapLayer: 1, mapPrevNode: 0, hardMode: hard, floor: 1 };
    }
    case "SELECT_NODE": {
      const { layer, node } = a;
      const nodeType = s.mapData[layer][node].type;
      const next = { ...s, mapLayer: layer, mapPrevNode: node };
      if (nodeType==="puzzle"||nodeType==="elite"||nodeType==="boss") return buildPuzzle(next, layer, nodeType);
      if (nodeType==="reward") return { ...next, phase: P.REWARD, rewards: rollRewards(layer), currentNodeType:"reward" };
      if (nodeType==="rest")   return { ...next, phase: P.REMOVE, currentNodeType:"rest" };
      if (nodeType==="shop") {
        const shopCards = rollRewards(layer, 3, layer >= 5);
        const owned = new Set(next.relics);
        const available = Object.keys(RELICS).filter(k => !owned.has(k));
        const shopRelics = shuffle(available).slice(0, 2);
        return { ...next, phase: P.SHOP, shopCards, shopRelics, currentNodeType:"shop" };
      }
      return next;
    }
    case "ADVANCE_MAP": return advanceAfterNode(s);
    case "SHOW_REWARDS": { const gl=(s.floor-1)*MAP_LAYERS+s.mapLayer; return { ...s, phase: P.REWARD, rewards: rollRewards(gl, 3, s.currentNodeType==="elite") }; }
    case "SHOW_LEVEL_UP": return { ...s, phase: P.LEVEL_UP };
    case "PICK_REWARD": {
      const next = { ...s, deck: [...s.deck, makeCard(a.cardId)] };
      return advanceAfterNode(next);
    }
    case "LEVEL_UP": {
      const next = a.stat==="energy" ? {...s,maxEnergy:s.maxEnergy+1} : {...s,handSize:s.handSize+1};
      return { ...next, phase: P.REWARD, rewards: rollRewards((next.floor-1)*MAP_LAYERS+next.mapLayer, 3, true) };
    }
    case "REMOVE_CARD": {
      const all=[...s.deck,...s.discard,...s.hand]; all.splice(a.idx,1);
      const next={...s,deck:all,hand:[],discard:[]};
      return advanceAfterNode(next);
    }
    case "SKIP_REMOVE": return advanceAfterNode(s);
    case "VIEW_DECK": return { ...s, phase: P.DECK_VIEW, _prevPhase: s.phase };
    case "CLOSE_DECK": return { ...s, phase: s._prevPhase || P.PLAY };

    case "SHOP_BUY_CARD": {
      const cardCost = 30 + (((s.floor-1)*MAP_LAYERS+s.mapLayer) * 5);
      if (s.gold < cardCost) return s;
      const next = { ...s, gold: s.gold - cardCost, deck: [...s.deck, makeCard(a.cardId)], shopCards: s.shopCards.filter(id => id !== a.cardId) };
      return next;
    }
    case "SHOP_BUY_RELIC": {
      const relic = RELICS[a.relicId];
      if (!relic || s.gold < relic.cost || s.relics.includes(a.relicId)) return s;
      return { ...s, gold: s.gold - relic.cost, relics: [...s.relics, a.relicId], shopRelics: s.shopRelics.filter(id => id !== a.relicId) };
    }
    case "SHOP_REMOVE_CARD": {
      const removeCost = 50;
      if (s.gold < removeCost) return s;
      const all = [...s.deck, ...s.discard, ...s.hand]; all.splice(a.idx, 1);
      return { ...s, gold: s.gold - removeCost, deck: all, hand: [], discard: [] };
    }
    case "LEAVE_SHOP": return advanceAfterNode(s);

    case "END_TURN": {
      if (s.board && isSolved(s.board)) return checkWin(s, s.board);
      if (s.turn >= s.maxTurns) return { ...s, phase: P.GAME_OVER };
      // Step 1: Move enemies (animate), disable controls
      if (!s.enemies || s.enemies.length === 0) {
        // No current enemies — still check for reinforcement spawns
        const afterSpawn = spawnReinforcement(s);
        const { deck, discard, drawn } = drawFrom(afterSpawn.deck, [...afterSpawn.discard, ...afterSpawn.hand], afterSpawn.handSize);
        return { ...afterSpawn, deck, discard, hand: drawn, energy: afterSpawn.maxEnergy, turn: afterSpawn.turn+1, taps: MAX_TAPS, targeting: null, highlight: new Set() };
      }
      return processEnemyMove({ ...s, message: "Enemy turn...", targeting: null, highlight: new Set() });
    }
    case "ENEMY_ABILITY": {
      // Step 2: Enemies use abilities
      return processEnemyAbilities(s);
    }
    case "FINISH_ENEMY_TURN": {
      // Step 3: Draw new hand, return control to player
      return finishEnemyTurn(s);
    }

    case "SELECT_CARD": {
      if (s.enemyTurnPhase) return s; // locked during enemy turn
      const card = s.hand[a.idx];
      if (!card || card.cost > s.energy) return s;
      if (card.special) {
        const { hand, discard } = discardFromHand(s, a.idx);
        const sz = s.board?.length||5;
        const base = { ...s, hand, discard, energy: s.energy-card.cost, targeting:null, highlight:new Set(), lastPlayed:{card,args:{}} };
        switch (card.special) {
          case "energize": return { ...base, energy:base.energy+1, message:"+1 Energy!" };
          case "battery":  return { ...base, energy:base.energy+2, message:"+2 Energy!" };
          case "purify":   return { ...base, locked:Array.from({length:sz},()=>Array(sz).fill(false)), message:"All cells unlocked!" };
          case "refresh":  { const {deck,discard:d,drawn}=drawFrom(s.deck,[...s.discard,...s.hand],s.handSize); return {...base,deck,discard:d,hand:drawn,message:"Hand refreshed!"}; }
          case "overtime":  { const {deck,discard:d,drawn}=drawFrom(s.deck,base.discard,2); return {...base,deck,discard:d,hand:[...base.hand,...drawn],message:"+2 Cards drawn!"}; }
          case "mirror": {
            if (!s.lastPlayed?.card?.effect) return {...s,message:"Nothing to mirror!"};
            const mirroredCard = s.lastPlayed.card;
            const mirrorTarget = mirroredCard.target;
            // If the mirrored card needs targeting, enter targeting mode with mirror info
            if (mirrorTarget && mirrorTarget !== "none") {
              const steps={"cell+color":"cell","2color":"color1","2cell":"cell1","row+color":"row","col+color":"col","color":"color_final"};
              const step=steps[mirrorTarget];
              const needsP=step==="color1"||step==="color_final";
              // Remove mirror from hand and deduct its cost, but enter targeting for the mirrored card
              return { ...s, hand, discard, energy: s.energy-card.cost,
                targeting:{cardIdx:-1, step, mirrorCard:mirroredCard},
                highlight:new Set(),
                message:`Mirror → ${mirroredCard.name}: ${step==="cell1"?"Select the first cell":needsP?"Pick a color":`Select a ${step} on the board`}` };
            }
            // No targeting needed — apply immediately
            const nb=mirroredCard.effect(s.board,s.locked,{});
            return checkWin({...s, hand, discard, energy:s.energy-card.cost,
              targeting:null, highlight:new Set(),
              lastPlayed:{card:mirroredCard, args:{}}, message:`Mirrored ${mirroredCard.name}!`
            }, nb);
          }
        }
      }
      const steps={"cell+color":"cell","2color":"color1","2cell":"cell1","row+color":"row","col+color":"col","color":"color_final"};
      const step=steps[card.target]; const needsP=step==="color1"||step==="color_final";
      const stepMsg = step==="cell1" ? "Select the first cell" : needsP ? "Pick a color" : `Select a ${step} on the board`;
      return { ...s, targeting:{cardIdx:a.idx,step}, highlight:new Set(), message:stepMsg };
    }

    case "CANCEL_TARGET": return { ...s, targeting:null, highlight:new Set(), message:"" };

    case "CLICK_CELL": {
      if (s.enemyTurnPhase) return s; // locked during enemy turn animation
      const {r,c}=a, sz=s.board.length;
      if (s.targeting) {
        // If this click came from a drag release for a different card, ignore it
        if (a.fromCard !== undefined && a.fromCard !== s.targeting.cardIdx) return s;
        const {step, cardIdx, mirrorCard}=s.targeting;
        const targetCard = mirrorCard || s.hand[cardIdx];
        if(step==="cell") return {...s,targeting:{...s.targeting,step:"color_final",cell:[r,c]},highlight:computeHighlight("cell",s.board,r,c,targetCard),message:"Now pick a color"};
        if(step==="cell1") { const hl=new Set([`${r},${c}`]); return {...s,targeting:{...s.targeting,step:"cell2",cell:[r,c]},highlight:hl,message:"Now select the second cell"}; }
        if(step==="cell2") {
          const args = { cell:s.targeting.cell, cell2:[r,c] };
          if (mirrorCard) {
            const nb = mirrorCard.effect(s.board,s.locked,args);
            return checkWin({...s, targeting:null, highlight:new Set(), lastPlayed:{card:mirrorCard, args}, message:`Mirrored ${mirrorCard.name}!`}, nb);
          }
          return afterCardPlayed(s,cardIdx,targetCard.effect(s.board,s.locked,args),args);
        }
        if(step==="row")  return {...s,targeting:{...s.targeting,step:"color_final",row:r},highlight:computeHighlight("row",s.board,r,c,targetCard),message:"Now pick a color"};
        if(step==="col")  return {...s,targeting:{...s.targeting,step:"color_final",col:c},highlight:computeHighlight("col",s.board,r,c,targetCard),message:"Now pick a color"};
        return s;
      }
      if (s.taps<=0) return {...s,message:"No taps left this turn!"};
      // Block tap-cycling on enemy-occupied cells
      const enemyAt = (er,ec) => s.enemies?.some(e => e.r===er && e.c===ec);
      if (enemyAt(r,c)) return {...s, message:"Can't tap an enemy cell — use a card!"};
      const b=cloneBoard(s.board);
      const targets=[[r,c],...ALL_DIRS.map(([dr,dc])=>[r+dr,c+dc])];
      for (const [tr,tc] of targets) { if(inB(tr,tc,sz)&&!s.locked[tr][tc]&&!enemyAt(tr,tc)) b[tr][tc]=nextColor(b[tr][tc],s.colorCycle); }
      return checkWin({...s,board:b,taps:s.taps-1,message:""},b);
    }

    case "PICK_COLOR": {
      if(!s.targeting) return s;
      const {step,cardIdx,mirrorCard}=s.targeting;
      const card = mirrorCard || s.hand[cardIdx];
      if(step==="color1") return {...s,targeting:{...s.targeting,step:"color2",color1:a.color},message:"Pick the second color"};
      let args; if(step==="color2") args={color:s.targeting.color1,color2:a.color}; else args={color:a.color,cell:s.targeting.cell,row:s.targeting.row,col:s.targeting.col};
      if (mirrorCard) {
        // Mirror: card already removed from hand, just apply effect
        const nb = mirrorCard.effect(s.board,s.locked,args);
        return checkWin({...s, targeting:null, highlight:new Set(),
          lastPlayed:{card:mirrorCard, args}, message:`Mirrored ${mirrorCard.name}!`}, nb);
      }
      return afterCardPlayed(s,cardIdx,card.effect(s.board,s.locked,args),args);
    }
    default: return s;
  }
};

// ═══════════════════════════════════════════════════════════
// STYLE HELPERS (only for dynamic/color values)
// ═══════════════════════════════════════════════════════════
const box = (x={}) => ({ background:T.panel, border:`1px solid ${T.border}`, borderRadius:"var(--radius)", ...x });
const cn = { display:"flex", alignItems:"center", justifyContent:"center" };

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

const Overlay = ({ children }) => (
  <div style={{ position:"fixed", inset:0, background:"#0a0a0fdd", ...cn, zIndex:100, backdropFilter:"blur(8px)", padding:"var(--pad)", paddingTop:`calc(var(--pad) + env(safe-area-inset-top, 0px))`, paddingBottom:`calc(var(--pad) + env(safe-area-inset-bottom, 0px))`, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
    <div style={{ ...box({borderRadius:16, padding:"clamp(12px,3vw,24px)", maxWidth:420, width:"100%", textAlign:"center"}) }}>{children}</div>
  </div>
);

const Btn = ({ onClick, variant="primary", children, style={} }) => (
  <button onClick={onClick} className={`game-btn game-btn-${variant}`} style={style}>{children}</button>
);

const Stat = ({ label, value, color }) => (
  <div style={{ ...box({borderRadius:8,padding:"clamp(1px, 0.5dvh, 4px) clamp(4px, 1.2dvh, 10px)",textAlign:"center",flex:"1 1 0",minWidth:0}), fontSize:"var(--fs-stat-label)", fontWeight:600 }}>
    <div style={{ color, whiteSpace:"nowrap" }}>{label}</div>
    <div style={{ fontSize:"var(--fs-stat-val)", color:T.bright, whiteSpace:"nowrap" }}>{value}</div>
  </div>
);

const CARD_ART = {
  flood_fill:"🌊", paint:"🎨", color_swap:"🔄", row_wash:"↔️", col_wash:"↕️",
  snipe:"🎯", energize:"⚡", paint_bomb:"💣", refresh:"♻️", overtime:"⏰",
  cascade:"🌀", cross_wash:"✚", diagonal_slash:"✖", battery:"🔋", mirror:"🪞",
  purify:"✨", color_drain:"🕳", mega_bomb:"💥", tsunami:"🌊",
};

const RARITY_BORDER = { starter:"#444", common:"#555", uncommon:T.accent, rare:T.danger };
const RARITY_GLOW = { starter:"none", common:"none", uncommon:`0 0 8px ${T.accent}44`, rare:`0 0 12px ${T.danger}44` };

const CardView = ({ card, onClick, playable, compact, large, style: extraStyle }) => {
  if (compact) {
    // Compact list view for overlays
    return (
      <div onClick={onClick} className={onClick ? "card-hover" : ""} style={{
        ...box({borderRadius:8,padding:"8px 10px",cursor:onClick?"pointer":"default"}),
        display:"flex", justifyContent:"space-between", alignItems:"center",
        opacity:playable===false?0.45:1, transition:"all .2s ease", width:"100%",
        ...extraStyle,
      }}>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span style={{ fontSize:16 }}>{CARD_ART[card.id]||"🃏"}</span>
          <div>
            <span style={{ fontSize:12, fontWeight:700, color:T.bright }}>{card.name}</span>
            <span style={{ fontSize:10, color:T.gold, marginLeft:6 }}>{card.cost}E</span>
          </div>
        </div>
        <div style={{ fontSize:8, fontWeight:700, textTransform:"uppercase",
          color:card.rarity==="rare"?T.danger:card.rarity==="uncommon"?T.accent:T.dim }}>{card.rarity}</div>
      </div>
    );
  }

  const rarityColor = RARITY_BORDER[card.rarity] || "#444";

  const w = large ? "clamp(120px, 28vw, 160px)" : "var(--tcg-w)";
  const artH = large ? "clamp(70px, 17vw, 100px)" : "var(--tcg-art-h)";
  const artFs = large ? "clamp(40px, 10vw, 56px)" : "var(--tcg-art-fs)";
  const nameFs = large ? "clamp(13px, 3.2vw, 17px)" : "var(--fs-card-name, 10px)";
  const costFs = large ? "clamp(13px, 3.2vw, 17px)" : "var(--fs-card-name, 11px)";
  const descFs = large ? "clamp(10px, 2.5vw, 13px)" : "var(--fs-card-desc, 8px)";
  const rarFs = large ? "clamp(8px, 2vw, 11px)" : "max(calc(var(--tcg-w) * 0.09), 6px)";
  const padTB = large ? "7px 10px" : "clamp(2px, 0.4dvh, 5px) clamp(4px, 0.8dvh, 8px)";
  const descPad = large ? "6px 10px" : "clamp(2px, 0.3dvh, 4px) clamp(3px, 0.5dvh, 6px)";
  const costPad = large ? "2px 8px" : "clamp(0px, 0.15dvh, 1px) clamp(3px, 0.5dvh, 6px)";
  const borderR = large ? 14 : 10;

  const h = large ? "clamp(186px, 44vw, 248px)" : "var(--tcg-h)";

  return (
    <div onClick={onClick} className={`tcg-card ${onClick?"card-hover":""}`} style={{
      width: w, height: h, flexShrink: 0, cursor: onClick?"pointer":"default",
      opacity: playable===false ? 0.45 : 1,
      ...extraStyle,
    }}>
      {/* Card frame */}
      <div style={{
        background: `linear-gradient(170deg, #1a1a2e 0%, ${T.panel} 40%, #1a1a2e 100%)`,
        border: `2px solid ${rarityColor}`,
        borderRadius: borderR, overflow: "hidden",
        boxShadow: RARITY_GLOW[card.rarity] || "none",
        display: "flex", flexDirection: "column", height: "100%",
      }}>
        {/* Top bar: name + cost */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: padTB, background: "#0d0d1a",
          borderBottom: `1px solid ${rarityColor}40`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: nameFs, fontWeight: 800, color: T.bright, letterSpacing: 0.3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{card.name}</span>
          <span style={{
            fontSize: costFs, fontWeight: 800, color: "#111",
            background: T.gold, borderRadius: 10, padding: costPad, marginLeft: 4,
            minWidth: "clamp(14px, calc(var(--tcg-w) * 0.25), 20px)", textAlign: "center", lineHeight: 1.3,
          }}>{card.cost}</span>
        </div>

        {/* Art area */}
        <div style={{
          flex: "0 0 auto", height: artH,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `radial-gradient(ellipse at center, ${rarityColor}15 0%, transparent 70%)`,
          fontSize: artFs, lineHeight: 1,
          borderBottom: `1px solid ${rarityColor}25`,
        }}>
          {CARD_ART[card.id] || "🃏"}
        </div>

        {/* Description */}
        <div style={{
          flex: 1, padding: descPad,
          fontSize: descFs, color: "#aaa", lineHeight: 1.3,
          display: "flex", alignItems: "center",
          overflow: "hidden",
          minHeight: 0,
        }}>
          <span>{card.desc}</span>
        </div>

        {/* Bottom bar: rarity */}
        <div style={{
          padding: "clamp(1px, 0.2dvh, 2px) 8px clamp(2px, 0.3dvh, 4px)", textAlign: "center",
          fontSize: rarFs, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
          color: rarityColor, borderTop: `1px solid ${rarityColor}25`,
          flexShrink: 0,
        }}>
          {card.rarity}
        </div>
      </div>
    </div>
  );
};

const CycleIndicator = ({ cycle }) => (
  <div className="hide-short" style={{ ...box({borderRadius:8,padding:"4px 10px",marginBottom:"var(--gap)"}), display:"flex", gap:3, alignItems:"center", justifyContent:"center" }}>
    <span style={{ fontSize:10, color:T.dim, fontWeight:600, marginRight:3 }}>CYCLE</span>
    {cycle.map((c,i) => (
      <div key={i} style={{ display:"flex", alignItems:"center", gap:3 }}>
        <div style={{ width:16, height:16, borderRadius:3, background:c, border:"1px solid #333", flexShrink:0 }} />
        {i < cycle.length-1 && <span style={{ color:"#444", fontSize:9 }}>→</span>}
      </div>
    ))}
    <span style={{ color:"#444", fontSize:9, marginLeft:2 }}>↻</span>
  </div>
);

const ColorPicker = ({ numColors, onPick, disabled }) => (
  <div style={{
    ...box({borderRadius:10,padding:"clamp(2px, min(0.8vw, 0.5dvh), 8px)",marginBottom:"var(--gap)"}),
    display:"flex", gap:"clamp(4px, min(2vw, 1.2vh), 10px)", justifyContent:"center", flexWrap:"wrap",
    opacity: disabled ? 0.18 : 1,
    pointerEvents: disabled ? "none" : "auto",
    transition: "opacity 0.25s ease",
    position: "relative", zIndex: 5,
  }}>
    {COLORS.slice(0,numColors).map((c,i) => (
      <div key={i} className="color-picker-cell tap-target" onClick={disabled ? undefined : ()=>onPick(c)} style={{
        background: disabled ? "#333" : c,
        boxShadow: disabled ? "none" : `0 2px 8px ${c}44`,
        ...cn,
        transition: "background 0.25s ease, box-shadow 0.25s ease",
      }} />
    ))}
  </div>
);

// ── MAP SCREEN ────────────────────────────────────────────
const MapScreen = ({ state: s, dispatch }) => {
  const { mapData, mapLayer, mapPrevNode } = s;
  const LAYER_H = 52, NODE_R = 16;
  const totalH = mapData.length * LAYER_H + 30;
  const maxLi = mapData.length - 1;
  const scrollRef = useRef(null);

  // Flip Y: layer 0 at bottom, last layer at top
  const yOf = (li) => (maxLi - li) * LAYER_H + 24;

  // Auto-scroll to bottom (where player starts) on mount / layer change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mapLayer]);

  const available = new Set();
  if (mapLayer < mapData.length) {
    if (mapLayer===0) mapData[0].forEach((_,i)=>available.add(i));
    else { const prev=mapData[mapLayer-1]?.[mapPrevNode]; if(prev) prev.conns.forEach(i=>available.add(i)); }
  }

  return (
    <div className="map-shell" style={{ background:T.bg, color:T.text }}>
      <AnimatedBg opacity={0.14} vignette={false} />
        {/* Header — compact on mobile */}
        <div style={{ ...box({borderRadius:"var(--radius)",padding:"6px 10px",marginBottom:6,flexShrink:0}), display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:"clamp(13px, 4vw, 18px)", fontWeight:700, color:T.bright, letterSpacing:1 }}>CELLS</div>
          <div style={{ display:"flex", gap:"clamp(6px, 2vw, 12px)", alignItems:"center" }}>
            <span style={{ fontSize:"clamp(10px, 3vw, 13px)", color:T.gold, fontWeight:700 }}>Gold: {s.gold}</span>
            <span style={{ fontSize:"clamp(10px, 3vw, 13px)", color:T.dim, fontWeight:700 }}>Score: {s.score}</span>
          </div>
        </div>

        <div style={{ textAlign:"center", fontSize:"clamp(12px, 3.5vw, 15px)", fontWeight:700, color:T.bright, marginBottom:4, flexShrink:0 }}>
          Floor {s.floor}/{TOTAL_FLOORS} — Choose your path
        </div>

        {/* Legend — wraps and shrinks on mobile */}
        <div className="hide-short" style={{ display:"flex", gap:"clamp(4px, 2vw, 10px)", justifyContent:"center", marginBottom:6, flexWrap:"wrap", flexShrink:0 }}>
          {Object.entries(NODE_TYPES).map(([k,v]) => (
            <div key={k} className="map-legend-item" style={{ display:"flex", gap:2, alignItems:"center", fontSize:"clamp(8px, 2.5vw, 11px)", color:T.dim }}>
              <span style={{ color:v.color, fontSize:"clamp(10px, 3vw, 13px)" }}>{v.icon}</span> {v.label}
            </div>
          ))}
        </div>

        {/* Deck link */}
        <div style={{ display:"flex", justifyContent:"center", fontSize:"clamp(9px, 2.5vw, 11px)", color:T.dim, fontWeight:600, marginBottom:6, flexShrink:0 }}>
          <span onClick={()=>dispatch({type:"VIEW_DECK"})} style={{ cursor:"pointer", textDecoration:"underline" }}>
            Deck: {s.deck.length + s.hand.length + s.discard.length}
          </span>
        </div>

        {/* Scrollable map */}
        <div className="map-scroll" ref={scrollRef}>
          <svg width="100%" viewBox={`0 0 300 ${totalH}`} style={{ maxWidth:"var(--map-w)" }}>
            {/* Lines */}
            {mapData.map((layer, li) => li < mapData.length-1 && layer.map((node, ni) =>
              node.conns.map(ci => {
                const nxl = mapData[li+1].length;
                const x1 = (ni+1)/(layer.length+1)*300, y1 = yOf(li);
                const x2 = (ci+1)/(nxl+1)*300,         y2 = yOf(li+1);
                const isPath = li===mapLayer-1 && ni===mapPrevNode;
                const past = li < mapLayer-1;
                return <line key={`${li}-${ni}-${ci}`} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={isPath?"#556":past?"#333":"#1a1a2e"} strokeWidth={isPath?2.5:1.5} />;
              })
            ))}

            {/* Nodes */}
            {mapData.map((layer, li) => layer.map((node, ni) => {
              const x = (ni+1)/(layer.length+1)*300, y = yOf(li);
              const isAvail = li===mapLayer && available.has(ni);
              const isPast = li<mapLayer;
              const isCurr = li===mapLayer-1 && ni===mapPrevNode;
              const nt = NODE_TYPES[node.type];
              return (
                <g key={`${li}-${ni}`}
                  onClick={isAvail ? ()=>dispatch({type:"SELECT_NODE",layer:li,node:ni}) : undefined}
                  style={{ cursor:isAvail?"pointer":"default" }}>
                  {/* Glow for available */}
                  {isAvail && <circle cx={x} cy={y} r={NODE_R+8} fill="none" stroke={nt.color} strokeWidth={2} opacity={0.35}>
                    <animate attributeName="r" values={`${NODE_R+6};${NODE_R+10};${NODE_R+6}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.35;0.15;0.35" dur="2s" repeatCount="indefinite" />
                  </circle>}
                  {/* "You are here" pulse for current node */}
                  {isCurr && <circle cx={x} cy={y} r={NODE_R+8} fill="none" stroke={T.gold} strokeWidth={1.5} opacity={0.5}>
                    <animate attributeName="r" values={`${NODE_R+5};${NODE_R+12};${NODE_R+5}`} dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2.5s" repeatCount="indefinite" />
                  </circle>}
                  {/* Soft colored halo behind every node */}
                  <circle cx={x} cy={y} r={NODE_R+3} fill={isCurr?T.gold:nt.color}
                    opacity={isPast?0.08:isAvail?0.25:isCurr?0.35:0.12} />
                  <circle cx={x} cy={y} r={NODE_R}
                    fill={isCurr?T.gold:nt.color}
                    stroke={isAvail?T.bright:isCurr?T.gold:nt.color} strokeWidth={isAvail?2.5:isCurr?2.5:2}
                    opacity={isPast?0.35:isAvail?1:isCurr?0.9:0.5} />
                  <text x={x} y={y+1} textAnchor="middle" dominantBaseline="central"
                    fill={isPast?"#999":"#fff"} fontSize={13} fontWeight={700}
                    style={{ pointerEvents:"none" }}>
                    {nt.icon}
                  </text>
                </g>
              );
            }))}
          </svg>
        </div>
    </div>
  );
};

// ── Reusable animated background ─────────────────────────
const BG_COLS = 8;
const BG_ROWS = 14;  // extra rows so square cells always fill tall screens
const BG_PALETTE = COLORS.slice(0, 5);

const AnimatedBg = ({ opacity = 0.12, vignette = true }) => {
  const gridRef = useRef(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const cells = el.children;
    let running = true;
    let last = Date.now();
    const tick = () => {
      if (!running) return;
      const now = Date.now();
      if (now - last > 150) {
        last = now;
        const count = 2 + Math.floor(Math.random() * 2);
        for (let k = 0; k < count; k++) {
          const idx = Math.floor(Math.random() * cells.length);
          cells[idx].style.background = pick(BG_PALETTE);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { running = false; };
  }, []);

  const initColors = useRef(
    Array.from({ length: BG_COLS * BG_ROWS }, () => pick(BG_PALETTE))
  ).current;

  return (
    <>
      <div ref={gridRef} style={{
        position: "fixed", inset: 0, display: "grid",
        gridTemplateColumns: `repeat(${BG_COLS}, 1fr)`,
        gap: 3, padding: 3, opacity, pointerEvents: "none", zIndex: 0,
        alignContent: "center", willChange: "contents",
        overflow: "hidden",
      }}>
        {initColors.map((color, i) => (
          <div key={i} style={{
            background: color, borderRadius: 4,
            transition: "background 1s ease",
            aspectRatio: "1",
          }} />
        ))}
      </div>
      {vignette && (
        <div style={{
          position: "fixed", inset: 0,
          background: "radial-gradient(ellipse at center, transparent 20%, #0a0a0f 75%)",
          pointerEvents: "none", zIndex: 0,
        }} />
      )}
    </>
  );
};

// ── Full-page screens ─────────────────────────────────────
const TUTORIAL_STEPS = [
  { title:"Tap to Cycle", icon:"🎨", text:"Tap any cell on the board to cycle its color (and all connected cells) to the next color in the cycle." },
  { title:"Play Cards", icon:"🃏", text:"Drag cards from your hand to play powerful effects — paint areas, swap colors, snipe cells, and more. Each card costs energy." },
  { title:"Locked Cells", icon:"🔒", text:"Some cells are locked and can't be recolored. Surround a locked cell with its own color to unlock it, or use a Purify card." },
  { title:"Clear the Board", icon:"✨", text:"Make every cell the same color before you run out of turns. Fewer turns used = more bonus points and gold." },
  { title:"Explore the Map", icon:"🗺", text:"Choose your path through 13 layers. Fight puzzles, visit shops, collect relics, and face the final boss." },
  { title:"Build Your Deck", icon:"📦", text:"Earn new cards after each puzzle. Visit shops to buy cards and relics, or remove weak cards to streamline your deck." },
];

const TitleScreen = ({ dispatch }) => {
  const [hard, setHard] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutStep, setTutStep] = useState(0);

  if (showTutorial) {
    const step = TUTORIAL_STEPS[tutStep];
    const isLast = tutStep === TUTORIAL_STEPS.length - 1;
    return (
      <div className="full-page title-screen" style={{ background: T.bg, color: T.text, position: "relative", overflow: "hidden" }}>
        <AnimatedBg opacity={0.18} />
        <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:16, maxWidth:400, width:"100%", padding:"0 20px" }}>
          {/* Progress dots */}
          <div style={{ display:"flex", gap:8, marginBottom:8 }}>
            {TUTORIAL_STEPS.map((_, i) => (
              <div key={i} style={{
                width: i===tutStep ? 24 : 8, height: 8, borderRadius: 4,
                background: i===tutStep ? T.accent : i<tutStep ? T.success : "#333",
                transition: "all 0.3s ease",
              }} />
            ))}
          </div>

          {/* Icon */}
          <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 4 }}>{step.icon}</div>

          {/* Title */}
          <div style={{ fontSize:"clamp(22px, 6vw, 30px)", fontWeight:900, color:T.bright, letterSpacing:1 }}>{step.title}</div>

          {/* Body */}
          <div style={{
            fontSize:"clamp(14px, 3.5vw, 17px)", color:"#aab", textAlign:"center",
            lineHeight:1.7, padding:"0 8px", minHeight:70,
          }}>{step.text}</div>

          {/* Navigation */}
          <div style={{ display:"flex", gap:12, marginTop:12 }}>
            {tutStep > 0 && (
              <button onClick={()=>setTutStep(tutStep-1)} style={{
                padding:"12px 24px", borderRadius:10, border:`1px solid #444`, cursor:"pointer",
                fontWeight:700, fontSize:14, color:T.text, background:"transparent", fontFamily:"inherit",
              }}>Back</button>
            )}
            <button onClick={isLast ? ()=>setShowTutorial(false) : ()=>setTutStep(tutStep+1)} style={{
              padding:"12px 32px", borderRadius:10, border:"none", cursor:"pointer",
              fontWeight:800, fontSize:15, color:T.bright, fontFamily:"inherit",
              background: isLast ? `linear-gradient(135deg, ${T.success}, #27ae60)` : `linear-gradient(135deg, ${T.accent}, #2980b9)`,
              boxShadow: `0 4px 16px ${isLast ? T.success : T.accent}44`,
            }}>{isLast ? "Got It!" : "Next"}</button>
          </div>

          {/* Skip */}
          <div onClick={()=>setShowTutorial(false)} style={{
            fontSize:12, color:"#555", cursor:"pointer", marginTop:8, textDecoration:"underline",
          }}>Skip tutorial</div>
        </div>
      </div>
    );
  }

  return (
    <div className="full-page title-screen" style={{ background: T.bg, color: T.text, position: "relative", overflow: "hidden" }}>
      <AnimatedBg opacity={0.22} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        {/* Small grid icon above title */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 4 }}>
          {[COLORS[0],COLORS[1],COLORS[2],COLORS[3],COLORS[4],COLORS[5],COLORS[6],COLORS[1],COLORS[0]].map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, opacity: 0.8 }} />
          ))}
        </div>

        {/* Title */}
        <div className="title-glow" style={{
          fontSize: "clamp(48px, 14vw, 80px)", fontWeight: 900,
          color: T.bright, letterSpacing: 8, lineHeight: 1,
          textShadow: `0 0 40px ${T.accent}44, 0 0 80px ${T.accent}22, 0 2px 0 #111`,
        }}>
          CELLS
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: "clamp(14px, 3.5vw, 18px)", color: T.accent,
          fontWeight: 600, letterSpacing: 3, textTransform: "uppercase",
        }}>
          Roguelike Puzzle
        </div>

        {/* Description */}
        <div style={{
          fontSize: "clamp(13px, 3vw, 16px)", color: "#8888a8",
          textAlign: "center", maxWidth: 340, lineHeight: 1.7, padding: "0 16px",
        }}>
          Tap cells to cycle colors. Play cards for powerful effects.
          Clear each board before you run out of turns.
        </div>

        {/* Hard mode toggle */}
        <div onClick={()=>setHard(!hard)} style={{
          display:"flex", alignItems:"center", gap:12, cursor:"pointer",
          padding:"10px 20px", borderRadius:10,
          background: hard ? `${T.danger}18` : "#ffffff08",
          border: `1.5px solid ${hard ? T.danger : "#333"}`,
          transition:"all 0.3s ease",
        }}>
          <div style={{
            width:40, height:22, borderRadius:11, padding:2,
            background: hard ? T.danger : "#333",
            transition:"background 0.3s ease", display:"flex",
            justifyContent: hard ? "flex-end" : "flex-start",
          }}>
            <div style={{
              width:18, height:18, borderRadius:9, background:"#fff",
              transition:"all 0.3s ease",
              boxShadow: hard ? `0 0 8px ${T.danger}88` : "none",
            }} />
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color: hard ? T.danger : T.dim, letterSpacing:0.5 }}>
              {hard ? "HARD MODE" : "Hard Mode"}
            </div>
            <div style={{ fontSize:10, color: hard ? "#c0392b" : "#555", marginTop:1 }}>
              {hard ? "More colors, fewer turns, locked cells earlier" : "For experienced players"}
            </div>
          </div>
        </div>

        {/* Start button — retro arcade style */}
        <button className="retro-btn" onClick={() => dispatch({ type: "START_RUN", hard })} style={{
          "--retro-bg": hard ? T.danger : T.accent,
          "--retro-shadow": hard ? "#8e1a1a" : "#1a5276",
          "--retro-glow": hard ? T.danger : T.accent,
        }}>
          {hard ? "START HARD RUN" : "START RUN"}
        </button>

        {/* How to Play — retro style */}
        <button className="retro-btn retro-btn-sm" onClick={()=>{setTutStep(0);setShowTutorial(true);}} style={{
          "--retro-bg": "#333",
          "--retro-shadow": "#111",
          "--retro-glow": "#555",
        }}>
          HOW TO PLAY
        </button>

        <div style={{ fontSize:11, color:"#444", marginTop:4 }}>v0.2</div>
      </div>
    </div>
  );
};

const GameOverScreen = ({ state: s, dispatch }) => (
  <div className="full-page" style={{ background:T.bg, color:T.text, position:"relative", overflow:"hidden" }}>
    <AnimatedBg opacity={0.18} />
    <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
      <div style={{ fontSize:"clamp(32px, 8vw, 48px)", fontWeight:900, color:T.danger }}>RUN OVER</div>
      {s.hardMode && <div style={{ fontSize:13, fontWeight:800, color:T.danger, background:`${T.danger}20`, padding:"3px 12px", borderRadius:6 }}>HARD MODE</div>}
      <div style={{ fontSize:"clamp(14px, 3.5vw, 18px)", color:"#aaa" }}>Made it to Floor {s.floor}, Layer {s.mapLayer} of {MAP_LAYERS}</div>
      <div style={{ fontSize:"clamp(20px, 6vw, 32px)", color:T.gold, fontWeight:700 }}>Score: {s.score}</div>
      <Btn onClick={()=>dispatch({type:"START_RUN"})}>New Run</Btn>
    </div>
  </div>
);

const VictoryScreen = ({ state: s, dispatch }) => (
  <div className="full-page" style={{ background:T.bg, color:T.text, position:"relative", overflow:"hidden" }}>
    <AnimatedBg opacity={0.2} />
    <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
      <div style={{ fontSize:"clamp(36px, 10vw, 56px)", fontWeight:900, color:T.gold, textShadow:`0 0 40px ${T.gold}44` }}>VICTORY!</div>
      {s.hardMode && <div style={{ fontSize:14, fontWeight:800, color:T.danger, background:`${T.danger}20`, padding:"4px 14px", borderRadius:6, letterSpacing:1 }}>HARD MODE CONQUERED</div>}
      <div style={{ fontSize:"clamp(14px, 3.5vw, 18px)", color:"#aaa" }}>You conquered all {TOTAL_FLOORS} floors!</div>
      <div style={{ fontSize:"clamp(24px, 6vw, 36px)", color:T.success, fontWeight:700 }}>Score: {s.score}</div>
      <Btn onClick={()=>dispatch({type:"START_RUN"})}>Play Again</Btn>
    </div>
  </div>
);

// ── Overlay screens ───────────────────────────────────────
const WinScreen = ({ state: s, dispatch }) => {
  const isElite = s.currentNodeType==="elite", isBoss = s.currentNodeType==="boss";
  const goNext = () => { if(isBoss) dispatch({type:"ADVANCE_MAP"}); else if(isElite) dispatch({type:"SHOW_LEVEL_UP"}); else dispatch({type:"SHOW_REWARDS"}); };
  return (
    <Overlay>
      <div style={{ fontSize:22, fontWeight:800, color:isBoss?T.gold:T.success, marginBottom:12 }}>
        {isBoss?"BOSS DEFEATED!":isElite?"ELITE CLEARED!":"PUZZLE CLEARED!"}
      </div>
      <div style={{ fontSize:14, color:"#aaa", marginBottom:4 }}>+{(s.maxTurns-s.turn+1)*100*(((s.floor-1)*MAP_LAYERS+s.mapLayer)+1)} points</div>
      <div style={{ fontSize:14, color:T.gold, marginBottom:12 }}>+{s._goldEarned||0} gold</div>
      <Btn onClick={goNext}>Continue</Btn>
    </Overlay>
  );
};

const RewardScreen = ({ state: s, dispatch }) => {
  // Sparkle particles — reduced count, no box-shadow
  const sparkles = useRef(Array.from({length:12}, (_,i) => ({
    left: `${5 + Math.random()*90}%`, top: `${5 + Math.random()*90}%`,
    delay: `${(i * 0.4).toFixed(2)}s`, size: 3 + Math.random()*4,
    color: pick(["#fff","#f1c40f","#3498db","#2ecc71","#e74c3c","#9b59b6"]),
  }))).current;

  return (
    <div className="reward-backdrop" style={{ position:"fixed", inset:0, zIndex:100, ...cn, padding:"var(--pad)" }}>
      {/* Animated bg behind */}
      <AnimatedBg opacity={0.25} vignette={false} />

      {/* Sparkle particles — GPU composited, no box-shadow */}
      {sparkles.map((sp, i) => (
        <div key={i} className="reward-sparkle" style={{
          position:"absolute", left:sp.left, top:sp.top,
          width:sp.size, height:sp.size, borderRadius:"50%",
          background:sp.color, filter:`blur(${Math.round(sp.size*0.3)}px)`,
          animationDelay:sp.delay, zIndex:1,
          willChange: "transform, opacity",
        }} />
      ))}

      {/* Radial glow behind cards */}
      <div style={{
        position:"absolute", left:"50%", top:"50%",
        transform:"translate(-50%,-40%)",
        width:"clamp(300px, 60vw, 500px)", height:"clamp(200px, 35vh, 300px)",
        background:`radial-gradient(ellipse, ${T.gold}18 0%, ${T.accent}0a 40%, transparent 70%)`,
        borderRadius:"50%", pointerEvents:"none", zIndex:1,
      }} />

      <div style={{ position:"relative", zIndex:2, maxWidth:440, width:"100%", textAlign:"center" }}>
        {/* Glowing title */}
        <div className="reward-title" style={{
          fontSize:"clamp(22px, 6vw, 32px)", fontWeight:900, letterSpacing:2,
          color:T.gold, marginBottom:4,
          textShadow:`0 0 20px ${T.gold}88, 0 0 40px ${T.gold}44, 0 2px 8px #000`,
        }}>CHOOSE A CARD</div>
        <div style={{ fontSize:13, color:"#888", marginBottom:20, letterSpacing:0.5 }}>Add one to your deck</div>

        {/* Cards with staggered float-in — oversized for reward screen */}
        <div className="reward-cards-row" style={{ display:"flex", gap:"clamp(18px, 5vw, 36px)", justifyContent:"center", overflow:"visible", padding:"28px 0 36px" }}>
          {s.rewards.map((id, i) => {
            const card = {...CARDS[id], id};
            const rarityColor = RARITY_BORDER[card.rarity] || "#444";
            return (
              <div key={id} className="reward-card-wrap" style={{
                "--card-in-delay": `${0.2 + i * 0.18}s`,
                "--bob-delay": `${0.8 + i * 0.5}s`,
                "--rarity-color": rarityColor,
              }}>
                <CardView card={card} large onClick={()=>dispatch({type:"PICK_REWARD",cardId:id})} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const LevelUpScreen = ({ state: s, dispatch }) => (
  <Overlay>
    <div style={{ fontSize:18, fontWeight:800, color:T.success, marginBottom:12 }}>LEVEL UP!</div>
    {[{stat:"energy",label:"+1 Max Energy",color:T.gold,detail:`${s.maxEnergy} → ${s.maxEnergy+1}`},
      {stat:"hand",label:"+1 Hand Size",color:T.accent,detail:`${s.handSize} → ${s.handSize+1}`}
    ].map(o => (
      <div key={o.stat} onClick={()=>dispatch({type:"LEVEL_UP",stat:o.stat})}
        style={{ ...box({borderRadius:12,padding:16,cursor:"pointer",marginBottom:8}) }}>
        <div style={{ fontSize:16, fontWeight:700, color:o.color }}>{o.label}</div>
        <div style={{ fontSize:12, color:T.dim }}>{o.detail}</div>
      </div>
    ))}
  </Overlay>
);

const RemoveScreen = ({ state: s, dispatch }) => {
  const all = [...s.deck,...s.discard,...s.hand];
  return (
    <div style={{ position:"fixed", inset:0, background:"radial-gradient(ellipse at 50% 30%, #141428ee 0%, #0a0a0ffa 60%)",
      zIndex:100, display:"flex", flexDirection:"column", alignItems:"center", overflow:"hidden",
      padding:"var(--pad)", paddingTop:`calc(var(--pad) + env(safe-area-inset-top, 0px))`, paddingBottom:`calc(var(--pad) + env(safe-area-inset-bottom, 0px))`,
    }}>
      <div style={{ ...box({borderRadius:16, padding:"clamp(10px,3vw,24px)", maxWidth:"clamp(320px, 92vw, 960px)", width:"100%", textAlign:"center"}),
        display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden", flex:"1 1 0",
      }}>
        <div style={{ fontSize:"clamp(16px, 3.5vw, 20px)", fontWeight:800, color:T.warn, marginBottom:2, flexShrink:0 }}>
          {s.currentNodeType==="rest" ? "REST STOP" : "TRIM YOUR DECK"}
        </div>
        <div style={{ fontSize:"clamp(10px, 2.5vw, 13px)", color:T.dim, marginBottom:10, flexShrink:0 }}>
          {s.currentNodeType==="rest" ? "Take a breather. Remove a card to sharpen your deck." : "Choose a card to remove."}
        </div>
        <div className="deck-scroll" style={{ minHeight:0, flex:"1 1 auto" }}>
          <div className="deck-grid">
            {all.map((card,i) => (
              <div key={i} className="deck-card-wrap" onClick={()=>dispatch({type:"REMOVE_CARD",idx:i})} style={{ cursor:"pointer" }}>
                <CardView card={card} style={{ width:"var(--deck-card-w)", height:"calc(var(--deck-card-w) * 1.5)" }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ flexShrink:0, paddingTop:12 }}>
          <Btn variant="dim" onClick={()=>dispatch({type:"SKIP_REMOVE"})}>Skip</Btn>
        </div>
      </div>
    </div>
  );
};

const ShopScreen = ({ state: s, dispatch }) => {
  const cardCost = 30 + (((s.floor-1)*MAP_LAYERS+s.mapLayer) * 5);
  const removeCost = 50;
  const allCards = [...s.deck, ...s.discard, ...s.hand];
  return (
    <div className="map-shell" style={{ background:T.bg, color:T.text }}>
      <AnimatedBg opacity={0.14} vignette={false} />
      {/* Header */}
      <div style={{ ...box({borderRadius:"var(--radius)",padding:"6px 10px",marginBottom:6,flexShrink:0}), display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:"clamp(14px, 4vw, 18px)", fontWeight:700, color:T.bright, letterSpacing:1 }}>SHOP</div>
        <div style={{ fontSize:"clamp(11px, 3vw, 14px)", color:T.gold, fontWeight:700 }}>Gold: {s.gold}</div>
      </div>

      <div className="map-scroll" style={{ padding:"0 4px" }}>
        <div style={{ width:"100%", maxWidth:440 }}>
          {/* Buy cards */}
          <div style={{ fontSize:14, fontWeight:700, color:T.bright, marginBottom:8 }}>Cards <span style={{ fontSize:11, color:T.dim, fontWeight:400 }}>({cardCost}g each)</span></div>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap", overflow:"visible", padding:"12px 0", marginBottom:16 }}>
            {s.shopCards.length ? s.shopCards.map(id => (
              <div key={id} className="shop-card-wrap" style={{ position:"relative" }}>
                <CardView card={{...CARDS[id],id}}
                  onClick={s.gold >= cardCost ? ()=>dispatch({type:"SHOP_BUY_CARD",cardId:id}) : undefined}
                  playable={s.gold >= cardCost} />
                <div style={{ textAlign:"center", marginTop:4, fontSize:11, fontWeight:700, color:T.gold }}>{cardCost}g</div>
              </div>
            )) : <div style={{ fontSize:12, color:T.dim, padding:8 }}>Sold out!</div>}
          </div>

          {/* Buy relics */}
          <div style={{ fontSize:14, fontWeight:700, color:T.bright, marginBottom:8 }}>Relics</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
            {s.shopRelics.length ? s.shopRelics.map(id => {
              const r = RELICS[id]; const canBuy = s.gold >= r.cost;
              return (
                <div key={id} className="card-hover" onClick={canBuy ? ()=>dispatch({type:"SHOP_BUY_RELIC",relicId:id}) : undefined}
                  style={{ ...box({borderRadius:8,padding:10,cursor:canBuy?"pointer":"default"}), display:"flex", justifyContent:"space-between", alignItems:"center",
                    opacity:canBuy?1:0.4, transition:"all .2s ease" }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:20 }}>{r.icon}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:T.bright }}>{r.name}</div>
                      <div style={{ fontSize:10, color:"#888" }}>{r.desc}</div>
                    </div>
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:T.gold }}>{r.cost}g</span>
                </div>
              );
            }) : <div style={{ fontSize:12, color:T.dim, padding:8 }}>No relics available</div>}
          </div>

          {/* Remove a card */}
          <div style={{ fontSize:14, fontWeight:700, color:T.bright, marginBottom:8 }}>Remove a Card <span style={{ fontSize:11, color:T.dim, fontWeight:400 }}>({removeCost}g)</span></div>
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap", overflow:"visible", padding:"12px 0", marginBottom:16 }}>
            {allCards.map((card, i) => (
              <div key={i} className="shop-card-wrap" style={{ position:"relative" }}>
                <CardView card={card}
                  onClick={s.gold >= removeCost ? ()=>dispatch({type:"SHOP_REMOVE_CARD",idx:i}) : undefined}
                  playable={s.gold >= removeCost} />
                <div style={{ textAlign:"center", marginTop:4, fontSize:10, fontWeight:700, color:T.danger }}>✕ {removeCost}g</div>
              </div>
            ))}
          </div>

          {/* Owned relics */}
          {s.relics.length > 0 && (
            <>
              <div style={{ fontSize:14, fontWeight:700, color:T.bright, marginBottom:8 }}>Your Relics</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                {s.relics.map(id => (
                  <div key={id} style={{ ...box({borderRadius:8,padding:"4px 8px"}), display:"flex", gap:4, alignItems:"center", fontSize:11 }}>
                    <span>{RELICS[id].icon}</span> <span style={{ color:T.bright }}>{RELICS[id].name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Leave button */}
      <div style={{ flexShrink:0, padding:"8px 0", display:"flex", justifyContent:"center" }}>
        <Btn onClick={()=>dispatch({type:"LEAVE_SHOP"})}>Leave Shop</Btn>
      </div>
    </div>
  );
};

const DeckViewScreen = ({ state: s, dispatch }) => {
  const all = [...s.hand,...s.deck,...s.discard];
  return (
    <div style={{ position:"fixed", inset:0, background:"radial-gradient(ellipse at 50% 30%, #141428ee 0%, #0a0a0ffa 60%)",
      zIndex:100, display:"flex", flexDirection:"column", alignItems:"center", overflow:"hidden",
      padding:"var(--pad)", paddingTop:`calc(var(--pad) + env(safe-area-inset-top, 0px))`, paddingBottom:`calc(var(--pad) + env(safe-area-inset-bottom, 0px))`,
    }}>
      <div style={{ ...box({borderRadius:16, padding:"clamp(10px,3vw,24px)", maxWidth:"clamp(320px, 92vw, 960px)", width:"100%", textAlign:"center"}),
        display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden", flex:"1 1 0",
      }}>
        <div style={{ fontSize:"clamp(16px, 3.5vw, 20px)", fontWeight:800, color:T.bright, marginBottom:8, flexShrink:0 }}>DECK ({all.length})</div>
        <div className="deck-scroll" style={{ minHeight:0, flex:"1 1 auto" }}>
          <div className="deck-grid">
            {all.map((card,i) => (
              <div key={i} className="deck-card-wrap">
                <CardView card={card} style={{ width:"var(--deck-card-w)", height:"calc(var(--deck-card-w) * 1.5)" }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ flexShrink:0, paddingTop:12 }}>
          <Btn variant="dim" onClick={()=>dispatch({type:"CLOSE_DECK"})}>Close</Btn>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// ENEMY OVERLAY — positioned absolutely over board, no grid impact
// ═══════════════════════════════════════════════════════════
const EnemyOverlay = ({ enemies, sz, turn, boardRef, hoveredEnemy, setHoveredEnemy, enemyTurnPhase, affectedCells }) => {
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    const measure = () => {
      if (!boardRef.current) return;
      const el = boardRef.current;
      const style = getComputedStyle(el);
      const w = el.offsetWidth;
      const gap = parseFloat(style.gap) || 3;
      const pad = parseFloat(style.paddingLeft) || 3;
      const cellW = (w - pad * 2 - gap * (sz - 1)) / sz;
      setLayout({ w, gap, pad, cellW });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [boardRef, sz, enemies]);

  if (!layout || !enemies.length) return null;
  const { gap, pad, cellW } = layout;

  return (
    <div style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:10 }}>
      {/* Ability flash overlay — shows which cells enemies just affected */}
      {enemyTurnPhase === "ability" && affectedCells && [...affectedCells].map(cellKey => {
        const [pr, pc] = cellKey.split(",").map(Number);
        return (
          <div key={`flash-${cellKey}`} className="enemy-ability-flash" style={{
            position:"absolute",
            left: pad + pc * (cellW + gap),
            top: pad + pr * (cellW + gap),
            width: cellW, height: cellW,
            borderRadius: "var(--cell-radius)",
          }} />
        );
      })}
      {enemies.map(enemy => {
        const def = ENEMY_DEFS[enemy.defId];
        const abil = ENEMY_ABILITIES[def.abilities[turn % def.abilities.length]];
        const left = pad + enemy.c * (cellW + gap);
        const top = pad + enemy.r * (cellW + gap);
        const spriteSize = cellW * 1.3;
        const isHovered = hoveredEnemy === enemy.id;
        const intentCells = isHovered ? abil.preview(enemy, sz) : [];
        return (
          <div key={enemy.id}>
            {/* Intent preview: highlight affected cells */}
            {intentCells.map(cellKey => {
              const [pr, pc] = cellKey.split(",").map(Number);
              return (
                <div key={cellKey} style={{
                  position:"absolute",
                  left: pad + pc * (cellW + gap),
                  top: pad + pr * (cellW + gap),
                  width: cellW, height: cellW,
                  borderRadius: "var(--cell-radius)",
                  background: "rgba(255,60,60,0.2)",
                  border: "2px solid rgba(255,60,60,0.5)",
                  pointerEvents:"none",
                }} />
              );
            })}
            {/* Enemy sprite — clicks pass through to cell beneath */}
            <div
              className={enemy._spawning ? "enemy-sprite-spawn" : enemyTurnPhase === "ability" ? "enemy-sprite-attack" : "enemy-sprite-bob"}
              style={{
                position:"absolute",
                left: left + cellW / 2 - spriteSize / 2,
                top: top + cellW - spriteSize * 0.85,
                width: spriteSize,
                height: spriteSize,
                pointerEvents:"auto",
                cursor:"pointer",
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))",
                transition: "left 0.5s ease, top 0.5s ease",
                animationDelay: `${(enemy.r * sz + enemy.c) * 0.3}s`,
              }}
              onMouseEnter={() => setHoveredEnemy(enemy.id)}
              onMouseLeave={() => setHoveredEnemy(null)}
              onTouchStart={(e) => { e.stopPropagation(); setHoveredEnemy(isHovered ? null : enemy.id); }}
              onClick={(e) => {
                // Forward click to the board cell underneath
                e.stopPropagation();
                const el = document.elementFromPoint(e.clientX, e.clientY);
                // Temporarily hide this sprite, find the cell beneath, click it
                const self = e.currentTarget;
                self.style.pointerEvents = "none";
                const below = document.elementFromPoint(e.clientX, e.clientY);
                self.style.pointerEvents = "auto";
                if (below && below.classList.contains("board-cell")) below.click();
              }}
            >
              <img
                src={`/enemies/${def.sprite}.png`}
                alt={def.name}
                style={{ width:"100%", height:"100%", objectFit:"contain" }}
                draggable={false}
              />
              {/* Color chain progress — scales to fit sprite width */}
              {(() => {
                const chainLen = enemy.chain.length;
                const maxPipW = spriteSize * 0.8; // max width for all pips
                const pipGap = Math.max(1, Math.min(2, maxPipW / chainLen * 0.15));
                const pipSize = Math.max(5, Math.min(10, (maxPipW - pipGap * (chainLen - 1)) / chainLen));
                return (
                  <div style={{
                    position:"absolute", bottom: -4, left:"50%", transform:"translateX(-50%)",
                    display:"flex", gap: pipGap,
                  }}>
                    {enemy.chain.map((color, i) => (
                      <div key={i} style={{
                        width: pipSize, height: pipSize,
                        borderRadius: "50%", background: color,
                        border: `${Math.max(1, pipSize * 0.2)}px solid ${i < enemy.chainIdx ? "#0a0a0f" : "#fff8"}`,
                        opacity: i < enemy.chainIdx ? 0.3 : 1,
                        boxShadow: i === enemy.chainIdx ? `0 0 ${pipSize * 0.6}px ${color}` : "none",
                      }} />
                    ))}
                  </div>
                );
              })()}
            </div>
            {/* Hover tooltip */}
            {isHovered && (
              <div style={{
                position:"absolute",
                left: left + cellW / 2,
                top: top - spriteSize * 0.35 - 48,
                transform:"translateX(-50%)",
                background:"#1a1028",
                border:"1px solid #4a2868",
                borderRadius: 8,
                padding:"6px 10px",
                pointerEvents:"none",
                zIndex: 50,
                whiteSpace:"nowrap",
                boxShadow:"0 4px 12px rgba(0,0,0,0.6)",
              }}>
                <div style={{ fontWeight:800, fontSize:11, color:"#ff8888", marginBottom:2 }}>{def.name}</div>
                {def.abilities.map(aId => {
                  const a = ENEMY_ABILITIES[aId];
                  return <div key={aId} style={{ fontSize:9, color:"#ccc" }}>{a.icon} {a.name}: {a.desc}</div>;
                })}
                <div style={{ display:"flex", alignItems:"center", gap:3, marginTop:3 }}>
                  <span style={{ fontSize:8, color:"#888" }}>Chain:</span>
                  {enemy.chain.map((c, i) => (
                    <span key={i} style={{
                      display:"inline-block", width:8, height:8, borderRadius:"50%",
                      background: c, opacity: i < enemy.chainIdx ? 0.3 : 1,
                      border: i === enemy.chainIdx ? "1px solid #fff" : "1px solid #0005",
                    }} />
                  ))}
                  <span style={{ fontSize:8, color:"#888" }}>({enemy.chainIdx}/{enemy.chain.length})</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN GAME COMPONENT
// ═══════════════════════════════════════════════════════════
// ── Compute preview cells for a card targeting a cell ──
const getCardPreviewCells = (card, r, c, board) => {
  if (!card || !board) return new Set();
  const sz = board.length;
  const cells = new Set();
  const target = card.target;
  if (target === "cell+color") {
    // Depends on card effect type
    if (card.id === "flood_fill" || card.id === "cascade") {
      const flood = getFlood(board, r, c);
      for (const k of flood) cells.add(k);
      if (card.id === "cascade") {
        for (const key of flood) {
          const [fr,fc] = key.split(",").map(Number);
          for (const [dr,dc] of DIRS) { const nr=fr+dr,nc=fc+dc; if(inB(nr,nc,sz)) cells.add(`${nr},${nc}`); }
        }
      }
    } else if (card.id === "cross_wash") {
      for (let i=0;i<sz;i++) { cells.add(`${r},${i}`); cells.add(`${i},${c}`); }
    } else if (card.id === "diagonal_slash") {
      for (let d=-sz;d<=sz;d++) { if(inB(r+d,c+d,sz)) cells.add(`${r+d},${c+d}`); if(inB(r+d,c-d,sz)) cells.add(`${r+d},${c-d}`); }
    } else {
      // paint / snipe / paint_bomb / mega_bomb — area based
      const radius = card.id==="mega_bomb" ? 2 : card.id==="paint_bomb" ? 1 : 0;
      for (let dr=-radius;dr<=radius;dr++) for (let dc=-radius;dc<=radius;dc++) {
        if (inB(r+dr,c+dc,sz)) cells.add(`${r+dr},${c+dc}`);
      }
    }
  } else if (target === "2cell") {
    cells.add(`${r},${c}`);
  } else if (target === "row+color") {
    for (let i=0;i<sz;i++) cells.add(`${r},${i}`);
  } else if (target === "col+color") {
    for (let i=0;i<sz;i++) cells.add(`${i},${c}`);
  }
  return cells;
};

export default function CellsRoguelike() {
  const [s, dispatch] = useReducer(reducer, null, initState);
  const [drag, setDrag] = useState(null); // { idx, x, y }
  const [hoverCell, setHoverCell] = useState(null); // { r, c }
  const [hoveredEnemy, setHoveredEnemy] = useState(null); // enemy id
  const boardRef = useRef(null);
  const dragCardRef = useRef(null);

  const needsColorPick = s.targeting && ["color_final","color1","color2"].includes(s.targeting.step);
  const sz = s.board?.length || 5;

  // Track cells that changed color for glow animation
  const prevBoardRef = useRef(null);
  const [changedCells, setChangedCells] = useState(new Set());
  const changedTimerRef = useRef(null);

  useEffect(() => {
    const prev = prevBoardRef.current;
    const cur = s.board;
    if (prev && cur && prev.length === cur.length) {
      const changed = new Set();
      for (let r = 0; r < cur.length; r++) {
        for (let c = 0; c < cur[r].length; c++) {
          if (prev[r][c] !== cur[r][c]) changed.add(`${r},${c}`);
        }
      }
      if (changed.size > 0) {
        setChangedCells(changed);
        clearTimeout(changedTimerRef.current);
        changedTimerRef.current = setTimeout(() => setChangedCells(new Set()), 600);
      }
    }
    prevBoardRef.current = cur ? cur.map(row => [...row]) : null;
  }, [s.board]);

  // ── Enemy turn animation sequencer ──
  useEffect(() => {
    if (!s.enemyTurnPhase) return;
    let timer;
    if (s.enemyTurnPhase === "moving") {
      // After movement animation plays (CSS transition), trigger abilities
      timer = setTimeout(() => dispatch({ type: "ENEMY_ABILITY" }), 650);
    } else if (s.enemyTurnPhase === "ability") {
      // After ability visual, finish turn
      timer = setTimeout(() => dispatch({ type: "FINISH_ENEMY_TURN" }), 800);
    }
    return () => clearTimeout(timer);
  }, [s.enemyTurnPhase]);

  // Compute preview cells when dragging over board
  const previewCells = (drag && hoverCell && s.hand[drag.idx])
    ? getCardPreviewCells(s.hand[drag.idx], hoverCell.r, hoverCell.c, s.board)
    : new Set();

  // Drag handlers — use refs to track latest values for global listeners
  const dragRef = useRef(null); // pending drag before threshold
  const dragStateRef = useRef(null); // latest drag state (updated eagerly)
  const hoverCellRef = useRef(null); // latest hoverCell (updated eagerly)
  const handRef = useRef(s.hand); // latest hand
  handRef.current = s.hand;
  const didDrag = useRef(false);
  const pendingClickTimeout = useRef(null); // track delayed CLICK_CELL from drag release
  const DRAG_THRESHOLD = 8;

  const onPointerDown = useCallback((idx, e) => {
    const card = s.hand[idx];
    if (!card || card.cost > s.energy) return;
    const touch = e.touches ? e.touches[0] : e;
    didDrag.current = false;
    dragRef.current = { idx, startX: touch.clientX, startY: touch.clientY };
  }, [s.hand, s.energy]);

  // Attach global listeners once (read from refs to avoid stale closures)
  useEffect(() => {
    const onMove = (e) => {
      const touch = e.touches ? e.touches[0] : e;
      const curDrag = dragStateRef.current;
      // Check threshold before starting real drag
      if (dragRef.current && !curDrag) {
        const dx = touch.clientX - dragRef.current.startX;
        const dy = touch.clientY - dragRef.current.startY;
        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
          didDrag.current = true;
          const newDrag = { idx: dragRef.current.idx, x: touch.clientX, y: touch.clientY };
          dragStateRef.current = newDrag; // update ref eagerly
          setDrag(newDrag);
        }
        return;
      }
      if (!curDrag) return;
      e.preventDefault?.();
      const newDrag = { ...curDrag, x: touch.clientX, y: touch.clientY };
      dragStateRef.current = newDrag;
      setDrag(newDrag);
      // Find which board cell is under cursor
      if (boardRef.current) {
        const boardRect = boardRef.current.getBoundingClientRect();
        const style = getComputedStyle(boardRef.current);
        const padL = parseFloat(style.paddingLeft) || 0;
        const padT = parseFloat(style.paddingTop) || 0;
        const padR = parseFloat(style.paddingRight) || 0;
        const padB = parseFloat(style.paddingBottom) || 0;
        const innerW = boardRect.width - padL - padR;
        const innerH = boardRect.height - padT - padB;
        const relX = touch.clientX - boardRect.left - padL;
        const relY = touch.clientY - boardRect.top - padT;
        if (relX >= 0 && relX < innerW && relY >= 0 && relY < innerH) {
          const bsz = s.board?.length || 5;
          const col = Math.floor(relX / (innerW / bsz));
          const row = Math.floor(relY / (innerH / bsz));
          if (row >= 0 && row < bsz && col >= 0 && col < bsz) {
            const newHover = { r: row, c: col };
            hoverCellRef.current = newHover;
            setHoverCell(newHover);
          } else { hoverCellRef.current = null; setHoverCell(null); }
        } else { hoverCellRef.current = null; setHoverCell(null); }
      }
    };
    const onUp = (e) => {
      const curDrag = dragStateRef.current;
      let curHover = hoverCellRef.current;
      // Also check board cell from mouseup position (handles fast drags with few mousemove events)
      if (curDrag && !curHover && boardRef.current) {
        const touch = e.touches ? e.changedTouches[0] : e;
        if (touch) {
          const boardRect = boardRef.current.getBoundingClientRect();
          const style = getComputedStyle(boardRef.current);
          const padL = parseFloat(style.paddingLeft) || 0;
          const padT = parseFloat(style.paddingTop) || 0;
          const padR = parseFloat(style.paddingRight) || 0;
          const padB = parseFloat(style.paddingBottom) || 0;
          const innerW = boardRect.width - padL - padR;
          const innerH = boardRect.height - padT - padB;
          const relX = touch.clientX - boardRect.left - padL;
          const relY = touch.clientY - boardRect.top - padT;
          if (relX >= 0 && relX < innerW && relY >= 0 && relY < innerH) {
            const bsz = boardRef.current.children.length ? Math.round(Math.sqrt(boardRef.current.children.length)) : 5;
            const col = Math.floor(relX / (innerW / bsz));
            const row = Math.floor(relY / (innerH / bsz));
            if (row >= 0 && row < bsz && col >= 0 && col < bsz) {
              curHover = { r: row, c: col };
            }
          }
        }
      }
      if (curDrag && curHover) {
        const card = handRef.current[curDrag.idx];
        if (card && !card.special && ["cell+color","row+color","col+color","2cell"].includes(card.target)) {
          clearTimeout(pendingClickTimeout.current);
          dispatch({ type: "SELECT_CARD", idx: curDrag.idx });
          const hr = curHover.r, hc = curHover.c;
          const expectedIdx = curDrag.idx;
          pendingClickTimeout.current = setTimeout(() => {
            pendingClickTimeout.current = null;
            dispatch({ type: "CLICK_CELL", r: hr, c: hc, fromCard: expectedIdx });
          }, 10);
        }
      }
      dragRef.current = null;
      dragStateRef.current = null;
      hoverCellRef.current = null;
      setDrag(null);
      setHoverCell(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  if (s.phase===P.TITLE)     return <TitleScreen dispatch={dispatch} />;
  if (s.phase===P.MAP)       return <MapScreen state={s} dispatch={dispatch} />;
  if (s.phase===P.GAME_OVER) return <GameOverScreen state={s} dispatch={dispatch} />;
  if (s.phase===P.VICTORY)   return <VictoryScreen state={s} dispatch={dispatch} />;
  if (s.phase===P.SHOP)      return <ShopScreen state={s} dispatch={dispatch} />;

  const overlay =
    s.phase===P.WIN      ? <WinScreen state={s} dispatch={dispatch} /> :
    s.phase===P.REWARD   ? <RewardScreen state={s} dispatch={dispatch} /> :
    s.phase===P.LEVEL_UP ? <LevelUpScreen state={s} dispatch={dispatch} /> :
    s.phase===P.REMOVE   ? <RemoveScreen state={s} dispatch={dispatch} /> :
    s.phase===P.DECK_VIEW? <DeckViewScreen state={s} dispatch={dispatch} /> : null;

  return (
    <>
    {overlay}
    <div className="game-shell" style={{ background:T.bg, color:T.text }}>
      <AnimatedBg opacity={0.12} vignette={false} />

      {/* ── Header ── */}
      <div className="game-header" style={{ ...box({padding:"clamp(2px, 0.5dvh, 4px) 10px",marginBottom:"var(--gap)"}), display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ fontSize:"clamp(12px, 3.5vw, 16px)", fontWeight:700, color:T.bright, letterSpacing:1 }}>CELLS</span>
          {s.hardMode && <span style={{ fontSize:"clamp(7px, 2vw, 9px)", fontWeight:800, color:T.danger, background:`${T.danger}20`, padding:"1px 4px", borderRadius:3, letterSpacing:0.5 }}>HARD</span>}
        </div>
        <div style={{ display:"flex", gap:4, alignItems:"center" }}>
          <span style={{ fontSize:"clamp(9px, 2.5vw, 11px)", color:T.dim }}>F{s.floor} · {s.mapLayer}/{MAP_LAYERS}</span>
          {s.currentNodeType && <span style={{ fontSize:"clamp(10px, 3vw, 12px)", color:NODE_TYPES[s.currentNodeType]?.color }}>{NODE_TYPES[s.currentNodeType]?.icon}</span>}
        </div>
      </div>

      {/* ── HUD ── */}
      <div className="game-hud" style={{ display:"flex", flexDirection:"column", gap:"var(--gap)" }}>
        {/* Stats row */}
        <div style={{ display:"flex", gap:"var(--gap)" }}>
          <Stat label="Energy" value={`${s.energy}/${s.maxEnergy}`} color={T.gold} />
          <Stat label="Turn" value={`${s.turn}/${s.maxTurns}`} color={T.danger} />
          <Stat label="Taps" value={s.taps} color={T.warn} />
          <Stat label="Gold" value={s.gold} color={T.gold} />
        </div>

        {/* Info row */}
        <div style={{ display:"flex", gap:"clamp(6px, 2vw, 10px)", justifyContent:"center", fontSize:"clamp(8px, 2.5vw, 10px)", color:T.dim, fontWeight:600 }}>
          <span>{sz}×{sz}</span>
          <span onClick={()=>dispatch({type:"VIEW_DECK"})} style={{ cursor:"pointer", textDecoration:"underline" }}>
            Deck: {s.deck.length+s.hand.length+s.discard.length}
          </span>
          <span>Draw: {s.deck.length}</span>
        </div>

        {/* Message – always present to reserve layout space, hidden on very short screens */}
        <div className="game-message" style={{
          ...box({borderRadius:8,padding:"clamp(1px, 0.5dvh, 4px) 8px"}),
          textAlign:"center", fontSize:"clamp(8px, min(3vw, 1.8dvh), 12px)",
          color: s.enemyTurnPhase ? "#ff8888" : "#aaa",
          fontWeight: s.enemyTurnPhase ? 700 : 400,
          visibility: (s.message || s.targeting || s.enemyTurnPhase) ? "visible" : "hidden",
        }}>
          {s.enemyTurnPhase === "moving" ? "⚔ Enemy moving..." : s.enemyTurnPhase === "ability" ? "⚔ Enemy attacks!" : s.message || "\u00A0"}
        </div>

        {/* Cycle */}
        {s.colorCycle.length > 0 && <CycleIndicator cycle={s.colorCycle} />}
      </div>

      {/* ── Board (fills remaining space) ── */}
      <div className="game-board-area">
        <div style={{ position:"relative" }}>
          <div ref={boardRef} className={`game-board${drag && hoverCell ? " board-drag-active" : ""}`} style={{ ...box(), gridTemplateColumns:`repeat(${sz}, 1fr)` }}>
            {s.board?.map((rowArr, r) => rowArr.map((color, c) => {
              const key = `${r},${c}`;
              const lit = s.highlight.has(key);
              const isLocked = s.locked[r][c];
              const isPrev = previewCells.has(key);
              const isHoverTarget = hoverCell && hoverCell.r === r && hoverCell.c === c && drag;
              const isChanged = changedCells.has(key);
              const hasEnemy = s.enemies?.some(e => e.r === r && e.c === c);
              return (
                <div key={key}
                  className={`board-cell${lit?" board-cell-lit":""}${isLocked?" board-cell-locked":""}${isPrev?" board-cell-preview":""}${isHoverTarget?" board-cell-target":""}${isChanged?" board-cell-changed":""}${hasEnemy?" board-cell-enemy":""}`}
                  onClick={()=>dispatch({type:"CLICK_CELL",r,c})}
                  style={{
                    "--cell-color": color,
                  }}
                >{isLocked && <span style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"clamp(6px, min(2vw, 2vh), 14px)", lineHeight:1, pointerEvents:"none" }}>🔒</span>}</div>
              );
            }))}
          </div>
          {/* ── Enemy sprite overlay — absolutely positioned, no grid impact ── */}
          {s.enemies?.length > 0 && <EnemyOverlay enemies={s.enemies} sz={sz} turn={s.turn} boardRef={boardRef} hoveredEnemy={hoveredEnemy} setHoveredEnemy={setHoveredEnemy} enemyTurnPhase={s.enemyTurnPhase} affectedCells={s._enemyAffectedCells} />}
        </div>
      </div>

      {/* ── Color picker (always present, greyed out when unavailable) ── */}
      <ColorPicker numColors={s.numColors} onPick={color=>dispatch({type:"PICK_COLOR",color})} disabled={!needsColorPick} />

      {/* ── Hand ── */}
      <div className="game-hand-area" style={s.enemyTurnPhase ? { opacity:0.4, pointerEvents:"none" } : {}}>
        <div className="game-hand">
          {s.hand.length ? s.hand.map((card,i) => {
            const playable = card.cost <= s.energy && !s.enemyTurnPhase;
            const count = s.hand.length;
            const mid = (count - 1) / 2;
            const offset = i - mid;
            const rotation = offset * (count <= 3 ? 4 : count <= 5 ? 3 : 2);
            const lift = -Math.abs(offset) * (count <= 3 ? 6 : 4);
            const isDragging = drag && drag.idx === i;
            return (
              <div key={card.uid} className={`hand-card${isDragging?" hand-card-dragging":""}`}
                ref={isDragging ? dragCardRef : undefined}
                style={{
                transform: isDragging ? "rotate(0deg)" : `rotate(${rotation}deg) translateY(${lift}px)`,
                zIndex: isDragging ? 60 : i,
                "--bob-delay": `${i * 0.35}s`,
                opacity: 1,
                filter: isDragging ? "brightness(1.3) drop-shadow(0 0 12px rgba(52,152,219,0.7))" : "none",
              }}
                onMouseDown={playable ? (e)=>onPointerDown(i,e) : undefined}
                onTouchStart={playable ? (e)=>onPointerDown(i,e) : undefined}
              >
                <CardView card={card} playable={playable}
                  onClick={playable ? ()=>{ if(didDrag.current) { didDrag.current=false; return; } clearTimeout(pendingClickTimeout.current); pendingClickTimeout.current=null; dispatch({type:"SELECT_CARD",idx:i}); } : undefined} />
              </div>
            );
          }) : <div style={{ color:"#444", fontSize:12, padding:12, textAlign:"center", width:"100%" }}>No cards in hand</div>}
        </div>
      </div>

      {/* ── Drag targeting arrow ── */}
      {drag && s.hand[drag.idx] && (() => {
        const cardEl = dragCardRef.current;
        if (!cardEl) return null;
        const rect = cardEl.getBoundingClientRect();
        const sx = rect.left + rect.width / 2;
        const sy = rect.top;
        const ex = drag.x;
        const ey = drag.y;
        const dx = ex - sx;
        const dy = ey - sy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const mx = (sx + ex) / 2;
        const my = Math.min(sy, ey) - Math.max(40, dist * 0.25);
        const onBoard = !!hoverCell;
        // Arrowhead angle from curve tangent at endpoint
        const t = 0.97;
        const tanX = 2*(1-t)*(mx-sx) + 2*t*(ex-mx);
        const tanY = 2*(1-t)*(my-sy) + 2*t*(ey-my);
        const angle = Math.atan2(tanY, tanX);
        const aLen = onBoard ? 14 : 10;
        const pathD = `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
        const gradId = "targ-grad";
        const glowId = "targ-glow";
        const flowId = "targ-flow";
        return (
          <svg style={{ position:"fixed", inset:0, width:"100vw", height:"100vh", zIndex:199, pointerEvents:"none" }}>
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={T.gold} stopOpacity="0.6"/>
                <stop offset="50%" stopColor={onBoard ? T.accent : "#667"} stopOpacity="0.9"/>
                <stop offset="100%" stopColor={onBoard ? "#fff" : "#aaa"} stopOpacity="1"/>
              </linearGradient>
              <filter id={glowId}>
                <feGaussianBlur stdDeviation={onBoard ? "5" : "2"} result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="reticle-pulse">
                <feGaussianBlur stdDeviation="4" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* Outer glow trail */}
            <path d={pathD} fill="none"
              stroke={onBoard ? T.accent : "#555"} strokeWidth={onBoard ? 10 : 6}
              strokeLinecap="round" opacity={0.15}
              filter={`url(#${glowId})`}
            />
            {/* Main energy beam */}
            <path d={pathD} fill="none"
              stroke={`url(#${gradId})`} strokeWidth={onBoard ? 3.5 : 2}
              strokeLinecap="round" filter={`url(#${glowId})`}
            />
            {/* Flowing energy particles (animated dashes) */}
            <path d={pathD} fill="none"
              stroke={onBoard ? "#fff" : "#999"} strokeWidth={onBoard ? 2 : 1.5}
              strokeLinecap="round" strokeDasharray="3 14"
              opacity={onBoard ? 0.7 : 0.4}
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-34" dur="0.6s" repeatCount="indefinite"/>
            </path>

            {/* Arrowhead — diamond shape */}
            <polygon
              points={`${ex},${ey} ${ex - aLen*Math.cos(angle - 0.45)},${ey - aLen*Math.sin(angle - 0.45)} ${ex - aLen*1.4*Math.cos(angle)},${ey - aLen*1.4*Math.sin(angle)} ${ex - aLen*Math.cos(angle + 0.45)},${ey - aLen*Math.sin(angle + 0.45)}`}
              fill={onBoard ? "#fff" : "#999"} opacity={onBoard ? 0.9 : 0.5}
              filter={`url(#${glowId})`}
            />

            {/* Targeting reticle — crosshair style */}
            {onBoard && <>
              <circle cx={ex} cy={ey} r={18} fill="none"
                stroke={T.accent} strokeWidth={1.5} opacity={0.5}
                strokeDasharray="6 6" filter="url(#reticle-pulse)"
              >
                <animateTransform attributeName="transform" type="rotate"
                  from={`0 ${ex} ${ey}`} to={`360 ${ex} ${ey}`} dur="3s" repeatCount="indefinite"/>
              </circle>
              <circle cx={ex} cy={ey} r={10} fill="none"
                stroke="#fff" strokeWidth={1.5} opacity={0.7}
              />
              <circle cx={ex} cy={ey} r={3} fill={T.accent} opacity={0.9}
                filter="url(#reticle-pulse)"
              />
              {/* Crosshair lines */}
              <line x1={ex-18} y1={ey} x2={ex-12} y2={ey} stroke="#fff" strokeWidth={1.5} opacity={0.5}/>
              <line x1={ex+12} y1={ey} x2={ex+18} y2={ey} stroke="#fff" strokeWidth={1.5} opacity={0.5}/>
              <line x1={ex} y1={ey-18} x2={ex} y2={ey-12} stroke="#fff" strokeWidth={1.5} opacity={0.5}/>
              <line x1={ex} y1={ey+12} x2={ex} y2={ey+18} stroke="#fff" strokeWidth={1.5} opacity={0.5}/>
            </>}
            {!onBoard && <circle cx={ex} cy={ey} r={6} fill="none"
              stroke="#666" strokeWidth={1.5} opacity={0.4} strokeDasharray="3 3"
            />}
          </svg>
        );
      })()}

      {/* ── Action buttons ── */}
      <div className="game-actions">
        <Btn variant="danger" onClick={()=>dispatch({type:"END_TURN"})} style={s.enemyTurnPhase ? {opacity:0.4,pointerEvents:"none"} : {}}>End Turn</Btn>
        {s.targeting && <Btn variant="dim" onClick={()=>dispatch({type:"CANCEL_TARGET"})}>Cancel</Btn>}
        <Btn variant="dim" onClick={()=>dispatch({type:"VIEW_DECK"})}>View Deck</Btn>
      </div>
    </div>
    </>
  );
}
