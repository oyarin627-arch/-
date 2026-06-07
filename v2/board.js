// 掲示板(Bulletin board)
//  ・ブロックを複数追加(半透明＋色変更／メモと同じ文字編集／写真)
//  ・横スワイプで「編集／アーカイブ」ボタン表示 → 編集ボタンで編集モード
//  ・長押しで並び替え・アーカイブモード
//  ・アーカイブ閲覧(復元／完全削除)
//  データは localStorage("taskapp-board-v1") に保存(同期は後段で安全に追加)。

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
function save(state){ try{ localStorage.setItem(BOARD_KEY, JSON.stringify(state)); }catch(e){ alert("保存に失敗: " + (e && e.message || e)); } }

function hexToRgba(hex, a){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if(!m) return "rgba(255,255,255," + a + ")";
  const n = parseInt(m[1],16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
const fmtTime = t => { try{ return new Date(t).toLocaleString(); }catch{ return ""; } };

let state = load();
let mountEl = null;
let view = "board";        // "board" | "archive"
let reordering = false;

export function renderBoard(el){
  mountEl = el; state = load(); view = "board"; reordering = false;
  draw();
}

function draw(){
  if(!mountEl) return;
  state = load();
  if(view === "archive"){ drawArchive(); return; }

  const blocks = state.blocks.filter(b => !b.archived);
  mountEl.innerHTML = `
    <div class="board-bar">
      <button class="btn btn-blue" id="b-add">＋ ブロックを追加</button>
      <span class="spacer"></span>
      <button class="btn-ghost" id="b-arch">🗄 アーカイブ</button>
    </div>
    <div class="board ${reordering ? "reordering" : ""}" id="b-list"></div>
  `;
  mountEl.querySelector("#b-add").onclick = () => openEditor(null);
  mountEl.querySelector("#b-arch").onclick = () => { view = "archive"; reordering = false; draw(); };

  const list = mountEl.querySelector("#b-list");
  if(reordering){
    const banner = document.createElement("div");
    banner.className = "reorder-banner";
    banner.innerHTML = `<span>並び替え・アーカイブ中（≡でドラッグ）</span><button class="btn-ghost" id="b-done">完了</button>`;
    list.appendChild(banner);
    banner.querySelector("#b-done").onclick = () => { reordering = false; draw(); };
  }
  if(!blocks.length && !reordering){
    list.insertAdjacentHTML("beforeend", `<div class="board-empty">まだブロックがありません。<br>「＋ ブロックを追加」で作成できます。</div>`);
  }
  blocks.forEach(b => list.appendChild(blockEl(b)));
}

function blockEl(b){
  const wrap = document.createElement("div");
  wrap.className = "bblock-wrap"; wrap.dataset.id = b.id;
  wrap.innerHTML = `
    <div class="bblock-actions">
      <button class="bblock-act-edit">編集</button>
      <button class="bblock-act-arch">アーカイブ</button>
    </div>
    <div class="bblock" style="background:${hexToRgba(b.color || "#ffffff", b.alpha == null ? 0.55 : b.alpha)}">
      <button class="bblock-arch-btn" title="アーカイブ">✕</button>
      <button class="bblock-grip" title="ドラッグで並び替え">≡</button>
      <div class="bblock-content"></div>
      <div class="bblock-meta">${fmtTime(b.updatedAt || b.createdAt)}</div>
    </div>`;
  wrap.querySelector(".bblock-content").innerHTML = b.html || "";
  const card = wrap.querySelector(".bblock");

  // アクションボタン(スワイプで表示)
  wrap.querySelector(".bblock-act-edit").onclick = () => openEditor(b);
  wrap.querySelector(".bblock-act-arch").onclick = () => archive(b.id);
  // 並び替えモードのボタン
  wrap.querySelector(".bblock-arch-btn").onclick = (e) => { e.stopPropagation(); archive(b.id); };

  attachGestures(wrap, card, b);
  return wrap;
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
    if(reordering) return;                 // 並び替え中はスワイプ無効
    sx=e.clientX; sy=e.clientY; moved=false; swiping=false;
    baseTx = (card.style.transform.match(/-?\d+(\.\d+)?/) ? parseFloat(card.style.transform.match(/-?\d+(\.\d+)?/)[0]) : 0);
    lp = setTimeout(() => { if(!moved && !swiping){ enterReorder(); } }, 500);
  });
  card.addEventListener("pointermove", (e) => {
    if(reordering) return;
    const dx=e.clientX-sx, dy=e.clientY-sy;
    if(Math.abs(dx)>8 || Math.abs(dy)>8){ moved=true; }
    if(Math.abs(dy)>10){ clearTimeout(lp); }       // 縦スクロールは長押し扱いにしない
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
      closeAllSwipes();                      // タップ: 開いているスワイプを閉じる
    }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);

  // 並び替えモードのドラッグ(グリップ)
  grip.addEventListener("pointerdown", (e) => { if(reordering){ e.preventDefault(); e.stopPropagation(); startDrag(wrap, b.id, e); } });
}

