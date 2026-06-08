// 掲示板(Bulletin board)
//  ・ブロックを複数追加(不透明＋色変更／メモと同じ文字編集／写真)
//  ・横スワイプで「編集／アーカイブ」 ・長押しで並び替え/アーカイブ ・アーカイブ閲覧
//  ・同期(boardsync): 3-wayマージ＋安全弁。掲示板は再描画で反映＝リロード不要。
//  データは localStorage("taskapp-board-v1")。

const BOARD_KEY = "taskapp-board-v1";
const PALETTE = ["#ffffff","#ffd8a8","#ffec99","#d3f9d8","#a5d8ff","#d0bfff","#ffc9c9","#c5f6fa","#ced4da"];
const TEXT_COLORS = ["#1c1c1e","#ff3b30","#ff9500","#34c759","#007aff","#5856d6","#ffffff"];
const SIZES = [{n:1,l:"S"},{n:3,l:"M"},{n:4,l:"L"},{n:5,l:"XL"},{n:7,l:"XXL"}];
const ACTION_W = 168;

const uid = () => "b" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const now = () => Date.now();

function load(){
  try{ const d = JSON.parse(localStorage.getItem(BOARD_KEY) || "null"); if(d && Array.isArray(d.blocks)) return d; }catch{}
  return { blocks: [] };
}
function save(state){
  try{ localStorage.setItem(BOARD_KEY, JSON.stringify(state)); }catch(e){ alert("保存に失敗: " + (e && e.message || e)); }
  if(boardSync) boardSync.noteLocalChange();    // 同期へ手元変更を通知
}

// 色を少し濃くする(縁の色用)。f<1 で暗く。
function shade(hex, f){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if(!m) return "rgba(0,0,0,.15)";
  const n = parseInt(m[1],16);
  const r=Math.round(((n>>16)&255)*f), g=Math.round(((n>>8)&255)*f), b=Math.round((n&255)*f);
  return `rgb(${r},${g},${b})`;
}
const fmtTime = t => { try{ return new Date(t).toLocaleString(); }catch{ return ""; } };
// カウントダウン(タスクページと同仕様: 日付ベースで「あと○日」)。データは kind:"cd" のブロックとして保存し同期に乗せる。
const cdDays = d => {                       // 目標日付までの残り日数(暦日)
  const t = new Date(d + "T00:00:00").getTime(); if(isNaN(t)) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((t - today.getTime())/86400000);
};
const cdText = d => { const n = cdDays(d); return n===null ? "—" : (n>0 ? `あと ${n}日` : (n===0 ? "本日" : `${-n}日経過`)); };
const cdDateLabel = d => { try{ return new Date(d + "T00:00:00").toLocaleDateString([], {year:"numeric",month:"2-digit",day:"2-digit"}); }catch{ return ""; } };
// 表示中のカウントダウンを定期更新(日付が変わったら反映)
let cdTimer = null;
function refreshCd(){
  if(!mountEl) return;
  mountEl.querySelectorAll("[data-cd]").forEach(el => { el.textContent = cdText(el.getAttribute("data-cd")); });
}
function ensureTicker(){
  const has = mountEl && mountEl.querySelector("[data-cd]");
  if(has){ if(!cdTimer) cdTimer = setInterval(refreshCd, 30000); refreshCd(); }
  else if(cdTimer){ clearInterval(cdTimer); cdTimer = null; }
}

let state = load();
let mountEl = null;
let view = "board";        // "board" | "archive"
let reordering = false;

/* ---- 同期(遅延読み込みでFirebaseの読込みを掲示板を開くまで遅らせる) ---- */
let boardSync = null, syncStarted = false;
function startSync(){
  if(syncStarted) return; syncStarted = true;
  import("./boardsync.js").then(m => {
    boardSync = m;
    m.initBoardSync({
      getLocalStr: () => { try{ return localStorage.getItem(BOARD_KEY) || ""; }catch{ return ""; } },
      applyRemoteStr: (str) => {
        try{ localStorage.setItem(BOARD_KEY, str); }catch{}
        state = load();
        if(mountEl && document.contains(mountEl) && mountEl.querySelector("#b-list, #a-list")) draw();
      }
    });
  }).catch(e => console.error("[board] sync load failed", e));
}
const setBusy = b => { if(boardSync) boardSync.setBusy(b); };

