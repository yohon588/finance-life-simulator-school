const STORAGE_KEY = "finance-life-shared-auth";
const DRAFT_KEY = "finance-life-draft";

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
    "event-title", "identity-display", "ranking-mode", "student-name-display", "player-role", "summary-cards", "round-budget",
    "news-headline", "news-body", "market-impact", "life-impact", "balance-table", "risk-hint", "decision-status",
    "consumption-options", "borrow-amount", "repay-amount", "asset-inputs", "option-direction", "risk-confirm",
    "gamble-type", "debt-detail", "house-panel", "house-action", "repay-target", "repayment-plan", "clear-repay-plan", "fill-min-repay", "fill-avalanche-repay",
    "preview-min-pay", "preview-cash", "preview-message", "decision-form", "teacher-view", "student-view", "ranking-view",
    "teacher-event", "publish-round", "lock-round", "settle-round", "reset-room", "teacher-metrics", "teaching-points",
    "submission-table", "ranking-title", "ranking-stage", "round-log", "loan-cards", "settlement-ledger", "asset-curve",
    "asset-mix", "export-csv", "class-profile", "teacher-history", "archive-room", "print-report", "archive-list"
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
  el["export-csv"].addEventListener("click", exportCsv);
  el["archive-room"].addEventListener("click", archiveRoom);
  el["print-report"].addEventListener("click", printReport);
  el["clear-repay-plan"].addEventListener("click", clearRepayPlan);
  el["fill-min-repay"].addEventListener("click", fillMinRepayPlan);
  el["fill-avalanche-repay"].addEventListener("click", fillAvalancheRepayPlan);
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
  const result = await api("/api/rooms", { method: "POST", body: { teacherName, roomName } });
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
  if (!roomCode || !displayName || !roleId) {
    alert("请输入课堂码、学生姓名并选择角色。");
    return;
  }
  const result = await api("/api/join", { method: "POST", body: { roomCode, displayName, roleId } });
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
    if (!allowed && state.currentView === "teacher") state.currentView = "student";
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
  const round = Math.min(room.season.round, 8);
  el["season-title"].textContent = `第 ${round} / 8 回合`;
  el["round-status"].textContent = statusText(room.season.status);
  el["round-status"].className = `status-pill ${statusTone(room.season.status)}`;
  el["room-name-display"].textContent = room.name;
  el["room-code-display"].textContent = state.payload.roomCode;
  el["event-title"].textContent = room.currentEvent ? room.currentEvent.title : "等待教师发布";
  el["identity-display"].value = `${state.payload.user.displayName} / ${state.payload.user.role === "teacher" ? "教师" : "学生"}`;
}

function renderStudent() {
  if (state.payload.user.role !== "student") return;
  const room = state.payload.room;
  const student = room.self;
  const score = student.score;
  const currentDecision = getWorkingDecision(student, room);

  el["student-name-display"].textContent = student.displayName;
  el["player-role"].textContent = `${student.roleName} / 净资产 ${money(student.metrics.netWorth)}`;
  el["summary-cards"].innerHTML = [
    summaryCard("净资产", money(student.metrics.netWorth)),
    summaryCard("负债率", percent(student.metrics.debtRatio * 100)),
    summaryCard("偿债率 DSR", percent(student.metrics.dsr * 100)),
    summaryCard("应急金月数", `${student.metrics.emergency.toFixed(1)} 月`),
    summaryCard("综合得分", score ? score.finalScore.toFixed(1) : "0.0")
  ].join("");

  renderBudgetCards(student, room);
  renderEvent(room.currentEvent);
  el["balance-table"].innerHTML = buildBalanceRows(student, room);
  renderDebtDetail(student);
  renderHousePanel(student, room);
  el["risk-hint"].textContent = student.riskTags.length ? student.riskTags.join(" / ") : "稳健观察中";
  el["decision-status"].textContent = student.submitted ? "已提交，可继续覆盖" : "未提交";
  el["decision-status"].className = `status-pill ${student.submitted ? "success" : "neutral"}`;
  renderLoanCards(student, room);
  renderConsumptions(room.consumptions, currentDecision);
  renderAssetInputs(room.assets, currentDecision);
  renderGambleOptions(room.gambleTypes || [], currentDecision.gambleType);
  renderRepaymentOptions(room.repaymentOptions || [], currentDecision.repayTarget);
  renderRepaymentPlan(student, currentDecision);
  el["house-action"].value = currentDecision.houseAction || "HOLD";
  applyDecision(currentDecision);
  previewDecision();
  renderLedger(student);
  renderAssetCurve(student);
  disableDecision(room.season.status !== "open");
}

