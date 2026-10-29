// ============================================================
// 知识树 / 知识网络
// - 每张卡片只有一个「主要前置」(parent)，因此形成一棵树
// - 卡片还可以有额外的「知识关联」(links)，因此树与网并存
// - 布局：以核心为圆心，按子树权重分配扇形，逐层向外环绕
// ============================================================

// ============ DOM ============
const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const toolbar = document.getElementById("toolbar");
const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menuBtn");
const resetBtn = document.getElementById("resetView");
const searchInput = document.getElementById("searchInput");
const searchBox = document.getElementById("searchBox");
const searchResults = document.getElementById("searchResults");

const SVG_NS = "http://www.w3.org/2000/svg";

// ============ 常量 ============
const CORE_ID = "core";
const CORE_BASE_SIZE = 200; // 正常状态下核心的屏幕直径
const SMALL_SIZE = 100;
const CORE_X = 1000;
const CORE_Y = 1000;
const ROOT_RADIUS = 300; // 第一层卡片到核心圆心的距离
const LEVEL_GAP = 300;   // 每深一层增加的环半径
const DRAG_THRESHOLD = 4;
const SCALE_MIN = 0.2;
const SCALE_MAX = 3;
const FOCUS_DURATION = 420;

// ============ 数据（中心节点与卡片同一份数据源）============
// parent：唯一的主要前置；links：额外的知识关联，可指向任意卡片
const nodesData = [
  { id: CORE_ID, text: "智慧树", img: "./images/core.png", x: CORE_X, y: CORE_Y },
  { id: "card1", text: "卡片 1", parent: CORE_ID },
  { id: "card2", text: "卡片 2", parent: CORE_ID },
  { id: "card3", text: "卡片 3", parent: CORE_ID },
  { id: "card4", text: "卡片 4", parent: "card3", links: ["card1"] },
];

const CORE = nodesData.find((node) => node.id === CORE_ID);
const nodeById = new Map(nodesData.map((node) => [node.id, node]));

// ============ 画布状态 ============
const view = { x: 0, y: 0, scale: 1 };
let activeId = null;

let childrenMap = new Map();
let leafWeightCache = new Map();
let edges = [];
let nodeEls = new Map();
let edgeEls = new Map();

