import type { ConsentFormData } from "../functions/_shared/consent-pdf.ts";
import type { PreferredLocale } from "../functions/_shared/locale-policy.ts";

export const CONSENT_FIXTURE_DATE = "2026-08-30T18:30:00.000Z";
const baseline: ConsentFormData = {
  submissionId: "00000000-0000-4000-8000-000000000001",
  firstName: "Alex", lastName: "Example", email: "synthetic@example.invalid", phone: "403-555-0100",
  address: "123 Example Street", city: "Calgary", province: "Alberta", postalCode: "T2P 1A1",
  driversLicense: "AB-123456", ticketNumber: "AB 12345", violation: "Speeding (80 km/h in a 50 km/h zone)",
  issueDate: "2026-08-30", digitalSignature: "Alex Example",
};
const cases: Array<[PreferredLocale, string, string, string]> = [
  ["en", "Alex", "Example", "Speeding (80 km/h in a 50 km/h zone)"],
  ["pa", "ਹਰਪ੍ਰੀਤ", "ਸਿੰਘ", "ਤੇਜ਼ ਰਫ਼ਤਾਰ ਨਾਲ ਗੱਡੀ ਚਲਾਉਣਾ (80 km/h), ਟਿਕਟ AB-123"],
  ["tl", "María", "Dela Cruz", "Pagmamaneho nang lampas sa takdang bilis (80 km/h)"],
  ["zh-hans", "王", "晓明", "超速行驶：80公里/小时（限速50公里/小时），票号 AB-123"],
  ["zh-hant", "陳", "曉明", "超速行駛：80公里/小時（限速50公里/小時），票號 AB-123。骨直令"],
  ["ar", "أَحْمَدُ", "السَّيِّد", "مخالفة سرعة (80 km/h) في منطقة 50 - رقم 123"],
  ["hi", "प्रियंका", "श्रीवास्तव", "तेज़ गति से गाड़ी चलाना (80 km/h), टिकट AB-123। क्षि त्रि श्रद्धा"],
  ["es", "José", "Muñoz", "Exceso de velocidad (80 km/h); información del conductor"],
];

export const CONSENT_FIXTURES: Array<{ name: string; locale: PreferredLocale; fields: ConsentFormData }> = cases.map(([locale, firstName, lastName, violation]) => ({
  name: locale,
  locale,
  fields: { ...baseline, firstName, lastName, violation, digitalSignature: `${firstName} ${lastName}`,
    ...(locale === "ar" ? { address: "123 شارع النور (Calgary)", city: "كالجاري" } : {}),
  },
}));

CONSENT_FIXTURES.push({
  name: "long-mixed",
  locale: "pa",
  fields: {
    ...baseline,
    firstName: "ਹਰਪ੍ਰੀਤ",
    lastName: "ਸਿੰਘ أحمد",
    digitalSignature: "  ਹਰਪ੍ਰੀਤ ਸਿੰਘ أحمد  ",
    address: "123 Example Street\r\nSuite 456\tਕੈਲਗਰੀ",
    violation: ("ਪ੍ਰੀਤ ਸਿੰਘ — क्षि त्रि श्रद्धा — 超速行駛 — أَحْمَدُ (AB-123)\n").repeat(22),
  },
});
