// CSS của khung "UrbanB tại quầy" trên PMS, chép từ mockup v2 (repo UrbanB:
// .design-sync/proto-extension-quay.html). Nằm trong Shadow DOM nên không lẫn với CSS của PMS.
// Khác mockup: vị trí `fixed` theo cửa sổ (mockup đặt `absolute` trong khung 1440×900 giả lập);
// không tải phông qua mạng (Inter / Playfair Display chỉ dùng khi máy có sẵn).
// Dock và khung lùi vào `--dock-right` (92px) để chừa chỗ bong bóng chat của PMS ezCloud: đo 20/10/2026,
// bong bóng ấy rộng 60px, cách mép phải 20px, và nằm đè lên nút Urban B khi dock còn ở 18px.
// Các dòng xoá mặc định (margin, padding, nền nút…) bọc trong `:where()` nên có độ mạnh bằng 0: mọi
// quy tắc của từng khối đều thắng, bất kể thứ tự thẻ <style>. Đo 20/10/2026: CSS thông báo (ui-notify.js)
// được chèn TRƯỚC tệp này, nên `.qz *{padding:0}` cùng độ mạnh với `.qn{padding:…}` mà đứng sau và thắng —
// thẻ tin mất padding, nút "Mở trên Hub" dính sát viền. Khung nằm trong Shadow DOM nên CSS của PMS không
// lọt vào được; độ mạnh 0 không mở cửa cho nó.

