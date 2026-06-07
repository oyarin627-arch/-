// 新アプリ(再構築版)の起動とページ切替。ビルド不要のESモジュール。
import { renderBoard, renderTasks, renderStudy, renderMyPage } from "./pages.js";

// ページ順は左から「掲示板」「タスク」「勉強」「マイページ」
const PAGES = [
  { id:"board",  label:"掲示板",     icon:"📌", render:renderBoard },
  { id:"tasks",  label:"タスク",     icon:"✅", render:renderTasks },
  { id:"study",  label:"勉強",       icon:"📚", render:renderStudy },
  { id:"mypage", label:"マイページ", icon:"👤", render:renderMyPage },
];
const DEFAULT_PAGE = "mypage";   // 最初に着手したページを既定表示

const content = document.getElementById("content");
const titleEl = document.getElementById("page-title");
const tabbar  = document.getElementById("tabbar");

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
  titleEl.textContent = page.label;
  for(const t of tabbar.querySelectorAll(".tab")){
    t.classList.toggle("active", t.dataset.id === id);
  }
  content.innerHTML = "";
  content.scrollTop = 0;
  try{ page.render(content); }
  catch(e){ content.innerHTML = `<div class="card"><p>表示エラー: ${String(e && e.message || e)}</p></div>`; }
}

buildTabs();
window.addEventListener("hashchange", navigate);
navigate();
