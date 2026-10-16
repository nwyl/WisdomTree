const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const toolbar = document.getElementById("toolbar");
const topTrigger = document.getElementById("topTrigger");
const resetBtn = document.getElementById("resetView");

// ============ 画布偏移和缩放 ============
let offsetX = 0;
let offsetY = 0;
let scale = 1;

// 拖拽状态
let isDragging = false;
let startX = 0;
let startY = 0;

// ============ 应用变换 ============
function applyTransform() {
  canvas.style.transform =
      `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

// ============ 重置到视图中心 ============
function resetView() {
  const rect = viewport.getBoundingClientRect();

  offsetX = rect.width / 2 - 1000 * scale;
  offsetY = rect.height / 2 - 1000 * scale;

  scale = 1;
  applyTransform();
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

window.addEventListener("mouseup", () => {
  isDragging = false;
  viewport.classList.remove("dragging");
});

// ============ 滚轮缩放（无上下限） ============
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
resetBtn.addEventListener("click", () => {
  resetView();
});

// ============ 工具栏自动下拉 ============
topTrigger.addEventListener("mouseenter", () => {
  toolbar.classList.add("show");
});

toolbar.addEventListener("mouseenter", () => {
  toolbar.classList.add("show");
});

toolbar.addEventListener("mouseleave", () => {
  toolbar.classList.remove("show");
});

topTrigger.addEventListener("mouseleave", () => {
  setTimeout(() => {
    if (!toolbar.matches(":hover")) {
      toolbar.classList.remove("show");
    }
  }, 100);
});

// 初始化
resetView();