function renderTeacher() {
  if (state.payload.user.role !== "teacher") return;
  const room = state.payload.room;
  if (!el["teacher-event"].children.length) {
    room.events.forEach((item) => {
      const option = document.createElement("option");
      option.value = String(item.id);
      option.textContent = `事件 ${item.id} / ${item.title}`;
      el["teacher-event"].appendChild(option);
    });
  }
  el["teacher-event"].value = String(room.season.eventId || room.events[0].id);
  const rankings = room.rankings.slice().sort((a, b) => b.finalScore - a.finalScore);
  const risky = room.students.filter((student) => student.riskTags.length);
  const overdueCount = room.students.filter((student) => debtPrincipal(student, "CONSUMER") > 0 && student.latestLedger?.debt?.arrears > 0).length;
  el["teacher-metrics"].innerHTML = [
    metricCard("综合领先", rankings[0] ? `${rankings[0].displayName} / ${rankings[0].finalScore.toFixed(1)}` : "-"),
    metricCard("高风险人数", `${risky.length} 人`),
    metricCard("还款承压", `${overdueCount} 人`)
  ].join("");

  const notes = room.currentEvent ? [...room.currentEvent.points] : ["先发布开始事件，再让学生完成预算和资产配置，最后锁定并结算。"];
  if (room.lastSettlement) notes.push(room.lastSettlement.body);
  el["teaching-points"].innerHTML = notes.map((note) => `<li>${note}</li>`).join("");
  renderClassProfile(room.classProfile);
  el["submission-table"].innerHTML = room.students.map((student) => `
    <tr>
      <td>${student.displayName}</td>
      <td>${student.roleName}</td>
      <td>${student.submitted ? "已提交" : "待提交"}</td>
      <td>${student.riskTags.join(" / ") || "常规"}</td>
    </tr>
  `).join("");
  el["teacher-history"].innerHTML = (room.classProfile?.history || []).length
    ? [...room.classProfile.history].reverse().map((entry) => `
      <div class="round-entry">
        <strong>第 ${entry.round} 回合</strong>
        <p>开始事件：${entry.title}</p>
        <p>结算事件：${entry.settlementTitle || "待生成"}${entry.settlementTemplate ? ` / ${entry.settlementTemplate}` : ""}</p>
        <p>${entry.settlementBody || entry.summary || ""}</p>
        <p>${entry.summary || ""}</p>
      </div>
    `).join("")
    : `<div class="round-entry"><strong>暂无历史结算</strong><p>老师完成结算后，这里会沉淀课堂记录，适合导出成绩后复盘。</p></div>`;
  el["archive-list"].innerHTML = (room.archives || []).length
    ? room.archives.map((archive) => `
      <div class="round-entry">
        <strong>${archive.roomName} / ${new Date(archive.archivedAt).toLocaleString("zh-CN")}</strong>
        <p>回合数：${archive.totalRounds}，状态：${archive.finalStatus}</p>
        <p>综合领先：${archive.topScore ? `${archive.topScore.displayName} ${archive.topScore.value.toFixed(1)}` : "-"}</p>
        <p>净资产领先：${archive.topNetWorth ? `${archive.topNetWorth.displayName} ${money(archive.topNetWorth.value)}` : "-"}</p>
      </div>
    `).join("")
    : `<div class="round-entry"><strong>暂无归档课堂</strong><p>点击“归档并关闭”后，历史课堂会保存在这里，之后重置也不会丢。</p></div>`;
}

function renderRanking() {
  if (!state.payload) return;
  const rankings = state.payload.room.rankings.slice().sort((a, b) => rankingValue(b) - rankingValue(a));
  const titleMap = {
    final_score: "综合得分榜",
    net_worth: "净资产榜",
    growth: "成长率榜",
    health: "健康分榜"
  };
  el["ranking-title"].textContent = titleMap[state.rankingMode];
  el["ranking-stage"].innerHTML = rankings.map((item, index) => `
    <article class="ranking-item ${item.id === state.payload.user.id ? "highlight" : ""}">
      <div class="rank-number">${index + 1}</div>
      <div>
        <strong>${item.displayName}</strong>
        <p>${roleLabel(item.roleId)}</p>
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
        <span class="metric-label">健康分拆解</span>
        <strong>${item.healthBreakdown ? `储蓄 ${item.healthBreakdown.saveScore.toFixed(0)} / 应急 ${item.healthBreakdown.emergencyScore.toFixed(0)}` : "-"}</strong>
      </div>
    </article>
  `).join("");

  const logs = state.payload.room.season.log || [];
  el["round-log"].innerHTML = logs.length ? [...logs].reverse().map((entry) => `
    <div class="round-entry">
      <strong>第 ${entry.round} 回合 / 开始事件：${entry.title}</strong>
      <p>结算事件：${entry.settlementTitle || "待生成"}${entry.settlementTemplate ? ` / ${entry.settlementTemplate}` : ""}</p>
      <p>${entry.settlementBody || entry.summary || ""}</p>
      <p>综合领先：${entry.topScore}，净资产领先：${entry.topWealth}，成本指数 ${Number(entry.costIndex || 1).toFixed(2)}</p>
    </div>
  `).join("") : `<div class="round-entry"><strong>还没有结算记录</strong><p>老师完成第一次结算后，这里会显示开始事件和结算事件。</p></div>`;
}

function renderBudgetCards(student, room) {
  const mandatory = student.metrics.mandatory;
  const consumerDebt = debtItem(student, "CONSUMER");
  const min = consumerDebt?.minPay || 0;
  const salary = inferSalary(student, room.currentEvent);
  const borrowLimit = Math.max(0, room.roles.find((role) => role.id === student.roleId).salary * 5 - debtPrincipal(student, "CONSUMER"));
  el["round-budget"].innerHTML = [
    summaryCard("本轮工资入账", money(salary)),
    summaryCard("必扣生活费", `${money(mandatory.baseLiving)} = 3600 × ${room.season.costIndex.toFixed(2)}`),
    summaryCard("应急金目标", `至少 ${CONFIG_TEXT.emergencyMin} 月，稳健 ${CONFIG_TEXT.emergencySafe} 月`),
    summaryCard("可借额度", money(borrowLimit))
  ].join("");
}