export const QUAY_CSS = `
:host{all:initial}
.qz{--dock-right:92px;--bg:#f9f7f2;--surface:#ffffff;--fg:#123b37;--fg-on:#f9f7f2;--muted-fg:#4a6660;--secondary:#ecdec0;--accent:#a68a64;--accent-text:#7d6544;
  --border:#ddd0b0;--destructive:#8c3226;--success:#3c6e52;--warning:#7a5417;--r-sm:6px;--r-md:10px;--r-lg:14px;--surface-soft:#f3eee4;--line-soft:rgba(221,208,176,.58);
  --font-body:'Inter',ui-sans-serif,system-ui,'Segoe UI',sans-serif;--font-display:'Playfair Display',Georgia,ui-serif,serif;
  font-family:var(--font-body);color:var(--fg);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
:where(.qz *){box-sizing:border-box;margin:0;padding:0}
:where(.qz button){font:inherit;color:inherit;cursor:pointer;border:none;background:none;text-align:left}
:where(.qz a){color:inherit}
:where(.qz svg){display:block;flex:none}
.qz :focus-visible{outline:2px solid var(--accent-text);outline-offset:2px}
.tnum{font-variant-numeric:tabular-nums}
.qdock{position:fixed;right:var(--dock-right);bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:10px}
.qfab{height:44px;display:flex;align-items:center;gap:8px;padding:0 10px 0 8px;background:var(--fg);color:var(--fg-on);border-radius:24px;
  box-shadow:0 4px 14px rgba(0,0,0,.25);font-size:13.5px;font-weight:600;white-space:nowrap}
.qz .qfab{color:var(--fg-on);background:var(--fg)}
.qfab .lg{width:28px;height:28px;border-radius:7px;background:var(--secondary);color:var(--fg);font:600 15px/28px var(--font-display);text-align:center;flex:none}
.qfab .seg{display:inline-flex;align-items:center;gap:5px;background:rgba(249,247,242,.14);border-radius:12px;padding:3px 9px;font-size:12px;font-weight:600}
.qfab .seg.bad{background:#f6ebe8;color:var(--destructive)}
.qfab[aria-expanded="true"]{box-shadow:0 0 0 3px var(--secondary),0 4px 14px rgba(0,0,0,.25)}
.dlv{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
.dlv.cb{background:#e07a6a}.dlv.cy{background:#e2b25a}.dlv.ok{background:#7fbf98}.dlv.lv{background:var(--secondary)}.dlv.off{background:transparent;border:1.5px solid currentColor}
.qchip{height:38px;display:inline-flex;align-items:center;gap:7px;padding:0 6px 0 12px;border-radius:20px;background:var(--surface);border:1px solid var(--border);
  color:var(--fg);font-size:13px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.18);white-space:nowrap}
.qz .qchip{border:1px solid var(--border)}
.qchip .n{min-width:24px;height:24px;border-radius:12px;background:var(--destructive);color:#fff;font-size:12.5px;line-height:24px;text-align:center;padding:0 7px;font-variant-numeric:tabular-nums}
.qchip[aria-expanded="true"]{background:var(--fg);color:var(--fg-on);border-color:var(--fg)}
.qchip[aria-expanded="true"] .n{background:var(--fg-on);color:var(--fg)}
.qchip.bump{animation:qbump .5s ease-out}
@keyframes qbump{0%{transform:scale(1)}35%{transform:scale(1.12)}100%{transform:scale(1)}}
.qf{position:fixed;right:var(--dock-right);bottom:72px;width:560px;max-width:calc(100vw - var(--dock-right) - 18px);height:min(720px,calc(100vh - 104px));min-height:320px;z-index:2147483001;background:var(--bg);border:1px solid var(--border);
  border-radius:var(--r-lg);box-shadow:0 14px 40px -10px rgba(18,59,55,.45);display:flex;flex-direction:column;overflow:hidden}
.qf-hd{background:var(--fg);color:var(--fg-on);padding:10px 12px 10px 14px;display:flex;align-items:center;gap:8px;flex:none}
.qf-hd .tt{flex:1;min-width:0;display:flex;flex-direction:column}
.qf-hd .tt b{font:600 16px/1.25 var(--font-display)}
.qf-hd .tt span{font-size:12px;color:var(--secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qz .qf-hd button{height:32px;padding:0 10px;border-radius:8px;background:rgba(249,247,242,.14);color:var(--fg-on);font-size:12.5px;white-space:nowrap}
.qz .qf-hd button:hover{background:rgba(249,247,242,.24)}
.qf-tabs{display:flex;background:var(--surface);border-bottom:1px solid var(--border);flex:none}
.qz .qf-tabs button{flex:1;min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:13.5px;font-weight:600;color:var(--muted-fg);
  border-bottom:2px solid transparent;text-align:center}
.qz .qf-tabs button.on{color:var(--fg);border-bottom-color:var(--fg)}
.qf-tabs .ct{min-width:20px;height:20px;border-radius:10px;font-size:11.5px;line-height:20px;padding:0 6px;text-align:center;background:var(--surface-soft);color:var(--muted-fg);font-variant-numeric:tabular-nums}
.qf-tabs .ct.bad{background:rgba(140,50,38,.12);color:var(--destructive)}
.qf-tabs .dlv.cb{background:var(--destructive)}.qf-tabs .dlv.cy{background:var(--warning)}.qf-tabs .dlv.ok{background:var(--success)}.qf-tabs .dlv.lv{background:var(--accent)}
.qf-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:0}
.qf-body>*{flex:none}
.qf-ft{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--border);background:var(--surface);font-size:12px;color:var(--muted-fg)}
.qf-ft .sp{flex:1;min-width:0}
.qz .qf-ft a,.qz .qf-ft .lk{min-height:32px;display:inline-flex;align-items:center;gap:4px;padding:0 10px;border:1px solid var(--fg);border-radius:var(--r-md);
  font-size:12.5px;font-weight:600;color:var(--fg);text-decoration:none;white-space:nowrap;background:var(--surface)}
.qban{border-radius:var(--r-md);padding:8px 10px;font-size:13px;display:flex;gap:8px;align-items:flex-start}
.qban.ok{background:rgba(60,110,82,.10);border:1px solid rgba(60,110,82,.3);color:var(--success)}
.qban.bad{background:#f6ebe8;border:1px solid #e6cbc4;color:var(--destructive)}
.qban.warn{background:#f6efdc;border:1px solid #e3cf9f;color:var(--warning)}
.qz .qban button{margin-left:auto;font-size:12px;text-decoration:underline;color:inherit;white-space:nowrap}
.qsearch{display:flex;gap:8px}
.qsearch input{flex:1;min-width:0;height:36px;padding:0 10px;border:1px solid var(--border);border-radius:var(--r-sm);font:inherit;font-size:13px;background:var(--surface);color:var(--fg)}
.ota-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:8px 10px;font-size:13px}
.ota-card.err{color:var(--destructive)}
.ota-card .ota-t{display:flex;justify-content:space-between;gap:8px;font-weight:600}
.ota-card .ota-m{color:var(--muted-fg);font-size:12px;margin-top:2px}
.ota-card .ota-m.bad{color:var(--destructive)}
.ota-row{display:flex;gap:8px;align-items:center}
.qz .ota-btn{background:var(--fg);color:var(--fg-on);border:none;border-radius:var(--r-sm);padding:7px 12px;cursor:pointer;font-weight:600;font-size:12.5px;white-space:nowrap}
.qz .ota-btn:disabled{opacity:.55;cursor:default}
.ota-chip{display:inline-block;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:600;margin-left:4px;white-space:nowrap}
.ota-chip.ota-ok{background:#E8F7F0;color:#1A7F4E}.ota-chip.ota-err{background:#FDECEB;color:#C0392B}.ota-chip.ota-warn{background:#FFFBEB;color:#B45309}.ota-chip.ota-info{background:#EAF2FB;color:#1F5FA8}.ota-chip.ota-none{background:#eee;color:#666}
.ota-scroll{overflow:auto}
table.ota-board{border-collapse:collapse;width:100%;font-size:11px;background:var(--surface)}
.ota-board th,.ota-board td{border:1px solid #e5e5e5;padding:0;text-align:center;height:40px;position:relative}
.ota-board th{background:#f7f7f7;font-weight:600;padding:4px 2px}
.ota-board th.ota-today{background:var(--secondary);color:var(--fg)}
.ota-board th.rt{text-align:left;padding:4px 6px}
.ota-board td.ota-rt{text-align:left;padding:0 6px;font-weight:600;white-space:nowrap;background:#fafafa}
.ota-board td .ota-n{position:absolute;inset:0;display:flex;justify-content:center;font-weight:600;align-items:flex-start;padding-top:3px;font-size:12px}
.ota-board td.ota-f0{background:#FDECEB;color:#C0392B}.ota-board td.ota-f1{background:#FFFBEB;color:#B45309}.ota-board td.ota-fx{background:#E8F7F0;color:#1A7F4E}.ota-board td.ota-fn{background:#f3f3f3;color:#999}
.ota-board td .ota-ic{position:absolute;left:0;right:0;bottom:2px;display:flex;justify-content:center;gap:1px;line-height:0;white-space:nowrap;overflow:hidden}
.ota-i{width:12px;height:12px;display:inline-block;vertical-align:middle;flex:none}
.ota-legend .ota-i{margin-right:3px}
.ota-i-hourly{color:#7C3AED}.ota-i-overnight{color:#C0392B}.ota-i-daily{color:#C0392B}.ota-i-lock{color:#C0392B}.ota-i-avail{color:#1F5FA8}.ota-i-warn{color:#B45309}
.ota-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--muted-fg);align-items:center}
.ota-legend span{display:inline-flex;align-items:center}
.ota-legend i{display:inline-block;width:14px;height:8px;border-radius:3px;vertical-align:middle;margin-right:3px}
.ota-muted{color:var(--muted-fg);font-size:12px}
.cb-verdict{font-size:13.5px;line-height:1.45;background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--fg);border-radius:var(--r-md);padding:8px 10px}
.cb-verdict b{font-variant-numeric:tabular-nums}
.cb-case{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 11px;display:flex;flex-direction:column;gap:4px;cursor:pointer;color:inherit;text-decoration:none}
.cb-case:hover{border-color:var(--accent)}
.cb-case.cbf{background:#fdf6f4;border-color:rgba(140,50,38,.35)}
.cb-case.cyf{background:#fdfaf3;border-color:rgba(122,84,23,.38)}
.cb-case .id{display:flex;align-items:flex-start;gap:8px}
.cb-case .nm{flex:1;min-width:0;font-weight:600;font-size:13.5px;line-height:1.35}
.cb-case .nm .no{color:var(--muted-fg);font-weight:600;margin-right:4px;font-variant-numeric:tabular-nums}
.cb-case .main{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.cb-case .chips{display:flex;flex-wrap:wrap;gap:6px}
.cb-case .todo{font-size:12.5px;color:var(--fg);display:flex;gap:6px;align-items:center;border-top:1px dashed var(--line-soft);padding-top:5px;margin-top:2px}
.cb-case .todo .k{color:var(--muted-fg);white-space:nowrap}
.lv{display:inline-flex;align-items:center;gap:4px;border-radius:var(--r-sm);padding:2px 7px;font-size:11.5px;font-weight:600;white-space:nowrap;flex:none}
.lv.cb{background:rgba(140,50,38,.10);color:var(--destructive)}
.lv.cy{background:rgba(122,84,23,.12);color:var(--warning)}
.lv.ov{background:transparent;border:1px solid rgba(140,50,38,.45);color:var(--destructive)}
.tag{display:inline-flex;align-items:center;white-space:nowrap;border-radius:var(--r-sm);padding:2px 8px;font-size:12px;font-weight:500;background:var(--surface-soft);color:var(--muted-fg)}
.tag.ol{background:transparent;border:1px solid var(--border);color:var(--fg)}
.cb-thieu{font-size:12.5px;color:var(--muted-fg);background:var(--surface);border:1px dashed var(--border);border-radius:var(--r-md);padding:8px 10px}
.cb-thieu b{color:var(--fg)}
.cb-note{font-size:13px;background:var(--secondary);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.cb-note.bad{background:#f6ebe8;border-color:#e6cbc4}
.cb-note .t{font-weight:600}
.cb-note .bt{display:flex;gap:8px;flex-wrap:wrap}
.cb-note .mut2{font-size:12px;color:var(--muted-fg)}
.qz .cb-btn{min-height:36px;padding:0 14px;border-radius:var(--r-md);background:var(--fg);color:var(--fg-on);font-size:13px;font-weight:600;display:inline-flex;align-items:center;text-decoration:none}
.qz .cb-btn2{min-height:36px;padding:0 14px;border-radius:var(--r-md);background:var(--surface);border:1px solid var(--border);font-size:13px;display:inline-flex;align-items:center}
.cb-stale .cb-case,.cb-stale .cb-verdict,.cb-stale .ota-card{opacity:.62}
.qnote{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483002;max-width:min(560px,calc(100vw - 36px));padding:9px 14px;border-radius:8px;
  font-size:12.5px;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);background:var(--fg)}
.qnote.ok{background:var(--success)}.qnote.warn{background:var(--warning)}.qnote.err{background:var(--destructive)}
`;