export function renderBoard(el){
  mountEl = el; state = load(); view = "board"; reordering = false;
  startSync();
  draw();
}

function draw(){
  if(!mountEl) return;
  state = load();
  if(view === "archive"){ drawArchive(); return; }

  const active = state.blocks.filter(b => !b.archived);
  const cds = active.filter(b => b.kind === "cd");       // カウントダウン(上部チップ)
  const blocks = active.filter(b => b.kind !== "cd");    // 通常ブロック
  mountEl.innerHTML = `
    <div class="board-bar">
      <button class="btn-ghost" id="b-add">＋ポスター</button>
      <button class="btn-ghost" id="b-add-cd">＋カウントダウン</button>
      <span class="spacer"></span>
      <button class="btn-ghost" id="b-arch">アーカイブ</button>
    </div>
    <div class="bcd-row" id="b-cds"></div>
    <div class="board ${reordering ? "reordering" : ""}" id="b-list"></div>
  `;
  mountEl.querySelector("#b-add").onclick = () => openEditor(null);
  mountEl.querySelector("#b-add-cd").onclick = () => openCdEditor(null);
  mountEl.querySelector("#b-arch").onclick = () => { view = "archive"; reordering = false; draw(); };

  const cdRow = mountEl.querySelector("#b-cds");
  cds.forEach(b => cdRow.appendChild(cdChip(b)));

  const list = mountEl.querySelector("#b-list");
  if(reordering){
    const banner = document.createElement("div");
    banner.className = "reorder-banner";
    banner.innerHTML = `<span>並び替え・アーカイブ中（≡でドラッグ）</span><button class="btn-ghost" id="b-done">完了</button>`;
    list.appendChild(banner);
    banner.querySelector("#b-done").onclick = () => { reordering = false; setBusy(false); draw(); };
  }
  if(!blocks.length && !reordering){
    list.insertAdjacentHTML("beforeend", `<div class="board-empty">まだポスターがありません。<br>「＋ポスター」で作成できます。</div>`);
  }
  blocks.forEach(b => list.appendChild(blockEl(b)));
  ensureTicker();
}

function blockColor(b){ return b.color || "#ffffff"; }

function blockEl(b){
  const col = blockColor(b);
  const wrap = document.createElement("div");
  wrap.className = "bblock-wrap"; wrap.dataset.id = b.id;
  wrap.innerHTML = `
    <div class="bblock-actions">
      <button class="bblock-act-edit">編集</button>
      <button class="bblock-act-arch">アーカイブ</button>
    </div>
    <div class="bblock" style="background:${col};border:1px solid ${shade(col,0.8)}">
      <button class="bblock-arch-btn" title="アーカイブ">✕</button>
      <button class="bblock-grip" title="ドラッグで並び替え">≡</button>
      <div class="bblock-content"></div>
      <div class="bblock-meta">${fmtTime(b.updatedAt || b.createdAt)}</div>
    </div>`;
  wrap.querySelector(".bblock-content").innerHTML = b.html || "";
  const card = wrap.querySelector(".bblock");

  wrap.querySelector(".bblock-act-edit").onclick = () => openEditor(b);
  wrap.querySelector(".bblock-act-arch").onclick = () => archive(b.id);
  wrap.querySelector(".bblock-arch-btn").onclick = (e) => { e.stopPropagation(); archive(b.id); };

  attachGestures(wrap, card, b);
  return wrap;
}

// カウントダウンのチップ(上部に横並び)。タップで編集、✕で削除。
function cdChip(b){
  const col = b.color || "#ffffff";
  const el = document.createElement("button");
  el.type = "button";
  el.className = "bcd-chip";
  el.style.background = col; el.style.borderColor = shade(col,0.8);
  el.innerHTML = `
    <span class="bcd-x" title="削除">✕</span>
    <span class="bcd-num" data-cd="${b.date}">${cdText(b.date)}</span>
    <span class="bcd-label">${(b.label||"").replace(/[<>&]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))||"（無題）"}</span>
    <span class="bcd-date">🎯 ${cdDateLabel(b.date)}</span>`;
  el.querySelector(".bcd-x").onclick = (e) => { e.stopPropagation(); removeForever(b.id); };
  el.onclick = () => openCdEditor(b);
  return el;
}