function renderEvent(event) {
  if (!event) {
    el["news-headline"].textContent = "等待本轮事件";
    el["news-body"].textContent = "教师发布事件后，这里会显示开始事件、市场影响和生活影响。";
    el["market-impact"].innerHTML = "";
    el["life-impact"].innerHTML = "";
    return;
  }
  el["news-headline"].textContent = event.title;
  el["news-body"].textContent = event.body;
  el["market-impact"].innerHTML = event.market.map((item) => `
    <div class="impact-card ${item.rate >= 0 ? "up" : "down"}">
      <strong>${item.name}</strong>
      <span>${item.id}</span>
      <b>${item.rate >= 0 ? "+" : ""}${item.rate.toFixed(2)}%</b>
    </div>
  `).join("");
  el["life-impact"].innerHTML = event.effects.map((item) => `<div class="hint-chip"><strong>${item.label}</strong><span>${item.detail}</span></div>`).join("");
}

function renderLoanCards(student, room) {
  const consumerDebt = debtItem(student, "CONSUMER");
  const mortgageDebt = debtItem(student, "MORTGAGE");
  const mandatory = student.metrics.mandatory;
  el["loan-cards"].innerHTML = [
    metricCard("消费贷本金", money(consumerDebt?.principal || 0)),
    metricCard("本轮利息", money(consumerDebt?.interestDue || 0)),
    metricCard("最低还款", money(consumerDebt?.minPay || 0)),
    metricCard("应急金分母", `${money(mandatory.total + (consumerDebt?.minPay || 0))} / 月`),
    metricCard("偿债率 DSR", percent(student.metrics.dsr * 100)),
    metricCard("房贷月供", money(mortgageDebt?.minPay || 0))
  ].join("");
}

function renderConsumptions(consumptions, decision) {
  el["consumption-options"].innerHTML = consumptions.map((item) => `
    <div class="choice-chip">
      <label>
        <input type="checkbox" data-consumption-id="${item.id}" ${decision.consumptions.includes(item.id) ? "checked" : ""}>
        <strong>${item.name}</strong>
      </label>
      <span>${money(item.displayCost ?? item.cost)} / 生活质量 +${item.lq}</span>
    </div>
  `).join("");
}

function renderGambleOptions(types, current) {
  el["gamble-type"].innerHTML = types.map((item) => `
    <option value="${item.id}" ${item.id === current ? "selected" : ""}>
      ${item.label}
    </option>
  `).join("");
}

function renderRepaymentOptions(options, current) {
  const list = current === "MANUAL" && !options.some((item) => item.id === "MANUAL")
    ? [{ id: "MANUAL", label: "按明细分配" }, ...options]
    : options;
  el["repay-target"].innerHTML = list.map((item) => `
    <option value="${item.id}" ${item.id === current ? "selected" : ""}>${item.label}</option>
  `).join("");
}

function renderRepaymentPlan(student, decision) {
  if (!student.debts || !student.debts.length) {
    el["repayment-plan"].innerHTML = `<p class="empty-copy">当前没有可分配的债务。借入消费贷、买车或买房后，这里会出现逐笔还款输入。</p>`;
    return;
  }
  el["repayment-plan"].innerHTML = student.debts.map((debt) => `
    <label class="choice-chip debt-plan-card">
      <span>
        <strong>${debt.creditor}</strong>
        <small>本金 ${money(debt.principal)} / 最低还款 ${money(debt.minPay || 0)}</small>
      </span>
      <input type="number" min="0" step="100" value="${decision.repayPlan?.[debt.type] || 0}" data-debt-type="${debt.type}">
    </label>
  `).join("");
}

function renderAssetInputs(assets, decision) {
  el["asset-inputs"].innerHTML = assets.map((asset) => `
    <div class="asset-input-card">
      <label>${asset.id} / ${asset.name}
        <input type="number" step="100" value="${decision.changes[asset.id] || 0}" data-asset-id="${asset.id}">
      </label>
      <small>最小买入 ${money(asset.min)}，手续费 ${(asset.fee * 100).toFixed(2)}%</small>
    </div>
  `).join("");
}

function applyDecision(decision) {
  el["borrow-amount"].value = decision.borrow || 0;
  el["repay-amount"].value = decision.repay || 0;
  el["repay-target"].value = decision.repayTarget || "AUTO";
  el["option-direction"].value = decision.optionDir || "CALL";
  el["gamble-type"].value = decision.gambleType || "LOTTERY";
  el["house-action"].value = decision.houseAction || "HOLD";
  el["risk-confirm"].checked = Boolean(decision.riskOk);
  [...el["repayment-plan"].querySelectorAll("input[data-debt-type]")].forEach((input) => {
    input.value = decision.repayPlan?.[input.dataset.debtType] || 0;
  });
  hookPreviewEvents();
}

function hookPreviewEvents() {
  [...el["consumption-options"].querySelectorAll("input")].forEach((input) => input.onchange = previewDecision);
  [...el["asset-inputs"].querySelectorAll("input")].forEach((input) => input.oninput = previewDecision);
  el["borrow-amount"].oninput = previewDecision;
  el["repay-amount"].oninput = previewDecision;
  el["repay-target"].onchange = previewDecision;
  [...el["repayment-plan"].querySelectorAll("input[data-debt-type]")].forEach((input) => input.oninput = previewDecision);
  el["option-direction"].onchange = previewDecision;
  el["gamble-type"].onchange = previewDecision;
  el["house-action"].onchange = previewDecision;
  el["risk-confirm"].onchange = previewDecision;
}

