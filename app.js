const STORAGE_KEY = "finance-life-shared-auth";

const ROLE_OPTIONS = [
  ["R1", "基础岗"],
  ["R2", "服务岗"],
  ["R3", "销售岗"],
  ["R4", "技术岗"],
  ["R5", "运营岗"],
  ["R6", "白领高薪"],
  ["R7", "高薪精英"]
];

const state = {
  auth: loadAuth(),
  payload: null,
  rankingMode: "final_score",
  currentView: "student",
  pollTimer: null
};

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  grabElements();
  bindEvents();
  fillRoleOptions();
  bootstrap();
});

function grabElements() {
  [
    "auth-view", "app-view", "teacher-create-form", "student-join-form", "teacher-name", "room-name", "join-room-code",
    "student-name", "join-role", "logout-button", "season-title", "round-status", "room-name-display", "room-code-display",
    "event-title", "identity-display", "ranking-mode", "student-name-display", "player-role", "summary-cards", "news-headline",
    "news-body", "balance-table", "risk-hint", "decision-status", "consumption-options", "borrow-amount", "repay-amount",
    "asset-inputs", "option-direction", "risk-confirm", "preview-min-pay", "preview-cash", "preview-message", "decision-form",
    "teacher-view", "student-view", "ranking-view", "teacher-event", "publish-round", "lock-round", "settle-round", "reset-room",
    "teacher-metrics", "teaching-points", "submission-table", "ranking-title", "ranking-stage", "round-log"
  ].forEach((id) => { el[id] = document.getElementById(id); });
  el.viewButtons = [...document.querySelectorAll("#view-switcher .segmented-button")];
}

function bindEvents() {
  el["teacher-create-form"].addEventListener("submit", createRoom);
  el["student-join-form"].addEventListener("submit", joinRoom);
  el["logout-button"].addEventListener("click", logout);
  el["ranking-mode"].addEventListener("change", (event) => {
    state.rankingMode = event.target.value;
    renderRanking();
  });
  el.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = button.dataset.view;
      syncViews();
    });
  });
  el["decision-form"].addEventListener("submit", submitDecision);
  el["publish-round"].addEventListener("click", publishRound);
  el["lock-round"].addEventListener("click", lockRound);
  el["settle-round"].addEventListener("click", settleRound);
  el["reset-room"].addEventListener("click", resetRoom);
}

function fillRoleOptions() {
  ROLE_OPTIONS.forEach(([id, label]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    el["join-role"].appendChild(option);
  });
}

async function bootstrap() {
  if (!state.auth) {
    showAuth();
    return;
  }
  try {
    await refreshState();
    startPolling();
  } catch (error) {
    console.error(error);
    logout();
  }
}

async function createRoom(event) {
  event.preventDefault();
  const teacherName = el["teacher-name"].value.trim();
  const roomName = el["room-name"].value.trim();
  if (!teacherName) {
    alert("请先输入教师姓名。");
    return;
  }
  const result = await api("/api/rooms", {
    method: "POST",
    body: { teacherName, roomName }
  });
  state.auth = { token: result.token, role: "teacher" };
  persistAuth();
  state.payload = result;
  state.currentView = "teacher";
  render();
  startPolling();
}

async function joinRoom(event) {
  event.preventDefault();
  const roomCode = el["join-room-code"].value.trim();
  const displayName = el["student-name"].value.trim();
  const roleId = el["join-role"].value;
  if (!roomCode || !displayName) {
    alert("请输入课堂码和学生姓名。");
    return;
  }
  const result = await api("/api/join", {
    method: "POST",
    body: { roomCode, displayName, roleId }
  });
  state.auth = { token: result.token, role: "student" };
  persistAuth();
  state.payload = result;
  state.currentView = "student";
  render();
  startPolling();
}

function logout() {
  stopPolling();
  state.auth = null;
  state.payload = null;
  localStorage.removeItem(STORAGE_KEY);
  showAuth();
}

async function refreshState() {
  state.payload = await api("/api/me", { method: "GET" });
  render();
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    refreshState().catch((error) => console.error(error));
  }, 5000);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function showAuth() {
  el["auth-view"].classList.remove("hidden");
  el["app-view"].classList.add("hidden");
  el["logout-button"].classList.add("hidden");
}

function render() {
  if (!state.payload) {
    showAuth();
    return;
  }
  el["auth-view"].classList.add("hidden");
  el["app-view"].classList.remove("hidden");
  el["logout-button"].classList.remove("hidden");
  syncViews();
  renderShell();
  renderStudent();
  renderTeacher();
  renderRanking();
}

