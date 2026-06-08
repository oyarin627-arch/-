// 掲示板の同期エンジン。タスク同期と同じ思想:
//  ・3-wayマージ(両端末の追加/編集を残す) ・土台は local===cloud の瞬間だけ更新
//  ・安全弁(クラウド欠落で手元が大量消失する取り込みは中止) ・オフライン中は送らない/復帰時にサーバ再読込
// 掲示板はミニファイ版アプリと違い「再描画」で反映できる＝リロード不要のシームレス同期。
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, getDocFromServer } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAr93zoGtmc3IaIiLnalzb3QDvW1Wlg_9w",
  authDomain: "task-app-c586e.firebaseapp.com",
  projectId: "task-app-c586e",
  storageBucket: "task-app-c586e.firebasestorage.app",
  messagingSenderId: "350937473724",
  appId: "1:350937473724:web:eb63cdd8a81950e133e6b9",
  measurementId: "G-91NWYMMPZW"
};
const BASE_KEY = "taskapp-board-base";

/* ---- マージ補助(タスクのブリッジと同じ考え方) ---- */
function stable(v){
  if(v===null||typeof v!=="object") return JSON.stringify(v)||"null";
  if(Array.isArray(v)) return "["+v.map(stable).join(",")+"]";
  return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
}
const eq=(a,b)=>stable(a)===stable(b);
function indexById(arr){ const m={}; (arr||[]).forEach(it=>{ if(it&&it.id!=null) m[String(it.id)]=it; }); return m; }
function orderIds(arr){ const o=[]; (arr||[]).forEach(it=>{ if(it&&it.id!=null) o.push(String(it.id)); }); return o; }
function sameRelOrder(a,b){ const sb=new Set(b),sa=new Set(a); return a.filter(x=>sb.has(x)).join("")===b.filter(x=>sa.has(x)).join(""); }
function mergeOrderIds(bA,lA,rA){
  const Bo=orderIds(bA),Lo=orderIds(lA),Ro=orderIds(rA);
  const lMoved=!sameRelOrder(Lo,Bo), rMoved=!sameRelOrder(Ro,Bo);
  const primary=rMoved?Ro:(lMoved?Lo:Ro), secondary=primary===Ro?Lo:Ro;
  const out=[],seen=new Set(); const add=id=>{ if(id!=null&&!seen.has(id)){seen.add(id);out.push(id);} };
  primary.forEach(add); secondary.forEach(add); Bo.forEach(add); return out;
}
// 同IDブロックの競合は updatedAt が新しい方を採用
function pickBlock(b,l,r){
  if(eq(l,r)) return l;
  if(b&&eq(l,b)) return r;
  if(b&&eq(r,b)) return l;
  return ((l&&l.updatedAt)||0) >= ((r&&r.updatedAt)||0) ? l : r;
}
function mergeBlocks(bA,lA,rA){
  const B=indexById(bA),L=indexById(lA),R=indexById(rA),out=[];
  mergeOrderIds(bA,lA,rA).forEach(id=>{
    const b=B[id],l=L[id],r=R[id],inB=id in B,inL=id in L,inR=id in R;
    if(inL&&inR) out.push(pickBlock(b,l,r));
    else if(inL&&!inR){ if(!(inB&&eq(l,b))) out.push(l); }  // 追加 or 編集vs削除 → 残す
    else if(inR&&!inL){ if(!(inB&&eq(r,b))) out.push(r); }
  });
  return out;
}
function mergeBoard(base,local,remote){
  const b=base||{},l=local||{},r=remote||{};
  return { blocks: mergeBlocks(b.blocks||[], l.blocks||[], r.blocks||[]) };
}

function nBlocks(str){ try{ const d=JSON.parse(str); return (d.blocks||[]).length; }catch{ return 0; } }
const hasBlocks = str => nBlocks(str) > 0;
function isWipe(localStr, mergedStr){
  const L=nBlocks(localStr); if(L===0) return false;
  const M=nBlocks(mergedStr);
  return M===0 || (L>=5 && M < Math.ceil(L*0.4));
}
function normStr(s){ try{ const d=JSON.parse(s||"null"); if(d&&Array.isArray(d.blocks)) return JSON.stringify({blocks:d.blocks}); }catch{} return JSON.stringify({blocks:[]}); }
const getBaseObj=()=>{ try{ return JSON.parse(localStorage.getItem(BASE_KEY)||"null"); }catch{ return null; } };
const setBase=(s)=>{ try{ localStorage.setItem(BASE_KEY, s); }catch{} };