function readDecision() {
  const repayPlan = {};
  const decision = {
    consumptions: [],
    borrow: Number(el["borrow-amount"].value || 0),
    repay: Number(el["repay-amount"].value || 0),
    repayTarget: el["repay-target"].value || "AUTO",
    repayPlan,
    changes: {},
    optionDir: el["option-direction"].value,
    gambleType: el["gamble-type"].value,
    houseAction: el["house-action"].value,
    riskOk: el["risk-confirm"].checked
  };
  [...el["consumption-options"].querySelectorAll("input:checked")].forEach((input) => decision.consumptions.push(input.dataset.consumptionId));
  [...el["asset-inputs"].querySelectorAll("input")].forEach((input) => {
    decision.changes[input.dataset.assetId] = Number(input.value || 0);
  });
  [...el["repayment-plan"].querySelectorAll("input[data-debt-type]")].forEach((input) => {
    const amount = Number(input.value || 0);
    if (amount > 0) repayPlan[input.dataset.debtType] = amount;
  });
  const plannedRepay = Object.values(repayPlan).reduce((sum, value) => sum + Number(value || 0), 0);
  if (plannedRepay > 0) {
    decision.repay = plannedRepay;
    decision.repayTarget = "MANUAL";
    el["repay-amount"].value = plannedRepay;
    el["repay-target"].value = "MANUAL";
  }
  saveDraft(decision);
  return decision;
}

function clearRepayPlan() {
  [...el["repayment-plan"].querySelectorAll("input[data-debt-type]")].forEach((input) => {
    input.value = 0;
  });
  el["repay-target"].value = "AUTO";
  el["repay-amount"].value = 0;
  previewDecision();
}

function fillMinRepayPlan() {
  const student = state.payload?.room?.self;
  if (!student) return;
  (student.debts || []).forEach((debt) => {
    const input = el["repayment-plan"].querySelector(`input[data-debt-type="${debt.type}"]`);
    if (!input) return;
    input.value = roundPlanAmount(debt.minPay || 0);
  });
  el["repay-target"].value = "MANUAL";
  previewDecision();
}

function fillAvalancheRepayPlan() {
  const student = state.payload?.room?.self;
  const room = state.payload?.room;
  if (!student || !room) return;
  const optionalTotal = [...el["consumption-options"].querySelectorAll("input:checked")]
    .reduce((sum, input) => sum + (room.consumptions.find((item) => item.id === input.dataset.consumptionId)?.displayCost || 0), 0);
  let trades = 0;
  let fees = 0;
  [...el["asset-inputs"].querySelectorAll("input")].forEach((input) => {
    const amount = Number(input.value || 0);
    const asset = room.assets.find((item) => item.id === input.dataset.assetId);
    trades += amount;
    if (amount > 0) fees += amount * asset.fee;
  });
  const buyHouseCost = el["house-action"].value === "BUY" ? 300000 * 0.2 + 300000 * 0.02 : 0;
  const available = Math.max(
    0,
    student.cash + inferSalary(student, room.currentEvent) + Number(el["borrow-amount"].value || 0)
      - student.metrics.mandatory.total - optionalTotal - trades - fees - buyHouseCost
  );
  const plan = buildAvalanchePlan(student, available);
  [...el["repayment-plan"].querySelectorAll("input[data-debt-type]")].forEach((input) => {
    input.value = plan[input.dataset.debtType] || 0;
  });
  el["repay-target"].value = "MANUAL";
  previewDecision();
}

function previewDecision() {
  if (!state.payload || state.payload.user.role !== "student") return;
  const room = state.payload.room;
  const student = room.self;
  const decision = readDecision();
  const optionalTotal = decision.consumptions.reduce((sum, id) => sum + (room.consumptions.find((item) => item.id === id).displayCost || 0), 0);
  let trades = 0;
  let fees = 0;
  const buyHouseCost = decision.houseAction === "BUY" ? 300000 * 0.2 + 300000 * 0.02 : 0;
  Object.entries(decision.changes).forEach(([id, amount]) => {
    const asset = room.assets.find((item) => item.id === id);
    trades += amount;
    if (amount > 0) fees += amount * asset.fee;
  });
  const minPay = debtItem(student, "CONSUMER")?.minPay || 0;
  const mandatory = student.metrics.mandatory.total;
  const predictedCash = student.cash + inferSalary(student, room.currentEvent) + decision.borrow - mandatory - optionalTotal - decision.repay - trades - fees - buyHouseCost;
  const highRiskTouched = ["A7", "A8", "A9"].some((id) => Math.abs(Number(decision.changes[id] || 0)) > 0);
  let message = "可以提交";
  if (decision.repayTarget === "MANUAL") message = `将按明细分配还款 ${money(decision.repay)}`;
  else if (decision.repay > 0 && decision.repayTarget !== "AUTO") message = `将优先偿还 ${repayTargetLabel(decision.repayTarget)}`;
  if (highRiskTouched && !decision.riskOk) message = "高风险资产需要先勾选风险确认";
  if (predictedCash < 0) message = "预计回合末现金为负，请调整决策";
  el["preview-min-pay"].textContent = money(minPay);
  el["preview-cash"].textContent = money(predictedCash);
  el["preview-message"].textContent = message;
}

function disableDecision(disabled) {
  [...el["decision-form"].querySelectorAll("input, select, button")].forEach((node) => { node.disabled = disabled; });
}

