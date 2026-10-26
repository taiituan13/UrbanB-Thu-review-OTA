// YC-246 (đổi 27/10/2026: Q1 a, Q2 b) — lượt đọc số ezCloud lúc lễ tân bấm Quét: phần chạy trong trang PMS và thân
// tin gửi Hub. Số và token trong tệp này là giá trị giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PMS_HOME_URL, PMS_TAB_PATTERN, readShiftInPage, readingReport } from "../extension/quay/ezcloud-reading.js";

const FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsZS10YW4tZ2lhIn0.chu-ky-gia";

// Phản hồi GetCurrentShift giả, đủ trường như fixture g2j_price_crawler/fixtures/tien_ket (kể cả tên người tạo ca).
const SHIFT_BODY = {
  Code: 0,
  Message: "",
  Data: {
    ShiftId: 52011,
    HotelId: 17704,
    ShiftNumber: 14,
    CreateDate: "2026-10-26T07:00:00",
    CreateUserId: "uid-gia",
    CreateUserName: "Lễ Tân Giả",
    Receiver: "Người Nhận Giả",
    IsFinish: false,
    FinishDate: null,
    ListShiftDetailModels: [
      {
        MoneyId: 1,
        MoneyName: "VND",
        MinorUnit: "đ",
        MoneyBeginShift: 260000,
        TotalRevenue: 1500000,
        TotalExpenditure: 200000,
        MoneyCurrent: 0,
        MoneyInTheSafe: 0,
        MoneyDifference: 0,
        MoneyNextShift: 0,
        MoneyAssignManagement: 0,
        ListShiftPaymentDetailModel: null,
      },
    ],
  },
};

function storage(entries) {
  const keys = Object.keys(entries);
  return { length: keys.length, key: (i) => keys[i], getItem: (k) => entries[k] ?? null };
}

/** Chạy readShiftInPage với `fetch` và bộ nhớ trang giả. `reply(headers)` trả `{ status, body }`. */
async function inPage(reply, { local = {}, session = {} } = {}) {
  const calls = [];
  const saved = { fetch: globalThis.fetch, window: globalThis.window };
  globalThis.window = { localStorage: storage(local), sessionStorage: storage(session) };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const { status, body } = reply(init.headers ?? {});
    return new Response(body === undefined ? "<html>" : JSON.stringify(body), { status });
  };
  try {
    return { result: await readShiftInPage(), calls };
  } finally {
    globalThis.fetch = saved.fetch;
    globalThis.window = saved.window;
  }
}

