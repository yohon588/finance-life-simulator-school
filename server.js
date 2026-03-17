const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, "db.json");
const DATABASE_URL = process.env.DATABASE_URL || "";
let pool = null;

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
  lqMax: 25,
  emergencyTargetMin: 3,
  emergencyTargetSafe: 6,
  housePrice: 300000,
  houseDownPaymentRate: 0.2,
  houseMortgageAnnualRate: 0.045,
  houseMortgageMonths: 240,
  housePay: 1900,
  houseKeep: 200,
  houseBuyFeeRate: 0.02,
  houseSellFeeRate: 0.02,
  houseSellDelayRounds: 1
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
  ["C5", "买车", 40000, 10, 1],
  ["E1", "高尔夫球局", 1500, 1, 2],
  ["E2", "演唱会/音乐节", 1000, 1, 2],
  ["E3", "餐厅/酒吧社交", 600, 1, 3],
  ["E4", "露营旅行升级", 3500, 2, 1],
  ["M1", "彩礼-基础", 0, 3, 1, "salary_multiple", 6],
  ["M2", "彩礼-体面", 0, 5, 1, "salary_multiple", 10],
  ["W1", "婚礼-简约", 0, 4, 1, "salary_multiple", 6, ["M1", "M2"]],
  ["W2", "婚礼-体面", 0, 7, 1, "salary_multiple", 10, ["M1", "M2"]]
];

const GAMBLE_TYPES = {
  LOTTERY: { label: "彩票", winProb: 0.01, winRate: 10, loseRate: -1, disciplinePenalty: 4 },
  SPORTS: { label: "体育投注", winProb: 0.1, winRate: 2, loseRate: -1, disciplinePenalty: 6 },
  CASINO: { label: "线上赌场", winProb: 0.05, winRate: 3, loseRate: -1, disciplinePenalty: 10 },
  SCAM: { label: "带单/高收益群", winProb: 0.3, winRate: 0.2, loseRate: -1, disciplinePenalty: 16, freezeNextRound: true }
};

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

initStorage()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Finance Life Simulator running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize storage", error);
    process.exit(1);
  });

async function handleApi(req, res, url) {
  const db = await readDb();
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
    await writeDb(db);
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
    await writeDb(db);
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

  if (req.method === "GET" && url.pathname === "/api/teacher/export") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    writeCsv(res, 200, buildTeacherExportCsv(room), `${slugify(room.name || room.code)}-scores.csv`);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher/event") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    const body = await readBody(req);
    room.season.eventId = Number(body.eventId || 0);
    room.season.status = "open";
    room.season.updatedAt = Date.now();
    await writeDb(db);
    writeJson(res, 200, buildClientPayload(room, auth));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher/lock") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    room.season.status = "locked";
    room.season.updatedAt = Date.now();
    await writeDb(db);
    writeJson(res, 200, buildClientPayload(room, auth));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher/settle") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    settleRoom(room);
    await writeDb(db);
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
    await writeDb(db);
    writeJson(res, 200, buildClientPayload(room, auth));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher/reset") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    const teacher = room.teacher;
    const nextRoom = createRoom(auth.roomCode, room.name, teacher.id, teacher.displayName);
    nextRoom.archives = Array.isArray(room.archives) ? room.archives : [];
    nextRoom.createdAt = room.createdAt || Date.now();
    db.rooms[auth.roomCode] = nextRoom;
    await writeDb(db);
    writeJson(res, 200, buildClientPayload(db.rooms[auth.roomCode], auth));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher/archive") {
    requireTeacher(auth, res);
    if (res.writableEnded) return;
    const body = await readBody(req);
    archiveRoom(room, Boolean(body.keepRoomOpen));
    await writeDb(db);
    writeJson(res, 200, buildClientPayload(room, auth));
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

async function initStorage() {
  if (DATABASE_URL) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    await pool.query(`
      create table if not exists app_state (
        state_key text primary key,
        value jsonb not null
      )
    `);
    const existing = await pool.query("select state_key from app_state where state_key = 'main'");
    if (!existing.rowCount) {
      await pool.query("insert into app_state (state_key, value) values ($1, $2::jsonb)", ["main", JSON.stringify({ rooms: {}, sessions: {} })]);
    }
    return;
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ rooms: {}, sessions: {} }, null, 2));
  }
}