async function submitDecision(event) {
  event.preventDefault();
  try {
    const result = await api("/api/student/decision", { method: "POST", body: readDecision() });
    clearDraft();
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
  clearDraft();
  state.payload = result;
  render();
}

async function exportCsv() {
  const response = await fetch("/api/teacher/export", {
    method: "GET",
    headers: {
      ...(state.auth ? { Authorization: `Bearer ${state.auth.token}` } : {})
    }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "导出失败" }));
    alert(data.message || "导出失败");
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.payload.room.name || "finance-class"}-scores.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function archiveRoom() {
  if (!confirm("确定要归档并关闭当前课堂吗？归档后会保留历史成绩和课堂画像。")) return;
  const result = await api("/api/teacher/archive", { method: "POST", body: { keepRoomOpen: false } });
  state.payload = result;
  state.currentView = "teacher";
  render();
}

function printReport() {
  if (!state.payload || state.payload.user.role !== "teacher") return;
  const room = state.payload.room;
  const rows = room.rankings.slice().sort((a, b) => b.finalScore - a.finalScore).map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.displayName}</td>
      <td>${roleLabel(item.roleId)}</td>
      <td>${item.finalScore.toFixed(1)}</td>
      <td>${money(item.netWorth)}</td>
      <td>${percent(item.debtRatio * 100)}</td>
      <td>${item.healthScore.toFixed(1)}</td>
      <td>${percent(item.growth * 100)}</td>
    </tr>
  `).join("");
  const profile = room.classProfile || {};
  const report = window.open("", "_blank", "width=1080,height=840");
  if (!report) return;
  report.document.write(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <title>课堂成绩单</title>
      <style>
        body { font-family: "Microsoft YaHei UI", sans-serif; padding: 32px; color: #1f2937; }
        h1, h2 { margin-bottom: 8px; }
        .meta, .profile { margin-bottom: 20px; }
        .profile span { display: inline-block; margin-right: 18px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
        th { background: #f3f4f6; }
      </style>
    </head>
    <body>
      <h1>${room.name} 成绩单</h1>
      <div class="meta">
        <div>课堂码：${state.payload.roomCode}</div>
        <div>打印时间：${new Date().toLocaleString("zh-CN")}</div>
      </div>
      <div class="profile">
        <h2>班级画像</h2>
        <span>班级人数：${profile.studentCount || 0}</span>
        <span>平均高风险暴露：${percent((profile.avgRiskExposure || 0) * 100)}</span>
        <span>平均负债率：${percent((profile.avgDebtRatio || 0) * 100)}</span>
        <span>平均应急金月数：${Number(profile.avgEmergencyMonths || 0).toFixed(1)} 月</span>
        <span>违约人数：${profile.defaults || 0}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>学生</th>
            <th>角色</th>
            <th>综合分</th>
            <th>净资产</th>
            <th>负债率</th>
            <th>健康分</th>
            <th>成长率</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </body>
    </html>
  `);
  report.document.close();
  report.focus();
  report.print();
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
  if (!response.ok) throw new Error(data.message || "请求失败");
  return data;
}

function renderLedger(student) {
  const ledger = student.latestLedger;
  if (!ledger || !ledger.cashflow || !ledger.settlementEvent) {
    el["settlement-ledger"].innerHTML = `<p class="empty-copy">本轮还没有结算单。完成结算后，这里会显示工资、生活费、贷款、投资收益和分数解释。</p>`;
    return;
  }
  const score = ledger.score || {};
  const health = score.healthBreakdown || {};
  const topInvestment = (ledger.investmentBreakdown || []).slice().sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))[0];
  el["settlement-ledger"].innerHTML = `
    <div class="ledger-section">
      <h4>${ledger.settlementEvent.title}</h4>
      <p>${ledger.settlementEvent.body}</p>
      <p><strong>${ledger.settlementEvent.summary}</strong></p>
      ${ledger.settlementEvent.drivers?.length ? `<div class="ledger-list">${ledger.settlementEvent.drivers.map((item) => `<div>关键变化：${item}</div>`).join("")}</div>` : ""}
    </div>
    <div class="ledger-grid">
      <div>
        <span class="metric-label">工资收入</span>
        <strong>${money(ledger.cashflow.income + ledger.cashflow.localIncome)}</strong>
      </div>
      <div>
        <span class="metric-label">基础生活费</span>
        <strong>${money(ledger.cashflow.mandatoryBase)}</strong>
      </div>
      <div>
        <span class="metric-label">总必需支出</span>
        <strong>${money(ledger.cashflow.mandatoryTotal)}</strong>
      </div>
      <div>
        <span class="metric-label">债务利息 / 还款</span>
        <strong>${money(ledger.cashflow.interest)} / ${money(ledger.cashflow.repay)}</strong>
      </div>
      <div>
        <span class="metric-label">可选消费</span>
        <strong>${money(ledger.cashflow.optional)}</strong>
      </div>
      <div>
        <span class="metric-label">手续费</span>
        <strong>${money(ledger.cashflow.fees)}</strong>
      </div>
    </div>
    <div class="ledger-list">
      ${(ledger.optionalItems || []).map((item) => `<div>消费：${item.name} ${money(item.amount)} / 生活质量 +${item.lq}</div>`).join("")}
      ${(ledger.investmentBreakdown || []).map((item) => `<div>资产：${item.name} ${item.rate >= 0 ? "上涨" : "下跌"} ${percent(Math.abs(item.rate) * 100)}，影响 ${money(item.gain)}</div>`).join("")}
      ${(ledger.cashflow.repayPayments || []).map((item) => `<div>还款分配：${item.creditor} ${money(item.amount)}</div>`).join("")}
      ${((ledger.debt?.items) || []).map((item) => `<div>债务：${item.creditor} / 本金 ${money(item.principal)} / 最低还款 ${money(item.minPay || 0)} / 状态 ${debtStatusText(item.status)}</div>`).join("")}
      ${topInvestment ? `<div>本轮最大波动来源：${topInvestment.name}，影响 ${money(topInvestment.gain)}</div>` : ""}
      ${ledger.debt.defaulted ? `<div>违约：高风险资产已被强制清算 ${money(ledger.debt.forcedSale)}</div>` : ""}
    </div>
    <div class="ledger-grid">
      <div>
        <span class="metric-label">健康分</span>
        <strong>${score.healthScore ? score.healthScore.toFixed(1) : "-"}</strong>
      </div>
      <div>
        <span class="metric-label">储蓄率分</span>
        <strong>${health.saveScore ? health.saveScore.toFixed(1) : "-"}</strong>
      </div>
      <div>
        <span class="metric-label">应急金分</span>
        <strong>${health.emergencyScore ? health.emergencyScore.toFixed(1) : "-"}</strong>
      </div>
      <div>
        <span class="metric-label">偿债率分</span>
        <strong>${health.dsrScore ? health.dsrScore.toFixed(1) : "-"}</strong>
      </div>
      <div>
        <span class="metric-label">负债率分</span>
        <strong>${health.debtScore ? health.debtScore.toFixed(1) : "-"}</strong>
      </div>
      <div>
        <span class="metric-label">分散度分</span>
        <strong>${health.diversificationScore ? health.diversificationScore.toFixed(1) : "-"}</strong>
      </div>
      <div>
        <span class="metric-label">纪律分</span>
        <strong>${health.disciplineScore ? health.disciplineScore.toFixed(1) : "-"}</strong>
      </div>
    </div>
  `;
}