// ============ 画布变换 ============
function applyTransform() {
  canvas.style.transform =
      `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ============ 尺寸 ============
function getNodeSize(node) {
  if (Number.isFinite(node.size) && node.size > 0) return node.size;
  return node.id === CORE_ID ? CORE_BASE_SIZE : SMALL_SIZE;
}

function getNodeRadius(node) {
  return getNodeSize(node) / 2;
}

// ============ 数据规范化 ============
// 每张非核心卡片必须有且只有一个 parent；坏数据/环回退到核心。
function normalizeGraph() {
  for (const node of nodesData) {
    if (!Array.isArray(node.links)) node.links = [];
    node.links = [...new Set(node.links)].filter(
        (id) => id !== node.id && nodeById.has(id)
    );
  }

  for (const node of nodesData) {
    if (node.id === CORE_ID) {
      node.parent = null;
      continue;
    }

    if (!nodeById.has(node.parent) || node.parent === node.id) {
      node.parent = CORE_ID;
    }

    const seen = new Set([node.id]);
    let cursor = nodeById.get(node.parent);
    let reachesCore = false;

    while (cursor) {
      if (cursor.id === CORE_ID) {
        reachesCore = true;
        break;
      }
      if (seen.has(cursor.id)) break;
      seen.add(cursor.id);
      cursor = nodeById.get(cursor.parent);
    }

    if (!reachesCore) node.parent = CORE_ID;
  }
}

// ============ 径向树布局 ============
function buildChildrenMap() {
  const map = new Map(nodesData.map((node) => [node.id, []]));
  for (const node of nodesData) {
    if (node.id === CORE_ID) continue;
    map.get(node.parent)?.push(node);
  }
  return map;
}

function leafWeight(node) {
  if (leafWeightCache.has(node.id)) return leafWeightCache.get(node.id);

  const kids = childrenMap.get(node.id) ?? [];
  const weight = kids.length
      ? kids.reduce((sum, kid) => sum + leafWeight(kid), 0)
      : 1;

  leafWeightCache.set(node.id, weight);
  return weight;
}

function placeSubtree(node, startAngle, span, depth) {
  const angle = startAngle + span / 2;
  const radius = ROOT_RADIUS + (depth - 1) * LEVEL_GAP;

  node.angle = angle;
  node.depth = depth;
  node.x = CORE_X + Math.cos(angle) * radius;
  node.y = CORE_Y + Math.sin(angle) * radius;

  const kids = childrenMap.get(node.id) ?? [];
  if (kids.length === 0) return;

  const total = kids.reduce((sum, kid) => sum + leafWeight(kid), 0) || 1;
  let cursor = startAngle;

  for (const kid of kids) {
    const childSpan = (span * leafWeight(kid)) / total;
    placeSubtree(kid, cursor, childSpan, depth + 1);
    cursor += childSpan;
  }
}

function layoutNodes() {
  childrenMap = buildChildrenMap();
  leafWeightCache = new Map();

  CORE.x = CORE_X;
  CORE.y = CORE_Y;
  CORE.angle = 0;
  CORE.depth = 0;

  const rootKids = childrenMap.get(CORE_ID) ?? [];
  const total = rootKids.reduce((sum, kid) => sum + leafWeight(kid), 0) || 1;
  let cursor = -Math.PI / 2;

  for (const kid of rootKids) {
    const span = (Math.PI * 2 * leafWeight(kid)) / total;
    placeSubtree(kid, cursor, span, 1);
    cursor += span;
  }
}

// ============ 连线数据 ============
function edgePairKey(aId, bId) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function buildEdges() {
  const primary = [];
  const primaryPairs = new Set();

  for (const node of nodesData) {
    if (node.id === CORE_ID) continue;
    const parent = nodeById.get(node.parent);
    if (!parent) continue;

    primary.push({
      kind: "primary",
      from: parent,
      to: node,
      key: `p:${parent.id}>${node.id}`,
    });
    primaryPairs.add(edgePairKey(parent.id, node.id));
  }

  const network = [];
  const seenPairs = new Set();

  for (const node of nodesData) {
    for (const otherId of node.links) {
      const other = nodeById.get(otherId);
      if (!other) continue;

      const pair = edgePairKey(node.id, other.id);
      if (primaryPairs.has(pair) || seenPairs.has(pair)) continue;

      seenPairs.add(pair);
      network.push({
        kind: "network",
        from: node,
        to: other,
        key: `n:${pair}`,
      });
    }
  }

  return [...primary, ...network];
}

// ============ 渲染 ============
function createArrowMarker(id, fill) {
  const marker = document.createElementNS(SVG_NS, "marker");
  marker.setAttribute("id", id);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "4");
  marker.setAttribute("markerHeight", "4");
  marker.setAttribute("markerUnits", "strokeWidth");
  marker.setAttribute("orient", "auto");

  const arrow = document.createElementNS(SVG_NS, "path");
  arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  arrow.setAttribute("fill", fill);

  marker.append(arrow);
  return marker;
}

function createEdgeLayer() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("id", "edges");
  svg.setAttribute("aria-hidden", "true");

  const defs = document.createElementNS(SVG_NS, "defs");
  defs.append(
      createArrowMarker("arrow-primary", "#93a9b3"),
      createArrowMarker("arrow-active", "#2e7d32")
  );

  svg.append(defs);
  return svg;
}

function createNodeEl(node) {
  const el = document.createElement("div");
  el.className = `node ${node.id === CORE_ID ? "core" : "small"}`;
  el.dataset.id = node.id;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.setProperty("--node-size", `${getNodeSize(node)}px`);
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", node.text);
  el.title = node.text;

  if (node.img) {
    const img = document.createElement("img");
    img.className = "node-img";
    img.src = node.img;
    img.alt = "";
    img.draggable = false;

    img.addEventListener("load", () => el.classList.add("has-img"));
    img.addEventListener("error", () => {
      img.remove();
      el.classList.remove("has-img");
    });

    el.append(img);
  }

  const label = document.createElement("span");
  label.className = "node-label";
  label.textContent = node.text;
  el.append(label);

  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      focusNode(node);
    }
  });

  return el;
}

function positionNodeEl(node) {
  const el = nodeEls.get(node.id);
  if (!el) return;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
}

function renderGraph() {
  normalizeGraph();
  layoutNodes();
  edges = buildEdges();

  nodeEls.clear();
  edgeEls.clear();

  const edgeLayer = createEdgeLayer();

  for (const edge of edges) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", `edge edge-${edge.kind}`);
    if (edge.kind === "primary") {
      path.setAttribute("marker-end", "url(#arrow-primary)");
    }
    edgeLayer.append(path);
    edgeEls.set(edge.key, path);
  }

  const fragment = document.createDocumentFragment();
  for (const node of nodesData) {
    const el = createNodeEl(node);
    nodeEls.set(node.id, el);
    fragment.append(el);
  }

  canvas.replaceChildren(edgeLayer, fragment);
  updateEdges();
  setActiveNode(activeId && nodeEls.has(activeId) ? activeId : null);
}

// ============ 连线几何 ============
function trimmedSegment(from, to, gapFrom, gapTo) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;

  const ux = dx / length;
  const uy = dy / length;
  const startGap = getNodeRadius(from) + gapFrom;
  const endGap = getNodeRadius(to) + gapTo;

  if (startGap + endGap >= length - 2) return null;

  return {
    x1: from.x + ux * startGap,
    y1: from.y + uy * startGap,
    x2: to.x - ux * endGap,
    y2: to.y - uy * endGap,
    length,
  };
}

function edgePath(edge) {
  if (edge.kind === "primary") {
    // 给箭头留出空间
    const s = trimmedSegment(edge.from, edge.to, 4, 12);
    if (!s) return "";
    return `M ${s.x1} ${s.y1} L ${s.x2} ${s.y2}`;
  }

  const s = trimmedSegment(edge.from, edge.to, 4, 4);
  if (!s) return "";

  const midX = (s.x1 + s.x2) / 2;
  const midY = (s.y1 + s.y2) / 2;

  // 关联线向外弯曲，尽量避免从核心上穿过
  let nx = -(s.y2 - s.y1) / s.length;
  let ny = (s.x2 - s.x1) / s.length;
  const toCoreX = CORE_X - midX;
  const toCoreY = CORE_Y - midY;
  if (nx * toCoreX + ny * toCoreY > 0) {
    nx = -nx;
    ny = -ny;
  }

  const bow = Math.min(90, Math.max(30, s.length * 0.14));
  const controlX = midX + nx * bow;
  const controlY = midY + ny * bow;

  return `M ${s.x1} ${s.y1} Q ${controlX} ${controlY} ${s.x2} ${s.y2}`;
}

function updateEdges() {
  for (const edge of edges) {
    const path = edgeEls.get(edge.key);
    if (!path) continue;
    path.setAttribute("d", edgePath(edge));
  }
}

function updateEdgeHighlight() {
  for (const edge of edges) {
    const path = edgeEls.get(edge.key);
    if (!path) continue;
    const related =
        !!activeId && (edge.from.id === activeId || edge.to.id === activeId);
    path.classList.toggle("is-active", related);
    if (edge.kind === "primary") {
      path.setAttribute(
          "marker-end",
          related ? "url(#arrow-active)" : "url(#arrow-primary)"
      );
    }
  }
}

// ============ 选中状态 ============
function setActiveNode(id) {
  activeId = id;
  for (const [nodeId, el] of nodeEls) {
    el.classList.toggle("active", nodeId === id);
  }
  updateEdgeHighlight();
}

// ============ 镜头动画 ============
let cameraRaf = 0;
let cameraResolve = null;
let cameraToken = 0;

function prefersReducedMotion() {
  const mq = window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  return !!mq?.matches;
}

function cancelCameraAnimation() {
  cameraToken += 1;
  if (cameraRaf) cancelAnimationFrame(cameraRaf);
  cameraRaf = 0;
  if (cameraResolve) {
    const done = cameraResolve;
    cameraResolve = null;
    done();
  }
}

function animateViewTo(x, y, scale, duration = FOCUS_DURATION) {
  cancelCameraAnimation();

  if (!duration || prefersReducedMotion()) {
    view.x = x;
    view.y = y;
    view.scale = scale;
    applyTransform();
    return Promise.resolve();
  }

  const token = ++cameraToken;
  const from = { ...view };

  return new Promise((resolve) => {
    cameraResolve = resolve;
    const startedAt = performance.now();

    const tick = (now) => {
      if (token !== cameraToken) return;

      const t = Math.min(1, (now - startedAt) / duration);
      const eased = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;

      view.x = from.x + (x - from.x) * eased;
      view.y = from.y + (y - from.y) * eased;
      view.scale = from.scale + (scale - from.scale) * eased;
      applyTransform();

      if (t < 1) {
        cameraRaf = requestAnimationFrame(tick);
      } else {
        cameraRaf = 0;
        cameraResolve = null;
        resolve();
      }
    };

    cameraRaf = requestAnimationFrame(tick);
  });
}

// 让卡片在屏幕上看起来和正常状态下的核心一样大
function targetScaleFor(node) {
  return clamp(CORE_BASE_SIZE / getNodeSize(node), SCALE_MIN, SCALE_MAX);
}

function focusNode(node, { animate = true, activate = true } = {}) {
  if (!node) return Promise.resolve();

  if (activate) setActiveNode(node.id);

  const scale = targetScaleFor(node);
  const x = viewport.clientWidth / 2 - node.x * scale;
  const y = viewport.clientHeight / 2 - node.y * scale;

  return animateViewTo(x, y, scale, animate ? FOCUS_DURATION : 0);
}

function resetView({ animate = true } = {}) {
  setActiveNode(null);
  return focusNode(CORE, { animate, activate: false });
}

// ============ 拖拽 / 点击 ============
let drag = null;

function nodeFromEvent(event) {
  const el = event.target.closest?.(".node");
  if (!el) return null;
  return nodeById.get(el.dataset.id) ?? null;
}

function capturePointer(pointerId) {
  try {
    viewport.setPointerCapture(pointerId);
  } catch {
    // 合成事件或指针已释放时忽略
  }
}

viewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;

  cancelCameraAnimation();

  const node = nodeFromEvent(event);

  if (node) {
    drag = {
      kind: "node",
      node,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startX: node.x,
      startY: node.y,
      canDrag: node.id !== CORE_ID,
      moved: false,
    };
  } else {
    drag = {
      kind: "pan",
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      viewX: view.x,
      viewY: view.y,
      moved: false,
    };
  }

  capturePointer(event.pointerId);
  event.preventDefault();
});

viewport.addEventListener("pointermove", (event) => {
  if (!drag) return;

  const dx = event.clientX - drag.clientX;
  const dy = event.clientY - drag.clientY;

  if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    drag.moved = true;
    if (drag.kind === "node" && drag.canDrag) {
      nodeEls.get(drag.node.id)?.classList.add("dragging");
    }
  }
  if (!drag.moved) return;

  if (drag.kind === "pan") {
    view.x = drag.viewX + dx;
    view.y = drag.viewY + dy;
    applyTransform();
    viewport.classList.add("panning");
    return;
  }

  if (!drag.canDrag) return;

  drag.node.x = drag.startX + dx / view.scale;
  drag.node.y = drag.startY + dy / view.scale;
  positionNodeEl(drag.node);
  updateEdges();
});

function finishDrag(event, cancelled = false) {
  if (!drag) return;

  const finished = drag;
  drag = null;

  viewport.classList.remove("panning");
  nodeEls.get(finished.node?.id)?.classList.remove("dragging");

  if (finished.kind === "node") {
    if (!finished.moved && !cancelled) {
      focusNode(finished.node);
    }
  } else if (!finished.moved && !cancelled) {
    // 在空白处单击：取消选中
    setActiveNode(null);
  }

  if (viewport.hasPointerCapture?.(event.pointerId)) {
    try {
      viewport.releasePointerCapture(event.pointerId);
    } catch {
      // 忽略
    }
  }
}

viewport.addEventListener("pointerup", (event) => finishDrag(event));
viewport.addEventListener("pointercancel", (event) =>
  finishDrag(event, true)
);

// ============ 滚轮缩放（带上下限）============
viewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  cancelCameraAnimation();

  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  const next = clamp(view.scale * factor, SCALE_MIN, SCALE_MAX);
  const ratio = next / view.scale;

  view.x = event.clientX - (event.clientX - view.x) * ratio;
  view.y = event.clientY - (event.clientY - view.y) * ratio;
  view.scale = next;
  applyTransform();
}, { passive: false });

// ============ 工具栏搜索 ============
let searchMatches = [];
let searchIndex = -1;

function openSearchPanel(open) {
  searchResults.classList.toggle("show", open);
  searchInput.setAttribute("aria-expanded", String(open));
}

function clearSearchMarks() {
  for (const el of nodeEls.values()) {
    el.classList.remove("search-match", "search-dim");
  }
}

function markSearchSelection() {
  const items = searchResults.querySelectorAll(".search-result");
  items.forEach((item, index) => {
    item.classList.toggle("is-active", index === searchIndex);
  });
  items[searchIndex]?.scrollIntoView({ block: "nearest" });
}

function renderSearchResults() {
  searchResults.replaceChildren();

  const summary = document.createElement("div");
  summary.className = "search-summary";
  summary.textContent = searchMatches.length
      ? `找到 ${searchMatches.length} 张卡片`
      : "没有找到匹配的卡片";
  searchResults.append(summary);

  if (searchMatches.length === 0) return;

  const list = document.createElement("div");
  list.className = "search-result-list";

  searchMatches.forEach((node, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "search-result";

    const text = document.createElement("span");
    text.className = "search-result-text";
    text.textContent = node.text;

    const meta = document.createElement("span");
    meta.className = "search-result-meta";
    meta.textContent = node.id === CORE_ID
        ? "核心"
        : `主要前置：${nodeById.get(node.parent)?.text ?? "—"}`;

    item.append(text, meta);
    item.addEventListener("click", () => {
      searchIndex = index;
      markSearchSelection();
      openSearchPanel(false);
      focusNode(node);
    });

    list.append(item);
  });

  searchResults.append(list);
}

function runSearch(rawValue) {
  const query = rawValue.trim().toLocaleLowerCase();

  clearSearchMarks();
  searchMatches = [];
  searchIndex = -1;

  if (!query) {
    openSearchPanel(false);
    return;
  }

  searchMatches = nodesData.filter((node) =>
    node.text.toLocaleLowerCase().includes(query)
  );

  const matchIds = new Set(searchMatches.map((node) => node.id));
  for (const [nodeId, el] of nodeEls) {
    el.classList.toggle("search-match", matchIds.has(nodeId));
    el.classList.toggle("search-dim", !matchIds.has(nodeId));
  }

  renderSearchResults();
  openSearchPanel(true);
}

searchInput.addEventListener("input", () => {
  runSearch(searchInput.value);
});

searchInput.addEventListener("focus", () => {
  if (searchInput.value.trim()) runSearch(searchInput.value);
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    if (searchMatches.length === 0) return;

    searchIndex = (searchIndex + 1) % searchMatches.length;
    markSearchSelection();
    focusNode(searchMatches[searchIndex]);
  } else if (event.key === "Escape") {
    searchInput.value = "";
    runSearch("");
    searchInput.blur();
  }
});

// ============ 侧边栏 ============
function setSidebar(open) {
  sidebar.classList.toggle("show", open);
  toolbar.classList.toggle("pinned", open);
  menuBtn.setAttribute("aria-expanded", String(open));
}

menuBtn.addEventListener("click", () => {
  setSidebar(!sidebar.classList.contains("show"));
});

// 点击侧边栏/工具栏以外的地方收起，省掉各处 stopPropagation
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("#sidebar, #toolbar")) {
    setSidebar(false);
  }
  if (!event.target.closest("#searchBox")) {
    openSearchPanel(false);
  }
});

// ============ 重置按钮 ============
resetBtn.addEventListener("click", () => {
  resetView();
});

// ============ 窗口尺寸变化时保持视觉中心 ============
let lastWidth = viewport.clientWidth;
let lastHeight = viewport.clientHeight;

window.addEventListener("resize", () => {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  view.x += (width - lastWidth) / 2;
  view.y += (height - lastHeight) / 2;
  lastWidth = width;
  lastHeight = height;
  applyTransform();
});

// ============ 初始化 ============
renderGraph();
resetView({ animate: false });
