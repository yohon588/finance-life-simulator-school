const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, "db.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const CONFIG = {
  rounds: 8,
  livingCost: 3600,
  costIndex: 1,
  loanRate: 0.01,
  loanMinPayRate: 0.05,
  lateFeeRate: 0.01,
  defaultRounds: 3,
  maxLoanSalaryMultiple: 5,
  carPrice: 200000,
  carLoan: 160000,
  carPay: 3090,
  carKeep: 800,
  carDep: 0.01,
  lqMax: 25
};

const ROLES = [
  ["R1", "基础岗", 4500, 2000],
  ["R2", "服务岗", 5500, 3000],
  ["R3", "销售岗", 6500, 2000],
  ["R4", "技术岗", 8500, 5000],
  ["R5", "运营岗", 10000, 8000],
  ["R6", "白领高薪", 12000, 10000],
  ["R7", "高薪精英", 15000, 15000]
];

const CONSUMPTIONS = [
  ["C1", "旅游", 2000, 1, 2],
  ["C2", "健身卡", 1000, 1, 1],
  ["C3", "学习课程", 3000, 2, 2],
  ["C4", "换手机", 6000, 1, 1],
  ["C5", "买车", 40000, 10, 1]
];

const ASSETS = [
  ["A1", "银行存款", 1000, 0],
  ["A2", "银行理财", 1000, 0.0005],
  ["A3", "货币基金", 100, 0.0005],
  ["A4", "债券基金", 100, 0.0005],
  ["A5", "股票基金", 100, 0.001],
  ["A6", "股票", 0, 0.001],
  ["A7", "虚拟币", 0, 0.002],
  ["A8", "期权", 0, 0.005],
  ["A9", "赌博", 0, 0]
];

const EVENTS = [
  { id: 1, title: "人工智能行情扩散，成长板块升温", body: "科技主题继续发酵，市场风险偏好上升，权益类资产明显更受关注。", market: { A1: 0.25, A2: 0.5, A3: 0.3, A4: -0.5, A5: 6, A6: 12, A7: 25 }, effects: [{ type: "bonus", roles: ["R4", "R5", "R6", "R7"], amount: 1000 }], points: ["引导学生讨论风险偏好上升时为什么权益更强。", "提醒学生主题行情往往伴随更大的回撤。"] },
  { id: 2, title: "房地产信用承压，租金与避险需求同步上行", body: "房租压力抬升，债券与现金管理类产品重新受到关注。", market: { A1: 0.25, A2: 0.55, A3: 0.3, A4: 2.5, A5: -5, A6: -10, A7: -15 }, effects: [{ type: "rent", amount: 500, permanent: true }], points: ["让学生看到生活成本变化可能比市场涨跌更伤现金流。", "比较现金流脆弱者与稳健者面对同一新闻的差异。"] },
  { id: 3, title: "定向降息释放流动性，债券与权益共振", body: "流动性改善后，债券基金和权益类产品同步受益。", market: { A1: 0.15, A2: 0.45, A3: 0.25, A4: 3.2, A5: 4.8, A6: 7.5, A7: 10 }, effects: [], points: ["比较债基与股基对利率变化的反应差异。", "提醒学生降息不代表所有高风险资产都值得追。"] },
  { id: 4, title: "医疗支出抬头，应急金价值凸显", body: "家庭医疗支出压力上升，保持流动性重新成为重要理财能力。", market: { A1: 0.3, A2: 0.45, A3: 0.35, A4: 1.8, A5: -4, A6: -8, A7: -12 }, effects: [{ type: "health", amount: 1200, prob: 0.55 }], points: ["应急金不是低效资金，而是风险管理工具。", "可观察健身卡消费是否带来保护效果。"] },
  { id: 5, title: "政策支持成长赛道，市场情绪回暖", body: "成长板块走强，但高收益和高波动同时出现。", market: { A1: 0.2, A2: 0.35, A3: 0.25, A4: -0.8, A5: 5.5, A6: 11, A7: 18 }, effects: [{ type: "bonus", roles: ["R3", "R4", "R5"], amount: 800 }], points: ["比较股票基金和个股在政策利好下的表现差异。", "强调政策故事同样可能快速反转。"] },
  { id: 6, title: "就业市场转弱，收入端压力上升", body: "工资和奖金预期下修，收入不确定性开始挤压杠杆空间。", market: { A1: 0.25, A2: 0.4, A3: 0.3, A4: 1.2, A5: -2.5, A6: -6, A7: -10 }, effects: [{ type: "cut", roles: ["R1", "R2", "R3"], ratio: 0.08 }], points: ["收入波动与投资波动一样需要被管理。", "高杠杆在收入下滑时会快速放大压力。"] },
  { id: 7, title: "投机热升温，虚拟币与期权活跃", body: "高风险资产迎来狂热交易，尾部风险也同步扩大。", market: { A1: 0.15, A2: 0.25, A3: 0.2, A4: -1.5, A5: 7, A6: 13, A7: 35 }, effects: [{ type: "gamble", prob: 0.08, payout: 3.5 }], points: ["高波动改变的不只是收益大小，还有结果分布。", "投机行为与长期理财目标并不一致。"] },
  { id: 8, title: "通胀回升，基础生活成本持续抬高", body: "名义收益看起来不错，但真实购买力正在被生活成本吞噬。", market: { A1: 0.12, A2: 0.3, A3: 0.25, A4: -1.2, A5: 2, A6: 4, A7: 6 }, effects: [{ type: "inflate", ratio: 0.08, permanent: true }], points: ["帮助学生区分名义收益和真实购买力。", "单纯存低收益资产可能仍然跑不赢通胀。"] }
];