/* ---- スワイプ＆長押し ---- */
function closeAllSwipes(except){
  if(!mountEl) return;
  mountEl.querySelectorAll(".bblock").forEach(c => { if(c !== except) c.style.transform = ""; });
}
function attachGestures(wrap, card, b){
  let sx=0, sy=0, baseTx=0, moved=false, swiping=false, lp=null;
  const grip = wrap.querySelector(".bblock-grip");

  card.addEventListener("pointerdown", (e) => {
    if(reordering) return;
    sx=e.clientX; sy=e.clientY; moved=false; swiping=false;
    baseTx = (card.style.transform.match(/-?\d+(\.\d+)?/) ? parseFloat(card.style.transform.match(/-?\d+(\.\d+)?/)[0]) : 0);
    lp = setTimeout(() => { if(!moved && !swiping){ enterReorder(); } }, 500);
  });
  card.addEventListener("pointermove", (e) => {
    if(reordering) return;
    const dx=e.clientX-sx, dy=e.clientY-sy;
    if(Math.abs(dx)>8 || Math.abs(dy)>8){ moved=true; }
    if(Math.abs(dy)>10){ clearTimeout(lp); }
    if(!swiping && Math.abs(dx)>10 && Math.abs(dx)>Math.abs(dy)){ swiping=true; clearTimeout(lp); closeAllSwipes(card); }
    if(swiping){
      e.preventDefault();
      let tx = Math.max(-ACTION_W, Math.min(0, baseTx + dx));
      card.style.transform = `translateX(${tx}px)`;
    }
  });
  const end = () => {
    clearTimeout(lp);
    if(reordering) return;
    if(swiping){
      const tx = (card.style.transform.match(/-?\d+(\.\d+)?/) ? parseFloat(card.style.transform.match(/-?\d+(\.\d+)?/)[0]) : 0);
      card.style.transform = tx < -ACTION_W/2 ? `translateX(${-ACTION_W}px)` : "";
    } else if(!moved){
      closeAllSwipes();
    }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);

  grip.addEventListener("pointerdown", (e) => { if(reordering){ e.preventDefault(); e.stopPropagation(); startDrag(wrap, b.id, e); } });
}

function enterReorder(){ if(reordering) return; reordering = true; setBusy(true); closeAllSwipes(); draw(); }

/* ---- ドラッグ並び替え ---- */
let drag = null;
function startDrag(wrap, id, e){
  drag = { id, wrap };
  wrap.classList.add("dragging");
  try{ wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId); }catch{}
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", endDrag, { once:true });
}
function onDrag(e){
  if(!drag || !mountEl) return;
  const list = mountEl.querySelector("#b-list");
  const wraps = [...list.querySelectorAll(".bblock-wrap")];
  const cur = wraps.indexOf(drag.wrap);
  let target = cur;
  for(let i=0;i<wraps.length;i++){
    const r = wraps[i].getBoundingClientRect();
    if(e.clientY < r.top + r.height/2){ target = i; break; }
    target = i;
  }
  if(target !== cur && target >= 0){
    reorderActive(cur, target);
    draw();
    const nl = mountEl.querySelector("#b-list");
    const nw = [...nl.querySelectorAll(".bblock-wrap")].find(w => w.dataset.id === drag.id);
    if(nw){ drag.wrap = nw; nw.classList.add("dragging"); }
  }
}
function endDrag(){
  if(drag && drag.wrap) drag.wrap.classList.remove("dragging");
  drag = null;
  window.removeEventListener("pointermove", onDrag);
}
function reorderActive(from, to){
  const activeIdx = [];
  state.blocks.forEach((b,i) => { if(!b.archived && b.kind!=="cd") activeIdx.push(i); });
  if(from<0||from>=activeIdx.length||to<0||to>=activeIdx.length) return;
  const realFrom = activeIdx[from];
  const [moved] = state.blocks.splice(realFrom,1);
  const activeIdx2 = [];
  state.blocks.forEach((b,i) => { if(!b.archived && b.kind!=="cd") activeIdx2.push(i); });
  const realTo = to >= activeIdx2.length ? state.blocks.length : activeIdx2[to];
  state.blocks.splice(realTo,0,moved);
  save(state);
}

