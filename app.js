/** =========================
 * データ構造とユーティリティ
 * ========================= */
// ===== モード管理 =====
const MODES = { EDIT: "edit", VIEW: "view", ADMIN: "admin" };
// デフォルトは閲覧モード
let currentMode = MODES.VIEW;

const DEFAULT_GRADE_NAME = "新しい学年";
const STORAGE_KEY = "undokai_scene_maker_v11"; // v11: 名簿に色列/子ども形状変更/ボタン修正
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function lerp(a,b,t){ return a + (b-a)*t; }

const MARKER_COLORS = [
  {name:"赤", value:"#ff0000"},
  {name:"青", value:"#0066ff"},
  {name:"緑", value:"#00aa00"},
  {name:"黄", value:"#ffd43b"},
  {name:"橙", value:"#ffa500"},
  {name:"白", value:"#ffffff"},
];

// 子どもポイント用の色選択肢
const STUDENT_COLORS = [
  {label:"赤", value:"#ff0000"},
  {label:"青", value:"#0066ff"},
  {label:"黄", value:"#ffd43b"},
  {label:"緑", value:"#00aa00"},
  {label:"橙", value:"#ffa500"},
  {label:"白", value:"#ffffff"},
  {label:"黒", value:"#000000"},
];

function defaultField(){
  return {
    ratioH: 0.5, showSplit: true,
    splitV: 2, splitH: 2,
    markers: [],
    circles: [
      {x: 0.35, y:0.5, r:0.07, color:"#000000"},
      {x: 0.50, y:0.5, r:0.07, color:"#ff0000"},
      {x: 0.65, y:0.5, r:0.07, color:"#0066ff"},
    ],
    snap: { enabled: true, px: 18 }
  };
}

// --- 一時的なダミー定義（後で本体が上書きされる） ---
function currentGrade() { return state.grades[state.currentGradeIndex] || { roster: [], workingPositions: {}, scenes: [] }; }
function currentPositions() {
  const g = currentGrade();
  if (!g) return {};
  if (state.currentSceneIndex >= 0 && g.scenes[state.currentSceneIndex])
    return g.scenes[state.currentSceneIndex].positions || {};
  return g.workingPositions || {};
}

/** =========================
 * 現在の配置を取得
 * ========================= */
function currentPositions() {
  const g = currentGrade();
  if (!g) return {};  // 学年が未定義の場合
  // 現在のシーンが選択されていればその positions を返す
  if (state.currentSceneIndex >= 0 && g.scenes[state.currentSceneIndex]) {
    return g.scenes[state.currentSceneIndex].positions || {};
  }
  // シーンが選択されていない場合は作業用の配置を返す
  return g.workingPositions || {};
}


function defaultGrade(name=DEFAULT_GRADE_NAME){
  return { name, roster: [], scenes: [], workingPositions: {} };
}
function defaultPosition(i, total){
  const angle = (i/Math.max(1,total)) * Math.PI*2;
  const cx=0.5, cy=0.5, r=0.35;
  return { x: cx + Math.cos(angle)*r, y: cy + Math.sin(angle)*r }; // スタジアム基準（0..1）
}
function makeId(){ return Math.random().toString(36).slice(2,10); }

/** =========================
 * アプリ状態
 * ========================= */
const state = {
  field: defaultField(),  // 共通グランド
  grades: [],
  currentGradeIndex: 0,
  currentSceneIndex: -1,
  activeTab: "field", // 初期はグランド
  editMode: "none",   // field 用: none|markers|circles
  selectedMarkerIndex: -1,
  selectedCircleIndex: -1,
  dragging: null,
  playing: false,
  playTimer: null,
  studentEdit: false,
  markerBrush: "#ff0000",
  rotate: {
    active: false,
    centerX: 0,
    centerY: 0,
    startAngle: 0,
    initialPositions: {}
  },
  schools: [],
  playback: {
    index: 0,
    phase: "hold",
    holdElapsed: 0,
    tweenElapsed: 0
  },
  // ビュー（ズーム・パン）
  view: { scale: 1, x: 0, y: 0, min: 0.4, max: 4 }
};

// 複数選択操作の追加状態
state.rotate = { active:false, center:null, startAngle:0, origPos:{} };

// 子ども配置モードの範囲選択用
state.multiSelect = {
  active: false,
  startX: 0, startY: 0,
  endX: 0, endY: 0,
  selectedIds: [],
  orderedIds: []   // ★ 選択順を保持する配列
};

// GASのデプロイURLを設定
const GAS_URL = "https://script.google.com/macros/s/AKfycbyNEi6MYQSura-q8fSMTfq4sNOj_VeSpeAWk5ykmjMZQ4CTstNF_PGPJBT8BQrK4ljy/exec";

/** =========================
 * ストレージ
 * ========================= */
async function saveAll() {
  const gradeObj = currentGrade(); // ← 現在選択中の学年データを取得
  const gradeName = gradeObj?.name || "未設定";

  const payload = {
    action: "save",
    schoolId: state.currentSchoolCode || "unknown",
    grade: gradeName,
    data: {
      field: state.field,
      grades: [gradeObj] // ← ★ 現在の学年のみを送信！
    }
  };

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain" }
    });

    const json = await res.json();
    if (json.status === "ok") {
      flash(`${gradeName} のデータをスプレッドシートに保存しました`);
    } else {
      alert("保存に失敗しました: " + json.status);
    }
  } catch (err) {
    alert("通信エラー: " + err.message);
  }
}



/** =========================
 * 要素参照
 * ========================= */
