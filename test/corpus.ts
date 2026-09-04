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

type CodeRange = readonly [number, number]

/** Bidi class L — Latin, Latin Extended, Greek and Cyrillic letters. */
const STRONG_LTR_RANGES: readonly CodeRange[] = [
  [0x0041, 0x005A], // A-Z
  [0x0061, 0x007A], // a-z
  [0x00C0, 0x024F], // Latin-1 Supplement + Latin Extended-A/B
  [0x0370, 0x03FF], // Greek
  [0x0400, 0x04FF], // Cyrillic
]

/**
 * Bidi classes R and AL — Hebrew and Arabic letters, including the Persian
 * additions (پ چ ژ گ ک ی) that live in U+066E-U+06D3, plus presentation forms.
 *
 * The gaps matter as much as the ranges. Both digit blocks are absent —
 * U+0660-U+0669 are AN and U+06F0-U+06F9 are EN, neither of them strong — which
 * is why a line opening with a number still takes its direction from the Persian
 * word after it. Arabic punctuation (U+060C, U+061B, U+061F) is absent for the
 * same reason, and the presentation forms stop at U+FEFC because U+FEFF is a
 * zero-width no-break space rather than a letter.
 */
const STRONG_RTL_RANGES: readonly CodeRange[] = [
  [0x05D0, 0x05EA], // Hebrew letters
  [0x05EF, 0x05F2], // Hebrew ligatures
  [0x0620, 0x064A], // Arabic letters
  [0x066E, 0x06D3], // Arabic letters incl. Persian
  [0x06D5, 0x06D5],
  [0x06E5, 0x06E6],
  [0x06EE, 0x06EF],
  [0x06FA, 0x06FF],
  [0x0750, 0x077F], // Arabic Supplement
  [0x08A0, 0x08BD], // Arabic Extended-A
  [0xFB1D, 0xFB4F], // Hebrew presentation forms
  [0xFB50, 0xFDFD], // Arabic presentation forms A
  [0xFE70, 0xFEFC], // Arabic presentation forms B
]

function inRanges(codePoint: number, ranges: readonly CodeRange[]): boolean {
  return ranges.some(([low, high]) => codePoint >= low && codePoint <= high)
}

export function firstStrongDirection(text: string): 'ltr' | 'rtl' | 'neutral' {
  for (const ch of text) {
    const codePoint = ch.codePointAt(0)
    if (codePoint === undefined) {
      continue
    }
    if (inRanges(codePoint, STRONG_RTL_RANGES)) {
      return 'rtl'
    }
    if (inRanges(codePoint, STRONG_LTR_RANGES)) {
      return 'ltr'
    }
  }
  return 'neutral'
}
