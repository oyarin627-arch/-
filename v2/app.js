// 新アプリ(再構築版)の起動とページ切替。ビルド不要のESモジュール。
// 「タスク」タブは従来アプリ(/index.html)をそのまま iframe 埋め込み
//  → 見た目・操作性・同期を従来と完全に同一に保つ。
import { renderBoard, renderMyPage } from "./pages.js";

// ページ順は左から「掲示板」「タスク」「勉強」「マイページ」
//  embed: 従来アプリをiframeで埋め込むページ / render: v2で描画するページ
const PAGES = [
  { id:"board",  label:"掲示板",     icon:"📌", render:renderBoard },
  { id:"tasks",  label:"タスク",     icon:"✅", embed:"../index.html" },
  { id:"study",  label:"勉強",       icon:"📚", embed:"../index.html?ns=study" },
  { id:"mypage", label:"マイページ", icon:"👤", render:renderMyPage },
];
const DEFAULT_PAGE = "tasks";

const content = document.getElementById("content");
const titleEl = document.getElementById("page-title");
const header  = document.getElementById("page-header");
const tabbar  = document.getElementById("tabbar");
const appEl   = document.getElementById("app");

// 埋め込みiframeはページごとに1度だけ生成して保持(タブ切替で再読込しない＝同期の無駄な再接続を防ぐ)
const frames = {};
function ensureFrame(page){
  if(!frames[page.id]){
    const f = document.createElement("iframe");
    f.className = "embed-frame"; f.src = page.embed; f.title = page.label;
    appEl.appendChild(f); frames[page.id] = f;
  }
  return frames[page.id];
}

// iOSではiframeの高さを上下固定だと中身の100dvhが潰れるため、実ピクセルで高さを指定する
function sizeFrames(){
  const tab = tabbar.offsetHeight || 60;
  const h = Math.max(0, window.innerHeight - tab);
  for(const f of Object.values(frames)) f.style.height = h + "px";
}
window.addEventListener("resize", sizeFrames);
window.addEventListener("orientationchange", () => setTimeout(sizeFrames, 200));
if(window.visualViewport) window.visualViewport.addEventListener("resize", sizeFrames);

function buildTabs(){
  tabbar.innerHTML = "";
  for(const p of PAGES){
    const b = document.createElement("button");
    b.className = "tab"; b.dataset.id = p.id; b.type = "button";
    b.innerHTML = `<span class="tab-icon">${p.icon}</span><span class="tab-label">${p.label}</span>`;
    b.addEventListener("click", () => { location.hash = p.id; });
    tabbar.appendChild(b);
  }
}

function currentId(){
  const h = (location.hash || "").replace(/^#/, "");
  return PAGES.some(p => p.id === h) ? h : DEFAULT_PAGE;
}

function navigate(){
  const id = currentId();
  const page = PAGES.find(p => p.id === id);

  // 埋め込みページ: 該当iframeだけ表示、他は隠す
  Object.values(frames).forEach(f => f.classList.remove("show"));
  if(page.embed){ ensureFrame(page).classList.add("show"); sizeFrames(); }

  // 埋め込み時はv2ヘッダーを隠して従来アプリを全面表示
  header.style.display = page.embed ? "none" : "";
  for(const t of tabbar.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.id === id);

  if(page.embed){
    content.innerHTML = "";
  } else {
    titleEl.textContent = page.label;
    content.innerHTML = ""; content.scrollTop = 0;
    try{ page.render(content); }
    catch(e){ content.innerHTML = `<div class="card"><p>表示エラー: ${String(e && e.message || e)}</p></div>`; }
  }
}

buildTabs();
window.addEventListener("hashchange", navigate);
navigate();
