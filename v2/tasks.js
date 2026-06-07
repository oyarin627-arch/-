// タスク(再構築版) — 現行アプリと同じデータモデルで作り直し。
// 【安全策】本番キー taskapp-state-v1 には書かない。v2専用キー taskapp-v2-state に
// 本番のスナップショットを複製して動かす(初回シードのみ本番を読む)。本番・同期は無傷。
// 「↻」で本番データを取り込み直せる。同期接続は検証後の次段で行う。

import { openRichEditor } from "./richedit.js";

const KEY = "taskapp-v2-state";
const LEGACY = "taskapp-state-v1";
const BACKUPS = "taskapp-v2-backups";
const EMOJIS = ["🚀","📝","💼","🏠","📚","💪","🎯","🛒","✈️","🎨","💡","⭐","📌","🔥","🌱","🎵","📥","🍀"];
const COLORS = ["#007aff","#34c759","#ff9500","#ff3b30","#5856d6","#af52de","#ff2d55","#00c7be","#8e8e93"];

const now = () => Date.now();
const uid = (p="x") => p + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const esc = s => String(s==null?"":s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const escAttr = s => esc(s).replace(/"/g,"&quot;");
const htmlToText = h => { const d = document.createElement("div"); d.innerHTML = h || ""; return (d.textContent || "").trim(); };

function blankState(){ return { projects:[], custom:[], recent:[], countdowns:[], hidden:[], headline:"" }; }

function normalize(s){
  s = s || {};
  if(!Array.isArray(s.projects)) s.projects = [];
  s.projects.forEach(p => {
    p.id = p.id || uid("p"); p.name = p.name || "無題"; p.emoji = p.emoji || "📁";
    p.color = p.color || "#007aff"; p.notes = p.notes || "";
    if(typeof p.deleted !== "boolean") p.deleted = false;
    if(p.deletedAt === undefined) p.deletedAt = null;
    if(!Array.isArray(p.tasks)) p.tasks = [];
    p.tasks.forEach(t => {
      t.id = t.id || uid("t"); t.text = t.text || ""; t.done = !!t.done;
      if(t.deadline === undefined) t.deadline = null; t.memo = t.memo || "";
      if(!Array.isArray(t.subtasks)) t.subtasks = [];
      t.subtasks = t.subtasks.map(st => typeof st === "string"
        ? { id:uid("s"), text:st, done:false }
        : { id:st.id || uid("s"), text:st.text || "", done:!!st.done });
    });
  });
  ["custom","recent","countdowns","hidden"].forEach(k => { if(!Array.isArray(s[k])) s[k] = []; });
  if(typeof s.headline !== "string") s.headline = "";
  return s;
}

function load(){
  let raw = null;
  try{ raw = localStorage.getItem(KEY); }catch{}
  if(raw == null){ // 初回: 本番のスナップショットをシード(本番は読むだけ)
    try{ raw = localStorage.getItem(LEGACY); }catch{}
    if(raw == null) raw = JSON.stringify(blankState());
    try{ localStorage.setItem(KEY, raw); }catch{}
  }
  try{ return normalize(JSON.parse(raw)); }catch{ return blankState(); }
}
function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){ alert("保存に失敗: " + (e && e.message || e)); } }
function backup(){
  try{
    const cur = localStorage.getItem(KEY); if(!cur) return;
    const arr = JSON.parse(localStorage.getItem(BACKUPS) || "[]");
    arr.push({ at:now(), data:cur }); while(arr.length > 5) arr.shift();
    localStorage.setItem(BACKUPS, JSON.stringify(arr));
  }catch{}
}

/* 期限表示 */
function fmtDeadline(d){ if(!d) return ""; const dt = new Date(d + "T00:00:00"); if(isNaN(dt)) return d; return (dt.getMonth()+1) + "/" + dt.getDate(); }
function isOverdue(d){ if(!d) return false; const dt = new Date(d + "T23:59:59"); return !isNaN(dt) && dt < new Date(); }

let mountEl = null;
let state = load();
let view = { name:"projects" };   // {name:"projects"} | {name:"project",id} | {name:"trash"}
let focusQuick = false;