function syncViews() {
  const role = state.payload.user.role;
  el.viewButtons.forEach((button) => {
    const allowed = role === "teacher" || button.dataset.view !== "teacher";
    button.classList.toggle("hidden", !allowed);
    if (!allowed && state.currentView === "teacher") {
      state.currentView = "student";
    }
    button.classList.toggle("active", button.dataset.view === state.currentView);
  });
  ["student", "teacher", "ranking"].forEach((name) => {
    const section = el[`${name}-view`];
    const allowed = role === "teacher" || name !== "teacher";
    section.classList.toggle("active", allowed && name === state.currentView);
    section.classList.toggle("hidden", !allowed);
  });
}

function renderShell() {
  const room = state.payload.room;
  el["season-title"].textContent = `第 ${Math.min(room.season.round, 8)} / 8 回合`;
  el["round-status"].textContent = statusText(room.season.status);
  el["round-status"].className = `status-pill ${statusTone(room.season.status)}`;
  el["room-name-display"].textContent = room.name;
  el["room-code-display"].textContent = state.payload.roomCode;
  el["event-title"].textContent = room.event ? room.event.title : "等待教师发布";
  el["identity-display"].value = `${state.payload.user.displayName} · ${state.payload.user.role === "teacher" ? "教师" : "学生"}`;
}

function renderStudent() {
  if (state.payload.user.role !== "student") {
    return;
  }
  const room = state.payload.room;
  const student = room.self;
  const score = student.score;
  el["student-name-display"].textContent = student.displayName;
  el["player-role"].textContent = `${student.roleName} · 净资产 ${money(student.metrics.netWorth)}`;
  el["summary-cards"].innerHTML = [
    summaryCard("净资产", money(student.metrics.netWorth)),
    summaryCard("负债率", percent(student.metrics.debtRatio * 100)),
    summaryCard("应急金月数", `${student.metrics.emergency.toFixed(1)} 月`),
    summaryCard("综合得分", score ? score.finalScore.toFixed(1) : "0.0")
  ].join("");
  el["news-headline"].textContent = room.event ? room.event.title : "等待本轮事件";
  el["news-body"].textContent = room.event ? room.event.body : "教师发布事件后，这里会显示新闻叙事与讨论线索。";
  el["balance-table"].innerHTML = buildBalanceRows(student);
  el["risk-hint"].textContent = student.assets.A7 + student.assets.A8 + student.assets.A9 > 0 ? "高风险资产已暴露" : "稳健观察中";
  el["decision-status"].textContent = student.submitted ? "已提交，可覆盖" : "未提交";
  el["decision-status"].className = `status-pill ${student.submitted ? "success" : "neutral"}`;
  renderConsumptions(room.consumptions, student.currentDecision);
  renderAssetInputs(room.assets, student.currentDecision);
  applyDecision(student.currentDecision);
  previewDecision();
  disableDecision(room.season.status !== "open");
}

function renderTeacher() {
  if (state.payload.user.role !== "teacher") {
    return;
  }
  const room = state.payload.room;
  if (!el["teacher-event"].children.length) {
    room.events.forEach((event) => {
      const option = document.createElement("option");
      option.value = String(event.id);
      option.textContent = `事件 ${event.id} · ${event.title}`;
      el["teacher-event"].appendChild(option);
    });
  }
  el["teacher-event"].value = String(room.season.eventId || room.events[0].id);
  const rankings = room.rankings.slice().sort((a, b) => b.finalScore - a.finalScore);
  const risky = room.students
    .map((student) => ({ student, exposure: student.assets.A7 + student.assets.A8 + student.assets.A9 + student.loan }))
    .sort((a, b) => b.exposure - a.exposure)[0];
  const overdueCount = room.students.filter((student) => student.arrears > 0 || student.metrics.totalDebt > 0 && student.score && student.score.healthScore < 60).length;
  el["teacher-metrics"].innerHTML = [
    metricCard("综合得分领先", rankings[0] ? `${rankings[0].displayName} · ${rankings[0].finalScore.toFixed(1)}` : "-"),
    metricCard("高风险暴露最高", risky ? `${risky.student.displayName} · ${money(risky.exposure)}` : "-"),
    metricCard("参与学生人数", `${room.students.length} 人`)
  ].join("");
  const notes = room.event ? [...room.event.points] : ["教师先发布事件，再开放回合，让学生提交决策，最后锁定并结算。"];
  if (risky && risky.exposure > 12000) notes.push(`可以追问 ${risky.student.displayName} 的止损计划和应急金安排。`);
  if (overdueCount) notes.push(`课堂中已有 ${overdueCount} 位学生出现债务压力，适合讨论最低还款与逾期后果。`);
  el["teaching-points"].innerHTML = notes.map((note) => `<li>${note}</li>`).join("");
  el["submission-table"].innerHTML = room.students.map((student) => `<tr><td>${student.displayName}</td><td>${student.roleName}</td><td>${student.submitted ? "已提交" : "待提交"}</td><td>${student.assets.A7 + student.assets.A8 + student.assets.A9 > 0 ? "高风险暴露" : "常规"}</td></tr>`).join("");
}