ensureDb();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    writeJson(res, 500, { error: "SERVER_ERROR", message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Finance Life Simulator running at http://localhost:${PORT}`);
});

async function handleApi(req, res, url) {
  const db = readDb();
  const auth = authenticate(req, db);

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readBody(req);
    const teacherName = String(body.teacherName || "").trim();
    const roomName = String(body.roomName || "").trim() || "个人理财课堂";
    if (!teacherName) {
      writeJson(res, 400, { error: "INVALID_PARAM", message: "teacherName is required" });
      return;
    }

    const roomCode = createRoomCode(db);
    const teacherId = crypto.randomUUID();
    const token = createToken();
    const room = createRoom(roomCode, roomName, teacherId, teacherName);
    db.rooms[roomCode] = room;
    db.sessions[token] = { roomCode, userId: teacherId, role: "teacher" };
    writeDb(db);
    writeJson(res, 200, { token, roomCode, user: { id: teacherId, role: "teacher", displayName: teacherName }, room: serializeRoomForTeacher(room) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/join") {
    const body = await readBody(req);
    const roomCode = normalizeCode(body.roomCode);
    const displayName = String(body.displayName || "").trim();
    const roleId = String(body.roleId || "").trim();
    if (!roomCode || !displayName || !roleId) {
      writeJson(res, 400, { error: "INVALID_PARAM", message: "roomCode, displayName, roleId are required" });
      return;
    }
    const room = db.rooms[roomCode];
    if (!room) {
      writeJson(res, 404, { error: "ROOM_NOT_FOUND", message: "room not found" });
      return;
    }
    if (Object.keys(room.students).length >= 60) {
      writeJson(res, 400, { error: "ROOM_FULL", message: "room is full" });
      return;
    }
    const studentId = crypto.randomUUID();
    const token = createToken();
    room.students[studentId] = createStudent(studentId, displayName, roleId);
    db.sessions[token] = { roomCode, userId: studentId, role: "student" };
    writeDb(db);
    writeJson(res, 200, { token, roomCode, user: { id: studentId, role: "student", displayName }, room: serializeRoomForStudent(room, studentId) });
    return;
  }

  if (!auth) {
    writeJson(res, 401, { error: "UNAUTHORIZED", message: "Missing or invalid token" });
    return;
  }

  const room = db.rooms[auth.roomCode];
  if (!room) {
    writeJson(res, 404, { error: "ROOM_NOT_FOUND", message: "room not found" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    writeJson(res, 200, buildClientPayload(room, auth));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher/event") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    const body = await readBody(req);
    room.season.eventId = Number(body.eventId || 0);
    room.season.status = "open";
    room.season.updatedAt = Date.now();
    writeDb(db);
    writeJson(res, 200, buildClientPayload(room, auth));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher/lock") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    room.season.status = "locked";
    room.season.updatedAt = Date.now();
    writeDb(db);
    writeJson(res, 200, buildClientPayload(room, auth));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher/settle") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    settleRoom(room);
    writeDb(db);
    writeJson(res, 200, buildClientPayload(room, auth));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/student/decision") {
    if (auth.role !== "student") {
      writeJson(res, 403, { error: "FORBIDDEN", message: "Students only" });
      return;
    }
    const student = room.students[auth.userId];
    const body = await readBody(req);
    const validation = validateDecision(room, student, body);
    if (validation.errors.some((message) => !message.includes("最低还款"))) {
      writeJson(res, 400, { error: "INVALID_DECISION", message: validation.errors[0], details: validation.errors });
      return;
    }
    student.decisions[String(room.season.round)] = normalizeDecision(body);
    student.optionDir = student.decisions[String(room.season.round)].optionDir;
    room.season.updatedAt = Date.now();
    writeDb(db);
    writeJson(res, 200, buildClientPayload(room, auth));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher/reset") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    const teacher = room.teacher;
    db.rooms[auth.roomCode] = createRoom(auth.roomCode, room.name, teacher.id, teacher.displayName);
    writeDb(db);
    writeJson(res, 200, buildClientPayload(db.rooms[auth.roomCode], auth));
    return;
  }

  writeJson(res, 404, { error: "NOT_FOUND", message: "Unknown API route" });
}

function serveStatic(pathname, res) {
  let safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT, decodeURIComponent(safePath)));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error.code === "ENOENT" ? "Not Found" : "Server Error");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ rooms: {}, sessions: {} }, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function createRoom(roomCode, roomName, teacherId, teacherName) {
  return {
    code: roomCode,
    name: roomName,
    teacher: { id: teacherId, displayName: teacherName },
    students: {},
    season: {
      round: 1,
      status: "ready",
      eventId: null,
      costIndex: CONFIG.costIndex,
      log: [],
      updatedAt: Date.now()
    }
  };
}