/* ---- アーカイブ ---- */
function archive(id){
  const b = state.blocks.find(x => x.id === id); if(!b) return;
  b.archived = true; b.archivedAt = now(); b.updatedAt = now(); save(state); draw();
}
function unarchive(id){
  const b = state.blocks.find(x => x.id === id); if(!b) return;
  b.archived = false; b.archivedAt = null; b.updatedAt = now(); save(state); draw();
}
function removeForever(id){
  if(!confirm("このブロックを完全に削除します。元に戻せません。よろしいですか？")) return;
  state.blocks = state.blocks.filter(x => x.id !== id); save(state); draw();
}

function drawArchive(){
  const arch = state.blocks.filter(b => b.archived);
  mountEl.innerHTML = `
    <div class="board-bar">
      <button class="btn-ghost" id="a-back">← 掲示板へ戻る</button>
      <span class="spacer"></span>
    </div>
    <div class="board" id="a-list"></div>`;
  mountEl.querySelector("#a-back").onclick = () => { view = "board"; draw(); };
  ensureTicker();   // アーカイブにはカウントダウン表示が無いのでタイマー停止
  const list = mountEl.querySelector("#a-list");
  if(!arch.length){ list.innerHTML = `<div class="board-empty">アーカイブは空です。</div>`; return; }
  arch.forEach(b => {
    const col = blockColor(b);
    const wrap = document.createElement("div");
    wrap.className = "bblock-wrap";
    wrap.innerHTML = `
      <div class="bblock" style="background:${col};border:1px solid ${shade(col,0.8)}">
        <div class="bblock-content"></div>
        <div class="bblock-meta">アーカイブ: ${fmtTime(b.archivedAt)}</div>
        <div style="display:flex;gap:10px;margin-top:10px">
          <button class="btn btn-light" data-act="restore">復元</button>
          <button class="btn btn-arch" data-act="del">完全に削除</button>
        </div>
      </div>`;
    wrap.querySelector(".bblock-content").innerHTML = b.html || "";
    wrap.querySelector('[data-act="restore"]').onclick = () => unarchive(b.id);
    wrap.querySelector('[data-act="del"]').onclick = () => removeForever(b.id);
    list.appendChild(wrap);
  });
}

