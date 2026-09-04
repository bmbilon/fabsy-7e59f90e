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
  googleOnlyStatus: string;
  metaOnlyStatus: string;
  mixedStatus: string;
};

// Standalone measurement UI copy. Non-English text is machine translated;
// this file does not claim native/legal review or change the service agreement.
export const googleConsentCopy: Record<LocaleCode, GoogleConsentCopy> = {
  en: {
    title: 'Your privacy choices',
    body: 'Allow Fabsy’s first-party funnel measurement and Google Analytics, Google Ads and Meta Pixel cookies to measure visits, key progress steps and completed purchases? This helps us understand how people find and use Fabsy.',
    scope: 'Fabsy funnel events contain only named steps and campaign fields: no form contents, IP address or user agent, and ad click IDs are hashed. Google ad personalization is off. Meta automatic events, advanced matching and customer lists are not used. Google and Meta tags stay off ticket and contact forms. Cloudflare site analytics are separate.',
    changeHint: 'You can change your choice at any time.',
    allow: 'Allow measurement',
    decline: 'No thanks',
    withdraw: 'Withdraw permission',
    close: 'Close',
    settings: 'Privacy choices',
    privacyPolicy: 'Privacy policy',
    unknownStatus: 'Fabsy, Google and Meta measurement are off until you choose.',
    acceptedStatus: 'Fabsy, Google and Meta measurement are allowed on eligible pages.',
    declinedStatus: 'Fabsy, Google and Meta measurement are off.',
    googleOnlyStatus: 'Google measurement is allowed. Meta remains off until you choose both.',
    metaOnlyStatus: 'Meta measurement is allowed. Google remains off until you choose both.',
    mixedStatus: 'Fabsy, Google and Meta do not share one choice. Choose again to set all three.',
  },
  pa: {
    title: 'ਤੁਹਾਡੀਆਂ ਪਰਦੇਦਾਰੀ ਚੋਣਾਂ',
    body: 'ਕੀ ਤੁਸੀਂ Fabsy ਦੀ ਪਹਿਲੀ-ਪਾਰਟੀ ਫਨਲ ਮਾਪ ਅਤੇ Google Analytics, Google Ads ਅਤੇ Meta Pixel ਦੀਆਂ ਕੂਕੀਜ਼ ਨੂੰ ਦੌਰੇ, ਮੁੱਖ ਪ੍ਰਗਤੀ ਦੇ ਪੜਾਅ ਅਤੇ ਪੂਰੀਆਂ ਹੋਈਆਂ ਖਰੀਦਾਂ ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਦਿੰਦੇ ਹੋ? ਇਸ ਨਾਲ ਪਤਾ ਲੱਗਦਾ ਹੈ ਕਿ ਲੋਕ Fabsy ਤੱਕ ਕਿਵੇਂ ਪਹੁੰਚਦੇ ਅਤੇ ਇਸਦੀ ਵਰਤੋਂ ਕਰਦੇ ਹਨ।',
    scope: 'Fabsy ਫਨਲ ਇਵੈਂਟਾਂ ਵਿੱਚ ਸਿਰਫ਼ ਨਾਮਿਤ ਪੜਾਅ ਅਤੇ ਮੁਹਿੰਮ ਖੇਤਰ ਹੁੰਦੇ ਹਨ: ਫਾਰਮ ਦੀ ਸਮੱਗਰੀ, IP ਪਤਾ ਜਾਂ ਯੂਜ਼ਰ ਏਜੰਟ ਨਹੀਂ, ਅਤੇ ਇਸ਼ਤਿਹਾਰ ਕਲਿੱਕ ID ਨੂੰ ਹੈਸ਼ ਕੀਤਾ ਜਾਂਦਾ ਹੈ। Google ਦੇ ਨਿੱਜੀ ਰੁਚੀ ਅਨੁਸਾਰ ਇਸ਼ਤਿਹਾਰ ਬੰਦ ਹਨ। Meta ਦੇ ਆਟੋਮੈਟਿਕ ਇਵੈਂਟ, ਉੱਨਤ ਮੇਲ ਅਤੇ ਗਾਹਕ ਸੂਚੀਆਂ ਨਹੀਂ ਵਰਤੀਆਂ ਜਾਂਦੀਆਂ। ਟਿਕਟ ਅਤੇ ਸੰਪਰਕ ਫਾਰਮਾਂ ਉੱਤੇ Google ਅਤੇ Meta ਟੈਗ ਨਹੀਂ ਚੱਲਦੇ। Cloudflare ਦੇ ਸਾਈਟ ਅੰਕੜੇ ਵੱਖਰੇ ਹਨ।',
    changeHint: 'ਤੁਸੀਂ ਆਪਣੀ ਚੋਣ ਕਿਸੇ ਵੀ ਵੇਲੇ ਬਦਲ ਸਕਦੇ ਹੋ।',
    allow: 'ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਦਿਓ',
    decline: 'ਨਹੀਂ, ਧੰਨਵਾਦ',
    withdraw: 'ਇਜਾਜ਼ਤ ਵਾਪਸ ਲਓ',
    close: 'ਬੰਦ ਕਰੋ',
    settings: 'ਪਰਦੇਦਾਰੀ ਚੋਣਾਂ',
    privacyPolicy: 'ਪਰਦੇਦਾਰੀ ਨੀਤੀ (ਅੰਗਰੇਜ਼ੀ)',
    unknownStatus: 'ਤੁਹਾਡੀ ਚੋਣ ਤੱਕ Fabsy, Google ਅਤੇ Meta ਮਾਪਣ ਬੰਦ ਹਨ।',
    acceptedStatus: 'ਯੋਗ ਪੰਨਿਆਂ ਉੱਤੇ Fabsy, Google ਅਤੇ Meta ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਹੈ।',
    declinedStatus: 'Fabsy, Google ਅਤੇ Meta ਮਾਪਣ ਬੰਦ ਹਨ।',
    googleOnlyStatus: 'Google ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਹੈ। ਜਦੋਂ ਤੱਕ ਤੁਸੀਂ ਦੋਵਾਂ ਨੂੰ ਨਹੀਂ ਚੁਣਦੇ, Meta ਬੰਦ ਰਹਿੰਦਾ ਹੈ।',
    metaOnlyStatus: 'Meta ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਹੈ। ਜਦੋਂ ਤੱਕ ਤੁਸੀਂ ਦੋਵਾਂ ਨੂੰ ਨਹੀਂ ਚੁਣਦੇ, Google ਬੰਦ ਰਹਿੰਦਾ ਹੈ।',
    mixedStatus: 'Fabsy, Google ਅਤੇ Meta ਲਈ ਇੱਕੋ ਚੋਣ ਸੈੱਟ ਨਹੀਂ ਹੈ। ਤਿੰਨਾਂ ਨੂੰ ਸੈੱਟ ਕਰਨ ਲਈ ਮੁੜ ਚੁਣੋ।',
  },
  tl: {
    title: 'Mga pagpipilian mo sa privacy',
    body: 'Payagan ang sariling funnel measurement ng Fabsy at cookies ng Google Analytics, Google Ads at Meta Pixel na sukatin ang mga pagbisita, mahahalagang hakbang at nakumpletong pagbili? Nakakatulong ito para malaman namin kung paano nahanap at ginagamit ng mga tao ang Fabsy.',
    scope: 'Ang mga funnel event ng Fabsy ay may pangalan lamang ng hakbang at campaign fields: walang laman ng form, IP address o user agent, at naka-hash ang ad click ID. Naka-off ang pag-personalize ng Google ads. Hindi ginagamit ang awtomatikong Meta events, advanced matching o customer lists. Hindi gumagana ang Google at Meta tag sa mga form para sa tiket at pakikipag-ugnayan. Hiwalay ang pagsusuri ng Cloudflare sa paggamit ng site.',
    changeHint: 'Maaari mong baguhin ang iyong pagpili anumang oras.',
    allow: 'Payagan ang pagsukat',
    decline: 'Hindi, salamat',
    withdraw: 'Bawiin ang pahintulot',
    close: 'Isara',
    settings: 'Mga pagpipilian sa privacy',
    privacyPolicy: 'Patakaran sa privacy (Ingles)',
    unknownStatus: 'Naka-off ang pagsukat ng Fabsy, Google at Meta hangga’t hindi ka pumipili.',
    acceptedStatus: 'Pinapayagan ang pagsukat ng Fabsy, Google at Meta sa mga angkop na pahina.',
    declinedStatus: 'Naka-off ang pagsukat ng Fabsy, Google at Meta.',
    googleOnlyStatus: 'Pinapayagan ang pagsukat ng Google. Naka-off ang Meta hanggang piliin mo ang dalawa.',
    metaOnlyStatus: 'Pinapayagan ang pagsukat ng Meta. Naka-off ang Google hanggang piliin mo ang dalawa.',
    mixedStatus: 'Hindi iisa ang iyong mga pagpili para sa Fabsy, Google at Meta. Pumili muli upang itakda ang tatlo.',
  },
  'zh-hans': {
    title: '您的隐私选择',
    body: '是否允许 Fabsy 第一方漏斗统计以及 Google Analytics、Google Ads 和 Meta Pixel Cookie 统计访问、关键进度步骤和已完成的购买？这有助于了解访客如何找到并使用 Fabsy。',
    scope: 'Fabsy 漏斗事件只包含步骤名称和广告系列字段：不含表单内容、IP 地址或用户代理，广告点击 ID 会经过哈希处理。Google 广告个性化已关闭。不使用 Meta 自动事件、高级匹配或客户名单。Google 和 Meta 标签不会在罚单或联系表单页面运行。Cloudflare 网站统计独立于此选项。',
    changeHint: '您可以随时更改选择。',
    allow: '允许统计',
    decline: '不用，谢谢',
    withdraw: '撤回许可',
    close: '关闭',
    settings: '隐私选择',
    privacyPolicy: '隐私政策（英文）',
    unknownStatus: '在您作出选择之前，Fabsy、Google 和 Meta 统计保持关闭。',
    acceptedStatus: '已允许在符合条件的页面使用 Fabsy、Google 和 Meta 统计。',
    declinedStatus: 'Fabsy、Google 和 Meta 统计已关闭。',
    googleOnlyStatus: '已允许 Google 统计。在您同时选择两者之前，Meta 保持关闭。',
    metaOnlyStatus: '已允许 Meta 统计。在您同时选择两者之前，Google 保持关闭。',
    mixedStatus: '您对 Fabsy、Google 和 Meta 的选择不一致。请重新选择以同时设置三者。',
  },
  'zh-hant': {
    title: '您的隱私選擇',
    body: '是否允許 Fabsy 第一方漏斗統計以及 Google Analytics、Google Ads 和 Meta Pixel Cookie 統計瀏覽、關鍵進度步驟及已完成的購買？這有助於了解訪客如何找到並使用 Fabsy。',
    scope: 'Fabsy 漏斗事件只包含步驟名稱和廣告活動欄位：不含表單內容、IP 位址或使用者代理，廣告點擊 ID 會經過雜湊處理。Google 廣告個人化已關閉。不使用 Meta 自動事件、進階配對或客戶名單。Google 和 Meta 標籤不會在罰單或聯絡表單頁面執行。Cloudflare 網站統計獨立於此選項。',
    changeHint: '您可以隨時更改選擇。',
    allow: '允許統計',
    decline: '不用，謝謝',
    withdraw: '撤回許可',
    close: '關閉',
    settings: '隱私選擇',
    privacyPolicy: '隱私政策（英文）',
    unknownStatus: '在您作出選擇之前，Fabsy、Google 和 Meta 統計保持關閉。',
    acceptedStatus: '已允許在符合條件的頁面使用 Fabsy、Google 和 Meta 統計。',
    declinedStatus: 'Fabsy、Google 和 Meta 統計已關閉。',
    googleOnlyStatus: '已允許 Google 統計。在您同時選擇兩者之前，Meta 保持關閉。',
    metaOnlyStatus: '已允許 Meta 統計。在您同時選擇兩者之前，Google 保持關閉。',
    mixedStatus: '您對 Fabsy、Google 和 Meta 的選擇不一致。請重新選擇以同時設定三者。',
  },
  ar: {
    title: 'خيارات الخصوصية الخاصة بك',
    body: 'هل تسمح بقياس مسار الاستخدام من Fabsy وملفات تعريف الارتباط من Google Analytics وGoogle Ads وMeta Pixel لقياس الزيارات وخطوات التقدم الأساسية وعمليات الشراء المكتملة؟ يساعدنا ذلك على فهم كيف يصل الناس إلى Fabsy ويستخدمونه.',
    scope: 'تحتوي أحداث مسار Fabsy فقط على اسم الخطوة وحقول الحملة: لا محتوى للنماذج ولا عنوان IP ولا وكيل مستخدم، وتُجزّأ معرّفات نقرات الإعلانات. تخصيص إعلانات Google متوقف. لا نستخدم أحداث Meta التلقائية أو المطابقة المتقدمة أو قوائم العملاء. لا تعمل علامات Google وMeta على نماذج المخالفات أو التواصل. تحليلات الموقع من Cloudflare منفصلة عن هذا الاختيار.',
    changeHint: 'يمكنك تغيير اختيارك في أي وقت.',
    allow: 'السماح بالقياس',
    decline: 'لا، شكرًا',
    withdraw: 'سحب الإذن',
    close: 'إغلاق',
    settings: 'خيارات الخصوصية',
    privacyPolicy: 'سياسة الخصوصية (بالإنجليزية)',
    unknownStatus: 'قياس Fabsy وGoogle وMeta متوقف إلى أن تختار.',
    acceptedStatus: 'قياس Fabsy وGoogle وMeta مسموح على الصفحات المؤهلة.',
    declinedStatus: 'قياس Fabsy وGoogle وMeta متوقف.',
    googleOnlyStatus: 'قياس Google مسموح. يبقى Meta متوقفًا حتى تختار كليهما.',
    metaOnlyStatus: 'قياس Meta مسموح. يبقى Google متوقفًا حتى تختار كليهما.',
    mixedStatus: 'لا يوجد اختيار واحد لخدمات Fabsy وGoogle وMeta. اختر مرة أخرى لضبط الخدمات الثلاث.',
  },
  hi: {
    title: 'आपकी गोपनीयता के विकल्प',
    body: 'क्या आप Fabsy के प्रथम-पक्ष फ़नल मापन और Google Analytics, Google Ads तथा Meta Pixel कुकीज़ को विज़िट, मुख्य प्रगति चरण और पूरी हुई खरीदारी मापने की अनुमति देना चाहते हैं? इससे हमें समझ आता है कि लोग Fabsy तक कैसे पहुँचते और उसका उपयोग करते हैं।',
    scope: 'Fabsy फ़नल इवेंट में केवल चरण का नाम और अभियान फ़ील्ड होते हैं: फ़ॉर्म की सामग्री, IP पता या यूज़र एजेंट नहीं, और विज्ञापन क्लिक ID हैश की जाती है। Google विज्ञापन वैयक्तिकरण बंद है। Meta के स्वचालित इवेंट, उन्नत मिलान और ग्राहक सूचियाँ उपयोग नहीं की जातीं। टिकट और संपर्क फ़ॉर्म पर Google और Meta टैग नहीं चलते। Cloudflare के साइट आँकड़े इस विकल्प से अलग हैं।',
    changeHint: 'आप अपना विकल्प कभी भी बदल सकते हैं।',
    allow: 'मापने की अनुमति दें',
    decline: 'नहीं, धन्यवाद',
    withdraw: 'अनुमति वापस लें',
    close: 'बंद करें',
    settings: 'गोपनीयता के विकल्प',
    privacyPolicy: 'गोपनीयता नीति (अंग्रेज़ी)',
    unknownStatus: 'आपके विकल्प चुनने तक Fabsy, Google और Meta मापन बंद हैं।',
    acceptedStatus: 'पात्र पेजों पर Fabsy, Google और Meta मापन की अनुमति है।',
    declinedStatus: 'Fabsy, Google और Meta मापन बंद हैं।',
    googleOnlyStatus: 'Google मापन की अनुमति है। जब तक आप दोनों को नहीं चुनते, Meta बंद रहता है।',
    metaOnlyStatus: 'Meta मापन की अनुमति है। जब तक आप दोनों को नहीं चुनते, Google बंद रहता है।',
    mixedStatus: 'Fabsy, Google और Meta के लिए एक ही विकल्प तय नहीं है। तीनों को तय करने के लिए फिर से चुनें।',
  },
  es: {
    title: 'Tus opciones de privacidad',
    body: '¿Permites que la medición propia del embudo de Fabsy y las cookies de Google Analytics, Google Ads y Meta Pixel midan visitas, pasos clave y compras completadas? Nos ayuda a entender cómo las personas encuentran y usan Fabsy.',
    scope: 'Los eventos del embudo de Fabsy solo contienen el nombre del paso y campos de campaña: no incluyen contenido de formularios, dirección IP ni agente de usuario, y los ID de clic publicitario se guardan como hash. La personalización de anuncios de Google está desactivada. No usamos eventos automáticos, coincidencia avanzada ni listas de clientes de Meta. Las etiquetas de Google y Meta no se ejecutan en los formularios de multas ni de contacto. Las estadísticas de Cloudflare son independientes de esta opción.',
    changeHint: 'Puedes cambiar tu elección en cualquier momento.',
    allow: 'Permitir medición',
    decline: 'No, gracias',
    withdraw: 'Retirar permiso',
    close: 'Cerrar',
    settings: 'Opciones de privacidad',
    privacyPolicy: 'Política de privacidad (inglés)',
    unknownStatus: 'La medición de Fabsy, Google y Meta está desactivada hasta que elijas.',
    acceptedStatus: 'La medición de Fabsy, Google y Meta está permitida en las páginas aptas.',
    declinedStatus: 'La medición de Fabsy, Google y Meta está desactivada.',
    googleOnlyStatus: 'La medición de Google está permitida. Meta sigue desactivada hasta que elijas ambas.',
    metaOnlyStatus: 'La medición de Meta está permitida. Google sigue desactivada hasta que elijas ambas.',
    mixedStatus: 'Fabsy, Google y Meta no comparten una misma opción. Vuelve a elegir para configurar las tres.',
  },
};