function createStudent(id, displayName, roleId) {
  const role = roleById(roleId);
  return {
    id,
    displayName,
    roleId,
    baseSalary: role.salary,
    cash: role.cash,
    assets: emptyAssets(),
    loan: 0,
    arrears: 0,
    missed: 0,
    defaults: 0,
    carLoan: 0,
    carValue: 0,
    carOwned: false,
    carMonths: 0,
    lq: 0,
    boosts: 0,
    lateCount: 0,
    counts: {},
    history: [],
    startWorth: role.cash,
    decisions: {},
    optionDir: "CALL"
  };
}

function authenticate(req, db) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !db.sessions[token]) return null;
  return db.sessions[token];
}

function requireTeacher(auth, res) {
  if (auth.role !== "teacher") {
    writeJson(res, 403, { error: "FORBIDDEN", message: "Teachers only" });
  }
}

function buildClientPayload(room, auth) {
  return {
    roomCode: room.code,
    user: auth.role === "teacher" ? { id: room.teacher.id, role: "teacher", displayName: room.teacher.displayName } : { id: auth.userId, role: "student", displayName: room.students[auth.userId].displayName },
    room: auth.role === "teacher" ? serializeRoomForTeacher(room) : serializeRoomForStudent(room, auth.userId)
  };
}

function serializeRoomForTeacher(room) {
  const event = eventById(room.season.eventId);
  return {
    name: room.name,
    season: room.season,
    event,
    events: EVENTS,
    roles: ROLES.map(([id, name, salary, cash]) => ({ id, name, salary, initCash: cash })),
    students: Object.values(room.students).map((student) => serializeStudent(student, room)),
    rankings: rankings(room)
  };
}

function serializeRoomForStudent(room, studentId) {
  const event = eventById(room.season.eventId);
  return {
    name: room.name,
    season: room.season,
    event,
    events: EVENTS,
    roles: ROLES.map(([id, name, salary, cash]) => ({ id, name, salary, initCash: cash })),
    consumptions: CONSUMPTIONS.map(([id, name, cost, lq, limit]) => ({ id, name, cost, lq, limit })),
    assets: ASSETS.map(([id, name, min, fee]) => ({ id, name, min, fee })),
    self: serializeStudent(room.students[studentId], room),
    rankings: rankings(room),
    classmates: Object.values(room.students).map((student) => ({ id: student.id, displayName: student.displayName, roleId: student.roleId, submitted: Boolean(student.decisions[String(room.season.round)]) }))
  };
}