test("🔴 readShiftInPage: gọi đúng GetCurrentShift?shiftId=0 bằng phiên trang (GET), chỉ trả trường cần — không tên người", async () => {
  const { result, calls } = await inPage(() => ({ status: 200, body: SHIFT_BODY }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/Shift/GetCurrentShift?shiftId=0");
  assert.equal(calls[0].init.method ?? "GET", "GET", "không gọi lệnh ghi nào trên ezCloud");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(result, {
    status: 200,
    code: 0,
    shift: {
      ShiftId: 52011,
      ShiftNumber: 14,
      CreateDate: "2026-10-26T07:00:00",
      IsFinish: false,
      HotelId: 17704,
      ListShiftDetailModels: [{ MoneyName: "VND", MoneyBeginShift: 260000, TotalRevenue: 1500000, TotalExpenditure: 200000 }],
    },
  });
});

test("🔴 readShiftInPage: phiên cookie bị từ chối ⇒ thử lại với JWT trong bộ nhớ trang; token không lọt ra kết quả", async () => {
  const { result, calls } = await inPage((h) => (h.Authorization === `Bearer ${FAKE_JWT}` ? { status: 200, body: SHIFT_BODY } : { status: 401, body: { Code: 401 } }), {
    local: { theme: "light", "ls.auth": JSON.stringify({ token: FAKE_JWT }) },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers.Authorization, `Bearer ${FAKE_JWT}`);
  assert.equal(result.code, 0);
  assert.ok(!JSON.stringify(result).includes(FAKE_JWT));
});

test("readShiftInPage: chưa đăng nhập, không có JWT ⇒ trả mã lỗi, không ca; trang trả HTML ⇒ code null", async () => {
  const a = await inPage(() => ({ status: 401, body: { Code: 401, Data: null } }));
  assert.deepEqual(a.result, { status: 401, code: 401, shift: null });
  assert.equal(a.calls.length, 1);
  const b = await inPage(() => ({ status: 200, body: undefined }));
  assert.deepEqual(b.result, { status: 200, code: null, shift: null });
});

test("readShiftInPage tự đủ: không dùng biến ngoài thân hàm (chạy bằng executeScript)", () => {
  const src = readShiftInPage.toString();
  for (const name of ["readingReport", "PMS_", "READING_", "isRecord", "import"]) assert.ok(!src.includes(name), `hàm dùng ${name} ngoài thân`);
});

const PAGE = { status: 200, code: 0, shift: { ...SHIFT_BODY.Data, ListShiftDetailModels: SHIFT_BODY.Data.ListShiftDetailModels } };
const report = (page) => readingReport({ page, scanCode: "K7M2PQ", readAt: "2026-10-27T02:00:00.000Z", extensionVersion: "1.5.5" });

test("🔴 readingReport: dựng đúng thân tin, từng trường một (không chép object của trang)", () => {
  assert.deepEqual(report(PAGE), {
    kind: "reading",
    scanCode: "K7M2PQ",
    ezcloudHotelId: "17704",
    ezShiftId: 52011,
    ezShiftNumber: 14,
    shiftOpenedAt: "2026-10-26T07:00:00",
    money: [{ name: "VND", begin: 260000, revenue: 1500000, expenditure: 200000 }],
    readAt: "2026-10-27T02:00:00.000Z",
    extensionVersion: "1.5.5",
  });
  assert.ok(!JSON.stringify(report(PAGE)).includes("Giả"), "không tên người");
});

test("🔴 readingReport: ezCloud báo lỗi, không có ca, ca đã kết, thiếu mã ⇒ null (không gửi gì)", () => {
  assert.equal(report({ ...PAGE, code: 2 }), null);
  assert.equal(report({ ...PAGE, shift: null }), null);
  assert.equal(report({ ...PAGE, shift: { ...PAGE.shift, IsFinish: true } }), null, "ca đã kết không phải ca đang mở");
  assert.equal(report({ ...PAGE, shift: { ...PAGE.shift, IsFinish: null } }), null);
  assert.equal(report({ ...PAGE, shift: { ...PAGE.shift, HotelId: 0 } }), null);
  assert.equal(report({ ...PAGE, shift: { ...PAGE.shift, ShiftId: "52011" } }), null);
  assert.equal(report(null), null);
});

test("readingReport: số không hợp lệ thành null (Hub từ chối), số ca lạ thành null, tối đa 10 dòng tiền", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ MoneyName: `T${i}`, MoneyBeginShift: "1", TotalRevenue: NaN, TotalExpenditure: 5 }));
  const r = report({ ...PAGE, shift: { ...PAGE.shift, ShiftNumber: -1, ListShiftDetailModels: rows } });
  assert.equal(r.ezShiftNumber, null);
  assert.equal(r.money.length, 10);
  assert.deepEqual(r.money[0], { name: "T0", begin: null, revenue: null, expenditure: 5 });
});

test("PMS: trang mở khi chưa có tab và mẫu tìm tab cùng một gốc, có trong host_permissions", () => {
  assert.equal(PMS_HOME_URL, "https://pms.ezcloudhotel.com/");
  assert.equal(PMS_TAB_PATTERN, "https://pms.ezcloudhotel.com/*");
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.ok(manifest.host_permissions.includes(PMS_TAB_PATTERN));
});
