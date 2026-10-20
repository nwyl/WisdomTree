const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const toolbar = document.getElementById("toolbar");
const topTrigger = document.getElementById("topTrigger");
const resetBtn = document.getElementById("resetView");

// ============ 核心锚点坐标 ============
const CORE_X = 1000;
const CORE_Y = 1000;

// 小卡片离核心的半径
const ORBIT_RADIUS = 400;

// ============ 数据：只放小卡片 ============
// x/y 不用写，由布局函数自动算
const nodesData = [
  { id: "card1", type: "small", text: "卡片 1" },
  { id: "card2", type: "small", text: "卡片 2" },
  { id: "card3", type: "small", text: "卡片 3" },
  { id: "card4", type: "small", text: "卡片 4" },
];

// ============ 按圆周等分，算出每个卡片的坐标 ============
function layoutNodes() {
  const count = nodesData.length;
  if (count === 0) return;

  const angleStep = (Math.PI * 2) / count;
  // 从正上方开始，可选：-Math.PI / 2 表示 12 点钟方向
  const startAngle = -Math.PI / 2;

  nodesData.forEach((n, i) => {
    const angle = startAngle + angleStep * i;
    n.x = CORE_X + Math.cos(angle) * ORBIT_RADIUS;
    n.y = CORE_Y + Math.sin(angle) * ORBIT_RADIUS;
  });
}

// ============ 画布偏移和缩放 ============
let offsetX = 0;
let offsetY = 0;
let scale = 1;

let isDragging = false;
let startX = 0;
let startY = 0;

const SNAP_DISTANCE = 100;

// ============ 应用变换 ============
function applyTransform() {
  canvas.style.transform =
      `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

// ============ 渲染 ============
function render() {
  layoutNodes();

  canvas.querySelectorAll(".node.small").forEach((n) => n.remove());

  nodesData.forEach((n) => {
    const div = document.createElement("div");
    div.className = `node ${n.type}`;
    div.dataset.id = n.id;
    div.style.left = n.x + "px";
    div.style.top = n.y + "px";
    div.textContent = n.text || "";
    canvas.appendChild(div);
  });
}

// ============ 重置 ============
function resetView() {
  scale = 1;
  const rect = viewport.getBoundingClientRect();
  offsetX = rect.width / 2 - CORE_X * scale;
  offsetY = rect.height / 2 - CORE_Y * scale;
  applyTransform();
}

// ============ 卡片居中 ============
function centerNodeById(id) {
  const node = nodesData.find((n) => n.id === id);
  if (!node) return;

  const rect = viewport.getBoundingClientRect();
  offsetX = rect.width / 2 - node.x * scale;
  offsetY = rect.height / 2 - node.y * scale;
  applyTransform();
}

// ============ 找最近卡片 ============
function findNearestNode(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  let nearestId = null;
  let minDist = Infinity;

  nodesData.forEach((n) => {
    const screenX = n.x * scale + offsetX;
    const screenY = n.y * scale + offsetY;
    const dist = Math.hypot(mx - screenX, my - screenY) / scale;

    if (dist < minDist) {
      minDist = dist;
      nearestId = n.id;
    }
  });

  return { nearestId, minDist };
}

// ============ 拖拽 ============
viewport.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;

  isDragging = true;
  startX = e.clientX - offsetX;
  startY = e.clientY - offsetY;
  viewport.classList.add("dragging");
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  offsetX = e.clientX - startX;
  offsetY = e.clientY - startY;
  applyTransform();
});

window.addEventListener("mouseup", (e) => {
  if (!isDragging) return;

  isDragging = false;
  viewport.classList.remove("dragging");

  const { nearestId, minDist } = findNearestNode(e.clientX, e.clientY);

  if (nearestId && minDist < SNAP_DISTANCE) {
    centerNodeById(nearestId);
  }
});

// ============ 缩放 ============
viewport.addEventListener("wheel", (e) => {
  e.preventDefault();

  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const newScale = scale * factor;

  const rect = viewport.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  offsetX = mx - (mx - offsetX) * (newScale / scale);
  offsetY = my - (my - offsetY) * (newScale / scale);

  scale = newScale;
  applyTransform();
}, { passive: false });

// ============ 重置按钮 ============
resetBtn.addEventListener("click", resetView);

// ============ 工具栏 ============
topTrigger.addEventListener("mouseenter", () => toolbar.classList.add("show"));
toolbar.addEventListener("mouseenter", () => toolbar.classList.add("show"));
toolbar.addEventListener("mouseleave", () => toolbar.classList.remove("show"));
topTrigger.addEventListener("mouseleave", () => {
  setTimeout(() => {
    if (!toolbar.matches(":hover")) toolbar.classList.remove("show");
  }, 100);
});

// ============ 初始化 ============
render();
resetView();