/* ---- ステータス表示(右下・タブバーの上) ---- */
let badge=null;
function mountBadge(){
  if(badge) return;
  badge=document.createElement("div");
  badge.style.cssText="position:fixed;right:10px;z-index:60;font:12px/1.4 -apple-system,system-ui,sans-serif;"+
    "bottom:calc(64px + env(safe-area-inset-bottom,0px));padding:5px 9px;border-radius:12px;"+
    "background:rgba(0,0,0,.72);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);transition:opacity .4s;pointer-events:none;";
  document.body.appendChild(badge);
}
const OK="rgba(20,140,70,.92)", BLUE="rgba(0,90,200,.88)", WARN="rgba(120,90,0,.92)", DANGER="rgba(150,0,0,.92)";
function setStatus(text,color){
  if(!badge) return;
  badge.textContent="☁️ "+text; if(color) badge.style.background=color; badge.style.opacity=".95";
  clearTimeout(setStatus._t);
  if(/同期OK/.test(text)) setStatus._t=setTimeout(()=>{ if(badge) badge.style.opacity="0"; }, 2200);
}

/* ---- 本体 ---- */
let hooks=null, started=false, boardRef=null;
let applyingRemote=false, busy=false, busyDeferred=false, editTimer=null;
let lastCloud=null, lastCloudKnown=false, cloudFresh=false;

export function initBoardSync(h){
  hooks=h; if(started) return; started=true;
  mountBadge(); setStatus("接続中…",BLUE);
  const app=initializeApp(firebaseConfig,"board");
  const db=getFirestore(app);
  boardRef=doc(db,"taskapp","board");
  onSnapshot(boardRef,{includeMetadataChanges:true}, snap=>{
    const fromCache=snap.metadata&&snap.metadata.fromCache;
    lastCloud = snap.exists() ? ((snap.data()&&typeof snap.data().data==="string") ? snap.data().data : null) : null;
    lastCloudKnown=true; cloudFresh=!fromCache;
    reconcile();
  }, err=>{ console.error("[board-sync]",err); setStatus("オフライン",WARN); });
  window.addEventListener("online", ()=>{
    if(!boardRef) return;
    getDocFromServer(boardRef).then(snap=>{ lastCloud=snap.exists()?((snap.data()&&snap.data().data)||null):null; lastCloudKnown=true; cloudFresh=true; reconcile(); }).catch(()=>{});
  });
  window.addEventListener("offline", ()=>{ cloudFresh=false; setStatus("オフライン",WARN); });
}

// 手元編集(保存)後に呼ぶ
export function noteLocalChange(){
  if(applyingRemote) return;
  clearTimeout(editTimer);
  editTimer=setTimeout(reconcile, 600);
}
// 編集シート/並び替え中は遠隔反映を保留
export function setBusy(b){ busy=!!b; if(!busy && busyDeferred){ busyDeferred=false; reconcile(); } }

function pushCloud(str){
  if(typeof navigator!=="undefined" && navigator.onLine===false){ setStatus("オフライン(後で同期)",WARN); return; }
  if(lastCloudKnown && lastCloud && hasBlocks(normStr(lastCloud)) && !hasBlocks(str)) return; // 本物を空で上書きしない
  setStatus("保存中…",BLUE);
  setDoc(boardRef,{data:str,updatedAt:Date.now()}).then(()=>setStatus("同期OK",OK)).catch(e=>{ console.error(e); setStatus("オフライン(後で同期)",WARN); });
}
function applyRemote(str){
  applyingRemote=true;
  try{ hooks.applyRemoteStr(str); } finally{ applyingRemote=false; }
}

function reconcile(){
  if(!hooks || applyingRemote || !lastCloudKnown || !cloudFresh) return;
  const localNorm = normStr(hooks.getLocalStr());

  if(lastCloud===null){                                  // クラウド未作成
    if(hasBlocks(localNorm)){ pushCloud(localNorm); } setBase(localNorm); setStatus("同期OK",OK); return;
  }
  const cloudNorm = normStr(lastCloud);
  if(localNorm===cloudNorm){ setBase(localNorm); setStatus("同期OK",OK); return; }

  let merged;
  try{ merged=JSON.stringify(mergeBoard(getBaseObj(), JSON.parse(localNorm), JSON.parse(cloudNorm))); }
  catch(e){ console.error("[board-sync] merge",e); return; }
  const pushNeeded = merged!==cloudNorm;
  const localNeeded = merged!==localNorm;

  if(localNeeded && isWipe(localNorm, merged)){          // 安全弁
    setStatus("⚠データ保護: 取り込み中止",DANGER);
    if(nBlocks(cloudNorm) < nBlocks(localNorm)) pushCloud(localNorm);
    return;
  }
  if(localNeeded){
    if(busy){ busyDeferred=true; if(pushNeeded) pushCloud(merged); return; }  // 編集中は反映を保留(送信は可)
    applyRemote(merged);
    if(pushNeeded) pushCloud(merged);
  } else if(pushNeeded){ pushCloud(merged); }
}
