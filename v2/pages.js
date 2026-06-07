// 各ページの描画。まずは「マイページ(容量確認)」を実装。他は段階的に作る。
import { rawLegacy, readLegacyState, byteSize, fmtBytes } from "./store.js";

function placeholder(el, title, note){
  el.innerHTML =
    `<div class="card"><h2>${title} <span class="pill">準備中</span></h2>` +
    `<p class="muted">${note || "このページはこれから作っていきます。"}</p></div>`;
}

export function renderBoard(el){
  placeholder(el, "掲示板",
    "ブロックを複数追加できる掲示板。半透明＋色変更、メモと同じ文字編集、写真添付、" +
    "横スワイプで編集ボタン、長押しで並び替え・アーカイブ、アーカイブ閲覧 … を順に作ります。");
}
export function renderTasks(el){
  placeholder(el, "タスク",
    "現行アプリ（/）のタスク機能を、ここに作り直していきます。完成・検証までは現行アプリをご利用ください。");
}
export function renderStudy(el){
  placeholder(el, "勉強",
    "「タスク」と同じ仕様で、データだけ完全に別管理にします（普段のタスクと混ざりません）。");
}

const DOC_LIMIT = 1048576; // Firestore 1ドキュメントの上限 = 1 MiB

export function renderMyPage(el){
  const raw = rawLegacy();
  const docBytes = byteSize(raw);
  const docPct = Math.min(100, docBytes / DOC_LIMIT * 100);
  const st = readLegacyState();
  let projects = 0, tasks = 0;
  if(st && Array.isArray(st.projects)){
    projects = st.projects.filter(p => p && !p.deleted).length;
    tasks = st.projects.reduce((a,p) => a + (((p && p.tasks) || []).length), 0);
  }
  const cls = docPct >= 90 ? "danger" : (docPct >= 60 ? "warn" : "");

  el.innerHTML = `
    <div class="card">
      <h2>クラウド同期データ</h2>
      <p class="muted">全端末で共有している1つのデータ（Firestoreの1ドキュメント）。上限は <b>1 MiB</b> です。</p>
      <div class="bar"><div class="bar-fill ${cls}" style="width:${docPct}%"></div></div>
      <p><b>${fmtBytes(docBytes)}</b> / 1.00 MiB（${docPct.toFixed(1)}%）</p>
      <p class="muted">内訳：プロジェクト ${projects}件 ／ タスク ${tasks}件</p>
    </div>

    <div class="card" id="device-card">
      <h2>この端末の保存容量</h2>
      <p class="muted">計測中…</p>
    </div>

    <div class="card note">
      <h2>容量についての注意</h2>
      <ul>
        <li>Firebase無料(Spark)枠：保存合計 <b>1 GiB</b>／読み取り 5万・書き込み 2万（1日）。</li>
        <li>ただし同期データは <b>1ドキュメント = 最大 1 MiB</b>。テキスト中心なら十分ですが、
            <b>写真をそのまま埋め込むと上限を超えて同期が壊れます</b>。</li>
        <li>掲示板の写真は「圧縮＋枚数制限」または「Firebase Storage」での対応を予定しています。</li>
      </ul>
    </div>

    <p class="muted" style="text-align:center;margin:18px 0">
      これは再構築版（v2）のプレビューです。現行アプリには影響しません。
    </p>
  `;

  // この端末(オリジン)のストレージ使用量
  if(navigator.storage && navigator.storage.estimate){
    navigator.storage.estimate().then(({usage, quota}) => {
      const card = document.getElementById("device-card");
      if(!card) return;
      const pct = quota ? Math.min(100, usage / quota * 100) : 0;
      card.innerHTML = `
        <h2>この端末の保存容量</h2>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <p><b>${fmtBytes(usage)}</b> 使用 ／ 約 ${fmtBytes(quota)} まで（${pct.toFixed(1)}%）</p>
        <p class="muted">この端末のブラウザがこのアプリのために使っている容量（キャッシュ等を含む）。</p>`;
    }).catch(() => {});
  }
}
