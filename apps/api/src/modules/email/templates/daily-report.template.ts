interface DailyReportData {
  date: string;
  stats: {
    requestsToday: number;
    inputTokensToday: number;
    outputTokensToday: number;
    failedToday: number;
  };
  newUsers: Array<{ name: string; email: string; createdAt: Date }>;
  suspiciousUsers: Array<{ name: string; email: string; reason: string }>;
  heavyUsers: Array<{ name: string; email: string; tokens: number; requests: number }>;
}

export function dailyReportTemplate(data: DailyReportData): string {
  const totalTokens = data.stats.inputTokensToday + data.stats.outputTokensToday;

  const newUsersRows =
    data.newUsers.length === 0
      ? '<tr><td colspan="2" style="text-align:center;color:#999;padding:12px">لا يوجد مستخدمون جدد اليوم</td></tr>'
      : data.newUsers
          .map(
            (u) =>
              `<tr>
                <td style="padding:10px 14px;color:#333">${u.name}</td>
                <td style="padding:10px 14px;color:#555;font-size:13px">${u.email}</td>
              </tr>`,
          )
          .join('');

  const suspiciousRows =
    data.suspiciousUsers.length === 0
      ? '<tr><td colspan="3" style="text-align:center;color:#999;padding:12px">✅ لا يوجد مستخدمون مشبوهون</td></tr>'
      : data.suspiciousUsers
          .map(
            (u) =>
              `<tr>
                <td style="padding:10px 14px;color:#333">${u.name}</td>
                <td style="padding:10px 14px;color:#555;font-size:13px">${u.email}</td>
                <td style="padding:10px 14px;color:#e53e3e;font-size:13px">${u.reason}</td>
              </tr>`,
          )
          .join('');

  const heavyRows =
    data.heavyUsers.length === 0
      ? '<tr><td colspan="3" style="text-align:center;color:#999;padding:12px">لا يوجد استهلاك مرتفع اليوم</td></tr>'
      : data.heavyUsers
          .map(
            (u) =>
              `<tr>
                <td style="padding:10px 14px;color:#333">${u.name}</td>
                <td style="padding:10px 14px;color:#555;font-size:13px">${u.email}</td>
                <td style="padding:10px 14px;font-weight:600;color:#d97706">${u.tokens.toLocaleString('ar-SA')} رمز (${u.requests} طلب)</td>
              </tr>`,
          )
          .join('');

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>التقرير اليومي</title>
  <style>
    body { margin:0; padding:0; background:#f4f6fb; font-family:'Segoe UI',Tahoma,Arial,sans-serif; direction:rtl; }
    .wrap { max-width:640px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
    .hdr { background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); padding:32px; text-align:center; }
    .hdr h1 { color:#fff; margin:0; font-size:24px; }
    .hdr p { color:#8ecae6; margin:6px 0 0; font-size:13px; }
    .section { padding:24px 32px; }
    .section h3 { color:#1a1a2e; font-size:16px; margin:0 0 14px; border-bottom:2px solid #e8ecf4; padding-bottom:8px; }
    .stats-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; margin-bottom:8px; }
    .stat-card { background:#f8faff; border-radius:10px; padding:16px; text-align:center; border:1px solid #e8ecf4; }
    .stat-card .num { font-size:28px; font-weight:700; color:#0f3460; }
    .stat-card .lbl { font-size:12px; color:#888; margin-top:4px; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th { background:#f0f4ff; color:#1a1a2e; padding:10px 14px; text-align:right; font-weight:600; }
    tr:nth-child(even) { background:#fafbff; }
    .badge-warn { background:#fff7ed; color:#c05621; border-radius:6px; padding:3px 8px; font-size:12px; }
    .footer { background:#f4f6fb; padding:20px 32px; text-align:center; border-top:1px solid #e8ecf4; }
    .footer p { color:#999; font-size:12px; margin:0; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>✦ ثنارة AI — التقرير اليومي</h1>
    <p>${data.date}</p>
  </div>

  <!-- Stats -->
  <div class="section">
    <h3>📊 إحصائيات اليوم</h3>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="num">${data.stats.requestsToday.toLocaleString('ar-SA')}</div>
        <div class="lbl">إجمالي الطلبات</div>
      </div>
      <div class="stat-card">
        <div class="num">${totalTokens.toLocaleString('ar-SA')}</div>
        <div class="lbl">إجمالي الرموز المستخدمة</div>
      </div>
      <div class="stat-card">
        <div class="num">${data.newUsers.length}</div>
        <div class="lbl">مستخدم جديد</div>
      </div>
      <div class="stat-card">
        <div class="num" style="color:${data.stats.failedToday > 0 ? '#e53e3e' : '#38a169'}">${data.stats.failedToday}</div>
        <div class="lbl">طلبات فاشلة</div>
      </div>
    </div>
  </div>

  <!-- New Users -->
  <div class="section" style="padding-top:0">
    <h3>👤 المستخدمون الجدد (${data.newUsers.length})</h3>
    <table>
      <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th></tr></thead>
      <tbody>${newUsersRows}</tbody>
    </table>
  </div>

  <!-- Suspicious Users -->
  <div class="section" style="padding-top:0">
    <h3>⚠️ مستخدمون مشبوهون (${data.suspiciousUsers.length})</h3>
    <table>
      <thead><tr><th>الاسم</th><th>البريد</th><th>السبب</th></tr></thead>
      <tbody>${suspiciousRows}</tbody>
    </table>
  </div>

  <!-- Heavy Users -->
  <div class="section" style="padding-top:0">
    <h3>🔥 أعلى استهلاك اليوم</h3>
    <table>
      <thead><tr><th>الاسم</th><th>البريد</th><th>الاستهلاك</th></tr></thead>
      <tbody>${heavyRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>© ${new Date().getFullYear()} ثنارة AI · هذا تقرير آلي يومي · ai@thanarah.com</p>
  </div>
</div>
</body>
</html>
`;
}