function renderRanking() {
  if (!state.payload) return;
  const rankings = state.payload.room.rankings.slice().sort((a, b) => rankingValue(b) - rankingValue(a));
  const titleMap = { final_score: "综合得分榜", net_worth: "净资产榜", growth: "成长率榜", health: "健康分榜" };
  el["ranking-title"].textContent = titleMap[state.rankingMode];
  el["ranking-stage"].innerHTML = rankings.map((item, index) => `
    <article class="ranking-item ${item.id === state.payload.user.id ? "highlight" : ""}">
      <div class="rank-number">${index + 1}</div>
      <div>
        <strong>${item.displayName}</strong>
        <p>${ROLE_OPTIONS.find((role) => role[0] === item.roleId)?.[1] || item.roleId}</p>
      </div>
      <div>
        <span class="metric-label">${titleMap[state.rankingMode]}</span>
        <strong>${rankingText(item)}</strong>
      </div>
      <div>
        <span class="metric-label">净资产</span>
        <strong>${money(item.netWorth)}</strong>
      </div>
      <div>
        <span class="metric-label">负债率 / 生活质量</span>
        <strong>${percent(item.debtRatio * 100)} / ${item.lq}</strong>
      </div>
    </article>
  `).join("");
  el["round-log"].innerHTML = state.payload.room.season.log.length
    ? [...state.payload.room.season.log].reverse().map((entry) => `<div class="round-entry"><strong>第 ${entry.round} 回合 · ${entry.title}</strong><p>成本指数 ${entry.costIndex.toFixed(2)}，净资产领先者为 ${entry.topWealth}，综合得分领先者为 ${entry.topScore}。</p></div>`).join("")
    : `<div class="round-entry"><strong>还没有结算记录</strong><p>完成每轮结算后，这里会自动累计赛季轨迹。</p></div>`;
}

function renderConsumptions(consumptions, decision) {
  el["consumption-options"].innerHTML = consumptions.map((item) => `
    <div class="choice-chip">
      <label><input type="checkbox" data-consumption-id="${item.id}" ${decision.consumptions.includes(item.id) ? "checked" : ""}> <strong>${item.name}</strong></label>
      <span>${money(item.cost)} · 生活质量 +${item.lq}</span>
    </div>
  `).join("");
}

function renderAssetInputs(assets, decision) {
  el["asset-inputs"].innerHTML = assets.map((asset) => `
    <div class="asset-input-card">
      <label>${asset.id} · ${asset.name}<input type="number" step="100" value="${decision.changes[asset.id] || 0}" data-asset-id="${asset.id}"></label>
      <small>最小单位 ${asset.min} 元</small>
    </div>
  `).join("");
}

function applyDecision(decision) {
  el["borrow-amount"].value = decision.borrow || 0;
  el["repay-amount"].value = decision.repay || 0;
  el["option-direction"].value = decision.optionDir || "CALL";
  el["risk-confirm"].checked = Boolean(decision.riskOk);
  hookPreviewEvents();
}

function hookPreviewEvents() {
  [...el["consumption-options"].querySelectorAll("input")].forEach((input) => input.onchange = previewDecision);
  [...el["asset-inputs"].querySelectorAll("input")].forEach((input) => input.oninput = previewDecision);
  el["borrow-amount"].oninput = previewDecision;
  el["repay-amount"].oninput = previewDecision;
  el["option-direction"].onchange = previewDecision;
  el["risk-confirm"].onchange = previewDecision;
}

function readDecision() {
  const decision = { consumptions: [], borrow: Number(el["borrow-amount"].value || 0), repay: Number(el["repay-amount"].value || 0), changes: {}, optionDir: el["option-direction"].value, riskOk: el["risk-confirm"].checked };
  [...el["consumption-options"].querySelectorAll("input:checked")].forEach((input) => decision.consumptions.push(input.dataset.consumptionId));
  [...el["asset-inputs"].querySelectorAll("input")].forEach((input) => { decision.changes[input.dataset.assetId] = Number(input.value || 0); });
  return decision;
}