export function renderTasks(el){ mountEl = el; state = load(); view = { name:"projects" }; draw(); }

function draw(){
  if(!mountEl) return;
  state = load();
  if(view.name === "project") return drawProject(view.id);
  if(view.name === "trash") return drawTrash();
  drawProjects();
}

/* ---- プロジェクト一覧 ---- */
function drawProjects(){
  const ps = state.projects.filter(p => !p.deleted);
  const trashed = state.projects.filter(p => p.deleted).length;
  mountEl.innerHTML = `
    <div class="t-bar">
      <button class="btn btn-blue" id="t-addp">＋ プロジェクト</button>
      <span class="spacer"></span>
      <button class="btn-ghost" id="t-trash">🗑 ゴミ箱${trashed ? " (" + trashed + ")" : ""}</button>
      <button class="btn-ghost" id="t-reimport" title="現在のアプリ(/)のデータを取り込み直す">↻</button>
    </div>
    <div class="t-note">これは再構築版(v2)。<b>本番データの複製</b>の上で動作し、本番アプリ・同期には影響しません。同期接続は検証後に行います。</div>
    <div id="t-plist"></div>`;
  mountEl.querySelector("#t-addp").onclick = () => openProjectEditor(null);
  mountEl.querySelector("#t-trash").onclick = () => { view = { name:"trash" }; draw(); };
  mountEl.querySelector("#t-reimport").onclick = reimport;

  const list = mountEl.querySelector("#t-plist");
  if(!ps.length){ list.innerHTML = `<div class="t-empty">プロジェクトがありません。<br>「＋ プロジェクト」で作成できます。</div>`; return; }
  ps.forEach(p => {
    const remaining = p.tasks.filter(t => !t.done).length;
    const card = document.createElement("div");
    card.className = "t-pcard"; card.style.borderLeft = "5px solid " + p.color;
    card.innerHTML = `
      <div class="t-pemoji">${p.emoji || "📁"}</div>
      <div class="t-pbody"><div class="t-pname">${esc(p.name)}</div>
        <div class="t-pcount">残り ${remaining} / 全 ${p.tasks.length}</div></div>
      <div class="t-pchev">›</div>`;
    card.onclick = () => { view = { name:"project", id:p.id }; focusQuick = false; draw(); };
    list.appendChild(card);
  });
}

/* ---- プロジェクト詳細 ---- */
function drawProject(id){
  const p = state.projects.find(x => x.id === id);
  if(!p || p.deleted){ view = { name:"projects" }; return draw(); }
  const inc = p.tasks.filter(t => !t.done);
  const don = p.tasks.filter(t => t.done);
  mountEl.innerHTML = `
    <div class="t-bar">
      <button class="btn-ghost" id="t-back">‹ プロジェクト</button>
      <span class="spacer"></span>
      <button class="btn-ghost" id="t-editp">編集</button>
    </div>
    <div class="t-phead"><span class="t-phead-emoji">${p.emoji || "📁"}</span><h2>${esc(p.name)}</h2></div>
    ${p.notes ? `<div class="t-pnotes">${esc(p.notes)}</div>` : ""}
    <div class="t-quick"><input id="t-qadd" placeholder="タスクを追加" autocomplete="off"><button class="btn btn-blue" id="t-qaddbtn">追加</button></div>
    <button class="btn-ghost" id="t-detailadd">＋ 期限・メモ付きで追加</button>
    <div id="t-inc"></div>
    ${don.length ? `<button class="t-done-toggle" id="t-donetoggle">完了 (${don.length}) ▾</button><div id="t-don" style="display:none"></div>` : ""}`;

  mountEl.querySelector("#t-back").onclick = () => { view = { name:"projects" }; draw(); };
  mountEl.querySelector("#t-editp").onclick = () => openProjectEditor(p);
  const qadd = mountEl.querySelector("#t-qadd");
  const doAdd = () => { const v = qadd.value.trim(); if(!v) return; addTask(p.id, v); };
  mountEl.querySelector("#t-qaddbtn").onclick = doAdd;
  qadd.addEventListener("keydown", e => { if(e.key === "Enter") doAdd(); });
  mountEl.querySelector("#t-detailadd").onclick = () => openTaskDetail(p, null);

  const incBox = mountEl.querySelector("#t-inc");
  inc.forEach(t => incBox.appendChild(taskRow(p, t)));

  const dt = mountEl.querySelector("#t-donetoggle");
  if(dt){
    const donBox = mountEl.querySelector("#t-don");
    don.forEach(t => donBox.appendChild(taskRow(p, t)));
    dt.onclick = () => {
      const open = donBox.style.display !== "none";
      donBox.style.display = open ? "none" : "block";
      dt.textContent = `完了 (${don.length}) ${open ? "▾" : "▴"}`;
    };
  }
  if(focusQuick){ focusQuick = false; qadd.focus(); }
}

