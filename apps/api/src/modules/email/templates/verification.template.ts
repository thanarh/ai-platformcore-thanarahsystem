export function verificationTemplate(firstName: string, verifyLink: string): string {
  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>تحقق من بريدك</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f6fb; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }
    .wrapper { max-width: 580px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px 32px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px; }
    .header p { color: #8ecae6; margin: 8px 0 0; font-size: 14px; }
    .body { padding: 40px 32px; }
    .body h2 { color: #1a1a2e; font-size: 22px; margin: 0 0 16px; }
    .body p { color: #555; line-height: 1.8; font-size: 15px; margin: 0 0 20px; }
    .btn { display: block; width: fit-content; margin: 28px auto; padding: 14px 40px; background: linear-gradient(135deg, #0f3460, #533483); color: #fff; text-decoration: none; border-radius: 10px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px; }
    .note { background: #f0f4ff; border-right: 4px solid #0f3460; border-radius: 8px; padding: 12px 16px; margin-top: 24px; }
    .note p { color: #444; font-size: 13px; margin: 0; }
    .footer { background: #f4f6fb; padding: 24px 32px; text-align: center; border-top: 1px solid #e8ecf4; }
    .footer p { color: #999; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>✦ ثنارة AI</h1>
      <p>منصة الذكاء الاصطناعي العربية</p>
    </div>
    <div class="body">
      <h2>أهلاً ${firstName}! 👋</h2>
      <p>شكراً لتسجيلك في ثنارة AI. أنت على بُعد خطوة واحدة من البدء.</p>
      <p>اضغط على الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك:</p>
      <a href="${verifyLink}" class="btn">✅ تحقق من البريد الإلكتروني</a>
      <div class="note">
        <p>⏰ هذا الرابط صالح لمدة <strong>24 ساعة</strong> فقط.</p>
        <p style="margin-top:6px">إذا لم تطلب هذا، يمكنك تجاهل هذا البريد بأمان.</p>
      </div>
      <p style="margin-top:28px; font-size:13px; color:#aaa; word-break:break-all;">
        أو انسخ هذا الرابط: <br/>${verifyLink}
      </p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ثنارة AI · ai@thanarah.com</p>
    </div>
  </div>
</body>
</html>
`;
}