function previewDecision() {
  if (state.payload.user.role !== "student") return;
  const room = state.payload.room;
  const student = room.self;
  const decision = readDecision();
  const optional = decision.consumptions.reduce((sum, id) => sum + room.consumptions.find((item) => item.id === id).cost, 0);
  let trades = 0;
  let fees = 0;
  Object.entries(decision.changes).forEach(([id, amount]) => {
    const asset = room.assets.find((item) => item.id === id);
    trades += amount;
    if (amount > 0) fees += amount * asset.fee;
  });
  const predictedCash = student.cash + inferSalary(student, room.event) + decision.borrow - currentMandatory(student, room) - optional - decision.repay - trades - fees;
  const minPay = student.loan <= 0 ? 0 : student.loan * 0.01 + student.loan * 0.05;
  el["preview-min-pay"].textContent = money(minPay);
  el["preview-cash"].textContent = money(predictedCash);
  el["preview-message"].textContent = predictedCash < 0 ? "预计现金为负，请调整决策" : "可提交";
}

function disableDecision(disabled) {
  [...el["decision-form"].querySelectorAll("input, select, button")].forEach((node) => { node.disabled = disabled; });
}

async function submitDecision(event) {
  event.preventDefault();
  try {
    const result = await api("/api/student/decision", { method: "POST", body: readDecision() });
    state.payload = result;
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function publishRound() {
  const result = await api("/api/teacher/event", { method: "POST", body: { eventId: Number(el["teacher-event"].value) } });
  state.payload = result;
  render();
}

async function lockRound() {
  const result = await api("/api/teacher/lock", { method: "POST" });
  state.payload = result;
  render();
}

async function settleRound() {
  const result = await api("/api/teacher/settle", { method: "POST" });
  state.payload = result;
  render();
}

async function resetRoom() {
  if (!confirm("确定要重置整个课堂房间吗？")) return;
  const result = await api("/api/teacher/reset", { method: "POST" });
  state.payload = result;
  render();
}

async function api(path, options) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(state.auth ? { Authorization: `Bearer ${state.auth.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "请求失败");
  }
  return data;
}

function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function persistAuth() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.auth));
}

function summaryCard(label, value) {
  return `<div class="summary-card"><span class="metric-label">${label}</span><strong class="summary-value">${value}</strong></div>`;
}

function buildBalanceRows(student) {
  const rows = [];
  rows.push(balanceRow("现金", money(student.cash), "现金缓冲与应急金"));
  Object.entries(student.assets).forEach(([id, value]) => rows.push(balanceRow(id, money(value), "当前持仓")));
  if (student.carOwned) rows.push(balanceRow("汽车资产", money(student.carValue), `已持有 ${student.carMonths} 轮`));
  rows.push(balanceRow("消费贷本金", money(-student.loan), "最低还款将自动检查"));
  rows.push(balanceRow("车贷本金", money(-student.carLoan), "月供固定"));
  rows.push(balanceRow("逾期欠款", money(-student.arrears), "逾期会影响健康分"));
  rows.push(balanceRow("生活质量分", student.lq.toFixed(1), "幸福感与体验指标"));
  rows.push(balanceRow("成长率", percent(student.metrics.growth * 100), "组内更公平"));
  rows.push(balanceRow("健康分", student.score ? student.score.healthScore.toFixed(1) : "0.0", "预算、应急金、负债与分散度"));
  return rows.join("");
}

function balanceRow(name, value, note) {
  return `<tr><td>${name}</td><td>${value}</td><td>${note}</td></tr>`;
}

function metricCard(label, value) {
  return `<div class="metric-card"><span class="metric-label">${label}</span><strong>${value}</strong></div>`;
}

function rankingValue(item) {
  return state.rankingMode === "net_worth" ? item.netWorth : state.rankingMode === "growth" ? item.growth : state.rankingMode === "health" ? item.healthScore : item.finalScore;
}

function rankingText(item) {
  return state.rankingMode === "net_worth" ? money(item.netWorth) : state.rankingMode === "growth" ? percent(item.growth * 100) : (state.rankingMode === "health" ? item.healthScore : item.finalScore).toFixed(1);
}

function inferSalary(student, event) {
  let salary = state.payload.room.roles.find((role) => role.id === student.roleId).salary * (1 + 0.05 * (student.boosts || 0));
  if (!event) return salary;
  event.effects?.forEach?.((effect) => {
    if (effect.type === "bonus" && effect.roles.includes(student.roleId)) salary += effect.amount;
    if (effect.type === "cut" && effect.roles.includes(student.roleId)) salary -= state.payload.room.roles.find((role) => role.id === student.roleId).salary * effect.ratio;
  });
  return salary;
}

function currentMandatory(student, room) {
  return 3600 * room.season.costIndex + (student.carOwned ? 800 : 0);
}

function money(value) {
  return `¥${Number(value || 0).toFixed(0)}`;
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function statusText(status) {
  return { ready: "准备中", open: "开放中", locked: "已锁定", settled: "已结算", finished: "已结束" }[status] || status;
}

function statusTone(status) {
  return { ready: "neutral", open: "success", locked: "danger", settled: "neutral", finished: "danger" }[status] || "neutral";
}