function taskRow(p, t){
  const row = document.createElement("div"); row.className = "t-task";
  const subs = t.subtasks || [];
  const subDone = subs.filter(s => s.done).length;
  const badges = [];
  if(t.deadline) badges.push(`<span class="t-badge ${!t.done && isOverdue(t.deadline) ? "over" : ""}">📅 ${fmtDeadline(t.deadline)}</span>`);
  if(htmlToText(t.memo)) badges.push(`<span class="t-badge">📝</span>`);
  if(subs.length) badges.push(`<span class="t-badge">☑ ${subDone}/${subs.length}</span>`);
  row.innerHTML = `
    <button class="t-check ${t.done ? "on" : ""}">${t.done ? "✓" : ""}</button>
    <div class="t-task-body">
      <div class="t-task-text ${t.done ? "done" : ""}">${esc(t.text) || '<span class="muted">（無題）</span>'}</div>
      ${badges.length ? `<div class="t-task-sub">${badges.join("")}</div>` : ""}
    </div>`;
  row.querySelector(".t-check").onclick = e => { e.stopPropagation(); toggleTask(p.id, t.id); };
  row.querySelector(".t-task-body").onclick = () => openTaskDetail(p, t);
  return row;
}

function addTask(projectId, text){
  const p = state.projects.find(x => x.id === projectId); if(!p) return;
  p.tasks.push({ id:uid("t"), text, done:false, deadline:null, memo:"", subtasks:[] });
  save(state); focusQuick = true; draw();
}
function toggleTask(projectId, taskId){
  const p = state.projects.find(x => x.id === projectId); const t = p && p.tasks.find(x => x.id === taskId);
  if(!t) return; t.done = !t.done; save(state); draw();
}

/* ---- ゴミ箱(削除されたプロジェクト) ---- */
function drawTrash(){
  const del = state.projects.filter(p => p.deleted);
  mountEl.innerHTML = `
    <div class="t-bar"><button class="btn-ghost" id="t-back">‹ プロジェクト</button></div>
    <div id="t-tlist"></div>`;
  mountEl.querySelector("#t-back").onclick = () => { view = { name:"projects" }; draw(); };
  const list = mountEl.querySelector("#t-tlist");
  if(!del.length){ list.innerHTML = `<div class="t-empty">ゴミ箱は空です。</div>`; return; }
  del.forEach(p => {
    const card = document.createElement("div"); card.className = "t-pcard"; card.style.borderLeft = "5px solid " + p.color;
    card.innerHTML = `
      <div class="t-pemoji">${p.emoji || "📁"}</div>
      <div class="t-pbody"><div class="t-pname">${esc(p.name)}</div><div class="t-pcount">タスク ${p.tasks.length}件</div></div>`;
    const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:8px";
    actions.innerHTML = `<button class="btn btn-light">復元</button><button class="btn btn-arch">削除</button>`;
    actions.children[0].onclick = () => { p.deleted = false; p.deletedAt = null; save(state); draw(); };
    actions.children[1].onclick = () => {
      if(!confirm("このプロジェクトを完全に削除します。元に戻せません。よろしいですか？")) return;
      backup(); state.projects = state.projects.filter(x => x.id !== p.id); save(state); draw();
    };
    const wrap = document.createElement("div"); wrap.style.cssText = "margin:10px 0";
    wrap.appendChild(card); wrap.appendChild(actions); list.appendChild(wrap);
  });
}

