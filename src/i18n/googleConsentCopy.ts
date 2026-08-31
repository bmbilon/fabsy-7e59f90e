import type { LocaleCode } from './locale-policy.mjs';

type GoogleConsentCopy = {
  title: string;
  body: string;
  scope: string;
  changeHint: string;
  allow: string;
  decline: string;
  withdraw: string;
  close: string;
  settings: string;
  privacyPolicy: string;
  unknownStatus: string;
  acceptedStatus: string;
  declinedStatus: string;
};

// Standalone measurement UI copy. Non-English text is machine translated;
// this file does not claim native/legal review or change the service agreement.
export const googleConsentCopy: Record<LocaleCode, GoogleConsentCopy> = {
  en: {
    title: 'Your privacy choices',
    body: 'Allow Google Analytics and Google Ads cookies to measure visits to public pages and completed purchases? This helps us understand how people find Fabsy.',
    scope: 'No personalized ads. Google tags stay off ticket and contact forms. Cloudflare site analytics are separate.',
    changeHint: 'You can change your choice at any time.',
    allow: 'Allow measurement',
    decline: 'No thanks',
    withdraw: 'Withdraw permission',
    close: 'Close',
    settings: 'Privacy choices',
    privacyPolicy: 'Privacy policy',
    unknownStatus: 'Google measurement is off until you choose.',
    acceptedStatus: 'Google measurement is allowed on eligible pages.',
    declinedStatus: 'Google measurement is off.',
  },
  pa: {
    title: 'ਤੁਹਾਡੀਆਂ ਪਰਦੇਦਾਰੀ ਚੋਣਾਂ',
    body: 'ਕੀ ਤੁਸੀਂ Google Analytics ਅਤੇ Google Ads ਦੀਆਂ ਕੂਕੀਜ਼ ਨੂੰ ਜਨਤਕ ਪੰਨਿਆਂ ਦੇ ਦੌਰੇ ਅਤੇ ਪੂਰੀਆਂ ਹੋਈਆਂ ਖਰੀਦਾਂ ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਦਿੰਦੇ ਹੋ? ਇਸ ਨਾਲ ਪਤਾ ਲੱਗਦਾ ਹੈ ਕਿ ਲੋਕ Fabsy ਤੱਕ ਕਿਵੇਂ ਪਹੁੰਚਦੇ ਹਨ।',
    scope: 'ਨਿੱਜੀ ਰੁਚੀ ਅਨੁਸਾਰ ਇਸ਼ਤਿਹਾਰ ਨਹੀਂ। ਟਿਕਟ ਅਤੇ ਸੰਪਰਕ ਫਾਰਮਾਂ ਉੱਤੇ Google ਟੈਗ ਨਹੀਂ ਚੱਲਦੇ। Cloudflare ਦੇ ਸਾਈਟ ਅੰਕੜੇ ਵੱਖਰੇ ਹਨ।',
    changeHint: 'ਤੁਸੀਂ ਆਪਣੀ ਚੋਣ ਕਿਸੇ ਵੀ ਵੇਲੇ ਬਦਲ ਸਕਦੇ ਹੋ।',
    allow: 'ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਦਿਓ',
    decline: 'ਨਹੀਂ, ਧੰਨਵਾਦ',
    withdraw: 'ਇਜਾਜ਼ਤ ਵਾਪਸ ਲਓ',
    close: 'ਬੰਦ ਕਰੋ',
    settings: 'ਪਰਦੇਦਾਰੀ ਚੋਣਾਂ',
    privacyPolicy: 'ਪਰਦੇਦਾਰੀ ਨੀਤੀ (ਅੰਗਰੇਜ਼ੀ)',
    unknownStatus: 'ਤੁਹਾਡੀ ਚੋਣ ਤੱਕ Google ਮਾਪਣ ਬੰਦ ਹੈ।',
    acceptedStatus: 'ਯੋਗ ਪੰਨਿਆਂ ਉੱਤੇ Google ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਹੈ।',
    declinedStatus: 'Google ਮਾਪਣ ਬੰਦ ਹੈ।',
  },
  tl: {
    title: 'Mga pagpipilian mo sa privacy',
    body: 'Payagan ang cookies ng Google Analytics at Google Ads na sukatin ang mga pagbisita sa pampublikong pahina at mga nakumpletong pagbili? Nakakatulong ito para malaman namin kung paano nahanap ng mga tao ang Fabsy.',
    scope: 'Walang patalastas na iniangkop sa iyong interes. Hindi gumagana ang mga Google tag sa mga form para sa tiket at pakikipag-ugnayan. Hiwalay ang pagsusuri ng Cloudflare sa paggamit ng site.',
    changeHint: 'Maaari mong baguhin ang iyong pagpili anumang oras.',
    allow: 'Payagan ang pagsukat',
    decline: 'Hindi, salamat',
    withdraw: 'Bawiin ang pahintulot',
    close: 'Isara',
    settings: 'Mga pagpipilian sa privacy',
    privacyPolicy: 'Patakaran sa privacy (Ingles)',
    unknownStatus: 'Naka-off ang pagsukat ng Google hangga’t hindi ka pumipili.',
    acceptedStatus: 'Pinapayagan ang pagsukat ng Google sa mga angkop na pahina.',
    declinedStatus: 'Naka-off ang pagsukat ng Google.',
  },
  'zh-hans': {
    title: '您的隐私选择',
    body: '允许 Google Analytics 和 Google Ads 使用 Cookie 统计公开页面访问和已完成的购买吗？这有助于了解访客如何找到 Fabsy。',
    scope: '不投放个性化广告。Google 标签不会在罚单或联系表单页面运行。Cloudflare 网站统计独立于此选项。',
    changeHint: '您可以随时更改选择。',
    allow: '允许统计',
    decline: '不用，谢谢',
    withdraw: '撤回许可',
    close: '关闭',
    settings: '隐私选择',
    privacyPolicy: '隐私政策（英文）',
    unknownStatus: '在您作出选择之前，Google 统计保持关闭。',
    acceptedStatus: '已允许在符合条件的页面使用 Google 统计。',
    declinedStatus: 'Google 统计已关闭。',
  },
  'zh-hant': {
    title: '您的隱私選擇',
    body: '是否允許 Google Analytics 和 Google Ads 使用 Cookie 統計公開頁面的瀏覽及已完成的購買？這有助於了解訪客如何找到 Fabsy。',
    scope: '不投放個人化廣告。Google 標籤不會在罰單或聯絡表單頁面執行。Cloudflare 網站統計獨立於此選項。',
    changeHint: '您可以隨時更改選擇。',
    allow: '允許統計',
    decline: '不用，謝謝',
    withdraw: '撤回許可',
    close: '關閉',
    settings: '隱私選擇',
    privacyPolicy: '隱私政策（英文）',
    unknownStatus: '在您作出選擇之前，Google 統計保持關閉。',
    acceptedStatus: '已允許在符合條件的頁面使用 Google 統計。',
    declinedStatus: 'Google 統計已關閉。',
  },
  ar: {
    title: 'خيارات الخصوصية الخاصة بك',
    body: 'هل تسمح لملفات تعريف الارتباط من Google Analytics وGoogle Ads بقياس زيارات الصفحات العامة وعمليات الشراء المكتملة؟ يساعدنا ذلك على فهم كيف يصل الناس إلى Fabsy.',
    scope: 'لا إعلانات مخصصة. لا تعمل علامات Google على نماذج المخالفات أو التواصل. تحليلات الموقع من Cloudflare منفصلة عن هذا الاختيار.',
    changeHint: 'يمكنك تغيير اختيارك في أي وقت.',
    allow: 'السماح بالقياس',
    decline: 'لا، شكرًا',
    withdraw: 'سحب الإذن',
    close: 'إغلاق',
    settings: 'خيارات الخصوصية',
    privacyPolicy: 'سياسة الخصوصية (بالإنجليزية)',
    unknownStatus: 'قياس Google متوقف إلى أن تختار.',
    acceptedStatus: 'قياس Google مسموح على الصفحات المؤهلة.',
    declinedStatus: 'قياس Google متوقف.',
  },
  hi: {
    title: 'आपकी गोपनीयता के विकल्प',
    body: 'क्या आप Google Analytics और Google Ads की कुकीज़ को सार्वजनिक पेजों पर विज़िट और पूरी हुई खरीदारी मापने की अनुमति देना चाहते हैं? इससे हमें समझ आता है कि लोग Fabsy तक कैसे पहुँचते हैं।',
    scope: 'व्यक्तिगत रुचि के अनुसार विज्ञापन नहीं। टिकट और संपर्क फ़ॉर्म पर Google टैग नहीं चलते। Cloudflare के साइट आँकड़े इस विकल्प से अलग हैं।',
    changeHint: 'आप अपना विकल्प कभी भी बदल सकते हैं।',
    allow: 'मापने की अनुमति दें',
    decline: 'नहीं, धन्यवाद',
    withdraw: 'अनुमति वापस लें',
    close: 'बंद करें',
    settings: 'गोपनीयता के विकल्प',
    privacyPolicy: 'गोपनीयता नीति (अंग्रेज़ी)',
    unknownStatus: 'आपके विकल्प चुनने तक Google मापन बंद है।',
    acceptedStatus: 'पात्र पेजों पर Google मापन की अनुमति है।',
    declinedStatus: 'Google मापन बंद है।',
  },
  es: {
    title: 'Tus opciones de privacidad',
    body: '¿Permites que las cookies de Google Analytics y Google Ads midan las visitas a páginas públicas y las compras completadas? Nos ayuda a entender cómo llegan las personas a Fabsy.',
    scope: 'Sin anuncios personalizados. Las etiquetas de Google no se ejecutan en los formularios de multas ni de contacto. Las estadísticas de Cloudflare son independientes de esta opción.',
    changeHint: 'Puedes cambiar tu elección en cualquier momento.',
    allow: 'Permitir medición',
    decline: 'No, gracias',
    withdraw: 'Retirar permiso',
    close: 'Cerrar',
    settings: 'Opciones de privacidad',
    privacyPolicy: 'Política de privacidad (inglés)',
    unknownStatus: 'La medición de Google está desactivada hasta que elijas.',
    acceptedStatus: 'La medición de Google está permitida en las páginas aptas.',
    declinedStatus: 'La medición de Google está desactivada.',
  },
};