const el = {
  // ...（省略：元のまま）
  settingsWin: document.getElementById("settingsWin"),
  settingsDrag: document.getElementById("settingsDrag"),
  settingsCloseBtn: document.getElementById("settingsCloseBtn"),
  controlsWin: document.getElementById("controlsWin"),
  controlsDrag: document.getElementById("controlsDrag"),
  openSettingsBtn: document.getElementById("openSettingsBtn"),
  gradeSelect: document.getElementById("gradeSelect"),
  addGradeBtn: document.getElementById("addGradeBtn"),
  renameGradeBtn: document.getElementById("renameGradeBtn"),
  deleteGradeBtn: document.getElementById("deleteGradeBtn"),
  tabs: document.querySelectorAll(".tab"),
  panels: {
    roster: document.getElementById("panel-roster"),
    field: document.getElementById("panel-field"),
    scenes: document.getElementById("panel-scenes"),
  },
  rosterTableBody: document.querySelector("#rosterTable tbody"),
  addRowBtn: document.getElementById("addRowBtn"),
  clearRosterBtn: document.getElementById("clearRosterBtn"),
  ratioH: document.getElementById("ratioH"),
  showSplit: document.getElementById("showSplit"),
  splitV: document.getElementById("splitV"),
  splitH: document.getElementById("splitH"),
  editModeChips: document.getElementById("editModeChips"),
  markerPalette: document.getElementById("markerPalette"),
  snapEnabled: document.getElementById("snapEnabled"),
  snapPx: document.getElementById("snapPx"),
  clearMarkersBtn: document.getElementById("clearMarkersBtn"),
  circleCount: document.getElementById("circleCount"),
  circleColorSel: document.getElementById("circleColorSel"),
  circleX: document.getElementById("circleX"),
  circleY: document.getElementById("circleY"),
  circleR: document.getElementById("circleR"),
  circleApplyBtn: document.getElementById("circleApplyBtn"),
  resetCirclesBtn: document.getElementById("resetCirclesBtn"),
  sceneTableBody: document.querySelector("#sceneTable tbody"),
  addSceneBtn: document.getElementById("addSceneBtn"),
  dupSceneBtn: document.getElementById("dupSceneBtn"),
  delSceneBtn: document.getElementById("delSceneBtn"),
  durationSec: document.getElementById("durationSec"),
  holdSec: document.getElementById("holdSec"),
  playBtn: document.getElementById("playBtn"),
  stopBtn: document.getElementById("stopBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  studentEditToggle: document.getElementById("studentEditToggle"),
  playBtnMini: document.getElementById("playBtnMini"),
  stopBtnMini: document.getElementById("stopBtnMini"),
  prevBtnMini: document.getElementById("prevBtnMini"),
  nextBtnMini: document.getElementById("nextBtnMini"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  zoomResetBtn: document.getElementById("zoomResetBtn"),
  zoomFitBtn: document.getElementById("zoomFitBtn"),
  canvas: document.getElementById("canvas"),
  statusText: document.getElementById("statusText"),
  saveBtn: document.getElementById("saveBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  gearIcon: document.getElementById("gearIcon"),
  loginDialog: document.getElementById("loginDialog"),
  loginBtn: document.getElementById("loginBtn"),
  schoolCode: document.getElementById("schoolCode"),
  password: document.getElementById("password"),
  adminWin: document.getElementById("adminWin"),
  addSchoolBtn: document.getElementById("addSchoolBtn"),
  canvasWrap: document.getElementById("canvasWrap"),
  saveSchoolsBtn: document.getElementById("saveSchoolsBtn"),
  adminCloseBtn: document.getElementById("adminCloseBtn"),
};
const ctx = el.canvas.getContext("2d");


/** =========================
 * 座標系と外接矩形（CSS pxベース）
 * ========================= */
function canvasCssSize(){
  const r = el.canvas.getBoundingClientRect();
  return { w: r.width, h: r.height };
}
function rects(){
  const { w: cssW, h: cssH } = canvasCssSize();
  const pad = 40;
  const maxW = cssW - pad*2;
  const maxH = cssH - pad*2;
  const ratioH = clamp(Number(state.field.ratioH)||0.5, 0.10, 1.50); // h_rect / w_rect

  const wByWidth  = maxW / (1 + ratioH);
  const wByHeight = maxH / ratioH;
  const wRect = Math.max(10, Math.min(wByWidth, wByHeight));
  const hRect = wRect * ratioH;
  const R = hRect / 2;
  const stadiumW = wRect + hRect; // w_rect + 2R
  const stadiumH = hRect;

  const sx = pad + (maxW - stadiumW)/2;
  const sy = pad + (maxH - stadiumH)/2;

  return {
    stadium: { x: sx, y: sy, w: stadiumW, h: stadiumH },
    rect:    { x: sx + R, y: sy, w: wRect, h: hRect },
    R
  };
}

// 変換（内側長方形ベース）
function n2pRect(nx, ny){ const r = rects().rect; return { x: r.x + nx*r.w, y: r.y + ny*r.h }; }
function p2nRect(px, py){ const r = rects().rect; return { x: (px - r.x)/r.w, y: (py - r.y)/r.h }; }
// 変換（スタジアム外接矩形ベース：子ども用／クランプしない）
function n2pStad(nx, ny){ const s = rects().stadium; return { x: s.x + nx*s.w, y: s.y + ny*s.h }; }
function p2nStad(px, py){ const s = rects().stadium; return { x: (px - s.x)/s.w, y: (py - s.y)/s.h }; }

/** =========================
 * ズーム＆パン
 * ========================= */
function applyViewTransform(){
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,el.canvas.width, el.canvas.height);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.translate(state.view.x, state.view.y);
  ctx.scale(state.view.scale, state.view.scale);
}
function screenToWorld(px, py){
  return {
    x: (px - state.view.x) / state.view.scale,
    y: (py - state.view.y) / state.view.scale
  };
}
function setZoomAt(newScale, anchorCssX, anchorCssY){
  const { min, max } = state.view;
  const scale = clamp(newScale, min, max);
  const before = screenToWorld(anchorCssX, anchorCssY);
  state.view.scale = scale;
  const afterSx = before.x * scale + state.view.x;
  const afterSy = before.y * scale + state.view.y;
  state.view.x += (anchorCssX - afterSx);
  state.view.y += (anchorCssY - afterSy);
  draw();
}
function zoomIn(step=1.2){
  const rect = el.canvas.getBoundingClientRect();
  setZoomAt(state.view.scale * step, rect.width/2, rect.height/2);
}
function zoomOut(step=1/1.2){
  const rect = el.canvas.getBoundingClientRect();
  setZoomAt(state.view.scale * step, rect.width/2, rect.height/2);
}
function zoomReset(){
  state.view.scale = 1; state.view.x = 0; state.view.y = 0; draw();
}
function zoomFitStadium(){
  const rect = el.canvas.getBoundingClientRect();
  const s = rects().stadium;
  const margin = 20;
  const scaleX = (rect.width - margin*2) / s.w;
  const scaleY = (rect.height - margin*2) / s.h;
  const scale = clamp(Math.min(scaleX, scaleY), state.view.min, state.view.max);
  state.view.scale = scale;
  state.view.x = rect.width/2  - (s.x + s.w/2) * scale;
  state.view.y = rect.height/2 - (s.y + s.h/2) * scale;
  draw();
}

/** =========================
 * グリッド（スナップ用：内側長方形）
 * ========================= */
function gridLines(fr){
  const vCount = clamp((state.field.splitV|0), 0, 11);
  const hCount = clamp((state.field.splitH|0), 0, 11);
  const xs = [fr.x];
  const ys = [fr.y];
  if(vCount>0){
    const stepX = fr.w/(vCount+1);
    for(let i=1;i<=vCount;i++) xs.push(fr.x + stepX*i);
  }
  if(hCount>0){
    const stepY = fr.h/(hCount+1);
    for(let j=1;j<=hCount;j++) ys.push(fr.y + stepY*j);
  }
  xs.push(fr.x + fr.w);
  ys.push(fr.y + fr.h);
  return {xs, ys};
}
function buildSnapPoints(fr){
  const {xs, ys} = gridLines(fr);
  const pts = [];
  xs.forEach(x => ys.forEach(y => pts.push({x,y})));
  const midY = fr.y + fr.h/2; xs.forEach(x => pts.push({x, y: midY}));
  const midX = fr.x + fr.w/2; ys.forEach(y => pts.push({x: midX, y}));
  for(let i=0;i<xs.length-1;i++){
    for(let j=0;j<ys.length-1;j++){
      const cx = (xs[i]+xs[i+1])/2;
      const cy = (ys[j]+ys[j+1])/2;
      pts.push({x:cx, y:cy});
    }
  }
  return pts;
}
function snapPoint(px,py){
  if(!state.field.snap?.enabled) return null;
  const fr = rects().rect;
  const pts = buildSnapPoints(fr);
  const thr = clamp(Number(state.field.snap.px)||18, 4, 40);
  let best = null, bestD2 = thr*thr;
  for(const p of pts){
    const dx = p.x - px, dy = p.y - py;
    const d2 = dx*dx + dy*dy;
    if(d2 <= bestD2){ bestD2 = d2; best = p; }
  }
  return best;
}

/** =========================
 * 子どもポイント描画（●の下に▲）
 * ========================= */
function strokeFor(fill){
  return (fill || "").toLowerCase()==="#ffffff" ? "#000000" : "#222222";
}
function drawStudentGlyph(x, y, fill){
  const r = 7;
  const stroke = strokeFor(fill);
  // 上向き三角形（頂点が上、円の直下に接続）
  const apexY = y + r - 4;
  const h = 18, w = 16;
  ctx.beginPath();
  ctx.moveTo(x, apexY);                 // 頂点（上）
  ctx.lineTo(x - w/2, apexY + h);       // 左下
  ctx.lineTo(x + w/2, apexY + h);       // 右下
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.stroke();
  // 円
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
}

/** =========================
 * 描画
 * ========================= */
function draw(){
  applyViewTransform();

  const fr = rects().rect;

  drawTrackOutline();           // トラックの線
  drawRectVerticalEdges(fr);   // 縦線
  if(state.field.showSplit) drawSplits(fr);  // 分割線（縦横）

  // 円（内側の円）
  state.field.circles.forEach((c,i)=>{
    const p = n2pRect(c.x, c.y);
    const rpx = c.r * rects().rect.w;
    ctx.beginPath(); ctx.arc(p.x, p.y, rpx, 0, Math.PI*2);
    ctx.strokeStyle = c.color || "#000000"; ctx.lineWidth = 2; ctx.stroke();
    if(state.selectedCircleIndex === i){
      ctx.setLineDash([4,3]); ctx.strokeStyle = "#333"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    }
  });

  // 目印（markers）
  state.field.markers.forEach((m,i)=>{
    const p = n2pRect(m.x, m.y);
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
    ctx.fillStyle = m.color || "#ff0000";
    ctx.fill();
    if((m.color||"").toLowerCase() === "#ffffff"){
      ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.stroke();
    }
    if(state.selectedMarkerIndex === i){
      ctx.lineWidth = 2; ctx.strokeStyle = "#333"; ctx.stroke();
    }
  });

  // 子どもポイント（名札は上に）
  const positions = currentPositions();
  ctx.font = `14px system-ui, "Noto Sans JP", sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  currentGrade().roster.forEach((s)=>{
    const pos = positions[s.id]; if(!pos) return;
    const p = n2pStad(pos.x, pos.y);
    drawStudentGlyph(p.x, p.y, s.color || "#0066ff");
    ctx.fillStyle = "#111"; ctx.fillText(s.name, p.x, p.y - 10);
  });
  if(state.multiSelect.active){
    ctx.save();
    ctx.strokeStyle = "#1a56db";
    ctx.setLineDash([4,2]);
    const x = state.multiSelect.startX;
    const y = state.multiSelect.startY;
    const w = state.multiSelect.endX - state.multiSelect.startX;
    const h = state.multiSelect.endY - state.multiSelect.startY;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  state.multiSelect.selectedIds.forEach(id=>{
    const pos = currentPositions()[id];
    if(!pos) return;
    const p = n2pStad(pos.x, pos.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI*2);
    ctx.strokeStyle = "#1a56db";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawTrackOutline(){
  const { rect, R } = rects();
  const { x, y, w, h } = rect;
  const cxL = x;
  const cxR = x + w;
  const cy  = y + h/2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.arc(cxR, cy, R, -Math.PI/2, Math.PI/2, false);
  ctx.lineTo(x, y + h);
  ctx.arc(cxL, cy, R, Math.PI/2, -Math.PI/2, false);
  ctx.closePath();

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#343a40";
  ctx.stroke();
}
function drawRectVerticalEdges(fr){
  const {x,y,w,h} = fr;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x, y + h);
  ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#343a40";
  ctx.stroke();
}
function drawSplits(fr){
  const {x,y,w,h} = fr;
  const vCount = clamp((state.field.splitV|0), 0, 11);
  const hCount = clamp((state.field.splitH|0), 0, 11);
  ctx.setLineDash([]);
  ctx.strokeStyle = "#adb5bd";
  if(vCount > 0){
    const stepX = w / (vCount + 1);
    ctx.lineWidth = 2;
    for(let i=1;i<=vCount;i++){
      const px = x + stepX * i;
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y+h); ctx.stroke();
    }
  }
  if(hCount > 0){
    const stepY = h / (hCount + 1);
    ctx.lineWidth = 2;
    for(let j=1;j<=hCount;j++){
      const py = y + stepY * j;
      ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x+w, py); ctx.stroke();
    }
  }
}

/** =========================
 * 現在ターゲット
 * ========================= */
function currentGrade() {
  if (!state.grades.length) {
    // ★ 学年が無いときはデフォルトを自動作成
    const g = defaultGrade("新しい学年");
    g.roster.push({id: makeId(), no: 1, name: "児童1", color: "#0066ff"});
    g.workingPositions[g.roster[0].id] = defaultPosition(0, 1);
    state.grades.push(g);
    state.currentGradeIndex = 0;
  }
  return state.grades[state.currentGradeIndex];
}


/** =========================
 * 名簿UI：色列つき
 * ========================= */
function colorSelectElement(selectedHex, onChange){
  const sel = document.createElement("select");
  STUDENT_COLORS.forEach(opt=>{
    const o = document.createElement("option");
    o.value = opt.value; o.textContent = opt.label;
    if(opt.value.toLowerCase() === (selectedHex||"").toLowerCase()) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener("change", ()=> onChange(sel.value));
  return sel;
}
function refreshRosterTable(){
  const g = currentGrade();
  el.rosterTableBody.innerHTML = "";
  g.roster.sort((a,b)=> (a.no|0)-(b.no|0));
  g.roster.forEach((s)=>{
    const tr = document.createElement("tr");

    const tdNo = document.createElement("td");
    tdNo.contentEditable = "true"; tdNo.textContent = s.no;
    tdNo.addEventListener("input", ()=>{ s.no = Number(tdNo.textContent.trim()||"0"); });

    const tdName = document.createElement("td");
    tdName.contentEditable = "true"; tdName.textContent = s.name;
    tdName.addEventListener("input", ()=>{ s.name = tdName.textContent.trim(); });

    const tdColor = document.createElement("td");
    const sel = colorSelectElement(s.color || "#0066ff", (hex)=>{
      s.color = hex;

      // 👇 シーンの色も更新（名簿の色を信頼）
      g.scenes.forEach(sc=>{
        if(sc.positions[s.id]){
          // 位置データには色を持たせていない場合 → roster.color が常に正
          // なので何もしなくても良いが、将来色をシーン別に持たせたい場合に備えて更新
        }
      });
      draw();
    });

    tdColor.appendChild(sel);

    const tdOp = document.createElement("td");
    const btnDel = document.createElement("button"); btnDel.textContent="🗑";
    btnDel.addEventListener("click", ()=>{
      delete g.workingPositions[s.id];
      g.roster = g.roster.filter(r=>r.id!==s.id);

      g.scenes.forEach(sc=>{
        delete sc.positions[s.id];
      });
      refreshAllUI();
    });
    tdOp.appendChild(btnDel);

    tr.appendChild(tdNo); tr.appendChild(tdName); tr.appendChild(tdColor); tr.appendChild(tdOp);
    el.rosterTableBody.appendChild(tr);
  });
}
function addRosterRow(){
  const g = currentGrade();
  const nextNo = (g.roster.reduce((m,r)=>Math.max(m,r.no),0) || 0) + 1;
  const st = {id:makeId(), no:nextNo, name:"", color:"#0066ff"};
  g.roster.push(st);
  g.workingPositions[st.id] = defaultPosition(g.roster.length-1, g.roster.length);

  // 👇 シーンにも反映
  syncRosterToScenes();

  refreshAllUI();
}

function clearRoster(){
  if(!confirm("名簿と位置（全シーン）を完全に削除します。よろしいですか？")) return;
  const g = currentGrade();
  g.roster = [];
  g.workingPositions = {};
  g.scenes.forEach(sc=> sc.positions = {});
  refreshAllUI();
}
// 名簿テーブルにExcel/スプレッドシートから貼り付け（番号[TAB]氏名）
el.rosterTableBody.addEventListener("paste", (e)=>{
  const text = (e.clipboardData || window.clipboardData).getData("text");
  if(!text) return;
  e.preventDefault();
  const rows = text.trim().split(/\r?\n/).map(r=>r.split(/\t/));
  const g = currentGrade();

  rows.forEach((cols, idx)=>{
    if(cols.length>=2){
      const no = Number(cols[0]);
      const name = cols[1].trim();
      // 新しい児童オブジェクトを追加
      const st = {id:makeId(), no:isFinite(no)?no:(g.roster.length+1), name, color:"#0066ff"};
      g.roster.push(st);
      g.workingPositions[st.id] = defaultPosition(g.roster.length-1, g.roster.length);
    }
  });
  syncRosterToScenes();
  refreshAllUI();
  flash(`${rows.length}人を追加しました`);
});

/** =========================
 * グランドUI（共通）
 * ========================= */
function refreshFieldControls(){
  el.ratioH.value = state.field.ratioH;
  el.showSplit.checked = state.field.showSplit;
  el.splitV.value = clamp(state.field.splitV|0, 0, 11);
  el.splitH.value = clamp(state.field.splitH|0, 0, 11);

  el.snapEnabled.checked = !!state.field.snap?.enabled;
  el.snapPx.value = clamp(Number(state.field.snap?.px)||18, 4, 40);

  buildMarkerPalette();

  el.circleCount.value = state.field.circles.length;

  if(state.selectedCircleIndex>=0){
    const c = state.field.circles[state.selectedCircleIndex];
    const fr = rects().rect;
    el.circleX.value = Math.round(fr.x + c.x*fr.w);
    el.circleY.value = Math.round(fr.y + c.y*fr.h);
    el.circleR.value = Math.round(c.r*fr.w);
    el.circleColorSel.value = normalizeCircleColor(c.color);
  }else{
    el.circleX.value = ""; el.circleY.value = ""; el.circleR.value = "";
  }
}

function normalizeCircleColor(color){
  const m = {
    "#000":"#000000","#000000":"#000000",
    "#f00":"#ff0000","#ff0000":"#ff0000",
    "#0a0":"#00aa00","#00aa00":"#00aa00",
    "#06f":"#0066ff","#0066ff":"#0066ff",
    "#00f":"#0066ff", "#0f0":"#00aa00"
  };
  return m[color?.toLowerCase?.()] || "#000000";
}
function buildMarkerPalette(){
  const cont = el.markerPalette;
  cont.innerHTML = "";
  MARKER_COLORS.forEach(({name,value})=>{
    const chip = document.createElement("div");
    chip.className = "pchip";
    chip.dataset.color = value;
    if(value.toLowerCase() === state.markerBrush.toLowerCase()) chip.classList.add("active");

    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = value;
    if(value.toLowerCase()==="#ffffff") sw.classList.add("white");

    const label = document.createElement("span");
    label.textContent = name;

    chip.appendChild(sw); chip.appendChild(label);
    chip.addEventListener("click", ()=>{
      state.markerBrush = value;
      if(state.selectedMarkerIndex>=0 && state.editMode==="markers"){
        const m = state.field.markers[state.selectedMarkerIndex];
        if(m){ m.color = value; draw(); }
      }
      [...cont.children].forEach(c=>c.classList.toggle("active", c===chip));
    });
    cont.appendChild(chip);
  });
}
el.ratioH.addEventListener("input", ()=>{ state.field.ratioH = clamp(Number(el.ratioH.value)||0.5, 0.10, 1.50); draw(); });
el.showSplit.addEventListener("change", ()=>{ state.field.showSplit = !!el.showSplit.checked; draw(); });
el.splitV.addEventListener("input", ()=>{ state.field.splitV = clamp(Number(el.splitV.value)||0, 0, 11); draw(); });
el.splitH.addEventListener("input", ()=>{ state.field.splitH = clamp(Number(el.splitH.value)||0, 0, 11); draw(); });
el.snapEnabled.addEventListener("change", ()=>{ state.field.snap.enabled = !!el.snapEnabled.checked; });
el.snapPx.addEventListener("input", ()=>{ state.field.snap.px = clamp(Number(el.snapPx.value)||18, 4, 40); });

// グランド編集モード
document.getElementById("editModeChips").addEventListener("click", (e)=>{
  const chip = e.target.closest(".chip"); if(!chip) return;
  [...e.currentTarget.children].forEach(c=>c.classList.toggle("active", c===chip));
  state.editMode = chip.dataset.mode; // none | markers | circles
  state.selectedMarkerIndex = -1;
  state.selectedCircleIndex = -1;
  flash(`モード: ${chip.textContent}`);
  refreshFieldControls();
  draw();
});

// 目印：全部消す
el.clearMarkersBtn.addEventListener("click", ()=>{
  if(!confirm("目印ポイントをすべて削除します。よろしいですか？")) return;
  state.field.markers = [];
  state.selectedMarkerIndex = -1;
  draw();
});

// 円：個数変更／色／数値適用
el.circleCount.addEventListener("input", ()=>{
  const n = clamp(Number(el.circleCount.value)||0, 0, 12);
  const cur = state.field.circles.length;
  if(n < cur){ state.field.circles.length = n; state.selectedCircleIndex = Math.min(state.selectedCircleIndex, n-1); }
  else { for(let i=cur;i<n;i++){ const t=(i+1)/(n+1); state.field.circles.push({x:t,y:0.5,r:0.07,color:"#000000"}); } }
  draw(); refreshFieldControls();
});
el.circleColorSel.addEventListener("change", ()=>{ const i=state.selectedCircleIndex; if(i<0) return; state.field.circles[i].color = el.circleColorSel.value; draw(); });
el.circleApplyBtn.addEventListener("click", ()=>{
  const i = state.selectedCircleIndex; if(i<0) return;
  const c = state.field.circles[i];
  const fr = rects().rect;
  const px = Number(el.circleX.value)||0, py = Number(el.circleY.value)||0;
  const pr = clamp(Number(el.circleR.value)||20, 4, Math.min(fr.w, fr.h));
  const n = p2nRect(px, py);
  c.x = n.x; c.y = n.y; c.r = pr / fr.w; c.color = el.circleColorSel.value;
  draw();
});
el.resetCirclesBtn.addEventListener("click", ()=>{
  state.field.circles = [
    {x:0.35, y:0.5, r:0.07, color:"#000000"},
    {x:0.50, y:0.5, r:0.07, color:"#ff0000"},
    {x:0.65, y:0.5, r:0.07, color:"#0066ff"},
  ];
  state.selectedCircleIndex = -1;
  refreshFieldControls(); draw();
});

/** =========================
 * シーンUI
 * ========================= */
function refreshSceneTable(){
  const g = currentGrade();
  el.sceneTableBody.innerHTML = "";

  g.scenes.forEach((sc, idx)=>{
    const tr = document.createElement("tr");
    tr.draggable = true;
    tr.style.background = (idx===state.currentSceneIndex) ? "#eef5ff" : "";

    // シーン番号
    const tdIdx = document.createElement("td");
    tdIdx.textContent = (idx+1);

    // シーン名（編集可能）
    const tdName = document.createElement("td");
    tdName.contentEditable="true";
    tdName.textContent = sc.name || `シーン${idx+1}`;
    tdName.addEventListener("blur", ()=>{
      sc.name = tdName.textContent.trim() || `シーン${idx+1}`;
    });
    tdName.addEventListener("keydown", (e)=>{
      if(e.key==="Enter"){ e.preventDefault(); tdName.blur(); }
    });

    // 行クリック（名前セル以外）
    tr.addEventListener("click", (e)=>{
      if(e.target === tdName) return;
      state.currentSceneIndex = idx;
      refreshSceneTable(); draw();
    });

    // --- ドラッグ&ドロップ ---
    tr.addEventListener("dragstart", ()=>{
      dragSceneIndex = idx;
      tr.style.opacity = "0.5";
    });
    tr.addEventListener("dragend", ()=>{
      dragSceneIndex = null;
      tr.style.opacity = "1";
    });
    tr.addEventListener("dragover", (e)=>{
      e.preventDefault();
      tr.style.borderTop = "2px solid #1a56db";
    });
    tr.addEventListener("dragleave", ()=>{
      tr.style.borderTop = "";
    });
    tr.addEventListener("drop", (e)=>{
      e.preventDefault();
      tr.style.borderTop = "";
      if(dragSceneIndex===null || dragSceneIndex===idx) return;
      const dragged = g.scenes.splice(dragSceneIndex,1)[0];
      g.scenes.splice(idx,0,dragged);
      state.currentSceneIndex = idx;
      refreshSceneTable(); draw();
    });

    tr.appendChild(tdIdx);
    tr.appendChild(tdName);
    el.sceneTableBody.appendChild(tr);
  });

  el.dupSceneBtn.disabled = (state.currentSceneIndex<0);
  el.delSceneBtn.disabled = (state.currentSceneIndex<0);
}

function addSceneFromCurrent(){
  const g = currentGrade();
  const name = prompt("シーン名", `シーン${g.scenes.length+1}`) || `シーン${g.scenes.length+1}`;
  const positions = deepClone(currentPositions());
  g.scenes.push({name, positions});
  state.currentSceneIndex = g.scenes.length-1;
  refreshSceneTable(); draw();
}
function dupScene(){
  const g = currentGrade();
  const i = state.currentSceneIndex; if(i<0) return;
  const src = g.scenes[i];
  const name = prompt("複製シーン名", `${src.name}のコピー`) || `${src.name}のコピー`;
  g.scenes.splice(i+1, 0, {name, positions: deepClone(src.positions)});
  state.currentSceneIndex = i+1;
  refreshSceneTable(); draw();
}
function delScene(){
  const g = currentGrade();
  const i = state.currentSceneIndex; if(i<0) return;
  if(!confirm(`「${g.scenes[i].name}」を削除します。よろしいですか？`)) return;
  g.scenes.splice(i,1);
  state.currentSceneIndex = -1;
  refreshSceneTable(); draw();
}
el.studentEditToggle.addEventListener("change", ()=>{
  state.studentEdit = !!el.studentEditToggle.checked;
  flash(state.studentEdit ? "子ども配置モード：ON" : "子ども配置モード：OFF");
});

/** =========================
 * 再生（アニメーション）
 * ========================= */
// 共通: 再生停止（フラグだけ落とす）
function stopPlayBase(){
  state.playing = false;
  if(state.playTimer){ cancelAnimationFrame(state.playTimer); state.playTimer=null; }
  if(el.playBtn) el.playBtn.textContent = "▶ 再生";
  if(el.playBtnMini) el.playBtnMini.textContent = "▶ 再生";
}

// 一時停止（現在の状態を保持）
function pausePlay(){
  stopPlayBase();
  flash("一時停止しました");
}

// 完全停止（最初に戻す）
function stopPlay(){
  stopPlayBase();
  state.currentSceneIndex = 0;
  state.playback = { index:0, phase:"hold", holdElapsed:0, tweenElapsed:0 };
  refreshSceneTable();
  draw();
  flash("停止（最初に戻しました）");
}


function play(){
  const g = currentGrade();
  if(g.scenes.length < 2){
    alert("再生には2つ以上のシーンが必要です");
    return;
  }
  state.playing = true;
  if(el.playBtn) el.playBtn.textContent = "⏸ 一時停止";
  if(el.playBtnMini) el.playBtnMini.textContent = "⏸ 一時停止";

  const duration = Math.max(0.1, Number(el.durationSec.value)||2.0);
  const hold = Math.max(0.0, Number(el.holdSec.value)||0.4);

  // 既存の進行状態をロード
  let i     = state.playback.index;
  let phase = state.playback.phase;
  let holdElapsed  = state.playback.holdElapsed;
  let tweenElapsed = state.playback.tweenElapsed;

  let lastTime = performance.now();

  function step(now){
    if(!state.playing) return;
    const delta = now - lastTime;
    lastTime = now;

    const cur = g.scenes[i];
    const next = g.scenes[i+1];

    if(phase === "hold"){
      holdElapsed += delta;
      state.currentSceneIndex = i;
      draw();
      if(holdElapsed >= hold*1000){
        if(next){
          phase = "tween";
          tweenElapsed = 0;
        }else{
          stopPlayBase();
          state.playback = { index:i, phase:"hold", holdElapsed:0, tweenElapsed:0 };
          refreshSceneTable(); draw();
          flash("再生終了（最後のシーン）");
          return;
        }
      }
    }else if(phase === "tween"){
      tweenElapsed += delta;
      const t = clamp(tweenElapsed / (duration*1000), 0, 1);
      const temp = {};
      g.roster.forEach(st=>{
        const a = cur.positions[st.id] || {x:0.5, y:0.5};
        const b = next ? (next.positions[st.id] || a) : a;
        temp[st.id] = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
      });
      renderWithPositions(temp);
      if(t >= 1){
        i++;
        if(i >= g.scenes.length){
          stopPlay();
          return;
        }
        phase = "hold";
        holdElapsed = 0;
      }
    }

    // ★ 状態を保存（pause時に利用）
    state.playback = { index:i, phase, holdElapsed, tweenElapsed };

    state.playTimer = requestAnimationFrame(step);
  }

  state.playTimer = requestAnimationFrame(step);
}

function renderWithPositions(positions){
  applyViewTransform();
  const fr = rects().rect;
  drawTrackOutline();
  drawRectVerticalEdges(fr);
  if(state.field.showSplit) drawSplits(fr);
  state.field.markers.forEach((m)=>{
    const p = n2pRect(m.x, m.y);
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
    ctx.fillStyle = m.color || "#ff0000"; ctx.fill();
    if((m.color||"").toLowerCase() === "#ffffff"){
      ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.stroke();
    }
  });
  state.field.circles.forEach((c)=>{
    const p = n2pRect(c.x, c.y);
    const rpx = c.r * rects().rect.w;
    ctx.beginPath(); ctx.arc(p.x, p.y, rpx, 0, Math.PI*2);
    ctx.strokeStyle = c.color || "#000000"; ctx.lineWidth = 2; ctx.stroke();
  });
  ctx.font = `14px system-ui, "Noto Sans JP", sans-serif`;
  ctx.textAlign="center"; ctx.textBaseline="bottom";
  currentGrade().roster.forEach(st=>{
    const pos = positions[st.id]; if(!pos) return;
    const p = n2pStad(pos.x, pos.y);
    drawStudentGlyph(p.x, p.y, st.color || "#0066ff");
    ctx.fillStyle = "#111"; ctx.fillText(st.name, p.x, p.y - 10);
  });
}

/** =========================
 * キャンバス操作（ピッキング等）
 * ========================= */
function flash(msg){ /* 何もしない */ }

function pickMarker(px,py){
  for(let i=state.field.markers.length-1;i>=0;i--){
    const m = state.field.markers[i];
    const p = n2pRect(m.x, m.y);
    if(Math.hypot(p.x-px, p.y-py) <= 8) return i;
  }
  return -1;
}
function pickCircle(px,py){
  const fr = rects().rect;
  for(let i=state.field.circles.length-1;i>=0;i--){
    const c = state.field.circles[i];
    const p = n2pRect(c.x, c.y);
    const rpx = c.r*fr.w;
    const d = Math.hypot(p.x-px, p.y-py);
    if(Math.abs(d - rpx) <= 8 || d<=rpx) return i;
  }
  return -1;
}
function pickStudent(px,py){
  const g = currentGrade();
  const pos = currentPositions();
  for(let i=g.roster.length-1;i>=0;i--){
    const st = g.roster[i];
    const p = n2pStad((pos[st.id]?.x)||0.5, (pos[st.id]?.y)||0.5);
    if(Math.hypot(p.x-px, p.y-py) <= 10) return st.id;
  }
  return null;
}

let panDrag = null;
let lastMouseX=0, lastMouseY=0;

el.canvas.addEventListener("mousedown", (e)=>{
  const rect = el.canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const world = screenToWorld(px, py);

  // ★ 回転モード中の操作
  if(state.rotate.active){
    if(e.button === 0){ // 左クリックで回転開始
      state.rotate.dragging = true;
      state.rotate.startAngle = Math.atan2(
        world.y - state.rotate.centerY,
        world.x - state.rotate.centerX
      );

      // ★ 現在位置を新しい基準に保存し直す
      const pos = currentPositions();
      state.rotate.initialPositions = {};
      state.multiSelect.selectedIds.forEach(id=>{
        if(pos[id]){
          state.rotate.initialPositions[id] = {x: pos[id].x, y: pos[id].y};
        }
      });

      return;
    }
    if(e.button === 2){ // 右クリックで回転終了
      e.preventDefault();
      state.rotate.active = false;
      state.rotate.dragging = false;
      state.multiSelect.selectedIds = []; // 選択解除
      draw();
      return;
    }
  }

  // ★ 通常時の右クリック
  if(e.button === 2){
    e.preventDefault();
    if(state.multiSelect.selectedIds.length > 1){
      const menu = document.getElementById("contextMenu");
      menu.style.left = e.pageX + "px";
      menu.style.top  = e.pageY + "px";
      menu.style.display = "block";
    } else {
      panDrag = { sx: px, sy: py, ox: state.view.x, oy: state.view.y };
    }
    return;
  }

  // ★ 左クリックで子ども選択や範囲選択
  if(state.activeTab==="scenes" && state.studentEdit && e.button===0){
    const id = pickStudent(world.x, world.y);

    // Ctrl+クリック → 複数選択に追加/削除
    if(e.ctrlKey || e.metaKey){
      if(id){
        const sel = state.multiSelect.selectedIds;
        if(sel.includes(id)){
          state.multiSelect.selectedIds = sel.filter(x=>x!==id);
        } else {
          state.multiSelect.selectedIds.push(id);
        }
        draw();
      }
      return;
    }

    if(id){
      state.dragging = { type:"student", id };
      el.canvas.style.cursor = "grabbing";
    } else {
      state.multiSelect.selectedIds = [];
      state.multiSelect.active = true;
      state.multiSelect.startX = world.x;
      state.multiSelect.startY = world.y;
      state.multiSelect.endX = world.x;
      state.multiSelect.endY = world.y;
    }
  }
});

el.canvas.addEventListener("mousemove", (e)=>{
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  const rect = el.canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const world = screenToWorld(px, py);

  // 回転中
  if(state.rotate.active && state.rotate.dragging){
    const pos = currentPositions();
    const ids = Object.keys(state.rotate.initialPositions);

    const angle = Math.atan2(world.y - state.rotate.centerY,
                             world.x - state.rotate.centerX);
    const delta = angle - state.rotate.startAngle;

    const cCanvas = n2pStad(state.rotate.centerX, state.rotate.centerY);

    ids.forEach(id=>{
      const p0 = state.rotate.initialPositions[id];
      if(!p0) return;

      const pCanvas = n2pStad(p0.x, p0.y);
      const rx = pCanvas.x - cCanvas.x;
      const ry = pCanvas.y - cCanvas.y;

      const cos = Math.cos(delta), sin = Math.sin(delta);
      const newX = cCanvas.x + rx*cos - ry*sin;
      const newY = cCanvas.y + rx*sin + ry*cos;

      const n = p2nStad(newX, newY);
      pos[id].x = n.x;
      pos[id].y = n.y;
    });

    draw();
    return;
  }

  // パン中
  if(panDrag){
    state.view.x = panDrag.ox + (px - panDrag.sx);
    state.view.y = panDrag.oy + (py - panDrag.sy);
    draw();
    return;
  }

  // 範囲選択中
  if(state.multiSelect.active){
    state.multiSelect.endX = world.x;
    state.multiSelect.endY = world.y;

    const g = currentGrade();
    const pos = currentPositions();

    const newSelected = g.roster.filter(st=>{
      const p = n2pStad(pos[st.id].x, pos[st.id].y);
      const [minX,maxX] = [Math.min(state.multiSelect.startX, state.multiSelect.endX),
                           Math.max(state.multiSelect.startX, state.multiSelect.endX)];
      const [minY,maxY] = [Math.min(state.multiSelect.startY, state.multiSelect.endY),
                           Math.max(state.multiSelect.startY, state.multiSelect.endY)];
      return (p.x>=minX && p.x<=maxX && p.y>=minY && p.y<=maxY);
    }).map(st=>st.id);

    if(!state.multiSelect.orderedIds) state.multiSelect.orderedIds = [];
    state.multiSelect.orderedIds = state.multiSelect.orderedIds.filter(id=> newSelected.includes(id));
    newSelected.forEach(id=>{
      if(!state.multiSelect.orderedIds.includes(id)){
        state.multiSelect.orderedIds.push(id);
      }
    });

    state.multiSelect.selectedIds = [...state.multiSelect.orderedIds];
    draw();
    return;
  }

  // 子ども移動中
  if(state.dragging?.type==="student"){
    const n = p2nStad(world.x, world.y);
    const pos = currentPositions();

    if(state.multiSelect.selectedIds.length > 1){
      const base = pos[state.dragging.id];
      if(base){
        const dx = n.x - base.x;
        const dy = n.y - base.y;
        state.multiSelect.selectedIds.forEach(id=>{
          if(pos[id]){
            pos[id].x += dx;
            pos[id].y += dy;
          }
        });
      }
    } else {
      if(pos[state.dragging.id]){
        pos[state.dragging.id].x = n.x;
        pos[state.dragging.id].y = n.y;
      }
    }
    draw();
  }

  if(!state.dragging && !state.multiSelect.active && !state.rotate.active){
    const id = pickStudent(world.x, world.y);
    el.canvas.style.cursor = id ? "grab" : "default";
  }
});

window.addEventListener("mouseup", ()=>{
  if(state.multiSelect.active){
    state.multiSelect.active = false;
    draw();
  }
  if(state.dragging){
    state.dragging = null;
    el.canvas.style.cursor = "default";
  }
  if(state.rotate.dragging){
    state.rotate.dragging = false; // 左クリック解除 → 回転は一時停止
  }
  panDrag = null;
});

// 右クリックメニュー表示
el.canvas.addEventListener("contextmenu", (e)=>{
  e.preventDefault();
  if(state.multiSelect.selectedIds.length > 1 && !state.rotate.active){
    const menu = document.getElementById("contextMenu");
    menu.style.left = e.pageX + "px";
    menu.style.top  = e.pageY + "px";
    menu.style.display = "block";
  }
});

document.getElementById("contextMenu").addEventListener("click", (e)=>{
  const action = e.target.dataset.action;
  if(!action) return;
  if(action==="distribute"){
    distributeEvenly();
  } else if(action==="rotate"){
    startRotate();
  }
  document.getElementById("contextMenu").style.display="none";
});

function distributeEvenly(){
  const ids = state.multiSelect.selectedIds;
  if(ids.length < 2) return;
  const pos = currentPositions();
  const start = pos[ids[0]];
  const end   = pos[ids[ids.length-1]];
  if(!start || !end) return;
  const dx = (end.x - start.x) / (ids.length - 1);
  const dy = (end.y - start.y) / (ids.length - 1);
  ids.forEach((id,i)=>{
    pos[id].x = start.x + dx*i;
    pos[id].y = start.y + dy*i;
  });
  draw();
  flash("等間隔に配置しました");
}

function startRotate(){
  const pos = currentPositions();
  const ids = state.multiSelect.orderedIds?.length
              ? state.multiSelect.orderedIds
              : state.multiSelect.selectedIds;
  if(ids.length < 2) return;

  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  ids.forEach(id=>{
    if(pos[id]){
      const pCanvas = n2pStad(pos[id].x, pos[id].y);
      minX = Math.min(minX, pCanvas.x);
      maxX = Math.max(maxX, pCanvas.x);
      minY = Math.min(minY, pCanvas.y);
      maxY = Math.max(maxY, pCanvas.y);
    }
  });
  const cx = (minX + maxX)/2;
  const cy = (minY + maxY)/2;

  state.rotate.active = true;
  state.rotate.dragging = false; // 左クリックで有効化するまで待機
  state.rotate.centerX = p2nStad(cx, cy).x;
  state.rotate.centerY = p2nStad(cx, cy).y;
  state.rotate.initialPositions = {};
  ids.forEach(id=>{
    if(pos[id]){
      state.rotate.initialPositions[id] = {x: pos[id].x, y: pos[id].y};
    }
  });
}

/** =========================
 * タブ切替（設定ウインドウ内）
 * ========================= */
document.querySelectorAll(".tab").forEach(t=>{
  t.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active", x===t));
    Object.values(el.panels).forEach(p=>p.classList.remove("active"));
    el.panels[t.dataset.tab].classList.add("active");
    state.activeTab = t.dataset.tab;
    state.dragging = null;
    flash({roster:"名簿", field:"グランド", scenes:"シーン"}[state.activeTab] + " パネル");
  });
});

/** =========================
 * 設定ウインドウ ↔ 再生ウインドウ 切替
 * ========================= */
function showSettingsWin(show){
  el.settingsWin.classList.toggle("hidden", !show);
  el.controlsWin.classList.toggle("hidden", show);
  fitCanvas();
}
el.settingsCloseBtn.addEventListener("click", ()=> showSettingsWin(false));
el.openSettingsBtn.addEventListener("click", ()=> showSettingsWin(true));

/** =========================
 * フローティングウインドウをドラッグ可能にする
 * ========================= */

// ★ グローバル管理変数を追加
let draggingWin = null;
let offsetX = 0, offsetY = 0;

function makeDraggable(winEl, handleEl){
  handleEl.addEventListener("mousedown", (e)=>{
    if(e.button!==0) return;
    draggingWin = winEl;                        // どのウインドウを掴んだか保存
    const rect = winEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = "none";
  });
}

// --- 共通の移動処理 ---
window.addEventListener("mousemove", (e)=>{
  if(draggingWin){
    const nx = e.clientX - offsetX;
    const ny = e.clientY - offsetY;
    const pad = 8;
    const maxX = window.innerWidth - draggingWin.offsetWidth - pad;
    const maxY = window.innerHeight - draggingWin.offsetHeight - pad;
    draggingWin.style.left = Math.max(pad, Math.min(nx, maxX)) + "px";
    draggingWin.style.top  = Math.max(pad, Math.min(ny, maxY)) + "px";
  }
});

// --- 共通の解除処理 ---
window.addEventListener("mouseup", (e)=>{
  // キャンバス関連のリセット（元の処理をこちらに統合）
  if(state.multiSelect.active){
    state.multiSelect.active = false;
    draw();
  }
  if(state.dragging){
    state.dragging = null;
    el.canvas.style.cursor = "default";
  }
  if(state.rotate.active && e.button===0){
    state.rotate.dragging = false;
  }
  panDrag = null;

  // ★ ウインドウ関連の解除
  draggingWin = null;
  document.body.style.userSelect = "";
});

makeDraggable(el.settingsWin, el.settingsDrag);
makeDraggable(el.controlsWin, el.controlsDrag);

/** =========================
 * ミニ再生ウインドウ：同期と操作
 * ========================= */
function bindIf(elm, ev, fn){ if(elm) elm.addEventListener(ev, fn); }
// ▶ 再生 / ⏸ 一時停止
bindIf(el.playBtn, "click", ()=> state.playing ? pausePlay() : play());
bindIf(el.playBtnMini, "click", ()=> state.playing ? pausePlay() : play());
bindIf(el.prevBtn, "click", ()=>{
  const g=currentGrade(); if(!g.scenes.length) return;
  state.currentSceneIndex = (state.currentSceneIndex<=0? g.scenes.length-1 : state.currentSceneIndex-1);
  refreshSceneTable(); draw();
});
bindIf(el.nextBtn, "click", ()=>{
  const g=currentGrade(); if(!g.scenes.length) return;
  state.currentSceneIndex = (state.currentSceneIndex+1) % g.scenes.length;
  refreshSceneTable(); draw();
});
// ■ 停止
bindIf(el.stopBtn, "click", stopPlay);
bindIf(el.stopBtnMini, "click", stopPlay);
bindIf(el.prevBtnMini, "click", ()=>{
  const g=currentGrade(); if(!g.scenes.length) return;
  state.currentSceneIndex = (state.currentSceneIndex<=0? g.scenes.length-1 : state.currentSceneIndex-1);
  refreshSceneTable(); draw();
});
bindIf(el.nextBtnMini, "click", ()=>{
  const g=currentGrade(); if(!g.scenes.length) return;
  state.currentSceneIndex = (state.currentSceneIndex+1) % g.scenes.length;
  refreshSceneTable(); draw();
});

// ズームボタン
bindIf(el.zoomInBtn, "click", ()=> zoomIn());
bindIf(el.zoomOutBtn, "click", ()=> zoomOut());
bindIf(el.zoomResetBtn, "click", ()=> zoomReset());
bindIf(el.zoomFitBtn, "click", ()=> zoomFitStadium());

/** =========================
 * 画面イベント（学年・保存・入出力・名簿・シーン）★修正点
 * ========================= */
el.addGradeBtn.addEventListener("click", addGrade);
el.renameGradeBtn.addEventListener("click", renameGrade);
el.deleteGradeBtn.addEventListener("click", deleteGrade);
el.gradeSelect.addEventListener("change", ()=>{
  state.currentGradeIndex = Number(el.gradeSelect.value) || 0;
  state.currentSceneIndex = -1;
  refreshAllUI();
});

el.addRowBtn.addEventListener("click", addRosterRow);        // ← 行を追加（修正）
el.clearRosterBtn.addEventListener("click", clearRoster);     // ← 全削除（明示）

el.addSceneBtn.addEventListener("click", addSceneFromCurrent); // ← 現在の配置をシーンに追加（修正）
el.dupSceneBtn.addEventListener("click", dupScene);
el.delSceneBtn.addEventListener("click", delScene);

el.saveBtn.addEventListener("click", saveAll);
el.exportBtn.addEventListener("click", ()=>{
  const data = JSON.stringify({field: state.field, grades: state.grades}, null, 2);
  const blob = new Blob([data], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download="undokai_project.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});
el.importBtn.addEventListener("click", ()=> el.importFile.click());
el.importFile.addEventListener("change", ()=>{
  const f = el.importFile.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const obj = JSON.parse(reader.result);
      if(obj && obj.field && Array.isArray(obj.grades)){
        state.field = Object.assign(defaultField(), obj.field);
        if(!state.field.snap) state.field.snap = {enabled:true, px:18};
        state.grades = obj.grades;
        // roster.color 初期化
        state.grades.forEach(g=>g.roster.forEach(s=>{ if(!s.color) s.color="#0066ff"; }));
        state.currentGradeIndex = 0;
        state.currentSceneIndex = -1;
        refreshAllUI();
        flash("インポート完了");
      }else{
        alert("JSONの形式が不正です（field/grades）");
      }
    }catch(err){
      alert("読み込みに失敗しました: " + err.message);
    }
  };
  reader.readAsText(f, "utf-8");
});

/** =========================
 * レンダリング＆リサイズ
 * ========================= */
function refreshAllUI(){
  refreshGradeSelect();
  refreshRosterTable();
  refreshFieldControls();
  refreshSceneTable();
  draw();
}
function refreshGradeSelect(){
  el.gradeSelect.innerHTML = "";
  state.grades.forEach((g,idx)=>{
    const opt = document.createElement("option");
    opt.value = idx; opt.textContent = g.name;
    el.gradeSelect.appendChild(opt);
  });
  el.gradeSelect.value = state.currentGradeIndex;
}
function addGrade(){
  const name = prompt("学年名を入力してください", DEFAULT_GRADE_NAME);
  if(!name) return;
  const g = defaultGrade(name);
  for(let i=1;i<=10;i++){
    g.roster.push({id:makeId(), no:i, name:`児童${i}`, color:"#0066ff"});
  }
  g.roster.forEach((s,idx)=>g.workingPositions[s.id]=defaultPosition(idx, g.roster.length));
  state.grades.push(g);
  state.currentGradeIndex = state.grades.length-1;
  state.currentSceneIndex = -1;
  state.selectedMarkerIndex = -1;
  state.selectedCircleIndex = -1;
  refreshAllUI();
}
function renameGrade(){
  const g = currentGrade();
  const name = prompt("学年名を変更", g.name);
  if(!name) return;
  g.name = name;
  refreshGradeSelect();
}

/** =========================
 * 名簿とシーンの同期ユーティリティ
 * ========================= */
function syncRosterToScenes() {
  const g = currentGrade();
  const ids = g.roster.map(s => s.id);

  g.scenes.forEach(sc => {
    // 追加：新しい児童があれば positions に追加
    g.roster.forEach((s, idx) => {
      if (!(s.id in sc.positions)) {
        sc.positions[s.id] = defaultPosition(idx, g.roster.length);
      }
    });

    // 削除：名簿から消えた児童を positions から削除
    Object.keys(sc.positions).forEach(id => {
      if (!ids.includes(id)) {
        delete sc.positions[id];
      }
    });
  });
}

function deleteGrade(){
  if(state.grades.length<=1){ alert("少なくとも1つの学年が必要です"); return; }
  if(!confirm("この学年を削除します。よろしいですか？")) return;
  state.grades.splice(state.currentGradeIndex,1);
  state.currentGradeIndex = 0;
  state.currentSceneIndex = -1;
  refreshAllUI();
}

function fitCanvas(){
  const dpr = window.devicePixelRatio || 1;
  const wrapH = window.innerHeight - 180;
  const wrap = el.canvas.parentElement;
  const rect = wrap.getBoundingClientRect();
  el.canvas.style.height = Math.max(480, wrapH) + "px";
  const cssW = rect.width, cssH = Math.max(480, wrapH);
  el.canvas.width = Math.round(cssW * dpr);
  el.canvas.height = Math.round(cssH * dpr);
  draw();
}
window.addEventListener("resize", fitCanvas);

// --- URLパラメータによる閲覧モード起動 ---
window.addEventListener("load", async () => {
  const params = new URLSearchParams(window.location.search);
  const school = params.get("school");
  const grade = params.get("grade");

  if (school && grade) {
    flash(`閲覧モード: ${school} - ${grade}`);

    // ★ 半角→全角変換（比較ずれ対策）
    function toZenkakuNum(str) {
      return str.replace(/[0-9]/g, s => String.fromCharCode(s.charCodeAt(0) + 0xFEE0));
    }

    const payload = {
      action: "load",
      schoolId: school,
      grade: toZenkakuNum(grade)
    };

    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "text/plain" }
      });
      const json = await res.json();

      if (json.status === "not found") {
        alert("データが見つかりませんでした");
        return;
      }

      // --- 成功 → データを反映 ---
      const data = typeof json === "string" ? JSON.parse(json) : json;

      state.field = data.field;
      state.grades = Array.isArray(data.grades)
        ? data.grades
        : Object.values(data.grades);

      // ★ 指定された学年を選択状態に
      const idx = state.grades.findIndex(g => g.name === toZenkakuNum(grade));
      state.currentGradeIndex = idx >= 0 ? idx : 0;

      // ★ 最初のシーンを自動ロード
      const currentGrade = state.grades[state.currentGradeIndex];
      if (currentGrade && currentGrade.scenes && currentGrade.scenes.length > 0) {
        state.currentSceneIndex = 0;
        state.scene = currentGrade.scenes[0];
        flash(`${currentGrade.name} の最初のシーンをロードしました`);
      } else {
        state.currentSceneIndex = -1;
        state.scene = null;
        flash(`${currentGrade.name} にシーンがありません。`);
      }

      // --- 閲覧モードを設定 ---
      state.mode = "view"; // 閲覧専用モード

      // --- UIを更新 ---
      refreshAllUI();
      updateModeUI(); // ★ 追加：モードに応じてUIを再構成
    } catch (err) {
      alert("閲覧モードの読み込みに失敗しました: " + err.message);
    }
  }
});




/** =========================
 * 学校リストをローカルストレージから読み込み
 * ========================= */
const savedSchools = localStorage.getItem("undokai_schools");
if (savedSchools) {
  try {
    state.schools = JSON.parse(savedSchools);
  } catch {
    state.schools = [];
  }
} else {
  // 初回用のデフォルト（必要なら）
  state.schools = [
    { name: "市川小学校", code: "ichikawa", pass: "1111" }
  ];
}

/** =========================
 * 起動
 * ========================= */
refreshAllUI();
fitCanvas();
flash("準備OK");

// モードに応じてUIを更新
updateModeUI();

// ★ 初期表示を「100%リセット後に一度ズームアウト」と同じにする
zoomReset();   // ← 100% ボタン相当
zoomOut();     // ← − ボタン相当
draw();

// Ctrl+ホイールでズーム
el.canvas.addEventListener("wheel", (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const rect = el.canvas.getBoundingClientRect();
    const anchorX = e.clientX - rect.left;
    const anchorY = e.clientY - rect.top;
    const scaleFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoomAt(state.view.scale * scaleFactor, anchorX, anchorY);
  }
}, { passive: false });

// ===== モード切替 =====
function updateModeUI() {
  if (currentMode === MODES.EDIT) {
    // 編集モード
    el.settingsWin.classList.remove("hidden");   // 設定ウインドウ表示
    el.controlsWin.classList.add("hidden");      // 再生ウインドウ非表示
    el.adminWin.classList.add("hidden");         // 管理者UI非表示
    el.canvasWrap.style.display = "block";       // グランド表示
    el.gearIcon.style.display = "block";         // 歯車表示
    document.querySelectorAll(".edit-only").forEach(e => e.classList.remove("edit-hidden"));
  }
  else if (currentMode === MODES.VIEW) {
    // 閲覧モード
    el.settingsWin.classList.add("hidden");      // 設定ウインドウ非表示
    el.controlsWin.classList.remove("hidden");   // 再生ウインドウ表示
    el.adminWin.classList.add("hidden");         // 管理者UI非表示
    el.canvasWrap.style.display = "block";       // グランド表示
    el.gearIcon.style.display = "block";         // 歯車表示
    document.querySelectorAll(".edit-only").forEach(e => e.classList.add("edit-hidden"));
  }
  else if (currentMode === MODES.ADMIN) {
    el.settingsWin.classList.add("hidden");  // 設定非表示
    el.controlsWin.classList.add("hidden");  // 再生非表示
    el.canvasWrap.style.display = "none";    // グランド非表示
    el.adminWin.classList.remove("hidden");  // 学校リスト表示
    el.gearIcon.style.display = "block";     // 歯車表示
    refreshSchoolTable();
  }
}

// =============================
// 学校ログイン認証（GAS連携）★複数学年＋初期シーン自動ロード対応版
// =============================
async function validateSchool(code, pass) {
  const payload = {
    action: "auth",
    schoolId: code,
    password: pass
  };

  const res = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "text/plain" }
  });

  const json = await res.json();

  if (json.status === "ok") {
    state.currentSchoolName = json.name;
    state.currentSchoolCode = code;

    if (code === "admin") {
      // 管理者モード
      currentMode = MODES.ADMIN;
      await loadSchools();
      flash("管理者モードでログインしました");
    } else {
      // 一般学校モード
      currentMode = MODES.EDIT;

      // ---- ロードする学年を決定 ----
      let gradeName = "１年";

      // ---- 半角→全角変換関数（比較ずれ対策）----
      function toZenkakuNum(str) {
        return str.replace(/[0-9]/g, s => String.fromCharCode(s.charCodeAt(0) + 0xFEE0));
      }

      const loadPayload = {
        action: "load",
        schoolId: code,
        grade: toZenkakuNum(gradeName)
      };

      console.log("送信schoolId:", code);
      console.log("送信gradeName:", loadPayload.grade);

      const res2 = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(loadPayload),
        headers: { "Content-Type": "text/plain" }
      });

      const json2 = await res2.json();
      console.log("📦 読み込み結果:", json2);

      // ---- データ反映 ----
      if (json2 && json2.field && json2.grades) {
        // 1️⃣ フィールドデータ
        state.field = json2.field;

        // 2️⃣ gradesを正規化してすべて格納
        const loadedGrades = Array.isArray(json2.grades)
          ? json2.grades
          : Object.values(json2.grades);

        state.grades = []; // 一旦空に
        loadedGrades.forEach((g, i) => {
          state.grades.push({
            name: g.name || `学年${i + 1}`,
            roster: g.roster || [],
            scenes: g.scenes || [],
            workingPositions: g.workingPositions || {}
          });
        });

        // 3️⃣ デフォルトで「１年」を選択（存在しなければ先頭）
        const idx = state.grades.findIndex(g => g.name === "１年");
        state.currentGradeIndex = idx >= 0 ? idx : 0;

        // 4️⃣ UI更新
        refreshGradeSelect();
        refreshRosterTable();
        refreshFieldControls();
        refreshSceneTable();
        draw();

        console.log("ロード完了時の学年一覧:", state.grades.map(g => g.name));
        flash("全学年データを読み込みました");

        // ★ 追加：ページ初回ロード時に最初のシーンを自動ロード
        const firstGrade = state.grades[state.currentGradeIndex];
        if (firstGrade && firstGrade.scenes && firstGrade.scenes.length > 0) {
          state.currentSceneIndex = 0;
          state.scene = firstGrade.scenes[0];
          flash(`${firstGrade.name} の最初のシーンをロードしました`);
        } else {
          state.currentSceneIndex = -1;
          state.scene = null;
          flash(`${firstGrade.name} にシーンがありません。`);
        }

        refreshAllUI(); // ★ 追加：再描画
      } else {
        // ---- データがない場合（初回用） ----
        state.grades = [{ name: "１年", roster: [], scenes: [] }];
        state.currentGradeIndex = 0;
        refreshAllUI();
        flash(`${gradeName} のデータが見つかりません。新しいデータを作成します。`);
      }
    }

    updateModeUI();
    return true;
  }

  return false;
}


el.loginBtn.addEventListener("click", async () => {
  const code = el.schoolCode.value.trim();
  const pass = el.password.value.trim();

  if (await validateSchool(code, pass)) {
    // 認証成功 → currentModeは validateSchool 内で設定済み
  } else {
    alert("学校コードまたはパスワードが違います");
  }

  el.loginDialog.classList.add("hidden");
});


async function saveSchools() {
  const payload = {
    action: "saveAccounts",
    data: state.schools
  };

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain" } // ← CORS回避
    });

    const json = await res.json();
    if (json.status === "ok") {
      alert("スプレッドシートに学校リストを保存しました");
    } else {
      alert("保存に失敗しました: " + json.status);
    }
  } catch (err) {
    alert("通信エラー: " + err.message);
  }
}


// 管理者モード：学校リスト
function refreshSchoolTable() {
  const tbody = document.querySelector("#schoolTable tbody");
  tbody.innerHTML = "";

  state.schools.forEach((school, idx) => {
    const tr = document.createElement("tr");

    // 学校名
    const tdName = document.createElement("td");
    const inputName = document.createElement("input");
    inputName.type = "text";
    inputName.value = school.name;
    inputName.addEventListener("input", () => school.name = inputName.value);
    tdName.appendChild(inputName);

    // コード
    const tdCode = document.createElement("td");
    const inputCode = document.createElement("input");
    inputCode.type = "text";
    inputCode.value = school.code;
    inputCode.addEventListener("input", () => school.code = inputCode.value);
    tdCode.appendChild(inputCode);

    // パスワード
    const tdPass = document.createElement("td");
    const inputPass = document.createElement("input");
    inputPass.type = "text";
    inputPass.value = school.pass;
    inputPass.addEventListener("input", () => school.pass = inputPass.value);
    tdPass.appendChild(inputPass);

    // 削除ボタン
    const tdOp = document.createElement("td");
    const btnDel = document.createElement("button");
    btnDel.textContent = "🗑";
    btnDel.addEventListener("click", () => {
      if (confirm(`「${school.name || "未命名"}」を削除しますか？`)) {
        state.schools.splice(idx, 1);
        refreshSchoolTable();
      }
    });
    tdOp.appendChild(btnDel);

    tr.appendChild(tdName);
    tr.appendChild(tdCode);
    tr.appendChild(tdPass);
    tr.appendChild(tdOp);
    tbody.appendChild(tr);
  });
}

async function loadSchools() {
  const payload = { 
    action: "loadAccounts",
    schoolId: state.currentSchoolCode || ""   // ★ 管理者判定に必要
  };

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain" }
    });
    const json = await res.json();

    if (Array.isArray(json)) {
      state.schools = json;
      refreshSchoolTable();
    } else {
      console.warn("学校リストの形式が不正:", json);
    }
  } catch (err) {
    alert("学校リストの読み込みに失敗しました: " + err.message);
  }
}


// 学校追加
el.addSchoolBtn.addEventListener("click", () => {
  state.schools.push({ name: "", code: "", pass: "" });
  refreshSchoolTable();
});

el.saveSchoolsBtn.addEventListener("click", () => {
  saveSchools(); // ← GASへ送信する関数を呼ぶ
});

// ★ 管理者データをGASからロード
loadSchools();

// --- 公開URLコピー機能 ---
document.getElementById("copyPublicUrl").addEventListener("click", async () => {
  const schoolId = state.currentSchoolCode;
  const gradeName = currentGrade()?.name || "１年";
  const baseUrl = window.location.origin + window.location.pathname;
  const publicUrl = `${baseUrl}?school=${encodeURIComponent(schoolId)}&grade=${encodeURIComponent(gradeName)}`;

  try {
    await navigator.clipboard.writeText(publicUrl);
    flash("公開URLをクリップボードにコピーしました");
    console.log("公開URL:", publicUrl);
  } catch (err) {
    alert("URLコピーに失敗しました: " + err.message);
  }
});


// ===== モード切替イベント =====
el.gearIcon.addEventListener("click", () => {
  if (currentMode === MODES.VIEW) {
    // 閲覧モード → ログインダイアログ表示
    el.loginDialog.classList.remove("hidden");
  }
  else if (currentMode === MODES.EDIT) {
    // 編集モード → 保存して閲覧に戻る
    if (confirm("変更点を保存し、閲覧モードに戻りますか？")) {
      saveAll();
      currentMode = MODES.VIEW;
      updateModeUI();
    }
  }
  else if (currentMode === MODES.ADMIN) {
    // 管理者モード → 保存して閲覧に戻る
    if (confirm("変更点を保存して閲覧モードに戻りますか？")) {
      saveSchools();
      currentMode = MODES.VIEW;
      updateModeUI();
    }
  }
});

// =============================
// 公開URLから自動読み込み処理
// =============================
window.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const schoolId = params.get("school");
  const gradeName = params.get("grade");

  if (schoolId && gradeName) {
    console.log(`公開URLモード: ${schoolId} / ${gradeName}`);
    try {
      const payload = {
        action: "load",
        schoolId: schoolId,
        grade: gradeName
      };

      const res = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "text/plain" }
      });

      const json = await res.json();

      if (json && json.field && json.grades) {
        state.field = json.field;
        state.grades = json.grades;
        currentMode = MODES.VIEW;
        updateModeUI();
        refreshAllUI();
        flash(`${gradeName} のシーンを読み込みました`);
      } else {
        flash("該当データが見つかりませんでした。");
      }
    } catch (err) {
      console.error("公開URL読み込みエラー:", err);
      flash("データ読み込みに失敗しました。");
    }
  }
});

// =============================
// 学年セレクト変更時の処理（最初のシーンを自動ロード）
// =============================
const gradeSelectEl = document.getElementById("gradeSelect");
if (gradeSelectEl) {
  gradeSelectEl.addEventListener("change", (e) => {
    state.currentGradeIndex = e.target.selectedIndex;

    // 選択した学年データを取得
    const currentGrade = state.grades[state.currentGradeIndex];

    // 最初のシーンを自動ロード
    if (currentGrade && currentGrade.scenes && currentGrade.scenes.length > 0) {
      state.currentSceneIndex = 0;
      state.scene = currentGrade.scenes[0];
      flash(`${currentGrade.name} の最初のシーンをロードしました`);
    } else {
      state.currentSceneIndex = -1;
      state.scene = null;
      flash(`${currentGrade.name} にシーンがありません。`);
    }

    refreshAllUI();
  });
}
























