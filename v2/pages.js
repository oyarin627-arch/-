// 各ページの描画。マイページ(容量)＋掲示板を実装。
// 「タスク」「勉強」は従来アプリを app.js が iframe 埋め込み（ここでは扱わない）。
import { rawLegacy, readLegacyState, rawStudy, readStudyState, byteSize, fmtBytes } from "./store.js";
export { renderBoard } from "./board.js";

const DOC_LIMIT = 1048576; // Firestore 1ドキュメントの上限 = 1 MiB

// 同期ドキュメント1件分の使用量カードを作る
function docCard(title, raw, st){
  const bytes = byteSize(raw);
  const pct = Math.min(100, bytes / DOC_LIMIT * 100);
  let projects = 0, tasks = 0;
  if(st && Array.isArray(st.projects)){
    projects = st.projects.filter(p => p && !p.deleted).length;
    tasks = st.projects.reduce((a,p) => a + (((p && p.tasks) || []).length), 0);
  }
  const cls = pct >= 90 ? "danger" : (pct >= 60 ? "warn" : "");
  return `
    <div class="card">
      <h2>${title}</h2>
      <div class="bar"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
      <p><b>${fmtBytes(bytes)}</b> / 1.00 MiB（${pct.toFixed(1)}%）</p>
      <p class="muted">内訳：プロジェクト ${projects}件 ／ タスク ${tasks}件</p>
    </div>`;
}

export function renderMyPage(el){
  el.innerHTML = `
    <p class="muted" style="margin:6px 2px 2px">クラウド同期データ（全端末で共有。各 <b>1ドキュメント＝最大 1 MiB</b>）</p>
    ${docCard("タスク", rawLegacy(), readLegacyState())}
    ${docCard("勉強", rawStudy(), readStudyState())}

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