async function readDb() {
  if (pool) {
    const result = await pool.query("select value from app_state where state_key = 'main'");
    return result.rows[0]?.value || { rooms: {}, sessions: {} };
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ rooms: {}, sessions: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

async function writeDb(db) {
  if (pool) {
    await pool.query("update app_state set value = $2::jsonb where state_key = $1", ["main", JSON.stringify(db)]);
    return;
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function createRoom(roomCode, roomName, teacherId, teacherName) {
  return {
    code: roomCode,
    name: roomName,
    teacher: { id: teacherId, displayName: teacherName },
    createdAt: Date.now(),
    closedAt: null,
    archives: [],
    students: {},
    season: {
      round: 1,
      status: "ready",
      eventId: null,
      costIndex: CONFIG.costIndex,
      lastSettlement: null,
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
    debts: [],
    loan: 0,
    arrears: 0,
    missed: 0,
    defaults: 0,
    carLoan: 0,
    carValue: 0,
    carOwned: false,
    carMonths: 0,
    houseOwned: false,
    houseValue: 0,
    mortgagePrincipal: 0,
    mortgageMonthsLeft: 0,
    housePendingCash: 0,
    housePendingRounds: 0,
    lq: 0,
    boosts: 0,
    lateCount: 0,
    counts: {},
    history: [],
    startWorth: role.cash,
    decisions: {},
    optionDir: "CALL",
    latestLedger: null,
    gambleType: "LOTTERY",
    scamFrozenRounds: 0
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
    createdAt: room.createdAt,
    closedAt: room.closedAt,
    season: room.season,
    event,
    currentEvent: event ? serializeEvent(event) : null,
    lastSettlement: room.season.lastSettlement,
    events: EVENTS,
    roles: ROLES.map(([id, name, salary, cash]) => ({ id, name, salary, initCash: cash })),
    students: Object.values(room.students).map((student) => serializeStudent(student, room)),
    rankings: rankings(room),
    classProfile: buildClassProfile(room),
    archives: (room.archives || []).slice().reverse()
  };
}

function serializeRoomForStudent(room, studentId) {
  const event = eventById(room.season.eventId);
  return {
    name: room.name,
    season: room.season,
    event,
    currentEvent: event ? serializeEvent(event) : null,
    lastSettlement: room.season.lastSettlement,
    events: EVENTS,
    roles: ROLES.map(([id, name, salary, cash]) => ({ id, name, salary, initCash: cash })),
    consumptions: CONSUMPTIONS.map(([id]) => {
      const item = consumptionById(id);
      const student = room.students[studentId];
      return { ...item, displayCost: consumptionCost(item, student) };
    }),
    assets: ASSETS.map(([id, name, min, fee]) => ({ id, name, min, fee })),
    gambleTypes: Object.entries(GAMBLE_TYPES).map(([id, value]) => ({ id, ...value })),
    repaymentOptions: buildRepaymentOptions(room.students[studentId]),
    self: serializeStudent(room.students[studentId], room),
    rankings: rankings(room),
    classmates: Object.values(room.students).map((student) => ({ id: student.id, displayName: student.displayName, roleId: student.roleId, submitted: Boolean(student.decisions[String(room.season.round)]) }))
  };
}

function serializeStudent(student, room) {
  ensureDebtState(student);
  const score = rankings(room).find((item) => item.id === student.id) || null;
  return {
    id: student.id,
    displayName: student.displayName,
    roleId: student.roleId,
    roleName: roleById(student.roleId).name,
    cash: student.cash,
    assets: student.assets,
    debts: buildDebtItems(student),
    loan: student.loan,
    arrears: student.arrears,
    carLoan: student.carLoan,
    carValue: student.carValue,
    carOwned: student.carOwned,
    carMonths: student.carMonths,
    houseOwned: student.houseOwned,
    houseValue: student.houseValue,
    mortgagePrincipal: student.mortgagePrincipal,
    mortgageMonthsLeft: student.mortgageMonthsLeft,
    housePendingCash: student.housePendingCash,
    housePendingRounds: student.housePendingRounds,
    lq: student.lq,
    counts: student.counts,
    boosts: student.boosts,
    gambleType: student.gambleType || "LOTTERY",
    scamFrozenRounds: student.scamFrozenRounds || 0,
    decisions: student.decisions,
    currentDecision: student.decisions[String(room.season.round)] || emptyDecision(),
    metrics: metrics(student, room),
    score,
    riskTags: riskTags(student, room),
    latestLedger: student.latestLedger ? { ...student.latestLedger, score } : null,
    history: student.history.slice(-8),
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

function writeCsv(res, statusCode, content, filename) {
  res.writeHead(statusCode, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(`\uFEFF${content}`);
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
  return { consumptions: [], borrow: 0, repay: 0, repayTarget: "AUTO", repayPlan: {}, changes: emptyAssets(), optionDir: "CALL", gambleType: "LOTTERY", houseAction: "HOLD", riskOk: false };
}

function normalizeDecision(raw) {
  const decision = emptyDecision();
  decision.borrow = Number(raw.borrow || 0);
  decision.repay = Number(raw.repay || 0);
  decision.repayTarget = ["AUTO", "MANUAL", "CONSUMER", "CAR", "MORTGAGE"].includes(raw.repayTarget) ? raw.repayTarget : "AUTO";
  ["CONSUMER", "CAR", "MORTGAGE"].forEach((type) => {
    const amount = Number(raw?.repayPlan?.[type] || 0);
    if (amount > 0) decision.repayPlan[type] = amount;
  });
  const plannedRepay = Object.values(decision.repayPlan).reduce((sum, value) => sum + Number(value || 0), 0);
  if (plannedRepay > 0) {
    decision.repay = plannedRepay;
    decision.repayTarget = "MANUAL";
  }
  decision.optionDir = raw.optionDir === "PUT" ? "PUT" : "CALL";
  decision.gambleType = GAMBLE_TYPES[raw.gambleType] ? raw.gambleType : "LOTTERY";
  decision.houseAction = ["HOLD", "BUY", "SELL"].includes(raw.houseAction) ? raw.houseAction : "HOLD";
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
  ensureDebtState(student);
  const decision = normalizeDecision(rawDecision);
  const errors = [];
  const currentEvent = eventById(room.season.eventId);
  const min = minPay(student);
  const plannedRepay = Object.values(decision.repayPlan).reduce((sum, value) => sum + Number(value || 0), 0);
  const plannedConsumerRepay = Number(decision.repayPlan.CONSUMER || 0);
  const role = roleById(student.roleId);
  const maxBorrow = role.salary * CONFIG.maxLoanSalaryMultiple - consumerPrincipal(student);
  const optional = decision.consumptions.reduce((sum, id) => sum + consumptionCost(consumptionById(id), student), 0);
  const housePreview = houseTransactionPreview(student, decision.houseAction);
  let trades = 0;
  let fees = 0;
  Object.entries(decision.changes).forEach(([id, amount]) => {
    const asset = assetById(id);
    trades += amount;
    if (amount > 0) fees += amount * asset.fee;
  });
  const cash = student.cash + effectiveSalary(student, currentEvent) + decision.borrow - mandatoryCost(student, room.season.costIndex) - optional - decision.repay - trades - fees - housePreview.buyCost;
  if (room.season.status !== "open") errors.push("当前回合未开放，暂不能提交。");
  if (student.scamFrozenRounds > 0 && decision.changes.A9 < 0) errors.push("诈骗冻结状态下，本轮不能从 A9 提现。");
  if (decision.borrow < 0 || decision.borrow > Math.max(0, maxBorrow)) errors.push(`新增贷款需在 0 到 ${money(maxBorrow)} 之间。`);
  if (decision.houseAction === "BUY" && student.houseOwned) errors.push("当前已持有房产，不能重复购房。");
  if (decision.houseAction === "SELL" && !student.houseOwned) errors.push("当前没有房产可出售。");
  if (decision.houseAction === "SELL" && student.housePendingRounds > 0) errors.push("卖房资金仍在到账中，暂不能再次卖房。");
  if (decision.repay < 0) errors.push("还款金额不能为负数。");
  if (decision.repay > 0 && !["AUTO", "MANUAL"].includes(decision.repayTarget) && !getDebt(student, decision.repayTarget)) {
    errors.push("指定的还款目标当前不存在，请改为自动分配或选择已有债务。");
  }
  Object.entries(decision.repayPlan).forEach(([type, amount]) => {
    if (amount < 0) errors.push(`${type} 的明细还款不能为负数。`);
    if (!getDebt(student, type)) errors.push(`${type} 当前没有可还的债务。`);
  });
  if (cash < 0) errors.push("预计回合末现金为负，请减少支出或买入规模。");
  if (consumerPrincipal(student) > 0 && ((decision.repayTarget === "MANUAL" ? plannedConsumerRepay : decision.repay) < min)) errors.push("低于最低还款，结算时会计为逾期。");
  if (["A7", "A8", "A9"].some((id) => Math.abs(decision.changes[id]) > 0) && !decision.riskOk) errors.push("涉及 A7、A8、A9 时必须勾选风险确认。");
  Object.entries(decision.changes).forEach(([id, amount]) => {
    const asset = assetById(id);
    if (amount > 0 && asset.min > 0 && amount < asset.min) errors.push(`${id} 最小买入单位为 ${money(asset.min)}。`);
    if (amount < 0 && Math.abs(amount) > student.assets[id]) errors.push(`${id} 卖出金额不能超过当前持仓。`);
  });
  decision.consumptions.forEach((id) => {
    const count = student.counts[id] || 0;
    const item = consumptionById(id);
    if (count >= item.limit) errors.push(`${item.name} 已达到赛季上限。`);
    if (id === "C5" && student.carOwned) errors.push("买车只能触发一次。");
    if (item.requires && !item.requires.some((requiredId) => decision.consumptions.includes(requiredId) || (student.counts[requiredId] || 0) > 0)) {
      errors.push(`${item.name} 需要先完成彩礼项目。`);
    }
  });
  if (plannedRepay > 0 && Math.abs(plannedRepay - decision.repay) > 0.01) errors.push("明细还款合计与总额不一致，请重新确认。");
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
  room.season.lastSettlement = buildSettlementEvent(room, event, startCostIndex, list);
  room.season.log.push({
    round: room.season.round,
    title: event.title,
    settlementTitle: room.season.lastSettlement.title,
    settlementBody: room.season.lastSettlement.body,
    settlementTemplate: room.season.lastSettlement.template,
    costIndex: room.season.costIndex,
    topScore: topScore?.displayName || "-",
    topWealth: topWealth?.displayName || "-",
    summary: room.season.lastSettlement.summary
  });
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

function archiveRoom(room, keepRoomOpen) {
  const snapshot = buildArchiveSnapshot(room);
  room.archives = Array.isArray(room.archives) ? room.archives : [];
  room.archives.push(snapshot);
  room.closedAt = Date.now();
  room.season.status = keepRoomOpen ? "ready" : "closed";
  room.season.updatedAt = Date.now();
}

function botDecision(student, room) {
  ensureDebtState(student);
  const decision = emptyDecision();
  const event = eventById(room.season.eventId);
  const risky = ["R5", "R6", "R7"].includes(student.roleId);
  if (student.cash > 5000 && (student.counts.C3 || 0) < 1) decision.consumptions.push("C3");
  if (student.cash < mandatoryCost(student, room.season.costIndex) + 1200) decision.borrow = Math.min(roleById(student.roleId).salary * 2, roleById(student.roleId).salary * CONFIG.maxLoanSalaryMultiple - consumerPrincipal(student));
  if (consumerPrincipal(student) > 0) decision.repay = Math.max(minPay(student), Math.min(student.cash * 0.2, consumerPrincipal(student) + minPay(student)));
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
  ensureDebtState(student);
  if (student.housePendingRounds > 0) {
    student.housePendingRounds -= 1;
    if (student.housePendingRounds === 0 && student.housePendingCash > 0) {
      student.cash += student.housePendingCash;
      student.housePendingCash = 0;
    }
  }
  const opening = {
    cash: student.cash,
    netWorth: metrics(student, room).netWorth,
    assetMix: buildAssetMix(student)
  };
  let income = effectiveSalary(student, event);
  let cash = student.cash + income;
  const mandatoryBase = mandatoryBreakdown(student, startCostIndex);
  let mandatory = mandatoryBase.total;
  let optional = 0;
  let fees = 0;
  const local = localEffects(student, event, room.season.round);
  mandatory += local.mandatory;
  cash += local.cash;

  if (decision.borrow > 0) {
    addConsumerDebt(student, decision.borrow);
    cash += decision.borrow;
  }

  decision.consumptions.forEach((id) => {
    const item = consumptionById(id);
    optional += consumptionCost(item, student);
    student.lq = Math.min(CONFIG.lqMax, student.lq + item.lq);
    student.counts[id] = (student.counts[id] || 0) + 1;
    if (id === "C3") student.boosts += 2;
    if (id === "C5" && !student.carOwned) {
      student.carOwned = true;
      student.carValue = CONFIG.carPrice;
      student.carMonths = 0;
      upsertDebt(student, {
        id: "D-car",
        type: "CAR",
        creditor: "车贷-银行",
        principal: CONFIG.carLoan,
        rateMonthly: 0,
        minPay: CONFIG.carPay,
        missedRounds: 0,
        status: "OK"
      });
    }
    if (id === "M1" || id === "M2") {
      const supportChance = seeded(`${student.id}-family-support`, room.season.round);
      if (supportChance < 0.6) cash += student.baseSalary * 2;
    }
  });
  cash -= optional;

  const houseFlow = settleHouse(student, decision.houseAction);
  mandatory += houseFlow.keepCost;
  fees += houseFlow.fees;
  cash -= houseFlow.buyCost;

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

  const loan = settleLoans(student, decision.repay, decision.repayTarget, decision.repayPlan);
  mandatory += loan.carKeep;
  mandatory += loan.housePay;
  fees += loan.fees;
  cash -= loan.pay;
  cash -= mandatory;
  cash -= fees;

  const investment = settleAssets(student, event, decision.optionDir, decision.gambleType, room.season.round);
  cash += investment.cashBack;

  if (student.carOwned) {
    student.carMonths += 1;
    student.carValue = CONFIG.carPrice * Math.pow(1 - CONFIG.carDep, student.carMonths);
  }
  if (student.houseOwned) {
    student.houseValue = CONFIG.housePrice * (1 + houseMarketRate(event));
  }
  if (cash < 0) {
    student.arrears += Math.abs(cash);
    cash = 0;
  }
  student.cash = cash;
  if (student.boosts > 0) student.boosts -= 1;
  if (student.scamFrozenRounds > 0) student.scamFrozenRounds -= 1;
  const studentMetrics = metrics(student, room);
  syncLegacyFromDebts(student);
  const closing = {
    cash: student.cash,
    netWorth: studentMetrics.netWorth,
    assetMix: buildAssetMix(student)
  };
  student.latestLedger = buildLedger(student, event, decision, {
    room,
    round: room.season.round,
    opening,
    closing,
    income,
    mandatoryBase,
    mandatory,
    optional,
    fees,
    local,
    loan,
    houseFlow,
    investment,
    metrics: studentMetrics
  });
  student.history.push(student.latestLedger);
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

function settleLoans(student, repay, repayTarget, repayPlan = {}) {
  ensureDebtState(student);
  let pay = 0;
  let fees = 0;
  let carKeep = 0;
  let housePay = 0;
  let interest = 0;
  let min = 0;
  let actual = 0;
  let defaulted = false;
  let forcedSale = 0;
  const payments = [];
  let repayRemaining = Math.max(0, repay);
  if (repayTarget === "MANUAL" && Object.keys(repayPlan).length) {
    ["CONSUMER", "MORTGAGE", "CAR"].forEach((type) => {
      const planned = Math.max(0, Number(repayPlan[type] || 0));
      if (planned <= 0 || repayRemaining <= 0) return;
      const debt = getDebt(student, type);
      if (!debt || debt.principal <= 0) return;
      if (type === "CAR" && !student.carOwned) return;
      if (type === "MORTGAGE" && (!student.houseOwned || student.mortgageMonthsLeft <= 0)) return;
      const applied = applyDebtPayment(student, debt, Math.min(planned, repayRemaining));
      if (applied.total <= 0) return;
      pay += applied.total;
      repayRemaining = Math.max(0, repayRemaining - applied.total);
      payments.push({ type, creditor: debt.creditor, amount: applied.total });
      if (type === "CONSUMER") {
        interest = applied.interest;
        min = applied.minPay;
        actual = applied.total;
      }
      if (type === "CAR") carKeep = CONFIG.carKeep;
      if (type === "MORTGAGE") {
        housePay = 0;
        student.mortgageMonthsLeft = Math.max(0, student.mortgageMonthsLeft - 1);
      }
      if (debt.principal <= 0) removeDebt(student, debt.id);
    });
  } else {
    const priority = repaymentPriority(repayTarget);

    priority.forEach((type) => {
      if (repayRemaining <= 0) return;
      const debt = getDebt(student, type);
      if (!debt || debt.principal <= 0) return;

      if (type === "CAR" && !student.carOwned) return;
      if (type === "MORTGAGE" && (!student.houseOwned || student.mortgageMonthsLeft <= 0)) return;

      const applied = applyDebtPayment(student, debt, repayRemaining);
      if (applied.total <= 0) return;

      pay += applied.total;
      repayRemaining = Math.max(0, repayRemaining - applied.total);
      payments.push({ type, creditor: debt.creditor, amount: applied.total });

      if (type === "CONSUMER") {
        interest = applied.interest;
        min = applied.minPay;
        actual = applied.total;
      }
      if (type === "CAR") {
        carKeep = CONFIG.carKeep;
      }
      if (type === "MORTGAGE") {
        housePay = 0;
        student.mortgageMonthsLeft = Math.max(0, student.mortgageMonthsLeft - 1);
      }

      if (debt.principal <= 0) removeDebt(student, debt.id);
    });
  }

  const consumerDebt = getDebt(student, "CONSUMER");
  if (consumerDebt && consumerDebt.principal > 0) {
    interest = consumerDebt.principal * CONFIG.loanRate;
    min = minPay(student);
    actual = payments
      .filter((item) => item.type === "CONSUMER")
      .reduce((sum, item) => sum + item.amount, 0);
    if (actual + 0.01 < min) {
      consumerDebt.missedRounds = (consumerDebt.missedRounds || 0) + 1;
      student.missed = consumerDebt.missedRounds;
      student.lateCount += 1;
      const late = consumerDebt.principal * CONFIG.lateFeeRate;
      student.arrears += late;
      fees += late;
      consumerDebt.status = "DELINQUENT";
      if (consumerDebt.missedRounds >= CONFIG.defaultRounds) {
        student.defaults += 1;
        defaulted = true;
        consumerDebt.status = "DEFAULT";
        ["A6", "A7", "A8", "A9"].forEach((id) => {
          forcedSale += student.assets[id] * 0.8;
          student.cash += student.assets[id] * 0.8;
          student.assets[id] = 0;
        });
      }
    } else {
      consumerDebt.missedRounds = 0;
      consumerDebt.status = "OK";
      student.missed = 0;
    }
    if (consumerDebt.principal <= 0) removeDebt(student, consumerDebt.id);
  } else {
    interest = 0;
    min = 0;
    actual = 0;
    student.missed = 0;
  }

  if (student.carOwned && carPrincipal(student) > 0) {
    carKeep = CONFIG.carKeep;
  }

  syncLegacyFromDebts(student);
  return { pay, fees, carKeep, housePay, interest, min, actual, defaulted, forcedSale, payments, repayTarget, repayPlan };
}

function repaymentPriority(repayTarget) {
  const base = ["CONSUMER", "MORTGAGE", "CAR"];
  if (!repayTarget || repayTarget === "AUTO") return base;
  return [repayTarget, ...base.filter((type) => type !== repayTarget)];
}

function applyDebtPayment(student, debt, amount) {
  if (!debt || debt.principal <= 0 || amount <= 0) return { total: 0, principal: 0, interest: 0, minPay: 0 };
  if (debt.type === "CONSUMER") {
    const originalPrincipal = debt.principal;
    const dueInterest = originalPrincipal * CONFIG.loanRate;
    const total = Math.min(amount, originalPrincipal + dueInterest);
    const principalPaid = Math.max(0, total - dueInterest);
    debt.principal = Math.max(0, originalPrincipal - principalPaid);
    return {
      total,
      principal: principalPaid,
      interest: dueInterest,
      minPay: originalPrincipal <= 0 ? 0 : originalPrincipal * CONFIG.loanRate + originalPrincipal * CONFIG.loanMinPayRate
    };
  }
  if (debt.type === "MORTGAGE") {
    const originalPrincipal = debt.principal;
    const dueInterest = originalPrincipal * (CONFIG.houseMortgageAnnualRate / 12);
    const total = Math.min(amount, originalPrincipal + dueInterest);
    const principalPaid = Math.max(0, total - dueInterest);
    debt.principal = Math.max(0, originalPrincipal - principalPaid);
    return { total, principal: principalPaid, interest: dueInterest, minPay: debt.principal <= 0 ? 0 : CONFIG.housePay };
  }
  const total = Math.min(amount, debt.principal);
  debt.principal = Math.max(0, debt.principal - total);
  return { total, principal: total, interest: 0, minPay: debt.principal <= 0 ? 0 : CONFIG.carPay };
}

function settleAssets(student, event, optionDir, gambleType, round) {
  let cashBack = 0;
  const breakdown = [];
  ASSETS.forEach(([id]) => {
    const amount = student.assets[id];
    if (amount <= 0) return;
    let rate = 0;
    if (id === "A8") {
      const stock = (event.market.A6 || 0) / 100;
      rate = optionDir === "PUT" ? clamp(-10 * stock - 0.05, -1, 2) : clamp(10 * stock - 0.05, -1, 2);
    } else if (id === "A9") {
      const config = GAMBLE_TYPES[gambleType] || GAMBLE_TYPES.LOTTERY;
      rate = seeded(`${student.id}-${id}-${gambleType}`, round) < config.winProb ? config.winRate : config.loseRate;
      if (amount > roleById(student.roleId).salary) student.lq = Math.max(0, student.lq - 1);
      if (config.freezeNextRound && rate < 0) student.scamFrozenRounds = 1;
      student.lateCount += Math.max(0, Math.floor(config.disciplinePenalty / 10));
    } else {
      rate = (event.market[id] || 0) / 100;
    }
    const gain = amount * rate;
    student.assets[id] += gain;
    breakdown.push({ id, name: assetById(id).name, opening: amount, rate, gain, closing: student.assets[id] });
    if (id === "A9") {
      cashBack += student.assets[id];
      student.assets[id] = 0;
    }
  });
  return { cashBack, breakdown };
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
    const avgSave = average(student.history.map((entry) => {
      const income = entry.income || entry.cashflow?.income || 0;
      const mandatory = entry.mandatory || entry.cashflow?.mandatoryTotal || 0;
      const optional = entry.optional || entry.cashflow?.optional || 0;
      return income ? (income - mandatory - optional) / income : 0;
    }));
    const saveScore = avgSave <= 0 ? 0 : avgSave >= 0.3 ? 100 : 80 * avgSave / 0.3;
    const emergencyScore = metric.emergency >= CONFIG.emergencyTargetSafe
      ? 100
      : metric.emergency >= CONFIG.emergencyTargetMin
        ? 80 + ((metric.emergency - CONFIG.emergencyTargetMin) / Math.max(CONFIG.emergencyTargetSafe - CONFIG.emergencyTargetMin, 1)) * 20
        : metric.emergency < 1
          ? 10
          : 10 + ((metric.emergency - 1) / Math.max(CONFIG.emergencyTargetMin - 1, 1)) * 70;
    const debtScore = metric.debtRatio <= 0.2 ? 100 : metric.debtRatio >= 0.8 ? 20 : 100 - ((metric.debtRatio - 0.2) / 0.6) * 80;
    const dsrScore = metric.dsr <= 0.36 ? 100 : metric.dsr >= 0.8 ? 10 : 100 - ((metric.dsr - 0.36) / 0.44) * 90;
    const diversificationScore = diversification(student);
    const disciplineScore = Math.max(0, 100 - student.lateCount * 10 - student.defaults * 40);
    const healthScore = 0.2 * saveScore + 0.25 * emergencyScore + 0.25 * dsrScore + 0.1 * debtScore + 0.1 * diversificationScore + 0.1 * disciplineScore;
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
      healthBreakdown: {
        saveScore,
        emergencyScore,
        dsrScore,
        debtScore,
        diversificationScore,
        disciplineScore
      },
      wealthScore,
      lqScore,
      finalScore: 0.6 * wealthScore + 0.3 * healthScore + 0.1 * lqScore
    };
  });
}

function metrics(student, room) {
  ensureDebtState(student);
  const assetSum = ASSETS.reduce((sum, [id]) => sum + student.assets[id], 0);
  const totalAssets = student.cash + assetSum + student.carValue + student.houseValue + student.housePendingCash;
  const totalDebt = totalDebtPrincipal(student) + student.arrears;
  const netWorth = totalAssets - totalDebt;
  const mandatory = mandatoryBreakdown(student, room.season.costIndex);
  const income = effectiveSalary(student, eventById(room.season.eventId));
  const dsr = debtServiceRatio(student, income);
  return {
    totalAssets,
    totalDebt,
    netWorth,
    debtRatio: totalDebt / Math.max(totalAssets, 1),
    emergency: student.cash / Math.max(mandatory.total + minPay(student), 1),
    emergencyDenominator: mandatory.total + minPay(student),
    mandatory,
    dsr,
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
  return {
    id: consumption[0],
    name: consumption[1],
    cost: consumption[2],
    lq: consumption[3],
    limit: consumption[4],
    pricing: consumption[5] || "fixed",
    multiple: consumption[6] || 0,
    requires: consumption[7] || []
  };
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

function mandatoryBreakdown(student, costIndex) {
  const baseLiving = CONFIG.livingCost * costIndex;
  const carKeep = student.carOwned ? CONFIG.carKeep : 0;
  const houseKeep = student.houseOwned ? CONFIG.houseKeep : 0;
  return {
    baseLiving,
    carKeep,
    houseKeep,
    total: baseLiving + carKeep + houseKeep
  };
}

function consumptionCost(item, student) {
  if (item.pricing === "salary_multiple") {
    return student.baseSalary * item.multiple;
  }
  return item.cost;
}

function houseTransactionPreview(student, houseAction) {
  ensureDebtState(student);
  const buyCost = CONFIG.housePrice * CONFIG.houseDownPaymentRate + CONFIG.housePrice * CONFIG.houseBuyFeeRate;
  const sellGross = student.houseValue * (1 - CONFIG.houseSellFeeRate) - mortgagePrincipal(student);
  return {
    buyCost: houseAction === "BUY" ? buyCost : 0,
    sellNet: houseAction === "SELL" ? Math.max(0, sellGross) : 0
  };
}

function settleHouse(student, houseAction) {
  ensureDebtState(student);
  const out = { buyCost: 0, fees: 0, keepCost: 0, pendingCash: 0 };
  if (houseAction === "BUY" && !student.houseOwned) {
    student.houseOwned = true;
    student.houseValue = CONFIG.housePrice;
    upsertDebt(student, {
      id: "D-mortgage",
      type: "MORTGAGE",
      creditor: "房贷-银行",
      principal: CONFIG.housePrice * (1 - CONFIG.houseDownPaymentRate),
      rateMonthly: CONFIG.houseMortgageAnnualRate / 12,
      minPay: CONFIG.housePay,
      missedRounds: 0,
      status: "OK"
    });
    student.mortgageMonthsLeft = CONFIG.houseMortgageMonths;
    out.buyCost = CONFIG.housePrice * CONFIG.houseDownPaymentRate;
    out.fees += CONFIG.housePrice * CONFIG.houseBuyFeeRate;
  }
  if (houseAction === "SELL" && student.houseOwned && student.housePendingRounds === 0) {
    const net = student.houseValue * (1 - CONFIG.houseSellFeeRate);
    const proceeds = net - mortgagePrincipal(student);
    out.fees += student.houseValue * CONFIG.houseSellFeeRate;
    if (proceeds < 0) {
      student.arrears += Math.abs(proceeds);
    } else {
      student.housePendingCash = proceeds;
      student.housePendingRounds = CONFIG.houseSellDelayRounds;
      out.pendingCash = proceeds;
    }
    student.houseOwned = false;
    student.houseValue = 0;
    removeDebt(student, "D-mortgage");
    student.mortgageMonthsLeft = 0;
  }
  if (student.houseOwned) {
    out.keepCost += CONFIG.houseKeep;
  }
  syncLegacyFromDebts(student);
  return out;
}

function houseMarketRate(event) {
  if (typeof event.market.house === "number") return event.market.house / 100;
  const map = {
    1: 0.03,
    2: -0.05,
    3: 0.02,
    4: -0.01,
    5: 0.01,
    6: -0.03,
    7: 0.00,
    8: -0.02
  };
  return map[event.id] || 0;
}

function minPay(student) {
  ensureDebtState(student);
  const principal = consumerPrincipal(student);
  return principal <= 0 ? 0 : principal * CONFIG.loanRate + principal * CONFIG.loanMinPayRate;
}

function debtServiceRatio(student, income) {
  ensureDebtState(student);
  const monthlyDebtService = minPay(student) + (carPrincipal(student) > 0 ? CONFIG.carPay : 0) + (mortgagePrincipal(student) > 0 ? CONFIG.housePay : 0);
  return monthlyDebtService / Math.max(income, 1);
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

function serializeEvent(event) {
  return {
    id: event.id,
    title: event.title,
    body: event.body,
    points: event.points,
    rawEffects: event.effects,
    market: Object.entries(event.market).map(([id, rate]) => ({
      id,
      name: assetById(id).name,
      rate
    })).concat([{ id: "house", name: "房产", rate: houseMarketRate(event) * 100 }]),
    effects: event.effects.map((effect) => describeEffect(effect))
  };
}

function describeEffect(effect) {
  if (effect.type === "bonus") return { label: "收入利好", detail: `相关岗位额外收入 ${money(effect.amount)}` };
  if (effect.type === "cut") return { label: "收入承压", detail: `相关岗位工资下调 ${percent(effect.ratio * 100)}` };
  if (effect.type === "rent") return { label: "生活成本上升", detail: `基础生活费额外增加 ${money(effect.amount)}` };
  if (effect.type === "health") return { label: "医疗事件", detail: `可能增加 ${money(effect.amount)} 医疗支出` };
  if (effect.type === "inflate") return { label: "通胀抬升", detail: `基础生活成本指数上调 ${percent(effect.ratio * 100)}` };
  if (effect.type === "gamble") return { label: "赌博结算", detail: `胜率 ${percent(effect.prob * 100)}，命中后收益倍率 ${effect.payout.toFixed(1)}x` };
  return { label: effect.type, detail: "" };
}

function buildAssetMix(student) {
  ensureDebtState(student);
  const mix = {
    cash: student.cash,
    stable: student.assets.A1 + student.assets.A2 + student.assets.A3 + student.assets.A4,
    growth: student.assets.A5 + student.assets.A6,
    speculative: student.assets.A7 + student.assets.A8 + student.assets.A9,
    car: student.carValue,
    house: student.houseValue,
    debt: totalDebtPrincipal(student) + student.arrears
  };
  return mix;
}

function buildDebtItems(student) {
  ensureDebtState(student);
  return (student.debts || [])
    .filter((debt) => debt.principal > 0 || debt.type === "MORTGAGE" && student.housePendingRounds > 0)
    .map((debt) => ({
      ...debt,
      interestDue: debt.type === "CONSUMER"
        ? debt.principal * CONFIG.loanRate
        : debt.type === "MORTGAGE"
          ? debt.principal * (CONFIG.houseMortgageAnnualRate / 12)
          : 0,
      minPay: debt.type === "CONSUMER" ? minPay(student) : debt.type === "CAR" ? CONFIG.carPay : CONFIG.housePay,
      status: debt.type === "MORTGAGE" && student.housePendingRounds > 0 ? "SELLING" : debt.status || "OK"
    }));
}

function buildRepaymentOptions(student) {
  const debts = buildDebtItems(student);
  return [
    { id: "AUTO", label: "自动分配（先高息后低息）" },
    ...debts.map((debt) => ({
      id: debt.type,
      label: `${debt.creditor} / ${money(debt.principal)}`
    }))
  ];
}

function ensureDebtState(student) {
  if (!Array.isArray(student.debts)) student.debts = [];
  if (!student.debts.length && (student.loan > 0 || student.carLoan > 0 || student.mortgagePrincipal > 0)) {
    if (student.loan > 0) {
      student.debts.push({
        id: "D-consumer",
        type: "CONSUMER",
        creditor: "消费贷平台",
        principal: student.loan,
        rateMonthly: CONFIG.loanRate,
        missedRounds: student.missed || 0,
        status: student.defaults > 0 ? "DEFAULT" : student.missed > 0 || student.arrears > 0 ? "DELINQUENT" : "OK"
      });
    }
    if (student.carLoan > 0) {
      student.debts.push({
        id: "D-car",
        type: "CAR",
        creditor: "车贷-银行",
        principal: student.carLoan,
        rateMonthly: 0,
        missedRounds: 0,
        status: "OK"
      });
    }
    if (student.mortgagePrincipal > 0) {
      student.debts.push({
        id: "D-mortgage",
        type: "MORTGAGE",
        creditor: "房贷-银行",
        principal: student.mortgagePrincipal,
        rateMonthly: CONFIG.houseMortgageAnnualRate / 12,
        missedRounds: 0,
        status: "OK"
      });
    }
  }
  syncLegacyFromDebts(student);
}

function syncLegacyFromDebts(student) {
  const consumer = getDebt(student, "CONSUMER");
  const car = getDebt(student, "CAR");
  const mortgage = getDebt(student, "MORTGAGE");
  student.loan = consumer?.principal || 0;
  student.carLoan = car?.principal || 0;
  student.mortgagePrincipal = mortgage?.principal || 0;
  student.missed = consumer?.missedRounds || 0;
}

function getDebt(student, type) {
  ensureDebtArray(student);
  return student.debts.find((debt) => debt.type === type) || null;
}

function ensureDebtArray(student) {
  if (!Array.isArray(student.debts)) student.debts = [];
}

function upsertDebt(student, debt) {
  ensureDebtArray(student);
  const index = student.debts.findIndex((item) => item.id === debt.id || item.type === debt.type);
  if (index >= 0) {
    student.debts[index] = { ...student.debts[index], ...debt };
  } else {
    student.debts.push(debt);
  }
  syncLegacyFromDebts(student);
}

function removeDebt(student, debtId) {
  ensureDebtArray(student);
  student.debts = student.debts.filter((debt) => debt.id !== debtId);
  syncLegacyFromDebts(student);
}

function addConsumerDebt(student, amount) {
  const current = getDebt(student, "CONSUMER");
  if (current) {
    current.principal += amount;
    current.status = "OK";
  } else {
    upsertDebt(student, {
      id: "D-consumer",
      type: "CONSUMER",
      creditor: "消费贷平台",
      principal: amount,
      rateMonthly: CONFIG.loanRate,
      missedRounds: 0,
      status: "OK"
    });
  }
  syncLegacyFromDebts(student);
}

function consumerPrincipal(student) {
  ensureDebtState(student);
  return getDebt(student, "CONSUMER")?.principal || 0;
}

function carPrincipal(student) {
  ensureDebtState(student);
  return getDebt(student, "CAR")?.principal || 0;
}

function mortgagePrincipal(student) {
  ensureDebtState(student);
  return getDebt(student, "MORTGAGE")?.principal || 0;
}

function totalDebtPrincipal(student) {
  ensureDebtState(student);
  return (student.debts || []).reduce((sum, debt) => sum + Math.max(0, debt.principal || 0), 0);
}

function buildLedger(student, event, decision, detail) {
  const debts = buildDebtItems(student);
  const debtSummary = debts.reduce((acc, debt) => {
    acc.principal += Math.max(0, debt.principal || 0);
    acc.interest += Math.max(0, debt.interestDue || 0);
    acc.minPay += Math.max(0, debt.minPay || 0);
    if (debt.type === "CONSUMER") acc.loan = debt.principal;
    if (debt.type === "CAR") acc.carLoan = debt.principal;
    if (debt.type === "MORTGAGE") acc.mortgagePrincipal = debt.principal;
    return acc;
  }, { principal: 0, interest: 0, minPay: 0, loan: 0, carLoan: 0, mortgagePrincipal: 0 });
  return {
    round: detail.round,
    income: detail.income + detail.local.cash,
    mandatory: detail.mandatory,
    optional: detail.optional,
    netWorth: detail.closing.netWorth,
    openingEvent: serializeEvent(event),
    settlementEvent: buildSettlementSummary(student, event, detail),
    opening: detail.opening,
    closing: detail.closing,
    cashflow: {
      income: detail.income,
      localIncome: detail.local.cash,
      mandatoryBase: detail.mandatoryBase.baseLiving,
      mandatoryTotal: detail.mandatory,
      carKeep: detail.loan.carKeep,
      localMandatory: detail.local.mandatory,
      optional: detail.optional,
      fees: detail.fees,
      borrow: decision.borrow,
      repay: detail.loan.actual,
      repayTarget: detail.loan.repayTarget,
      repayPlan: detail.loan.repayPlan,
      repayPayments: detail.loan.payments,
      interest: debtSummary.interest,
      minPay: debtSummary.minPay,
      arrears: student.arrears
    },
    optionalItems: decision.consumptions.map((id) => {
      const item = consumptionById(id);
      return { id, name: item.name, amount: item.cost, lq: item.lq };
    }),
    trades: Object.entries(decision.changes)
      .filter(([, amount]) => amount !== 0)
      .map(([id, amount]) => ({ id, name: assetById(id).name, amount })),
    investmentBreakdown: detail.investment.breakdown,
    debt: {
      items: debts,
      principal: debtSummary.principal,
      loan: debtSummary.loan,
      carLoan: debtSummary.carLoan,
      mortgagePrincipal: debtSummary.mortgagePrincipal,
      arrears: student.arrears,
      defaulted: detail.loan.defaulted,
      forcedSale: detail.loan.forcedSale
    },
    score: null,
    riskTags: riskTags(student, detail.room)
  };
}

function buildSettlementSummary(student, event, detail) {
  const best = [...detail.investment.breakdown].sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))[0];
  const netChange = detail.closing.netWorth - detail.opening.netWorth;
  const template = chooseStudentSettlementTemplate(detail, best, netChange);
  const lines = [];
  lines.push(`工资与事件合计入账 ${money(detail.income + detail.local.cash)}，基础生活成本扣除 ${money(detail.mandatoryBase.baseLiving)}。`);
  lines.push(`总必需支出 ${money(detail.mandatory)}，可选消费 ${money(detail.optional)}，手续费 ${money(detail.fees)}。`);
  if (detail.loan.interest > 0 || detail.loan.actual > 0) {
    lines.push(`债务端支付利息 ${money(detail.loan.interest)}，本轮还款 ${money(detail.loan.actual)}。`);
  }
  if (best) {
    lines.push(`关键资产表现来自 ${best.name}，本轮${best.rate >= 0 ? "上涨" : "下跌"} ${percent(Math.abs(best.rate) * 100)}，影响 ${money(best.gain)}。`);
  }
  if (detail.local.mandatory > 0) lines.push(`生活类突发影响额外扣除 ${money(detail.local.mandatory)}。`);
  if (detail.loan.defaulted) lines.push(`已触发违约，高风险资产被强制清算 ${money(detail.loan.forcedSale)}。`);
  return {
    title: template.title,
    template: template.id,
    body: `${template.lead} ${lines.join(" ")}`.trim(),
    summary: `净资产从 ${money(detail.opening.netWorth)} 变为 ${money(detail.closing.netWorth)}，变化 ${money(netChange)}。`,
    drivers: buildStudentSettlementDrivers(detail, best, netChange)
  };
}

function buildSettlementEvent(room, event, startCostIndex, rankingsList) {
  const winner = [...rankingsList].sort((a, b) => b.finalScore - a.finalScore)[0];
  const wealth = [...rankingsList].sort((a, b) => b.netWorth - a.netWorth)[0];
  const avgDebt = average(rankingsList.map((item) => item.debtRatio));
  const avgGrowth = average(rankingsList.map((item) => item.growth));
  const riskyCount = rankingsList.filter((item) => item.riskTags?.includes("高风险暴露")).length;
  const pressuredCount = rankingsList.filter((item) => item.riskTags?.includes("还款承压")).length;
  const defaults = Object.values(room.students).filter((student) => student.defaults > 0).length;
  const template = chooseClassSettlementTemplate({ avgDebt, avgGrowth, riskyCount, pressuredCount, defaults });
  return {
    title: template.title,
    template: template.id,
    body: `${template.lead} 综合得分领先者为 ${winner?.displayName || "-"}，净资产领先者为 ${wealth?.displayName || "-"}。班级平均负债率 ${percent(avgDebt * 100)}，平均成长率 ${percent(avgGrowth * 100)}。高风险暴露 ${riskyCount} 人，还款承压 ${pressuredCount} 人。`,
    summary: `成本指数由 ${startCostIndex.toFixed(2)} 变为 ${room.season.costIndex.toFixed(2)}。`,
    round: room.season.round,
    signals: {
      avgDebt,
      avgGrowth,
      riskyCount,
      pressuredCount,
      defaults
    }
  };
}

function chooseStudentSettlementTemplate(detail, best, netChange) {
  if (detail.loan.defaulted) {
    return { id: "default-shock", title: "结算事件：债务违约冲击", lead: "你本轮的主要问题不是投资判断，而是债务纪律失守，系统已经把违约后果直接落账。" };
  }
  if (detail.loan.actual > 0 && detail.loan.actual >= detail.loan.min && netChange >= 0) {
    return { id: "deleveraging", title: "结算事件：现金流修复", lead: "你这轮通过按时还款和控制支出，让资产结构比上一轮更健康。" };
  }
  if (best && ["A7", "A8", "A9"].includes(best.id) && Math.abs(best.gain) > 1000) {
    return { id: "speculative-swing", title: "结算事件：高风险资产波动", lead: "这轮结果明显被高波动资产放大，收益和回撤都不再平滑。" };
  }
  if (detail.local.mandatory > 0 || detail.mandatory > detail.mandatoryBase.total + 1000) {
    return { id: "life-pressure", title: "结算事件：生活成本挤压", lead: "这轮最值得复盘的不是买了什么，而是生活成本把现金流空间压缩了。" };
  }
  if (netChange >= 0) {
    return { id: "steady-growth", title: "结算事件：稳健增长兑现", lead: "你本轮的配置没有走极端，结果更多来自现金流管理和顺势收益。" };
  }
  return { id: "allocation-misfire", title: "结算事件：配置偏差回撤", lead: "这轮的损失提醒你，错误的仓位和顺序会比单个决定更伤净资产。" };
}

function buildStudentSettlementDrivers(detail, best, netChange) {
  const drivers = [
    `净资产变动 ${money(netChange)}`,
    `总必需支出 ${money(detail.mandatory)}`,
    `可选消费 ${money(detail.optional)}`
  ];
  if (detail.loan.actual > 0) drivers.push(`还款 ${money(detail.loan.actual)}`);
  if (best) drivers.push(`${best.name} 影响 ${money(best.gain)}`);
  if (detail.local.mandatory > 0) drivers.push(`生活事件额外支出 ${money(detail.local.mandatory)}`);
  return drivers;
}

function chooseClassSettlementTemplate({ avgDebt, avgGrowth, riskyCount, pressuredCount, defaults }) {
  if (defaults > 0) {
    return { id: "class-default-alert", title: "结算事件：班级债务警报", lead: "本轮课堂里已经出现了违约样本，说明部分同学把借贷当成了继续冒险的筹码。" };
  }
  if (riskyCount >= 3 && avgGrowth < 0) {
    return { id: "class-risk-reversal", title: "结算事件：风险暴露回撤", lead: "班级整体出现了典型的高风险回撤，说明许多同学在新闻刺激下把仓位推得过满。" };
  }
  if (pressuredCount >= 3 || avgDebt > 0.45) {
    return { id: "class-cashflow-tight", title: "结算事件：现金流收紧", lead: "本轮班级的核心问题不再是会不会买，而是每月现金流能不能撑住既有承诺。" };
  }
  if (avgGrowth > 0.05 && avgDebt < 0.3) {
    return { id: "class-steady-win", title: "结算事件：稳健策略占优", lead: "这轮班级整体表现说明，纪律化配置和保留缓冲金在多数时候比冲动押注更有效。" };
  }
  return { id: "class-divergence", title: "结算事件：课堂结果分化", lead: "同样的开始事件下，班级结果出现分化，关键差别来自现金流纪律、负债管理和仓位控制。" };
}

function riskTags(student, room) {
  const tags = [];
  const metric = metrics(student, room);
  const highRiskExposure = student.assets.A7 + student.assets.A8 + student.assets.A9;
  const totalInvestable = ASSETS.reduce((sum, [id]) => sum + student.assets[id], 0);
  if (metric.debtRatio > 0.5) tags.push("高负债");
  if (metric.emergency < 1) tags.push("应急金不足");
  if (metric.dsr > 0.5) tags.push("偿债率过高");
  if (highRiskExposure > 0 && highRiskExposure / Math.max(totalInvestable, 1) > 0.3) tags.push("高风险暴露");
  if (student.missed > 0 || student.arrears > 0) tags.push("还款承压");
  return tags;
}

function buildClassProfile(room) {
  const students = Object.values(room.students);
  const studentCount = students.length;
  const totalRiskRatio = students.map((student) => {
    const invested = ASSETS.reduce((sum, [id]) => sum + Math.max(student.assets[id], 0), 0);
    const risky = student.assets.A7 + student.assets.A8 + student.assets.A9;
    return risky / Math.max(invested, 1);
  });
  const debtRatios = students.map((student) => metrics(student, room).debtRatio);
  const emergencyMonths = students.map((student) => metrics(student, room).emergency);
  const defaulted = students.filter((student) => student.defaults > 0);
  const reasons = {};

  students.forEach((student) => {
    riskTags(student, room).forEach((tag) => {
      reasons[tag] = (reasons[tag] || 0) + 1;
    });
  });

  return {
    studentCount,
    avgRiskExposure: average(totalRiskRatio),
    avgDebtRatio: average(debtRatios),
    avgEmergencyMonths: average(emergencyMonths),
    defaults: defaulted.length,
    topRiskReasons: Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => ({ label, count })),
    history: room.season.log
  };
}

function buildArchiveSnapshot(room) {
  const currentRankings = rankings(room).slice().sort((a, b) => b.finalScore - a.finalScore);
  const wealthLeader = [...currentRankings].sort((a, b) => b.netWorth - a.netWorth)[0] || null;
  return {
    id: crypto.randomUUID(),
    archivedAt: Date.now(),
    roomName: room.name,
    finalStatus: room.season.status,
    totalRounds: Math.min(room.season.round, CONFIG.rounds),
    topScore: currentRankings[0] ? { displayName: currentRankings[0].displayName, value: currentRankings[0].finalScore } : null,
    topNetWorth: wealthLeader ? { displayName: wealthLeader.displayName, value: wealthLeader.netWorth } : null,
    classProfile: buildClassProfile(room),
    rankings: currentRankings.map((item) => ({
      displayName: item.displayName,
      roleId: item.roleId,
      finalScore: item.finalScore,
      healthScore: item.healthScore,
      netWorth: item.netWorth,
      growth: item.growth,
      debtRatio: item.debtRatio,
      lq: item.lq
    })),
    roundLog: [...(room.season.log || [])]
  };
}

function buildTeacherExportCsv(room) {
  const rows = [
    [
      "student_name",
      "role_name",
      "final_score",
      "wealth_score",
      "health_score",
      "lq_score",
      "net_worth",
      "debt_ratio",
      "growth",
      "emergency_months",
      "dsr",
      "late_count",
      "default_count",
      "debt_principal_total",
      "consumer_debt",
      "car_debt",
      "mortgage_debt",
      "debt_items",
      "risk_tags"
    ]
  ];
  const rankingMap = new Map(rankings(room).map((item) => [item.id, item]));
  Object.values(room.students).forEach((student) => {
    const metric = metrics(student, room);
    const score = rankingMap.get(student.id);
    const debts = buildDebtItems(student);
    const consumer = debts.find((item) => item.type === "CONSUMER");
    const car = debts.find((item) => item.type === "CAR");
    const mortgage = debts.find((item) => item.type === "MORTGAGE");
    const debtPrincipalTotal = debts.reduce((sum, item) => sum + Math.max(0, item.principal || 0), 0);
    rows.push([
      student.displayName,
      roleById(student.roleId).name,
      score?.finalScore?.toFixed(2) || "0.00",
      score?.wealthScore?.toFixed(2) || "0.00",
      score?.healthScore?.toFixed(2) || "0.00",
      score?.lqScore?.toFixed(2) || "0.00",
      metric.netWorth.toFixed(2),
      metric.debtRatio.toFixed(4),
      metric.growth.toFixed(4),
      metric.emergency.toFixed(2),
      metric.dsr.toFixed(4),
      String(student.lateCount || 0),
      String(student.defaults || 0),
      debtPrincipalTotal.toFixed(2),
      (consumer?.principal || 0).toFixed(2),
      (car?.principal || 0).toFixed(2),
      (mortgage?.principal || 0).toFixed(2),
      debts.map((item) => `${item.creditor}:${Number(item.principal || 0).toFixed(0)}:${item.status}`).join("|"),
      riskTags(student, room).join("|")
    ]);
  });
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function slugify(value) {
  return String(value || "room")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "room";
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
