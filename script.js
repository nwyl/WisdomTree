const page = document.getElementById("page");
const btn = document.getElementById("myBtn");

btn.addEventListener("click", () => {
  const p = document.createElement("p");
  p.textContent = `目的是建立一个可视化的涵盖各领域的知识脉络。`;
  page.appendChild(p);
});