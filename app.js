const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");
const alphaInput = document.getElementById("alpha");
const gammaInput = document.getElementById("gamma");
const epsilonInput = document.getElementById("epsilon");
const speedInput = document.getElementById("speed");
const alphaValue = document.getElementById("alpha-value");
const gammaValue = document.getElementById("gamma-value");
const epsilonValue = document.getElementById("epsilon-value");
const speedValue = document.getElementById("speed-value");
const epsilonLive = document.getElementById("epsilon-live");
const episodeDisplay = document.getElementById("episode");
const stepsDisplay = document.getElementById("steps");
const rewardDisplay = document.getElementById("reward");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const resetBtn = document.getElementById("reset");
const qTableContainer = document.getElementById("q-table");

const gridSize = 5;
const cellSize = canvas.width / gridSize;
const startState = { x: 0, y: 0 };
const goalState = { x: gridSize - 1, y: gridSize - 1 };
const obstacles = [
  { x: 2, y: 1 },
  { x: 1, y: 3 },
  { x: 3, y: 2 },
];
const actions = [
  { name: "Up", dx: 0, dy: -1, arrow: "↑" },
  { name: "Right", dx: 1, dy: 0, arrow: "→" },
  { name: "Down", dx: 0, dy: 1, arrow: "↓" },
  { name: "Left", dx: -1, dy: 0, arrow: "←" },
];

let qTable = createQTable();
let currentState = { ...startState };
let episodes = 0;
let steps = 0;
let totalReward = 0;
let epsilon = parseFloat(epsilonInput.value);
let alpha = parseFloat(alphaInput.value);
let gamma = parseFloat(gammaInput.value);
let running = false;
let animationHandle;

function createQTable() {
  return Array.from({ length: gridSize * gridSize }, () => Array(actions.length).fill(0));
}

function getStateIndex({ x, y }) {
  return y * gridSize + x;
}

function isObstacle(x, y) {
  return obstacles.some((obs) => obs.x === x && obs.y === y);
}

function resetEpisode() {
  currentState = { ...startState };
  steps = 0;
  totalReward = 0;
  stepsDisplay.textContent = "0";
  rewardDisplay.textContent = "0";
  draw();
}

function resetAll() {
  running = false;
  clearTimeout(animationHandle);
  qTable = createQTable();
  episodes = 0;
  epsilon = parseFloat(epsilonInput.value);
  alpha = parseFloat(alphaInput.value);
  gamma = parseFloat(gammaInput.value);
  updateRangeDisplays();
  epsilonLive.textContent = epsilon.toFixed(2);
  episodeDisplay.textContent = "0";
  stepsDisplay.textContent = "0";
  rewardDisplay.textContent = "0";
  resetEpisode();
  updateQTableDisplay();
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function environmentStep(state, actionIndex) {
  const action = actions[actionIndex];
  let newX = state.x + action.dx;
  let newY = state.y + action.dy;
  if (newX < 0 || newX >= gridSize || newY < 0 || newY >= gridSize) {
    newX = state.x;
    newY = state.y;
  }

  if (isObstacle(newX, newY)) {
    newX = state.x;
    newY = state.y;
  }

  let reward = -1;
  let done = false;
  if (newX === goalState.x && newY === goalState.y) {
    reward = 10;
    done = true;
  }

  return {
    nextState: { x: newX, y: newY },
    reward,
    done,
  };
}

function chooseAction(stateIndex) {
  if (Math.random() < epsilon) {
    return Math.floor(Math.random() * actions.length);
  }
  const values = qTable[stateIndex];
  let maxValue = -Infinity;
  let bestAction = 0;
  values.forEach((value, index) => {
    if (value > maxValue) {
      maxValue = value;
      bestAction = index;
    }
  });
  return bestAction;
}

function updateQValue(stateIndex, actionIndex, reward, nextStateIndex) {
  const bestNext = Math.max(...qTable[nextStateIndex]);
  const currentQ = qTable[stateIndex][actionIndex];
  qTable[stateIndex][actionIndex] = currentQ + alpha * (reward + gamma * bestNext - currentQ);
}

function updateStats(done) {
  stepsDisplay.textContent = steps.toString();
  rewardDisplay.textContent = totalReward.toFixed(1);
  if (done) {
    episodes += 1;
    episodeDisplay.textContent = episodes.toString();
    epsilon = clamp(epsilon * 0.995, 0.01, parseFloat(epsilonInput.max));
    epsilonLive.textContent = epsilon.toFixed(2);
  }
}

function updateRangeDisplays() {
  alphaValue.textContent = parseFloat(alphaInput.value).toFixed(2);
  gammaValue.textContent = parseFloat(gammaInput.value).toFixed(2);
  epsilonValue.textContent = parseFloat(epsilonInput.value).toFixed(2);
  speedValue.textContent = speedInput.value;
}

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i += 1) {
    ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
    ctx.beginPath();
    ctx.moveTo(i * cellSize, 0);
    ctx.lineTo(i * cellSize, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * cellSize);
    ctx.lineTo(canvas.width, i * cellSize);
    ctx.stroke();
  }
}

