/**
 * Report → print-ready HTML (spec §42).
 *
 * The browser's native "Save as PDF" produces a pixel-perfect A4 report with
 * full Bangla support and zero binary dependencies — the same document is
 * reachable from the "Download PDF" button (window.print) and from
 * GET /api/report/export?format=html (a standalone .html file).
 */
import { formatMeal, formatMoney, formatRate, round2 } from "@/lib/format";
import { toDisplayDate, toDisplayDateTime, monthLabelBn } from "@/lib/date";
import { bazarByBuyer, bazarByCategory } from "@/lib/calc";
import type { MessData, MonthSummary, OfficeDTO } from "@/lib/types";

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface PrintReportInput {
  office: OfficeDTO;
  data: MessData;
  summary: MonthSummary;
  fromDate?: string | null;
  toDate?: string | null;
  preparedBy?: string;
}

export function buildPrintHtml(input: PrintReportInput): string {
  const { office, data, summary, fromDate, toDate } = input;
  const generatedAt = toDisplayDateTime(new Date().toISOString());
  const range =
    fromDate && toDate
      ? `${toDisplayDate(fromDate)} — ${toDisplayDate(toDate)}`
      : `০১ — ${data.totalDays} (${data.monthName})`;

  const categories = bazarByCategory(data.bazarExpenses);
  const buyers = bazarByBuyer(data.bazarExpenses);
  const totalDue = round2(
    summary.memberCalculations.filter((m) => m.statusEn === "Due").reduce((s, m) => s + Math.abs(m.denaPoana), 0),
  );
  const totalReceive = round2(
    summary.memberCalculations.filter((m) => m.statusEn === "Receive").reduce((s, m) => s + m.denaPoana, 0),
  );
  const hasJer = (summary.totalOpeningDue ?? 0) > 0;

  const memberRows = summary.memberCalculations
    .map(
      (m, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(m.name)}</td>
        <td class="r">${formatMeal(m.totalMill)}</td>
        <td class="r">${formatRate(m.perMillRate)}</td>
        <td class="r">${formatMoney(m.mealCost)}</td>
        <td class="r">${formatMoney(m.individualExtra)}</td>
        <td class="r">${formatMoney(m.sharedExtra)}</td>
        <td class="r b">−৳${formatMoney(m.totalCost)}</td>
        <td class="r">৳${formatMoney(m.totalDeposit)}</td>
        <td class="r">${m.selfPaidBazar > 0 ? `৳${formatMoney(m.selfPaidBazar)}` : "—"}</td>
        ${hasJer ? `<td class="r">${(m.openingDue ?? 0) > 0 ? `৳${formatMoney(m.openingDue ?? 0)}` : "—"}</td>` : ""}
        ${hasJer ? `<td class="r">${(m.jerAdjusted ?? 0) + (m.jerCashPaid ?? 0) > 0 ? `৳${formatMoney((m.jerAdjusted ?? 0) + (m.jerCashPaid ?? 0))}` : "—"}</td>` : ""}
        ${hasJer ? `<td class="r">${(m.remainingJer ?? 0) > 0 ? `৳${formatMoney(m.remainingJer ?? 0)}` : "—"}</td>` : ""}
        <td class="r b">${m.denaPoana < 0 ? "−" : m.denaPoana > 0 ? "+" : ""}৳${formatMoney(Math.abs(m.denaPoana))}</td>
        <td class="r">৳${formatMoney(m.permanentFund)}</td>
        <td class="c"><span class="pill ${m.statusEn.toLowerCase()}">${esc(m.status)}</span></td>
      </tr>`,
    )
    .join("");

  // দেনা-পাওনা নগদ জমা: ফান্ড ও সিস্টেম-ক্যারি বাদ; জের-নগদ পরিশোধ ধরা হয়
  const carryByMember = new Map<string, number>();
  for (const d of data.deposits) {
    if (!d.memberId || d.type === "permanent_fund") continue;
    if ((d.createdBy ?? "") === "system:carry-forward") {
      carryByMember.set(d.memberId, round2((carryByMember.get(d.memberId) ?? 0) + Number(d.amount)));
    }
  }
  const paymentRows = summary.memberCalculations
    .map((m) => {
      const paid = round2(m.totalDeposit - (carryByMember.get(m.memberId) ?? 0) + (m.jerCashPaid ?? 0));
      const dueBefore = round2(m.denaPoana - paid);
      return { m, paid, dueBefore };
    })
    .filter((r) => r.dueBefore < -0.005 || r.paid > 0.005);
  const paymentTotalDue = round2(paymentRows.filter((r) => r.dueBefore < -0.005).reduce((s, r) => s + Math.abs(r.dueBefore), 0));
  const paymentTotalPaid = round2(paymentRows.reduce((s, r) => s + r.paid, 0));
  const paymentRemainDue = round2(paymentRows.filter((r) => r.m.denaPoana < -0.005).reduce((s, r) => s + Math.abs(r.m.denaPoana), 0));
  const paymentRemainRecv = round2(paymentRows.filter((r) => r.m.denaPoana > 0.005).reduce((s, r) => s + r.m.denaPoana, 0));
  const paymentTableHtml =
    !fromDate && !toDate && paymentRows.length > 0
      ? `
    <h2>★ দেনা-পাওনা জমা (সদস্য হিসেবের পরিপূরক)</h2>
    <table>
      <thead>
        <tr>
          <th class="c">#</th><th>সদস্য</th><th class="r">মোট দেনা</th>
          <th class="r">মোট জমা</th><th class="r">বাকি দেনা(−)/পাওনা(+)</th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows
          .map(
            (r, i) => `
          <tr>
            <td class="c">${i + 1}</td>
            <td>${esc(r.m.name)}</td>
            <td class="r">${r.dueBefore < -0.005 ? `৳${formatMoney(Math.abs(r.dueBefore))}` : "—"}</td>
            <td class="r">${r.paid > 0.005 ? `৳${formatMoney(r.paid)}` : "—"}</td>
            <td class="r b">${r.m.denaPoana < 0 ? "−" : r.m.denaPoana > 0 ? "+" : ""}৳${formatMoney(Math.abs(r.m.denaPoana))}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" class="r b">মোট</td>
          <td class="r b">৳${formatMoney(paymentTotalDue)}</td>
          <td class="r b">৳${formatMoney(paymentTotalPaid)}</td>
          <td class="r b">দিবে ৳${formatMoney(paymentRemainDue)} / পাবে ৳${formatMoney(paymentRemainRecv)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="note">
      জমা দিলে দেনা কমে ও লাস্ট ব্যালেন্স (নগদ) বাড়ে; বাজার-মোট ও মিল রেট অপরিবর্তিত থাকে।
      পুরনো মাসের বাকি (জের) নতুন মাসে নিজের টাকার বাজার বা জের-পরিশোধ থেকে সমন্বয় হয়।
    </div>`
      : "";

  const catRows = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${formatMoney(v)}</td></tr>`)
    .join("");

  const buyerRows = Object.entries(buyers)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${formatMoney(v)}</td></tr>`)
    .join("");

  const incomeRows = data.otherIncomes
    .map(
      (r) =>
        `<tr><td class="c">${toDisplayDate(r.date)}</td><td>${esc(r.title || "—")}</td><td class="r">${formatMoney(
          r.amount,
        )}</td><td>${esc(r.note)}</td></tr>`,
    )
    .join("");

  const fundRows = data.deposits
    .map(
      (r) =>
        `<tr><td class="c">${toDisplayDate(r.date)}</td><td>${esc(r.memberName || "—")}</td><td class="r">${formatMoney(
          r.amount,
        )}</td><td>${esc(r.type)}</td><td>${esc(r.note)}</td></tr>`,
    )
    .join("");

  const extraRows = data.extraExpenses
    .map(
      (r) =>
        `<tr><td class="c">${toDisplayDate(r.date)}</td><td>${esc(r.title || "—")}</td><td class="c">${esc(
          r.type === "shared" ? "Shared" : "Individual",
        )}</td><td>${esc(r.memberName || "—")}</td><td class="r">${formatMoney(r.amount)}</td></tr>`,
    )
    .join("");

  const bazarRows = [...data.bazarExpenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (r) =>
        `<tr><td class="c">${toDisplayDate(r.date)}</td><td>${esc(r.buyerName || "—")}</td><td>${esc(
          r.category,
        )}</td><td>${esc(r.items)}</td><td class="r">${formatMoney(r.amount)}</td><td>${esc(r.note)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>রিপোর্ট — ${esc(office.name)} — ${esc(data.monthName)}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Noto Sans Bengali", "Hind Siliguri", "SolaimanLipi", "Kalpurush", system-ui, sans-serif;
    color: #101828; margin: 0; padding: 16px; background: #f5f7f9; font-size: 12px; line-height: 1.45;
  }
  .sheet { max-width: 210mm; margin: 0 auto; background: #fff; padding: 18px 20px; border-radius: 8px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 2px solid #226e4a; color: #1c583d; }
  .sub { color: #475467; font-size: 12px; }
  .head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; border-bottom: 3px double #226e4a; padding-bottom: 10px; }
  .meta { text-align: right; font-size: 11px; color: #475467; }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 14px 0 4px; }
  .kpi { border: 1px solid #e4e7ec; border-radius: 6px; padding: 8px; background: #fbfdfc; }
  .kpi .k { font-size: 10px; color: #667085; }
  .kpi .v { font-size: 15px; font-weight: 700; color: #143a2a; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #e4e7ec; padding: 5px 6px; font-size: 11px; }
  th { background: #eef7f2; color: #184632; font-weight: 700; text-align: left; }
  td.r, th.r { text-align: right; }
  td.c, th.c { text-align: center; }
  td.b { font-weight: 700; }
  tfoot td { background: #f7faf8; font-weight: 700; }
  tr { page-break-inside: avoid; }
  .pill { padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; }
  .pill.due { background: #fee4e2; color: #b42318; }
  .pill.receive { background: #d1fadf; color: #027a48; }
  .pill.settled { background: #e4e7ec; color: #475467; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .note { font-size: 10px; color: #667085; margin-top: 6px; }
  .rules { background: #fffaeb; border: 1px solid #fedf89; border-radius: 6px; padding: 8px 10px; font-size: 10.5px; margin-top: 14px; }
  .sign { display: flex; justify-content: space-between; margin-top: 28px; gap: 20px; }
  .sign div { flex: 1; border-top: 1px solid #98a2b3; padding-top: 4px; text-align: center; font-size: 10.5px; color: #475467; }
  .toolbar { max-width: 210mm; margin: 0 auto 12px; display: flex; gap: 8px; justify-content: flex-end; }
  .btn { background: #226e4a; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font-size: 12px; cursor: pointer; font-family: inherit; }
  .btn.ghost { background: #fff; color: #226e4a; border: 1px solid #226e4a; }
  @media print { body { background: #fff; padding: 0; } .sheet { border-radius: 0; padding: 0; max-width: none; } .toolbar { display: none; } }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn" onclick="window.print()">🖨 প্রিন্ট / PDF সেভ করুন</button>
    <button class="btn ghost" onclick="window.close()">বন্ধ করুন</button>
  </div>
  <div class="sheet">
    <div class="head">
      <div>
        <h1>${esc(office.name)}</h1>
        <div class="sub">শাখা / Branch: ${esc(office.branch || "—")} &nbsp;•&nbsp; অফিস কোড: ${esc(office.code)}</div>
        <div class="sub">মাসিক হিসাব রিপোর্ট — ${esc(data.monthName)} (${esc(monthLabelBn(data.year, data.month))})</div>
        <div class="sub">সময়কাল: ${esc(range)} &nbsp;•&nbsp; MonthID: ${esc(data.id)}</div>
      </div>
      <div class="meta">
        <div><strong>Mess Meal Manager</strong></div>
        <div>তৈরির সময়: ${esc(generatedAt)}</div>
        <div>ম্যানেজার: ${esc(office.managerName || "—")}</div>
        <div>মোট দিন: ${data.totalDays}</div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="k">সক্রিয় সদস্য</div><div class="v">${summary.activeMembers}</div></div>
      <div class="kpi"><div class="k">মোট মিল</div><div class="v">${formatMeal(summary.totalMill)}</div></div>
      <div class="kpi"><div class="k">মিল রেট</div><div class="v">৳ ${formatRate(summary.perMillRate)}</div></div>
      <div class="kpi"><div class="k">মোট বাজার</div><div class="v">৳ ${formatMoney(summary.totalBazarCost)}</div></div>
      <div class="kpi"><div class="k">অন্যান্য আয়</div><div class="v">৳ ${formatMoney(summary.totalOthersIncome)}</div></div>
      <div class="kpi"><div class="k">নেট মিল খরচ</div><div class="v">৳ ${formatMoney(summary.netCost)}</div></div>
      <div class="kpi"><div class="k">স্থায়ী তহবিল</div><div class="v">৳ ${formatMoney(summary.totalFund)}</div></div>
      <div class="kpi"><div class="k">শেয়ার্ড অতিরিক্ত</div><div class="v">৳ ${formatMoney(summary.totalSharedExtra)}</div></div>
      <div class="kpi"><div class="k">ইন্ডিভিজুয়াল অতিরিক্ত</div><div class="v">৳ ${formatMoney(summary.totalIndividualExtra)}</div></div>
      <div class="kpi"><div class="k">লাস্ট ব্যালেন্স</div><div class="v">৳ ${formatMoney(summary.lastBalance)}</div></div>
    </div>

    <h2>১. সদস্য হিসাব সামারি / Member Summary</h2>
    <table>
      <thead>
        <tr>
          <th class="c">#</th><th>সদস্য</th><th class="r">মোট মিল</th>
          <th class="r">মিল রেট</th><th class="r">মিল খরচ</th><th class="r">ইন্ডি. অতিরিক্ত</th>
          <th class="r">শেয়ার্ড অতিরিক্ত</th><th class="r">মোট খরচ (−)</th><th class="r">জমা / সমন্বয়</th>
          <th class="r">নিজের টাকা থেকে বাজার</th>${hasJer ? `<th class="r">জের (প্রারম্ভিক)</th><th class="r">জের সমন্বয়</th><th class="r">বাকি জের</th>` : ""}<th class="r">দেনা-পাওনা</th><th class="r">স্থায়ী ফান্ড</th><th class="c">স্ট্যাটাস</th>
        </tr>
      </thead>
      <tbody>
        ${memberRows || `<tr><td colspan="13" class="c">কোনো সদস্য পাওয়া যায়নি</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="r">মোট</td>
          <td class="r">${formatMeal(summary.totalMill)}</td>
          <td class="r">${formatRate(summary.perMillRate)}</td>
          <td class="r">${formatMoney(round2(summary.memberCalculations.reduce((s, m) => s + m.mealCost, 0)))}</td>
          <td class="r">${formatMoney(summary.totalIndividualExtra)}</td>
          <td class="r">${formatMoney(summary.totalSharedExtra)}</td>
          <td class="r">${formatMoney(round2(summary.memberCalculations.reduce((s, m) => s + m.totalCost, 0)))}</td>
          <td class="r">${formatMoney(summary.totalFund)}</td>
          <td class="r">দিবে ৳${formatMoney(totalDue)} / পাবে ৳${formatMoney(totalReceive)}</td>
          <td class="c">—</td>
        </tr>
      </tfoot>
    </table>
    <div class="note">
      মিল রেট = (মোট বাজার − অন্য আয়) ÷ মোট মিল = (${formatMoney(summary.totalBazarCost)} − ${formatMoney(
        summary.totalOthersIncome,
      )}) ÷ ${formatMeal(summary.totalMill)} = ৳ ${formatRate(summary.perMillRate)}।
      স্থায়ী ফান্ড মিল খরচ থেকে বাদ দেওয়া হয় না (আলাদা স্তম্ভ)।
      শেয়ার্ড অতিরিক্ত = ${formatMoney(summary.totalSharedExtra)} ÷ ${summary.activeMembers} জন সক্রিয় সদস্য = ৳ ${formatMoney(
        summary.activeMembers ? summary.totalSharedExtra / summary.activeMembers : 0,
      )} জনপ্রতি।
    </div>
    ${paymentTableHtml}

    <h2>২. বাজার খরচ সামারি / Bazar Summary</h2>
    <div class="two">
      <div>
        <table>
          <thead><tr><th>ক্যাটাগরি</th><th class="r">খরচ</th></tr></thead>
          <tbody>${catRows || `<tr><td colspan="2" class="c">এই মাসে কোনো বাজার এন্ট্রি নেই</td></tr>`}</tbody>
          <tfoot><tr><td>মোট বাজার</td><td class="r">৳ ${formatMoney(summary.totalBazarCost)}</td></tr></tfoot>
        </table>
      </div>
      <div>
        <table>
          <thead><tr><th>ক্রেতা / Buyer</th><th class="r">খরচ</th></tr></thead>
          <tbody>${buyerRows || `<tr><td colspan="2" class="c">—</td></tr>`}</tbody>
          <tfoot><tr><td>মোট</td><td class="r">৳ ${formatMoney(summary.totalBazarCost)}</td></tr></tfoot>
        </table>
      </div>
    </div>

    <h2>৩. বাজার এন্ট্রি তালিকা / Bazar Entries</h2>
    <table>
      <thead><tr><th class="c">তারিখ</th><th>ক্রেতা</th><th>ক্যাটাগরি</th><th>আইটেম</th><th class="r">পরিমাণ</th><th>নোট</th></tr></thead>
      <tbody>${bazarRows || `<tr><td colspan="6" class="c">এই মাসে কোনো বাজার এন্ট্রি নেই</td></tr>`}</tbody>
    </table>

    <h2>৪. আয় সামারি / Other Income</h2>
    <table>
      <thead><tr><th class="c">তারিখ</th><th>খাত</th><th class="r">পরিমাণ</th><th>নোট</th></tr></thead>
      <tbody>${incomeRows || `<tr><td colspan="4" class="c">কোনো আয় এন্ট্রি নেই</td></tr>`}</tbody>
      <tfoot><tr><td colspan="2" class="r">মোট অন্যান্য আয়</td><td class="r">৳ ${formatMoney(
        summary.totalOthersIncome,
      )}</td><td></td></tr></tfoot>
    </table>

    <h2>৫. জমা ও স্থায়ী তহবিল / Fund</h2>
    <table>
      <thead><tr><th class="c">তারিখ</th><th>সদস্য</th><th class="r">পরিমাণ</th><th>ধরন</th><th>নোট</th></tr></thead>
      <tbody>${fundRows || `<tr><td colspan="5" class="c">কোনো জমা এন্ট্রি নেই</td></tr>`}</tbody>
      <tfoot><tr><td colspan="2" class="r">মোট স্থায়ী তহবিল</td><td class="r">৳ ${formatMoney(
        summary.totalFund,
      )}</td><td colspan="2"></td></tr></tfoot>
    </table>
    <div class="note">⚠ স্থায়ী তহবিল = স্থায়ী মূলধন। এটি মাসিক মিল খরচ থেকে কখনো বাদ দেওয়া হয় না।</div>

    <h2>৬. অতিরিক্ত খরচ / Extra Expenses</h2>
    <table>
      <thead><tr><th class="c">তারিখ</th><th>খাত</th><th class="c">ধরন</th><th>সদস্য</th><th class="r">পরিমাণ</th></tr></thead>
      <tbody>${extraRows || `<tr><td colspan="5" class="c">কোনো অতিরিক্ত খরচ নেই</td></tr>`}</tbody>
    </table>

    <h2>৭. দেনা-পাওনা / Dena-Paona</h2>
    <table>
      <thead><tr><th>সদস্য</th><th class="r">মোট খরচ (−)</th><th class="r">জমা / সমন্বয়</th><th class="r">নিজের টাকা থেকে বাজার</th>${hasJer ? `<th class="r">বাকি জের</th>` : ""}<th class="r">দেনা-পাওনা</th><th class="c">স্ট্যাটাস</th></tr></thead>
      <tbody>
        ${
          summary.memberCalculations
            .map(
              (m) =>
                `<tr><td>${esc(m.name)}</td><td class="r">−৳${formatMoney(m.totalCost)}</td><td class="r">৳${formatMoney(
                  m.totalDeposit,
                )}</td><td class="r">${
                  m.selfPaidBazar > 0 ? `৳${formatMoney(m.selfPaidBazar)}` : "—"
                }</td>${hasJer ? `<td class="r">${(m.remainingJer ?? 0) > 0 ? `৳${formatMoney(m.remainingJer ?? 0)}` : "—"}</td>` : ""}<td class="r b">${m.denaPoana < 0 ? "−" : m.denaPoana > 0 ? "+" : ""}৳${formatMoney(
                  Math.abs(m.denaPoana),
                )}</td><td class="c"><span class="pill ${m.statusEn.toLowerCase()}">${esc(
                  m.status,
                )} / ${esc(m.statusEn)}</span></td></tr>`,
            )
            .join("") || `<tr><td colspan="${hasJer ? 7 : 6}" class="c">কোনো সদস্য পাওয়া যায়নি</td></tr>`
        }
      </tbody>
      <tfoot>
        <tr>
          <td class="r">মোট</td>
          <td class="r">৳ ${formatMoney(round2(summary.memberCalculations.reduce((s, m) => s + m.totalCost, 0)))}</td>
          <td class="r">৳ ${formatMoney(round2(summary.memberCalculations.reduce((s, m) => s + m.totalDeposit, 0)))}</td>
          <td class="r">৳ ${formatMoney(summary.totalSelfPaidBazar)}</td>
          ${hasJer ? `<td class="r">৳ ${formatMoney(summary.totalRemainingJer ?? 0)}</td>` : ""}
          <td class="r">দিবে ৳ ${formatMoney(totalDue)} • পাবে ৳ ${formatMoney(totalReceive)}</td>
          <td class="c">—</td>
        </tr>
      </tfoot>
    </table>

    <div class="rules">
      <strong>অপরিবর্তনীয় হিসাব নিয়ম:</strong>
      ১) স্থায়ী ফান্ড আলাদা হিসাব • ২) ফান্ড মাসিক মিল চার্জ থেকে বাদ যাবে না •
      ৩) মিল রেট = (বাজার − অন্য আয়) ÷ মোট মিল • ৪) Individual Extra নির্দিষ্ট সদস্যের উপর •
      ৫) Shared Extra সক্রিয় সদস্যদের মধ্যে সমান ভাগ • ৬) প্রতিটি অফিসের তথ্য আলাদা •
      ৭) প্রতিটি মাসের হিসাব আলাদা • ৮) আগের মাস সবসময় দেখা যাবে •
      ৯) আগের মাসের বাকি (জের) নতুন মাসে নিজের টাকার বাজার বা নগদ পরিশোধ থেকে আগে সমন্বয় হয়; লাস্ট ব্যালেন্স হলো হাতে থাকা নগদ, বাকি জের সদস্য-দেনা হিসেবে আলাদা দেখানো হয়।
    </div>

    <div class="sign">
      <div>প্রস্তুতকারী / Prepared by${input.preparedBy ? ` — ${esc(input.preparedBy)}` : ""}</div>
      <div>পরীক্ষাকারী / Checked by</div>
      <div>অনুমোদনকারী / Approved by</div>
    </div>
  </div>
</body>
</html>`;
}

export function printFilename(office: OfficeDTO, data: MessData): string {
  return `Mess-Report_${office.code}_${data.year}-${String(data.month).padStart(2, "0")}`
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_");
}