function enterReorder(){ if(reordering) return; reordering = true; closeAllSwipes(); draw(); }

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
    // 表示順(=非アーカイブ)の cur→target を、実データ state.blocks 上で入れ替える
    reorderActive(cur, target);
    draw();
    // draw() で wrap が作り直されるので、新しい要素を掴み直す
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
  // 表示インデックス(非アーカイブのみ)→ 実インデックスへ写像して移動
  const activeIdx = [];
  state.blocks.forEach((b,i) => { if(!b.archived) activeIdx.push(i); });
  if(from<0||from>=activeIdx.length||to<0||to>=activeIdx.length) return;
  const realFrom = activeIdx[from];
  const [moved] = state.blocks.splice(realFrom,1);
  // toの実位置を再計算
  const activeIdx2 = [];
  state.blocks.forEach((b,i) => { if(!b.archived) activeIdx2.push(i); });
  const realTo = to >= activeIdx2.length ? state.blocks.length : activeIdx2[to];
  state.blocks.splice(realTo,0,moved);
  save(state);
}

/* ---- アーカイブ ---- */
function archive(id){
  const b = state.blocks.find(x => x.id === id); if(!b) return;
  b.archived = true; b.archivedAt = now(); save(state); draw();
}
function unarchive(id){
  const b = state.blocks.find(x => x.id === id); if(!b) return;
  b.archived = false; b.archivedAt = null; save(state); draw();
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
  const list = mountEl.querySelector("#a-list");
  if(!arch.length){ list.innerHTML = `<div class="board-empty">アーカイブは空です。</div>`; return; }
  arch.forEach(b => {
    const wrap = document.createElement("div");
    wrap.className = "bblock-wrap";
    wrap.innerHTML = `
      <div class="bblock" style="background:${hexToRgba(b.color||"#ffffff", b.alpha==null?0.55:b.alpha)}">
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

/* ---- 編集シート(メモと同じ文字編集 + 色/透明度 + 写真) ---- */
function openEditor(block){
  const isNew = !block;
  const data = block || { id:uid(), html:"", color:"#ffffff", alpha:0.55, createdAt:now() };
  let color = data.color || "#ffffff";
  let alpha = data.alpha == null ? 0.55 : data.alpha;

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
        <div class="row"><span class="label">ブロックの色</span><span id="be-colors"></span></div>
        <div class="row"><span class="label">透明度</span>
          <input type="range" id="be-alpha" min="20" max="100" value="${Math.round(alpha*100)}" style="flex:1">
          <span id="be-alpha-val" style="width:42px;text-align:right">${Math.round(alpha*100)}%</span>
        </div>
        <div class="row"><span class="label">プレビュー</span>
          <span id="be-preview" style="flex:1;height:34px;border-radius:10px;border:1px solid var(--sep)"></span>
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
  const updatePreview = () => { preview.style.background = hexToRgba(color, alpha); };
  updatePreview();

  // ブロック色スウォッチ
  const colorsWrap = ov.querySelector("#be-colors");
  PALETTE.forEach(c => {
    const s = document.createElement("span");
    s.className = "be-swatch" + (c === color ? " sel" : "");
    s.style.background = c; s.dataset.bcolor = c;
    s.onclick = () => { color = c; colorsWrap.querySelectorAll(".be-swatch").forEach(x => x.classList.toggle("sel", x.dataset.bcolor === c)); updatePreview(); };
    colorsWrap.appendChild(s);
  });
  // 透明度
  const alphaInput = ov.querySelector("#be-alpha");
  const alphaVal = ov.querySelector("#be-alpha-val");
  alphaInput.oninput = () => { alpha = Number(alphaInput.value)/100; alphaVal.textContent = alphaInput.value + "%"; updatePreview(); };

  // ツールバー(選択を保持するため mousedown を抑止)
  ov.querySelectorAll(".be-tool, .be-swatch[data-color]").forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("pointerdown", e => e.preventDefault());
  });
  const exec = (cmd, val, css) => { editor.focus(); document.execCommand("styleWithCSS", false, !!css); document.execCommand(cmd, false, val === undefined ? null : val); };
  ov.querySelectorAll(".be-tool").forEach(btn => {
    btn.addEventListener("click", () => {
      if(btn.dataset.size) exec("fontSize", String(btn.dataset.size), false);     // <font size> (CSSで均等サイズ)
      else if(btn.dataset.cmd === "bold") exec("bold", null, false);              // 太字は <b> (サイズと共存)
      else if(btn.dataset.cmd === "ul") exec("insertUnorderedList", null, false);
      else if(btn.dataset.cmd === "photo") pickPhoto(editor);
    });
  });
  ov.querySelectorAll(".be-swatch[data-color]").forEach(sw => {
    sw.addEventListener("click", () => exec("foreColor", sw.dataset.color, true));
  });

  // 保存/キャンセル/アーカイブ
  ov.querySelector('[data-act="cancel"]').onclick = () => ov.remove();
  ov.querySelector('[data-act="save"]').onclick = () => {
    data.html = editor.innerHTML; data.color = color; data.alpha = alpha; data.updatedAt = now();
    if(isNew) state.blocks.unshift(data);
    else { const i = state.blocks.findIndex(x => x.id === data.id); if(i>=0) state.blocks[i] = data; }
    save(state); ov.remove(); draw();
  };
  const archBtn = ov.querySelector('[data-act="archive"]');
  if(archBtn) archBtn.onclick = () => { ov.remove(); archive(data.id); };

  setTimeout(() => editor.focus(), 30);
}

/* 写真: 圧縮して挿入(ローカル保存。同期時の容量対策は後段で設計) */
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
