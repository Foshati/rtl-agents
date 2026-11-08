/**
 * Representative Persian technical chat text.
 *
 * Roughly 40% of these lines open with a strong left-to-right character — an API
 * name, a shell command, an acronym. Under first-strong resolution
 * (`unicode-bidi: plaintext`) every one of them flips the whole paragraph to LTR:
 * left-aligned, with the trailing Persian punctuation stranded on the wrong side.
 * That is the regression this corpus exists to catch.
 */
export const PERSIAN_CORPUS: string[] = [
  'پک‌پست (PackPost) یک مارکت‌پلیس نظیربه‌نظیر (P2P) برای فروش ظرفیت خالی چمدان است.',
  'PackPost یک مارکت‌پلیس نظیربه‌نظیر برای فروش ظرفیت خالی چمدان مسافران است.',
  'Next.js را با دستور زیر نصب کنید و سپس پروژه را اجرا کنید.',
  'npm install را در ریشه پروژه اجرا کنید.',
  'API لایه با Hono.js پیاده‌سازی شده است.',
  'OTP ارسال‌شده را در کادر زیر وارد کنید.',
  'PostgreSQL با Drizzle ORM برای لایه داده استفاده می‌شود.',
  'super_admin بالاترین سطح دسترسی را دارد.',
  'Better-Auth متمرکز بر شماره همراه و SMS OTP است.',
  'لایه API: فریمورک فوق‌سریع Hono.js که داخل Next.js مانت شده است.',
  'دیتابیس: PostgreSQL با Drizzle ORM (طرح کامل جدول‌ها از قبل تعریف شده).',
  'احراز هویت: Better-Auth متمرکز بر شماره همراه و SMS OTP.',
  'پرداخت: ادپترهای درگاه Thawani (عمان) و Tap Payments (خلیج فارس).',
  'محور سازمانی/دسترسی: user (کاربر عادی)، admin (مدیر)، super_admin (مدیر ارشد).',
  'محور بازار/اعتبار (Marketplace Capabilities): هر کاربر می‌تواند فرستنده باشد.',
  'گام ۱ (هسته API و پرداخت - Session B): اندپوئینت‌های بارها و آفرها.',
  'گام ۲ (فرانت‌فرستنده - Session C): ویزارد ۳ مرحله‌ای ثبت بار.',
  '۱. ماهیت پروژه و رویکرد اصلی (دقیقاً داریم چی می‌سازیم؟)',
  '۲. نقش‌ها و رتبه‌بندی کاربران (Roles & Personas)',
  '2024 سالی بود که این پروژه شروع شد.',
  'مکانیزم چت یا ارتباط امن پس از توافق (Anti-Leakage):',
  'چک‌لیست تصویری تحویل در مبدا (Inspection Photo Proof):',
  'پیامک مستقل از اینترنت برای گیرنده (Airport Offline Resilience):',
  'هنگام وارد کردن Pickup OTP توسط مسافر، مسافر می‌تواند ۲ عکس آپلود کند.',
  'Delivery OTP صرفاً از طریق پیامک مخابراتی ارسال می‌شود.',
  'ترتیب ساخت کدها: همان‌طور که در پلن آمده، پیشنهاد می‌کنم به ترتیب پیش برویم.',
  'Escrow یا امانت‌دار مالی، بزرگ‌ترین دامی بود که پلتفرم‌ها در آن شکست خوردند.',
  'hc<AppType> بدون نیاز به فچ‌های دستی، ارتباط type-safe فراهم می‌کند.',
  'در پک‌پست: پلتفرم یک تابلوی آگهی امن و هوشمند است.',
  'RTL و LTR هر دو باید به‌درستی پشتیبانی شوند.',
]

// The detector lives in src/bidi.ts so the runtime and the tests share one
// implementation; re-exported here for anything that imported it from the corpus.
export { firstStrongDirection } from '../src/bidi'