/* ---- 編集シート(メモと同じ文字編集 + 色 + 写真) ---- */
function openEditor(block, opts){
  opts = opts || {};
  const isNew = !block;
  const data = block || { id:uid(), html:"", color:"#ffffff", createdAt:now() };
  let color = data.color || "#ffffff";
  setBusy(true);

  const ov = document.createElement("div"); ov.className = "be-overlay";
  ov.innerHTML = `
    <div class="be-sheet">
      <div class="be-head">
        <button data-act="cancel">キャンセル</button>
        <b>${isNew ? "新しいブロック" : "ブロックを編集"}</b>
        <button data-act="save">保存</button>
      </div>
      <div class="be-toolbar">
        ${SIZES.map(s => `<button class="be-tool" data-size="${s.n}">${s.l}</button>`).join("")}
        <span class="be-divider"></span>
        <button class="be-tool" data-cmd="bold" title="太字">B</button>
        <button class="be-tool" data-cmd="ul" title="箇条書き">•</button>
        <span class="be-divider"></span>
        ${TEXT_COLORS.map(c => `<span class="be-swatch" data-color="${c}" style="background:${c}"></span>`).join("")}
        <span class="be-divider"></span>
        <button class="be-tool" data-cmd="photo" title="写真">📷</button>
      </div>
      <div class="be-editor" contenteditable="true" data-ph="ここに内容を入力…"></div>
      <div class="be-appearance">
        <div class="row"><span class="label">ブロックの色</span></div>
        <div class="bswatch-grid" id="be-colors"></div>
        <div class="row" style="margin-top:10px"><span class="label">プレビュー</span>
          <span id="be-preview" style="flex:1;height:38px;border-radius:10px"></span>
        </div>
      </div>
      <div class="be-foot">
        ${isNew ? "" : `<button class="btn btn-arch" data-act="archive">アーカイブ</button>`}
      </div>
    </div>`;
  document.body.appendChild(ov);

  const editor = ov.querySelector(".be-editor");
  editor.innerHTML = data.html || "";
  const preview = ov.querySelector("#be-preview");
  const updatePreview = () => { preview.style.background = color; preview.style.border = "1px solid " + shade(color,0.8); };
  updatePreview();

  // ブロック色スウォッチ(大きめ・押しやすい)
  const colorsWrap = ov.querySelector("#be-colors");
  PALETTE.forEach(c => {
    const s = document.createElement("button");
    s.type = "button";
    s.className = "be-bswatch" + (c === color ? " sel" : "");
    s.style.background = c; s.style.borderColor = shade(c,0.8); s.dataset.bcolor = c;
    s.onclick = () => { color = c; colorsWrap.querySelectorAll(".be-bswatch").forEach(x => x.classList.toggle("sel", x.dataset.bcolor === c)); updatePreview(); };
    colorsWrap.appendChild(s);
  });

  // ツールバー(選択を保持するため mousedown を抑止)
  ov.querySelectorAll(".be-tool, .be-swatch[data-color]").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("pointerdown", e => e.preventDefault());
  });
  const exec = (cmd, val, css) => { editor.focus(); document.execCommand("styleWithCSS", false, !!css); document.execCommand(cmd, false, val === undefined ? null : val); updateToolbarState(); };
  ov.querySelectorAll(".be-tool").forEach(btn => {
    btn.addEventListener("click", () => {
      if(btn.dataset.size) exec("fontSize", String(btn.dataset.size), false);
      else if(btn.dataset.cmd === "bold") exec("bold", null, false);
      else if(btn.dataset.cmd === "ul") exec("insertUnorderedList", null, false);
      else if(btn.dataset.cmd === "photo") pickPhoto(editor);
    });
  });
  ov.querySelectorAll(".be-swatch[data-color]").forEach(sw => {
    sw.addEventListener("click", () => exec("foreColor", sw.dataset.color, true));
  });

  // ② 選択中の整形(サイズ/太字/箇条書き)をボタンの青で示す
  function updateToolbarState(){
    let bold=false, ul=false, sizeVal="";
    try{ bold = document.queryCommandState("bold"); }catch{}
    try{ ul = document.queryCommandState("insertUnorderedList"); }catch{}
    try{ sizeVal = String(document.queryCommandValue("fontSize") || ""); }catch{}
    ov.querySelectorAll(".be-tool").forEach(btn => {
      let on = false;
      if(btn.dataset.size) on = (btn.dataset.size === sizeVal);
      else if(btn.dataset.cmd === "bold") on = bold;
      else if(btn.dataset.cmd === "ul") on = ul;
      btn.classList.toggle("on", on);
    });
  }
  const onSel = () => { const s = document.getSelection(); if(s && s.anchorNode && editor.contains(s.anchorNode)) updateToolbarState(); };
  document.addEventListener("selectionchange", onSel);
  editor.addEventListener("keyup", updateToolbarState);
  editor.addEventListener("mouseup", updateToolbarState);

  const close = () => { document.removeEventListener("selectionchange", onSel); setBusy(false); ov.remove(); };

  ov.querySelector('[data-act="cancel"]').onclick = close;
  ov.querySelector('[data-act="save"]').onclick = () => {
    data.html = editor.innerHTML; data.color = color; data.updatedAt = now();
    if("alpha" in data) delete data.alpha;          // 旧データの透明度は破棄
    if(isNew) state.blocks.unshift(data);
    else { const i = state.blocks.findIndex(x => x.id === data.id); if(i>=0) state.blocks[i] = data; }
    save(state); close(); draw();
  };
  const archBtn = ov.querySelector('[data-act="archive"]');
  if(archBtn) archBtn.onclick = () => { close(); archive(data.id); };

  setTimeout(() => { editor.focus(); updateToolbarState(); }, 30);
}