function renderDebtDetail(student) {
  if (!student.debts || !student.debts.length) {
    el["debt-detail"].innerHTML = `<p class="empty-copy">当前没有债务。若后续借入消费贷或车贷，这里会按债务条目展示本金、利息、最低还款和状态。</p>`;
    return;
  }
  el["debt-detail"].innerHTML = student.debts.map((debt) => `
    <div class="ledger-grid debt-grid">
      <div><span class="metric-label">债务名称</span><strong>${debt.creditor}</strong></div>
      <div><span class="metric-label">类型</span><strong>${debt.type}</strong></div>
      <div><span class="metric-label">当前本金</span><strong>${money(debt.principal)}</strong></div>
      <div><span class="metric-label">月利率</span><strong>${percent((debt.rateMonthly || 0) * 100)}</strong></div>
      <div><span class="metric-label">本轮利息</span><strong>${money(debt.interestDue || 0)}</strong></div>
      <div><span class="metric-label">最低还款</span><strong>${money(debt.minPay || 0)}</strong></div>
      <div><span class="metric-label">逾期轮数</span><strong>${debt.missedRounds || 0}</strong></div>
      <div><span class="metric-label">状态</span><strong>${debtStatusText(debt.status)}</strong></div>
    </div>
  `).join("");
}

function renderHousePanel(student, room) {
  const nextRate = room.currentEvent?.market?.find?.((item) => item.id === "house")?.rate ?? 0;
  const downPayment = 300000 * 0.2;
  const buyFee = 300000 * 0.02;
  const mortgageDebt = debtItem(student, "MORTGAGE");
  el["house-panel"].innerHTML = `
    <div class="ledger-grid">
      <div><span class="metric-label">当前房产状态</span><strong>${student.houseOwned ? "已持有" : "未持有"}</strong></div>
      <div><span class="metric-label">房屋估值</span><strong>${money(student.houseValue)}</strong></div>
      <div><span class="metric-label">房贷本金</span><strong>${money(mortgageDebt?.principal || 0)}</strong></div>
      <div><span class="metric-label">月供</span><strong>${money(mortgageDebt?.minPay || 0)}</strong></div>
      <div><span class="metric-label">维护费</span><strong>${money(200)} / 轮</strong></div>
      <div><span class="metric-label">本轮房价变化</span><strong>${nextRate >= 0 ? "+" : ""}${percent(nextRate)}</strong></div>
    </div>
    <div class="ledger-list">
      <div>买房需要：首付 ${money(downPayment)} + 税费 ${money(buyFee)}</div>
      <div>卖房规则：卖出后资金延迟 1 轮到账，期间不能再次卖房</div>
      ${student.housePendingRounds > 0 ? `<div>卖房到账中：还有 ${student.housePendingRounds} 轮，预计到账 ${money(student.housePendingCash)}</div>` : ""}
    </div>
  `;
}

