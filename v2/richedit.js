// 再利用できるリッチテキスト編集シート(メモ用)。掲示板と同じ整形:
// サイズ S/M/L/XL/XXL(=<font>をCSSで均等)・太字(=<b>でサイズと共存)・文字色・箇条書き・写真。
// CSSは board.css の .be-* を共用する。

const SIZES = [{n:1,l:"S"},{n:3,l:"M"},{n:4,l:"L"},{n:5,l:"XL"},{n:7,l:"XXL"}];
const TEXT_COLORS = ["#1c1c1e","#ff3b30","#ff9500","#34c759","#007aff","#5856d6"];

export function openRichEditor({ title = "メモ", html = "", placeholder = "入力…", onSave } = {}){
  const ov = document.createElement("div"); ov.className = "be-overlay";
  ov.innerHTML = `
    <div class="be-sheet">
      <div class="be-head">
        <button data-act="cancel">キャンセル</button><b>${title}</b><button data-act="save">保存</button>
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
      <div class="be-editor" contenteditable="true" data-ph="${placeholder}"></div>
    </div>`;
  document.body.appendChild(ov);

  const editor = ov.querySelector(".be-editor");
  editor.innerHTML = html || "";

  ov.querySelectorAll(".be-tool, .be-swatch[data-color]").forEach(b => {
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("pointerdown", e => e.preventDefault());
  });
  const exec = (cmd, val, css) => {
    editor.focus();
    document.execCommand("styleWithCSS", false, !!css);
    document.execCommand(cmd, false, val === undefined ? null : val);
  };
  ov.querySelectorAll(".be-tool").forEach(b => b.addEventListener("click", () => {
    if(b.dataset.size) exec("fontSize", String(b.dataset.size), false);
    else if(b.dataset.cmd === "bold") exec("bold", null, false);
    else if(b.dataset.cmd === "ul") exec("insertUnorderedList", null, false);
    else if(b.dataset.cmd === "photo") pickPhoto(editor);
  }));
  ov.querySelectorAll(".be-swatch[data-color]").forEach(sw =>
    sw.addEventListener("click", () => exec("foreColor", sw.dataset.color, true)));

  ov.querySelector('[data-act="cancel"]').onclick = () => ov.remove();
  ov.querySelector('[data-act="save"]').onclick = () => { const h = editor.innerHTML; ov.remove(); onSave && onSave(h); };
  setTimeout(() => editor.focus(), 30);
  return ov;
}

function pickPhoto(editor){
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*";
  input.onchange = () => {
    const f = input.files && input.files[0]; if(!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height; const MAX = 1200;
        if(w > MAX || h > MAX){ const k = Math.min(MAX/w, MAX/h); w = Math.round(w*k); h = Math.round(h*k); }
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        editor.focus();
        document.execCommand("insertHTML", false, `<img src="${cv.toDataURL("image/jpeg",0.8)}"/><div><br/></div>`);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  };
  input.click();
}