/* ---- カウントダウンの編集シート(ラベル＋日付＋色) ---- */
function openCdEditor(block){
  const isNew = !block;
  const data = block || { id:uid(), kind:"cd", label:"", date:"", color:"#a5d8ff", createdAt:now() };
  let color = data.color || "#a5d8ff";
  setBusy(true);

  const ov = document.createElement("div"); ov.className = "be-overlay";
  ov.innerHTML = `
    <div class="be-sheet be-sheet-cd">
      <div class="be-head">
        <button data-act="cancel">キャンセル</button>
        <b>${isNew ? "カウントダウンを追加" : "カウントダウンを編集"}</b>
        <button data-act="save">保存</button>
      </div>
      <div class="be-appearance">
        <div class="row"><span class="label">タイトル</span></div>
        <input type="text" class="be-cd-label" placeholder="例: 試験、誕生日…" />
        <div class="row" style="margin-top:12px"><span class="label">目標の日付</span></div>
        <input type="date" class="be-cd-date" />
        <div class="be-cd-preview" id="cd-prev"></div>
        <div class="row" style="margin-top:12px"><span class="label">色</span></div>
        <div class="bswatch-grid" id="cd-colors"></div>
      </div>
      <div class="be-foot">
        ${isNew ? "" : `<button class="btn btn-arch" data-act="del">削除</button>`}
      </div>
    </div>`;
  document.body.appendChild(ov);

  const labelInput = ov.querySelector(".be-cd-label");
  const dateInput = ov.querySelector(".be-cd-date");
  const prev = ov.querySelector("#cd-prev");
  labelInput.value = data.label || "";
  if(data.date) dateInput.value = data.date;
  const updatePrev = () => { prev.textContent = dateInput.value ? cdText(dateInput.value) : "あと —日"; };
  updatePrev();
  dateInput.addEventListener("input", updatePrev);

  const colorsWrap = ov.querySelector("#cd-colors");
  PALETTE.forEach(c => {
    const s = document.createElement("button");
    s.type = "button";
    s.className = "be-bswatch" + (c === color ? " sel" : "");
    s.style.background = c; s.style.borderColor = shade(c,0.8); s.dataset.bcolor = c;
    s.onclick = () => { color = c; colorsWrap.querySelectorAll(".be-bswatch").forEach(x => x.classList.toggle("sel", x.dataset.bcolor === c)); };
    colorsWrap.appendChild(s);
  });

  const close = () => { setBusy(false); ov.remove(); };
  ov.querySelector('[data-act="cancel"]').onclick = close;
  ov.querySelector('[data-act="save"]').onclick = () => {
    if(!dateInput.value){ alert("目標の日付を入力してください。"); return; }
    data.label = labelInput.value.trim(); data.date = dateInput.value; data.color = color;
    data.kind = "cd"; data.updatedAt = now();
    if(isNew) state.blocks.unshift(data);
    else { const i = state.blocks.findIndex(x => x.id === data.id); if(i>=0) state.blocks[i] = data; }
    save(state); close(); draw();
  };
  const delBtn = ov.querySelector('[data-act="del"]');
  if(delBtn) delBtn.onclick = () => { close(); removeForever(data.id); };

  setTimeout(() => { labelInput.focus(); }, 30);
}

/* 写真: 圧縮して挿入 */
function pickPhoto(editor){
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*";
  input.onchange = () => {
    const f = input.files && input.files[0]; if(!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height, MAX = 1200;
        if(w > MAX || h > MAX){ const k = Math.min(MAX/w, MAX/h); w = Math.round(w*k); h = Math.round(h*k); }
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        const url = cv.toDataURL("image/jpeg", 0.8);
        editor.focus();
        document.execCommand("insertHTML", false, `<img src="${url}"/><div><br/></div>`);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  };
  input.click();
}