function serializeStudent(student, room) {
  return {
    id: student.id,
    displayName: student.displayName,
    roleId: student.roleId,
    roleName: roleById(student.roleId).name,
    cash: student.cash,
    assets: student.assets,
    loan: student.loan,
    arrears: student.arrears,
    carLoan: student.carLoan,
    carValue: student.carValue,
    carOwned: student.carOwned,
    carMonths: student.carMonths,
    lq: student.lq,
    counts: student.counts,
    boosts: student.boosts,
    decisions: student.decisions,
    currentDecision: student.decisions[String(room.season.round)] || emptyDecision(),
    metrics: metrics(student, room),
    score: rankings(room).find((item) => item.id === student.id) || null,
    submitted: Boolean(student.decisions[String(room.season.round)])
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function createRoomCode(db) {
  let code = "";
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (db.rooms[code]);
  return code;
}

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function emptyAssets() {
  return Object.fromEntries(ASSETS.map(([id]) => [id, 0]));
}

function emptyDecision() {
  return { consumptions: [], borrow: 0, repay: 0, changes: emptyAssets(), optionDir: "CALL", riskOk: false };
}

function normalizeDecision(raw) {
  const decision = emptyDecision();
  decision.borrow = Number(raw.borrow || 0);
  decision.repay = Number(raw.repay || 0);
  decision.optionDir = raw.optionDir === "PUT" ? "PUT" : "CALL";
  decision.riskOk = Boolean(raw.riskOk);
  decision.consumptions = Array.isArray(raw.consumptions) ? raw.consumptions.filter((id) => CONSUMPTIONS.some((item) => item[0] === id)) : [];
  if (raw.changes && typeof raw.changes === "object") {
    Object.keys(decision.changes).forEach((id) => {
      decision.changes[id] = Number(raw.changes[id] || 0);
    });
  }
  return decision;
}

function validateDecision(room, student, rawDecision) {
  const decision = normalizeDecision(rawDecision);
  const errors = [];
  const currentEvent = eventById(room.season.eventId);
  const min = minPay(student);
  const role = roleById(student.roleId);
  const maxBorrow = role.salary * CONFIG.maxLoanSalaryMultiple - student.loan;
  const optional = decision.consumptions.reduce((sum, id) => sum + consumptionById(id).cost, 0);
  let trades = 0;
  let fees = 0;
  Object.entries(decision.changes).forEach(([id, amount]) => {
    const asset = assetById(id);
    trades += amount;
    if (amount > 0) fees += amount * asset.fee;
  });
  const cash = student.cash + effectiveSalary(student, currentEvent) + decision.borrow - mandatoryCost(student, room.season.costIndex) - optional - decision.repay - trades - fees;
  if (room.season.status !== "open") errors.push("当前回合未开放，暂不能提交。");
  if (decision.borrow < 0 || decision.borrow > Math.max(0, maxBorrow)) errors.push(`新增贷款需在 0 到 ${money(maxBorrow)} 之间。`);
  if (decision.repay < 0) errors.push("还款金额不能为负数。");
  if (cash < 0) errors.push("预计回合末现金为负，请减少支出或买入规模。");
  if (student.loan > 0 && decision.repay < min) errors.push("低于最低还款，结算时会计为逾期。");
  if (["A7", "A8", "A9"].some((id) => Math.abs(decision.changes[id]) > 0) && !decision.riskOk) errors.push("涉及 A7、A8、A9 时必须勾选风险确认。");
  Object.entries(decision.changes).forEach(([id, amount]) => {
    const asset = assetById(id);
    if (amount > 0 && asset.min > 0 && amount < asset.min) errors.push(`${id} 最小买入单位为 ${money(asset.min)}。`);
    if (amount < 0 && Math.abs(amount) > student.assets[id]) errors.push(`${id} 卖出金额不能超过当前持仓。`);
  });
  decision.consumptions.forEach((id) => {
    const count = student.counts[id] || 0;
    if (count >= consumptionById(id).limit) errors.push(`${consumptionById(id).name} 已达到赛季上限。`);
    if (id === "C5" && student.carOwned) errors.push("买车只能触发一次。");
  });
  return { errors, decision };
}

function settleRoom(room) {
  const event = eventById(room.season.eventId);
  if (!event) return;
  const startCostIndex = room.season.costIndex;
  Object.values(room.students).forEach((student) => {
    if (!student.decisions[String(room.season.round)]) {
      student.decisions[String(room.season.round)] = botDecision(student, room);
    }
    settleStudent(student, student.decisions[String(room.season.round)], event, room, startCostIndex);
  });
  applyPermanentEffects(room, event);
  const list = rankings(room);
  const topScore = [...list].sort((a, b) => b.finalScore - a.finalScore)[0];
  const topWealth = [...list].sort((a, b) => b.netWorth - a.netWorth)[0];
  room.season.log.push({ round: room.season.round, title: event.title, costIndex: room.season.costIndex, topScore: topScore?.displayName || "-", topWealth: topWealth?.displayName || "-" });
  if (room.season.round >= CONFIG.rounds) {
    room.season.round = CONFIG.rounds + 1;
    room.season.status = "finished";
  } else {
    room.season.round += 1;
    room.season.status = "ready";
    room.season.eventId = null;
  }
  room.season.updatedAt = Date.now();
}

function botDecision(student, room) {
  const decision = emptyDecision();
  const event = eventById(room.season.eventId);
  const risky = ["R5", "R6", "R7"].includes(student.roleId);
  if (student.cash > 5000 && (student.counts.C3 || 0) < 1) decision.consumptions.push("C3");
  if (student.cash < mandatoryCost(student, room.season.costIndex) + 1200) decision.borrow = Math.min(roleById(student.roleId).salary * 2, roleById(student.roleId).salary * CONFIG.maxLoanSalaryMultiple - student.loan);
  if (student.loan > 0) decision.repay = Math.max(minPay(student), Math.min(student.cash * 0.2, student.loan + minPay(student)));
  const free = Math.max(0, student.cash + effectiveSalary(student, event) + decision.borrow - mandatoryCost(student, room.season.costIndex) - decision.repay - 2000);
  if (free > 0) {
    if ((event.market.A6 || 0) > 0) {
      decision.changes.A5 = round100(free * 0.35);
      decision.changes.A6 = round100(free * (risky ? 0.35 : 0.25));
    } else {
      decision.changes.A3 = round100(free * 0.25);
      decision.changes.A4 = round100(free * 0.2);
    }
    if (risky && (event.market.A7 || 0) > 0) {
      decision.changes.A7 = round100(free * 0.15);
      decision.riskOk = true;
    }
  }
  if (risky && (event.market.A6 || 0) > 8 && student.cash > 12000) {
    decision.changes.A8 = 1000;
    decision.riskOk = true;
  }
  return decision;
}

function settleStudent(student, decision, event, room, startCostIndex) {
  let cash = student.cash + effectiveSalary(student, event);
  let mandatory = mandatoryCost(student, startCostIndex);
  let optional = 0;
  let fees = 0;
  const local = localEffects(student, event, room.season.round);
  mandatory += local.mandatory;
  cash += local.cash;

  if (decision.borrow > 0) {
    student.loan += decision.borrow;
    cash += decision.borrow;
  }

  decision.consumptions.forEach((id) => {
    const item = consumptionById(id);
    optional += item.cost;
    student.lq = Math.min(CONFIG.lqMax, student.lq + item.lq);
    student.counts[id] = (student.counts[id] || 0) + 1;
    if (id === "C3") student.boosts += 2;
    if (id === "C5" && !student.carOwned) {
      student.carOwned = true;
      student.carLoan = CONFIG.carLoan;
      student.carValue = CONFIG.carPrice;
      student.carMonths = 0;
    }
  });
  cash -= optional;

  Object.entries(decision.changes).forEach(([id, amount]) => {
    const asset = assetById(id);
    if (amount > 0) {
      fees += amount * asset.fee;
      student.assets[id] += amount;
      cash -= amount + amount * asset.fee;
    } else if (amount < 0) {
      const sell = Math.abs(amount);
      student.assets[id] = Math.max(0, student.assets[id] - sell);
      cash += sell;
    }
  });

  const loan = settleLoans(student, decision.repay);
  mandatory += loan.carKeep;
  fees += loan.fees;
  cash -= loan.pay;
  cash -= mandatory;
  cash -= fees;

  const investment = settleAssets(student, event, decision.optionDir, room.season.round);
  cash += investment.cashBack;

  if (student.carOwned) {
    student.carMonths += 1;
    student.carValue = CONFIG.carPrice * Math.pow(1 - CONFIG.carDep, student.carMonths);
  }
  if (cash < 0) {
    student.arrears += Math.abs(cash);
    cash = 0;
  }
  student.cash = cash;
  if (student.boosts > 0) student.boosts -= 1;
  const studentMetrics = metrics(student, room);
  student.history.push({ income: effectiveSalary(student, event), mandatory, optional, netWorth: studentMetrics.netWorth });
}

function localEffects(student, event, round) {
  const out = { cash: 0, mandatory: 0 };
  event.effects.forEach((effect) => {
    if (effect.type === "bonus" && effect.roles.includes(student.roleId)) out.cash += effect.amount;
    if (effect.type === "cut" && effect.roles.includes(student.roleId)) out.cash -= student.baseSalary * effect.ratio;
    if (effect.type === "rent") out.mandatory += effect.amount;
    if (effect.type === "health" && seeded(`${student.id}-health`, round) < effect.prob) out.mandatory += (student.counts.C2 ? effect.amount * 0.9 : effect.amount);
  });
  return out;
}

function settleLoans(student, repay) {
  let pay = 0;
  let fees = 0;
  let carKeep = 0;
  if (student.loan > 0) {
    const interest = student.loan * CONFIG.loanRate;
    const min = minPay(student);
    const actual = Math.min(repay, student.loan + interest);
    student.loan = Math.max(0, student.loan - Math.max(0, actual - interest));
    pay += actual;
    if (actual + 0.01 < min) {
      student.missed += 1;
      student.lateCount += 1;
      const late = student.loan * CONFIG.lateFeeRate;
      student.arrears += late;
      fees += late;
      if (student.missed >= CONFIG.defaultRounds) {
        student.defaults += 1;
        ["A6", "A7", "A8", "A9"].forEach((id) => {
          student.cash += student.assets[id] * 0.8;
          student.assets[id] = 0;
        });
      }
    } else {
      student.missed = 0;
    }
  }
  if (student.carOwned && student.carLoan > 0) {
    const carPay = Math.min(CONFIG.carPay, student.carLoan);
    student.carLoan = Math.max(0, student.carLoan - carPay);
    pay += carPay;
    carKeep += CONFIG.carKeep;
  }
  return { pay, fees, carKeep };
}

function settleAssets(student, event, optionDir, round) {
  let cashBack = 0;
  ASSETS.forEach(([id]) => {
    const amount = student.assets[id];
    if (amount <= 0) return;
    let rate = 0;
    if (id === "A8") {
      const stock = (event.market.A6 || 0) / 100;
      rate = optionDir === "PUT" ? clamp(-10 * stock - 0.05, -1, 2) : clamp(10 * stock - 0.05, -1, 2);
    } else if (id === "A9") {
      const gambleEffect = event.effects.find((effect) => effect.type === "gamble");
      const prob = gambleEffect ? gambleEffect.prob : 0.05;
      const payout = gambleEffect ? gambleEffect.payout : 3;
      rate = seeded(`${student.id}-${id}`, round) < prob ? payout : -1;
      if (amount > roleById(student.roleId).salary) student.lq = Math.max(0, student.lq - 1);
    } else {
      rate = (event.market[id] || 0) / 100;
    }
    student.assets[id] += amount * rate;
    if (id === "A9") {
      cashBack += student.assets[id];
      student.assets[id] = 0;
    }
  });
  return { cashBack };
}

function applyPermanentEffects(room, event) {
  event.effects.forEach((effect) => {
    if (effect.type === "rent" && effect.permanent) room.season.costIndex += effect.amount / CONFIG.livingCost;
    if (effect.type === "inflate" && effect.permanent) room.season.costIndex *= 1 + effect.ratio;
  });
}

function rankings(room) {
  const students = Object.values(room.students);
  const list = students.map((student) => ({ student, metric: metrics(student, room) }));
  return list.map(({ student, metric }) => {
    const sameRole = list.filter((item) => item.student.roleId === student.roleId).map((item) => item.metric.growth);
    const all = list.map((item) => item.metric.growth);
    const wealthScore = 0.7 * percentile(metric.growth, sameRole) + 0.3 * percentile(metric.growth, all);
    const avgSave = average(student.history.map((entry) => entry.income ? (entry.income - entry.mandatory - entry.optional) / entry.income : 0));
    const saveScore = avgSave <= 0 ? 0 : avgSave >= 0.3 ? 100 : 80 * avgSave / 0.3;
    const emergencyScore = metric.emergency >= 6 ? 100 : metric.emergency >= 3 ? 80 : metric.emergency < 1 ? 10 : 10 + (metric.emergency - 1) * 35;
    const debtScore = metric.debtRatio <= 0.2 ? 100 : metric.debtRatio >= 0.8 ? 20 : 100 - ((metric.debtRatio - 0.2) / 0.6) * 80;
    const healthScore = 0.25 * saveScore + 0.25 * emergencyScore + 0.3 * debtScore + 0.1 * diversification(student) + 0.1 * Math.max(0, 100 - student.lateCount * 10 - student.defaults * 40);
    const lqScore = Math.min(student.lq, CONFIG.lqMax) / CONFIG.lqMax * 100;
    return {
      id: student.id,
      displayName: student.displayName,
      roleId: student.roleId,
      netWorth: metric.netWorth,
      debtRatio: metric.debtRatio,
      growth: metric.growth,
      lq: student.lq,
      healthScore,
      finalScore: 0.6 * wealthScore + 0.3 * healthScore + 0.1 * lqScore
    };
  });
}

function metrics(student, room) {
  const assetSum = ASSETS.reduce((sum, [id]) => sum + student.assets[id], 0);
  const totalAssets = student.cash + assetSum + student.carValue;
  const totalDebt = student.loan + student.carLoan + student.arrears;
  const netWorth = totalAssets - totalDebt;
  return {
    totalAssets,
    totalDebt,
    netWorth,
    debtRatio: totalDebt / Math.max(totalAssets, 1),
    emergency: student.cash / Math.max(mandatoryCost(student, room.season.costIndex), 1),
    growth: (netWorth - student.startWorth) / Math.max(student.startWorth, 1000)
  };
}

function roleById(id) {
  const role = ROLES.find((item) => item[0] === id) || ROLES[0];
  return { id: role[0], name: role[1], salary: role[2], cash: role[3] };
}

function eventById(id) {
  return EVENTS.find((event) => event.id === id) || null;
}

function assetById(id) {
  const asset = ASSETS.find((item) => item[0] === id) || ASSETS[0];
  return { id: asset[0], name: asset[1], min: asset[2], fee: asset[3] };
}

function consumptionById(id) {
  const consumption = CONSUMPTIONS.find((item) => item[0] === id) || CONSUMPTIONS[0];
  return { id: consumption[0], name: consumption[1], cost: consumption[2], lq: consumption[3], limit: consumption[4] };
}

function effectiveSalary(student, event) {
  let salary = student.baseSalary * (1 + 0.05 * student.boosts);
  if (!event) return salary;
  event.effects.forEach((effect) => {
    if (effect.type === "bonus" && effect.roles.includes(student.roleId)) salary += effect.amount;
    if (effect.type === "cut" && effect.roles.includes(student.roleId)) salary -= student.baseSalary * effect.ratio;
  });
  return salary;
}

function mandatoryCost(student, costIndex) {
  return CONFIG.livingCost * costIndex + (student.carOwned ? CONFIG.carKeep : 0);
}

function minPay(student) {
  return student.loan <= 0 ? 0 : student.loan * CONFIG.loanRate + student.loan * CONFIG.loanMinPayRate;
}

function percentile(value, values) {
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((item) => item < value).length;
  const equal = sorted.filter((item) => item === value).length;
  return sorted.length ? ((below + 0.5 * equal) / sorted.length) * 100 : 0;
}

function diversification(student) {
  const total = ASSETS.reduce((sum, [id]) => sum + Math.max(0, student.assets[id]), 0);
  if (!total) return 20;
  const hhi = ASSETS.reduce((sum, [id]) => {
    const share = student.assets[id] / total;
    return sum + share * share;
  }, 0);
  return clamp((1 - hhi) * 120, 0, 100);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function money(value) {
  return `¥${Number(value || 0).toFixed(0)}`;
}

function round100(value) {
  return Math.round(value / 100) * 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function seeded(seed, round) {
  const text = `${seed}-${round}`;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 2147483647;
  }
  return (hash % 1000) / 1000;
}