function drawSpecialCells() {
  ctx.fillStyle = "rgba(94, 234, 212, 0.35)";
  ctx.fillRect(
    goalState.x * cellSize + 4,
    goalState.y * cellSize + 4,
    cellSize - 8,
    cellSize - 8
  );

  ctx.fillStyle = "rgba(248, 113, 113, 0.4)";
  obstacles.forEach(({ x, y }) => {
    ctx.fillRect(x * cellSize + 8, y * cellSize + 8, cellSize - 16, cellSize - 16);
  });
}

function drawAgent() {
  ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
  ctx.beginPath();
  ctx.arc(
    currentState.x * cellSize + cellSize / 2,
    currentState.y * cellSize + cellSize / 2,
    cellSize * 0.28,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function draw() {
  drawGrid();
  drawSpecialCells();
  drawAgent();
}

function updateQTableDisplay() {
  qTableContainer.innerHTML = "";
  let globalMax = -Infinity;
  let globalMin = Infinity;
  qTable.forEach((row) => {
    row.forEach((value) => {
      globalMax = Math.max(globalMax, value);
      globalMin = Math.min(globalMin, value);
    });
  });

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const stateIndex = getStateIndex({ x, y });
      const cell = document.createElement("div");
      cell.className = "state-cell";
      if (currentState.x === x && currentState.y === y) {
        cell.classList.add("active");
        const badge = document.createElement("div");
        badge.className = "badge";
        badge.textContent = "agent";
        cell.appendChild(badge);
      }

      const stateLabel = document.createElement("strong");
      stateLabel.textContent = `(${x}, ${y})`;
      cell.appendChild(stateLabel);

      const values = qTable[stateIndex];
      const bestValue = Math.max(...values);
      values.forEach((value, index) => {
        const valueBox = document.createElement("div");
        valueBox.className = "q-value";
        if (value === bestValue) {
          valueBox.classList.add("best");
        }
        const actionLabel = document.createElement("span");
        actionLabel.textContent = actions[index].arrow;
        const number = document.createElement("strong");
        number.textContent = value.toFixed(2);
        valueBox.append(actionLabel, number);
        cell.appendChild(valueBox);
      });

      const intensity = globalMax === globalMin ? 0.5 : (bestValue - globalMin) / (globalMax - globalMin);
      cell.style.background = `linear-gradient(160deg, rgba(56, 189, 248, ${0.15 + intensity * 0.25}), rgba(15, 23, 42, 0.8))`;

      qTableContainer.appendChild(cell);
    }
  }
}

function trainingStep() {
  if (!running) return;

  alpha = parseFloat(alphaInput.value);
  gamma = parseFloat(gammaInput.value);

  const stateIndex = getStateIndex(currentState);
  const actionIndex = chooseAction(stateIndex);
  const { nextState, reward, done } = environmentStep(currentState, actionIndex);
  const nextIndex = getStateIndex(nextState);
  updateQValue(stateIndex, actionIndex, reward, nextIndex);
  currentState = nextState;
  steps += 1;
  totalReward += reward;
  updateStats(done);
  draw();
  updateQTableDisplay();

  if (done) {
    resetEpisode();
  }

  const delay = parseInt(speedInput.value, 10);
  if (running) {
    animationHandle = setTimeout(trainingStep, delay);
  }
}

function startTraining() {
  if (running) return;
  running = true;
  epsilon = parseFloat(epsilonInput.value);
  epsilonLive.textContent = epsilon.toFixed(2);
  startBtn.disabled = true;
  stopBtn.disabled = false;
  trainingStep();
}

function stopTraining() {
  running = false;
  clearTimeout(animationHandle);
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

alphaInput.addEventListener("input", updateRangeDisplays);
gammaInput.addEventListener("input", updateRangeDisplays);
epsilonInput.addEventListener("input", () => {
  updateRangeDisplays();
  epsilonLive.textContent = parseFloat(epsilonInput.value).toFixed(2);
});
speedInput.addEventListener("input", updateRangeDisplays);
startBtn.addEventListener("click", startTraining);
stopBtn.addEventListener("click", stopTraining);
resetBtn.addEventListener("click", resetAll);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopTraining();
  }
});

resetAll();
draw();
updateQTableDisplay();
