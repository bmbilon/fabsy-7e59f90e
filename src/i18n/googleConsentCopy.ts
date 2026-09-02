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
    body: 'Allow Google Analytics, Google Ads and Meta Pixel cookies to measure visits to approved public pages and completed purchases? This helps us understand how people find Fabsy.',
    scope: 'Google ad personalization is off. Meta automatic events, advanced matching and customer lists are not used. Google and Meta tags stay off ticket and contact forms. Cloudflare site analytics are separate.',
    changeHint: 'You can change your choice at any time.',
    allow: 'Allow measurement',
    decline: 'No thanks',
    withdraw: 'Withdraw permission',
    close: 'Close',
    settings: 'Privacy choices',
    privacyPolicy: 'Privacy policy',
    unknownStatus: 'Google and Meta measurement are off until you choose.',
    acceptedStatus: 'Google and Meta measurement are allowed on eligible pages.',
    declinedStatus: 'Google and Meta measurement are off.',
    googleOnlyStatus: 'Google measurement is allowed. Meta remains off until you choose both.',
    metaOnlyStatus: 'Meta measurement is allowed. Google remains off until you choose both.',
    mixedStatus: 'Google and Meta have different choices. Choose again to set both.',
  },
  pa: {
    title: 'ਤੁਹਾਡੀਆਂ ਪਰਦੇਦਾਰੀ ਚੋਣਾਂ',
    body: 'ਕੀ ਤੁਸੀਂ Google Analytics, Google Ads ਅਤੇ Meta Pixel ਦੀਆਂ ਕੂਕੀਜ਼ ਨੂੰ ਮਨਜ਼ੂਰਸ਼ੁਦਾ ਜਨਤਕ ਪੰਨਿਆਂ ਦੇ ਦੌਰੇ ਅਤੇ ਪੂਰੀਆਂ ਹੋਈਆਂ ਖਰੀਦਾਂ ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਦਿੰਦੇ ਹੋ? ਇਸ ਨਾਲ ਪਤਾ ਲੱਗਦਾ ਹੈ ਕਿ ਲੋਕ Fabsy ਤੱਕ ਕਿਵੇਂ ਪਹੁੰਚਦੇ ਹਨ।',
    scope: 'Google ਦੇ ਨਿੱਜੀ ਰੁਚੀ ਅਨੁਸਾਰ ਇਸ਼ਤਿਹਾਰ ਬੰਦ ਹਨ। Meta ਦੇ ਆਟੋਮੈਟਿਕ ਇਵੈਂਟ, ਉੱਨਤ ਮੇਲ ਅਤੇ ਗਾਹਕ ਸੂਚੀਆਂ ਨਹੀਂ ਵਰਤੀਆਂ ਜਾਂਦੀਆਂ। ਟਿਕਟ ਅਤੇ ਸੰਪਰਕ ਫਾਰਮਾਂ ਉੱਤੇ Google ਅਤੇ Meta ਟੈਗ ਨਹੀਂ ਚੱਲਦੇ। Cloudflare ਦੇ ਸਾਈਟ ਅੰਕੜੇ ਵੱਖਰੇ ਹਨ।',
    changeHint: 'ਤੁਸੀਂ ਆਪਣੀ ਚੋਣ ਕਿਸੇ ਵੀ ਵੇਲੇ ਬਦਲ ਸਕਦੇ ਹੋ।',
    allow: 'ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਦਿਓ',
    decline: 'ਨਹੀਂ, ਧੰਨਵਾਦ',
    withdraw: 'ਇਜਾਜ਼ਤ ਵਾਪਸ ਲਓ',
    close: 'ਬੰਦ ਕਰੋ',
    settings: 'ਪਰਦੇਦਾਰੀ ਚੋਣਾਂ',
    privacyPolicy: 'ਪਰਦੇਦਾਰੀ ਨੀਤੀ (ਅੰਗਰੇਜ਼ੀ)',
    unknownStatus: 'ਤੁਹਾਡੀ ਚੋਣ ਤੱਕ Google ਅਤੇ Meta ਮਾਪਣ ਬੰਦ ਹਨ।',
    acceptedStatus: 'ਯੋਗ ਪੰਨਿਆਂ ਉੱਤੇ Google ਅਤੇ Meta ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਹੈ।',
    declinedStatus: 'Google ਅਤੇ Meta ਮਾਪਣ ਬੰਦ ਹਨ।',
    googleOnlyStatus: 'Google ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਹੈ। ਜਦੋਂ ਤੱਕ ਤੁਸੀਂ ਦੋਵਾਂ ਨੂੰ ਨਹੀਂ ਚੁਣਦੇ, Meta ਬੰਦ ਰਹਿੰਦਾ ਹੈ।',
    metaOnlyStatus: 'Meta ਮਾਪਣ ਦੀ ਇਜਾਜ਼ਤ ਹੈ। ਜਦੋਂ ਤੱਕ ਤੁਸੀਂ ਦੋਵਾਂ ਨੂੰ ਨਹੀਂ ਚੁਣਦੇ, Google ਬੰਦ ਰਹਿੰਦਾ ਹੈ।',
    mixedStatus: 'Google ਅਤੇ Meta ਲਈ ਤੁਹਾਡੀਆਂ ਚੋਣਾਂ ਵੱਖਰੀਆਂ ਹਨ। ਦੋਵਾਂ ਨੂੰ ਸੈੱਟ ਕਰਨ ਲਈ ਮੁੜ ਚੁਣੋ।',
  },
  tl: {
    title: 'Mga pagpipilian mo sa privacy',
    body: 'Payagan ang cookies ng Google Analytics, Google Ads at Meta Pixel na sukatin ang mga pagbisita sa mga aprubadong pampublikong pahina at mga nakumpletong pagbili? Nakakatulong ito para malaman namin kung paano nahanap ng mga tao ang Fabsy.',
    scope: 'Naka-off ang pag-personalize ng Google ads. Hindi ginagamit ang awtomatikong Meta events, advanced matching o customer lists. Hindi gumagana ang Google at Meta tag sa mga form para sa tiket at pakikipag-ugnayan. Hiwalay ang pagsusuri ng Cloudflare sa paggamit ng site.',
    changeHint: 'Maaari mong baguhin ang iyong pagpili anumang oras.',
    allow: 'Payagan ang pagsukat',
    decline: 'Hindi, salamat',
    withdraw: 'Bawiin ang pahintulot',
    close: 'Isara',
    settings: 'Mga pagpipilian sa privacy',
    privacyPolicy: 'Patakaran sa privacy (Ingles)',
    unknownStatus: 'Naka-off ang pagsukat ng Google at Meta hangga’t hindi ka pumipili.',
    acceptedStatus: 'Pinapayagan ang pagsukat ng Google at Meta sa mga angkop na pahina.',
    declinedStatus: 'Naka-off ang pagsukat ng Google at Meta.',
    googleOnlyStatus: 'Pinapayagan ang pagsukat ng Google. Naka-off ang Meta hanggang piliin mo ang dalawa.',
    metaOnlyStatus: 'Pinapayagan ang pagsukat ng Meta. Naka-off ang Google hanggang piliin mo ang dalawa.',
    mixedStatus: 'Magkaiba ang iyong mga pagpili para sa Google at Meta. Pumili muli upang itakda ang dalawa.',
  },
  'zh-hans': {
    title: '您的隐私选择',
    body: '允许 Google Analytics、Google Ads 和 Meta Pixel 使用 Cookie 统计经批准的公开页面访问和已完成的购买吗？这有助于了解访客如何找到 Fabsy。',
    scope: 'Google 广告个性化已关闭。不使用 Meta 自动事件、高级匹配或客户名单。Google 和 Meta 标签不会在罚单或联系表单页面运行。Cloudflare 网站统计独立于此选项。',
    changeHint: '您可以随时更改选择。',
    allow: '允许统计',
    decline: '不用，谢谢',
    withdraw: '撤回许可',
    close: '关闭',
    settings: '隐私选择',
    privacyPolicy: '隐私政策（英文）',
    unknownStatus: '在您作出选择之前，Google 和 Meta 统计保持关闭。',
    acceptedStatus: '已允许在符合条件的页面使用 Google 和 Meta 统计。',
    declinedStatus: 'Google 和 Meta 统计已关闭。',
    googleOnlyStatus: '已允许 Google 统计。在您同时选择两者之前，Meta 保持关闭。',
    metaOnlyStatus: '已允许 Meta 统计。在您同时选择两者之前，Google 保持关闭。',
    mixedStatus: '您对 Google 和 Meta 的选择不同。请重新选择以同时设置两者。',
  },
  'zh-hant': {
    title: '您的隱私選擇',
    body: '是否允許 Google Analytics、Google Ads 和 Meta Pixel 使用 Cookie 統計經核准公開頁面的瀏覽及已完成的購買？這有助於了解訪客如何找到 Fabsy。',
    scope: 'Google 廣告個人化已關閉。不使用 Meta 自動事件、進階配對或客戶名單。Google 和 Meta 標籤不會在罰單或聯絡表單頁面執行。Cloudflare 網站統計獨立於此選項。',
    changeHint: '您可以隨時更改選擇。',
    allow: '允許統計',
    decline: '不用，謝謝',
    withdraw: '撤回許可',
    close: '關閉',
    settings: '隱私選擇',
    privacyPolicy: '隱私政策（英文）',
    unknownStatus: '在您作出選擇之前，Google 和 Meta 統計保持關閉。',
    acceptedStatus: '已允許在符合條件的頁面使用 Google 和 Meta 統計。',
    declinedStatus: 'Google 和 Meta 統計已關閉。',
    googleOnlyStatus: '已允許 Google 統計。在您同時選擇兩者之前，Meta 保持關閉。',
    metaOnlyStatus: '已允許 Meta 統計。在您同時選擇兩者之前，Google 保持關閉。',
    mixedStatus: '您對 Google 和 Meta 的選擇不同。請重新選擇以同時設定兩者。',
  },
  ar: {
    title: 'خيارات الخصوصية الخاصة بك',
    body: 'هل تسمح لملفات تعريف الارتباط من Google Analytics وGoogle Ads وMeta Pixel بقياس زيارات الصفحات العامة المعتمدة وعمليات الشراء المكتملة؟ يساعدنا ذلك على فهم كيف يصل الناس إلى Fabsy.',
    scope: 'تخصيص إعلانات Google متوقف. لا نستخدم أحداث Meta التلقائية أو المطابقة المتقدمة أو قوائم العملاء. لا تعمل علامات Google وMeta على نماذج المخالفات أو التواصل. تحليلات الموقع من Cloudflare منفصلة عن هذا الاختيار.',
    changeHint: 'يمكنك تغيير اختيارك في أي وقت.',
    allow: 'السماح بالقياس',
    decline: 'لا، شكرًا',
    withdraw: 'سحب الإذن',
    close: 'إغلاق',
    settings: 'خيارات الخصوصية',
    privacyPolicy: 'سياسة الخصوصية (بالإنجليزية)',
    unknownStatus: 'قياس Google وMeta متوقف إلى أن تختار.',
    acceptedStatus: 'قياس Google وMeta مسموح على الصفحات المؤهلة.',
    declinedStatus: 'قياس Google وMeta متوقف.',
    googleOnlyStatus: 'قياس Google مسموح. يبقى Meta متوقفًا حتى تختار كليهما.',
    metaOnlyStatus: 'قياس Meta مسموح. يبقى Google متوقفًا حتى تختار كليهما.',
    mixedStatus: 'اختياراك لخدمتي Google وMeta مختلفان. اختر مرة أخرى لضبط كليهما.',
  },
  hi: {
    title: 'आपकी गोपनीयता के विकल्प',
    body: 'क्या आप Google Analytics, Google Ads और Meta Pixel की कुकीज़ को स्वीकृत सार्वजनिक पेजों पर विज़िट और पूरी हुई खरीदारी मापने की अनुमति देना चाहते हैं? इससे हमें समझ आता है कि लोग Fabsy तक कैसे पहुँचते हैं।',
    scope: 'Google विज्ञापन वैयक्तिकरण बंद है। Meta के स्वचालित इवेंट, उन्नत मिलान और ग्राहक सूचियाँ उपयोग नहीं की जातीं। टिकट और संपर्क फ़ॉर्म पर Google और Meta टैग नहीं चलते। Cloudflare के साइट आँकड़े इस विकल्प से अलग हैं।',
    changeHint: 'आप अपना विकल्प कभी भी बदल सकते हैं।',
    allow: 'मापने की अनुमति दें',
    decline: 'नहीं, धन्यवाद',
    withdraw: 'अनुमति वापस लें',
    close: 'बंद करें',
    settings: 'गोपनीयता के विकल्प',
    privacyPolicy: 'गोपनीयता नीति (अंग्रेज़ी)',
    unknownStatus: 'आपके विकल्प चुनने तक Google और Meta मापन बंद हैं।',
    acceptedStatus: 'पात्र पेजों पर Google और Meta मापन की अनुमति है।',
    declinedStatus: 'Google और Meta मापन बंद हैं।',
    googleOnlyStatus: 'Google मापन की अनुमति है। जब तक आप दोनों को नहीं चुनते, Meta बंद रहता है।',
    metaOnlyStatus: 'Meta मापन की अनुमति है। जब तक आप दोनों को नहीं चुनते, Google बंद रहता है।',
    mixedStatus: 'Google और Meta के लिए आपके विकल्प अलग हैं। दोनों को तय करने के लिए फिर से चुनें।',
  },
  es: {
    title: 'Tus opciones de privacidad',
    body: '¿Permites que las cookies de Google Analytics, Google Ads y Meta Pixel midan las visitas a páginas públicas aprobadas y las compras completadas? Nos ayuda a entender cómo llegan las personas a Fabsy.',
    scope: 'La personalización de anuncios de Google está desactivada. No usamos eventos automáticos, coincidencia avanzada ni listas de clientes de Meta. Las etiquetas de Google y Meta no se ejecutan en los formularios de multas ni de contacto. Las estadísticas de Cloudflare son independientes de esta opción.',
    changeHint: 'Puedes cambiar tu elección en cualquier momento.',
    allow: 'Permitir medición',
    decline: 'No, gracias',
    withdraw: 'Retirar permiso',
    close: 'Cerrar',
    settings: 'Opciones de privacidad',
    privacyPolicy: 'Política de privacidad (inglés)',
    unknownStatus: 'La medición de Google y Meta está desactivada hasta que elijas.',
    acceptedStatus: 'La medición de Google y Meta está permitida en las páginas aptas.',
    declinedStatus: 'La medición de Google y Meta está desactivada.',
    googleOnlyStatus: 'La medición de Google está permitida. Meta sigue desactivada hasta que elijas ambas.',
    metaOnlyStatus: 'La medición de Meta está permitida. Google sigue desactivada hasta que elijas ambas.',
    mixedStatus: 'Tus opciones de Google y Meta son distintas. Vuelve a elegir para configurar ambas.',
  },
};
