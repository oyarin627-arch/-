// データ層(暫定) — まずは既存アプリのデータを「読み取り専用」で参照する。
// ※ 書き込み/同期は、現行アプリのデータを壊さないよう、後段で慎重に追加する。

export const LEGACY_KEY = "taskapp-state-v1";   // 現行アプリ(/)の状態

export function rawLegacy(){
  try{ return localStorage.getItem(LEGACY_KEY) || ""; }catch{ return ""; }
}
export function readLegacyState(){
  try{ return JSON.parse(rawLegacy() || "null"); }catch{ return null; }
}

// 文字列のバイト数(UTF-8相当)
export function byteSize(str){
  try{ return new Blob([str || ""]).size; }catch{ return (str || "").length; }
}
export function fmtBytes(b){
  if(b < 1024) return b + " B";
  if(b < 1048576) return (b/1024).toFixed(1) + " KB";
  return (b/1048576).toFixed(2) + " MB";
}