function renderAssetCurve(student) {
  const history = (student.history || []).filter((entry) => entry.closing && entry.closing.assetMix);
  if (!history.length) {
    el["asset-curve"].innerHTML = `<p class="empty-copy">还没有曲线。完成首轮结算后，这里会展示净资产、总资产和总负债变化。</p>`;
    el["asset-mix"].innerHTML = "";
    return;
  }
  const points = history.map((entry) => ({
    label: `R${entry.round}`,
    netWorth: entry.closing.netWorth,
    totalAssets: entry.closing.assetMix.cash + entry.closing.assetMix.stable + entry.closing.assetMix.growth + entry.closing.assetMix.speculative + entry.closing.assetMix.car + (entry.closing.assetMix.house || 0),
    debt: entry.closing.assetMix.debt
  }));
  el["asset-curve"].innerHTML = buildLineChart(points);

  const latest = history[history.length - 1].closing.assetMix;
  const parts = [
    ["现金", latest.cash, "cash"],
    ["稳健资产", latest.stable, "stable"],
    ["成长资产", latest.growth, "growth"],
    ["高风险资产", latest.speculative, "speculative"],
    ["汽车", latest.car, "car"]
    ,["房产", latest.house || 0, "house"]
  ];
  const total = parts.reduce((sum, [, value]) => sum + Math.max(value, 0), 0) || 1;
  el["asset-mix"].innerHTML = parts.map(([label, value, tone]) => `
    <div class="mix-row">
      <span>${label}</span>
      <div class="mix-track"><i class="mix-fill ${tone}" style="width:${(Math.max(value, 0) / total) * 100}%"></i></div>
      <strong>${money(value)}</strong>
    </div>
  `).join("");
}

function renderClassProfile(profile) {
  if (!profile) {
    el["class-profile"].innerHTML = "";
    return;
  }
  const topReasons = (profile.topRiskReasons || []).map((item) => `${item.label} ${item.count}人`).join(" / ") || "暂无";
  el["class-profile"].innerHTML = [
    summaryCard("班级人数", String(profile.studentCount || 0)),
    summaryCard("平均高风险暴露", percent((profile.avgRiskExposure || 0) * 100)),
    summaryCard("平均负债率", percent((profile.avgDebtRatio || 0) * 100)),
    summaryCard("平均应急金月数", `${Number(profile.avgEmergencyMonths || 0).toFixed(1)} 月`),
    summaryCard("违约人数", String(profile.defaults || 0)),
    summaryCard("风险原因 Top3", topReasons)
  ].join("");
}