/* ---- 共通シート ---- */
function sheet(title, bodyHtml, footHtml){
  const ov = document.createElement("div"); ov.className = "be-overlay";
  ov.innerHTML = `
    <div class="be-sheet">
      <div class="be-head"><button data-act="cancel">キャンセル</button><b>${title}</b><span style="width:64px"></span></div>
      <div class="be-body">${bodyHtml}</div>
      <div class="be-foot">${footHtml || ""}</div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-act="cancel"]').onclick = () => ov.remove();
  return ov;
}

/* ---- タスク詳細(内容・期限・メモ・サブタスク) ---- */
function openTaskDetail(p, task){
  const isNew = !task;
  const t = task
    ? { ...task, subtasks:(task.subtasks || []).map(s => ({ ...s })) }
    : { id:uid("t"), text:"", done:false, deadline:null, memo:"", subtasks:[] };
  let memo = t.memo || "";

  const body = `
    <div class="td-field"><label>内容</label><input type="text" id="td-text" value="${escAttr(t.text)}" placeholder="タスク名"></div>
    <div class="td-field"><label>期限</label><input type="date" id="td-deadline" value="${t.deadline || ""}"></div>
    <div class="td-field"><label>メモ</label><div class="td-memo-prev" id="td-memoprev"></div>
      <button class="btn btn-light" id="td-memoedit" style="margin-top:8px">メモを編集</button></div>
    <div class="td-field"><label>サブタスク</label><div id="td-sublist"></div>
      <div class="t-quick" style="margin-top:6px"><input type="text" id="td-subadd" placeholder="サブタスクを追加"><button class="btn btn-light" id="td-subaddbtn">追加</button></div>
    </div>`;
  const foot = `${isNew ? "" : '<button class="btn btn-arch" data-act="del">削除</button>'}<button class="btn btn-blue" data-act="save">保存</button>`;
  const ov = sheet(isNew ? "新しいタスク" : "タスク", body, foot);

  const memoPrev = ov.querySelector("#td-memoprev");
  const renderMemo = () => { memoPrev.innerHTML = memo || '<span class="muted">なし</span>'; };
  renderMemo();
  ov.querySelector("#td-memoedit").onclick = () => openRichEditor({ title:"メモ", html:memo, onSave:h => { memo = h; renderMemo(); } });

  const subList = ov.querySelector("#td-sublist");
  const renderSubs = () => {
    subList.innerHTML = "";
    t.subtasks.forEach((s, i) => {
      const r = document.createElement("div"); r.className = "td-sub";
      r.innerHTML = `<button class="t-check ${s.done ? "on" : ""}" style="width:22px;height:22px;font-size:13px">${s.done ? "✓" : ""}</button>
        <span style="flex:1${s.done ? ";color:var(--muted);text-decoration:line-through" : ""}">${esc(s.text)}</span>
        <button class="x">✕</button>`;
      r.querySelector(".t-check").onclick = () => { s.done = !s.done; renderSubs(); };
      r.querySelector(".x").onclick = () => { t.subtasks.splice(i, 1); renderSubs(); };
      subList.appendChild(r);
    });
  };
  renderSubs();
  const subInput = ov.querySelector("#td-subadd");
  const addSub = () => { const v = subInput.value.trim(); if(!v) return; t.subtasks.push({ id:uid("s"), text:v, done:false }); subInput.value = ""; renderSubs(); subInput.focus(); };
  ov.querySelector("#td-subaddbtn").onclick = addSub;
  subInput.addEventListener("keydown", e => { if(e.key === "Enter") addSub(); });

  ov.querySelector('[data-act="save"]').onclick = () => {
    t.text = ov.querySelector("#td-text").value.trim();
    t.deadline = ov.querySelector("#td-deadline").value || null;
    t.memo = memo;
    if(!t.text && !htmlToText(memo) && !t.subtasks.length){ ov.remove(); return; } // 空の新規は破棄
    const proj = state.projects.find(x => x.id === p.id); if(!proj){ ov.remove(); return; }
    if(isNew) proj.tasks.push(t);
    else { const i = proj.tasks.findIndex(x => x.id === t.id); if(i >= 0){ t.done = proj.tasks[i].done; proj.tasks[i] = t; } }
    save(state); ov.remove(); draw();
  };
  const del = ov.querySelector('[data-act="del"]');
  if(del) del.onclick = () => {
    if(!confirm("このタスクを削除しますか？")) return;
    const proj = state.projects.find(x => x.id === p.id); if(proj) proj.tasks = proj.tasks.filter(x => x.id !== t.id);
    save(state); ov.remove(); draw();
  };
  setTimeout(() => { if(isNew) ov.querySelector("#td-text").focus(); }, 30);
}

/* ---- プロジェクト編集 ---- */
function openProjectEditor(project){
  const isNew = !project;
  const p = project || { id:uid("p"), name:"", emoji:"🚀", color:"#007aff", notes:"", tasks:[], deleted:false, deletedAt:null };
  let emoji = p.emoji, color = p.color;

  const body = `
    <div class="td-field"><label>名前</label><input type="text" id="pe-name" value="${escAttr(p.name)}" placeholder="プロジェクト名"></div>
    <div class="td-field"><label>絵文字</label><div class="emoji-grid" id="pe-emoji"></div></div>
    <div class="td-field"><label>色</label><div class="color-row" id="pe-color"></div></div>
    <div class="td-field"><label>メモ</label><textarea id="pe-notes" rows="3">${esc(p.notes || "")}</textarea></div>`;
  const foot = `${isNew ? "" : '<button class="btn btn-arch" data-act="del">ゴミ箱へ</button>'}<button class="btn btn-blue" data-act="save">保存</button>`;
  const ov = sheet(isNew ? "新しいプロジェクト" : "プロジェクトを編集", body, foot);

  const eg = ov.querySelector("#pe-emoji");
  EMOJIS.forEach(e => { const b = document.createElement("button"); b.textContent = e; if(e === emoji) b.className = "sel";
    b.onclick = () => { emoji = e; eg.querySelectorAll("button").forEach(x => x.classList.toggle("sel", x.textContent === e)); }; eg.appendChild(b); });
  const cr = ov.querySelector("#pe-color");
  COLORS.forEach(c => { const s = document.createElement("span"); s.className = "sw" + (c === color ? " sel" : ""); s.style.background = c;
    s.onclick = () => { color = c; cr.querySelectorAll(".sw").forEach((x, i) => x.classList.toggle("sel", COLORS[i] === c)); }; cr.appendChild(s); });

  ov.querySelector('[data-act="save"]').onclick = () => {
    const name = ov.querySelector("#pe-name").value.trim() || "無題";
    const notes = ov.querySelector("#pe-notes").value;
    if(isNew){ state.projects.push({ ...p, name, emoji, color, notes }); save(state); ov.remove(); view = { name:"project", id:p.id }; draw(); }
    else {
      const i = state.projects.findIndex(x => x.id === p.id);
      if(i >= 0) state.projects[i] = { ...state.projects[i], name, emoji, color, notes };
      save(state); ov.remove(); draw();
    }
  };
  const del = ov.querySelector('[data-act="del"]');
  if(del) del.onclick = () => {
    if(!confirm("このプロジェクトをゴミ箱へ移動しますか？(あとで復元できます)")) return;
    const pr = state.projects.find(x => x.id === p.id); if(pr){ pr.deleted = true; pr.deletedAt = now(); }
    save(state); ov.remove(); view = { name:"projects" }; draw();
  };
  setTimeout(() => { if(isNew) ov.querySelector("#pe-name").focus(); }, 30);
}

/* ---- 本番データの取り込み直し ---- */
function reimport(){
  if(!confirm("現在のアプリ(/)のデータをこのv2へ取り込み直します。v2での変更は上書きされます。よろしいですか？")) return;
  let leg = null; try{ leg = localStorage.getItem(LEGACY); }catch{}
  if(!leg){ alert("取り込めるデータ(taskapp-state-v1)が見つかりません。"); return; }
  backup();
  try{ localStorage.setItem(KEY, leg); }catch(e){ alert("失敗: " + (e && e.message || e)); return; }
  state = load(); view = { name:"projects" }; draw();
}