function buildLineChart(points) {
  const width = 640;
  const height = 220;
  const padding = 24;
  const allValues = points.flatMap((item) => [item.netWorth, item.totalAssets, item.debt]);
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const scaleX = (index) => padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
  const scaleY = (value) => height - padding - ((value - min) / Math.max(max - min, 1)) * (height - padding * 2);
  const pathFor = (key) => points.map((item, index) => `${index === 0 ? "M" : "L"}${scaleX(index)},${scaleY(item[key])}`).join(" ");
  const labels = points.map((item, index) => `<text x="${scaleX(index)}" y="${height - 6}" text-anchor="middle">${item.label}</text>`).join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" aria-label="资产曲线">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="chart-axis"></line>
      <path d="${pathFor("totalAssets")}" class="chart-line assets"></path>
      <path d="${pathFor("netWorth")}" class="chart-line worth"></path>
      <path d="${pathFor("debt")}" class="chart-line debt"></path>
      ${labels}
    </svg>
    <div class="chart-legend">
      <span><i class="legend-dot assets"></i>总资产</span>
      <span><i class="legend-dot worth"></i>净资产</span>
      <span><i class="legend-dot debt"></i>总负债</span>
    </div>
  `;
}

function buildBalanceRows(student, room) {
  const mandatory = student.metrics.mandatory;
  const consumerDebt = debtItem(student, "CONSUMER");
  const carDebt = debtItem(student, "CAR");
  const mortgageDebt = debtItem(student, "MORTGAGE");
  const min = consumerDebt?.minPay || 0;
  const rows = [];
  rows.push(balanceRow("现金", money(student.cash), "应急金与流动性"));
  Object.entries(student.assets).forEach(([id, value]) => rows.push(balanceRow(`${id} ${assetLabel(id)}`, money(value), "当前持仓市值")));
  if (student.carOwned) rows.push(balanceRow("汽车资产", money(student.carValue), `已持有 ${student.carMonths} 轮`));
  if (student.houseOwned || student.housePendingCash > 0) rows.push(balanceRow("房产资产", money(student.houseValue + student.housePendingCash), student.housePendingRounds > 0 ? `卖房到账中，还需 ${student.housePendingRounds} 轮` : "低流动性固定资产"));
  rows.push(balanceRow("消费贷本金", money(-(consumerDebt?.principal || 0)), `最低还款 ${money(min)}`));
  rows.push(balanceRow("车贷本金", money(-(carDebt?.principal || 0)), "月供已锁定未来现金流"));
  rows.push(balanceRow("房贷本金", money(-(mortgageDebt?.principal || 0)), "房贷月供会计入偿债率 DSR"));
  rows.push(balanceRow("逾期欠款", money(-student.arrears), "逾期会拖累健康分与纪律分"));
  rows.push(balanceRow("本轮基础生活费", money(mandatory.baseLiving), `3600 × 成本指数 ${room.season.costIndex.toFixed(2)}`));
  rows.push(balanceRow("应急金月数分母", money(mandatory.total + min), "基础生活费 + 养车成本 + 最低还款"));
  rows.push(balanceRow("偿债率 DSR", percent(student.metrics.dsr * 100), "（最低还款 + 车贷月供）÷ 本轮收入，建议控制在 36% 以下"));
  rows.push(balanceRow("健康分", student.score ? student.score.healthScore.toFixed(1) : "0.0", "由储蓄率、应急金、负债率、分散度、纪律组成"));
  return rows.join("");
}

function balanceRow(name, value, note) {
  return `<tr><td>${name}</td><td>${value}</td><td>${note}</td></tr>`;
}

function metricCard(label, value) {
  return `<div class="metric-card"><span class="metric-label">${label}</span><strong>${value}</strong></div>`;
}

function summaryCard(label, value) {
  return `<div class="summary-card"><span class="metric-label">${label}</span><strong class="summary-value">${value}</strong></div>`;
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
  (event.rawEffects || []).forEach((effect) => {
    if (effect.type === "bonus" && effect.roles.includes(student.roleId)) salary += effect.amount;
    if (effect.type === "cut" && effect.roles.includes(student.roleId)) salary -= state.payload.room.roles.find((role) => role.id === student.roleId).salary * effect.ratio;
  });
  return salary;
}

function getWorkingDecision(student, room) {
  const draft = loadDraft(room.season.round, student.id);
  if (room.season.status === "open" && draft) return normalizeDecision(draft);
  return normalizeDecision(student.currentDecision);
}

function normalizeDecision(raw) {
  const changes = {};
  (state.payload?.room?.assets || []).forEach((asset) => { changes[asset.id] = Number(raw?.changes?.[asset.id] || 0); });
  return {
    consumptions: Array.isArray(raw?.consumptions) ? raw.consumptions : [],
    borrow: Number(raw?.borrow || 0),
    repay: Number(raw?.repay || 0),
    repayPlan: normalizeRepayPlan(raw?.repayPlan),
    changes,
    optionDir: raw?.optionDir === "PUT" ? "PUT" : "CALL",
    gambleType: raw?.gambleType || "LOTTERY",
    repayTarget: raw?.repayTarget || "AUTO",
    houseAction: raw?.houseAction || "HOLD",
    riskOk: Boolean(raw?.riskOk)
  };
}

function draftStorageKey(round, userId) {
  return `${DRAFT_KEY}:${state.payload.roomCode}:${round}:${userId}`;
}

function saveDraft(decision) {
  if (!state.payload || state.payload.user.role !== "student") return;
  localStorage.setItem(draftStorageKey(state.payload.room.season.round, state.payload.user.id), JSON.stringify(decision));
}

function loadDraft(round, userId) {
  try {
    return JSON.parse(localStorage.getItem(draftStorageKey(round, userId)));
  } catch {
    return null;
  }
}

function clearDraft() {
  if (!state.payload || state.payload.user.role !== "student") return;
  localStorage.removeItem(draftStorageKey(state.payload.room.season.round, state.payload.user.id));
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

function roleLabel(roleId) {
  return ROLE_OPTIONS.find((item) => item[0] === roleId)?.[1] || roleId;
}

function assetLabel(assetId) {
  return state.payload?.room?.assets?.find((item) => item.id === assetId)?.name || assetId;
}

function money(value) {
  return `￥${Number(value || 0).toFixed(0)}`;
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function statusText(status) {
  return { ready: "准备中", open: "开放中", locked: "已锁定", settled: "已结算", finished: "已结束", closed: "已关闭" }[status] || status;
}

function statusTone(status) {
  return { ready: "neutral", open: "success", locked: "danger", settled: "neutral", finished: "danger", closed: "danger" }[status] || "neutral";
}

function debtStatusText(status) {
  return { OK: "正常", DELINQUENT: "逾期", DEFAULT: "违约", SELLING: "卖房到账中" }[status] || status;
}

function debtItem(student, type) {
  return (student.debts || []).find((item) => item.type === type) || null;
}

function debtPrincipal(student, type) {
  return debtItem(student, type)?.principal || 0;
}

function buildAvalanchePlan(student, budget) {
  const plan = {};
  let remaining = Math.max(0, budget);
  const debts = [...(student.debts || [])]
    .filter((item) => item.principal > 0)
    .sort((a, b) => (b.rateMonthly || 0) - (a.rateMonthly || 0));
  const consumer = debts.find((item) => item.type === "CONSUMER");
  if (consumer) {
    const min = Math.min(remaining, consumer.minPay || 0);
    if (min > 0) {
      plan.CONSUMER = roundPlanAmount(min);
      remaining -= plan.CONSUMER;
    }
  }
  debts.forEach((debt) => {
    if (remaining <= 0) return;
    const already = Number(plan[debt.type] || 0);
    const due = Math.max(0, debt.principal + (debt.interestDue || 0) - already);
    const applied = Math.min(remaining, due);
    if (applied <= 0) return;
    plan[debt.type] = already + roundPlanAmount(applied);
    remaining = Math.max(0, remaining - roundPlanAmount(applied));
  });
  return plan;
}

function roundPlanAmount(value) {
  return Math.max(0, Math.floor(Number(value || 0) / 100) * 100);
}

function normalizeRepayPlan(raw) {
  const plan = {};
  ["CONSUMER", "CAR", "MORTGAGE"].forEach((type) => {
    const value = Number(raw?.[type] || 0);
    if (value > 0) plan[type] = value;
  });
  return plan;
}

function repayTargetLabel(target) {
  return {
    AUTO: "自动分配",
    MANUAL: "按明细分配",
    CONSUMER: "消费贷",
    CAR: "车贷",
    MORTGAGE: "房贷"
  }[target] || target;
}

const CONFIG_TEXT = {
  emergencyMin: 3,
  emergencySafe: 6
};
