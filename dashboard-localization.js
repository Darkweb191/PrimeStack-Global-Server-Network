const LANGUAGE_CODES = [
  'en', 'fr', 'es', 'ar', 'pt', 'de', 'it', 'nl', 'ru', 'zh', 'ja', 'ko', 'hi',
  'tr', 'id', 'vi', 'th', 'sw', 'pl', 'uk', 'bn', 'fa', 'ur', 'he', 'el', 'sv',
  'no', 'da', 'fi', 'ms',
];

const LANGUAGE_NAMES = [
  'English', 'Français', 'Español', 'العربية', 'Português', 'Deutsch', 'Italiano',
  'Nederlands', 'Русский', '中文', '日本語', '한국어', 'हिन्दी', 'Türkçe',
  'Bahasa Indonesia', 'Tiếng Việt', 'ไทย', 'Kiswahili', 'Polski', 'Українська',
  'বাংলা', 'فارسی', 'اردو', 'עברית', 'Ελληνικά', 'Svenska', 'Norsk', 'Dansk',
  'Suomi', 'Bahasa Melayu',
];

const PHRASES = {
  Platform: [
    'Platform', 'Plateforme', 'Plataforma', 'المنصة', 'Plataforma', 'Plattform',
    'Piattaforma', 'Platform', 'Платформа', '平台', 'プラットフォーム', '플랫폼',
    'प्लेटफ़ॉर्म', 'Platform', 'Platform', 'Nền tảng', 'แพลตฟอร์ม', 'Jukwaa',
    'Platforma', 'Платформа', 'প্ল্যাটফর্ম', 'پلتفرم', 'پلیٹ فارم', 'פלטפורמה',
    'Πλατφόρμα', 'Plattform', 'Plattform', 'Platform', 'Alusta', 'Platform',
  ],
  Overview: [
    'Overview', 'Vue d’ensemble', 'Resumen', 'نظرة عامة', 'Visão geral', 'Übersicht',
    'Panoramica', 'Overzicht', 'Обзор', '概览', '概要', '개요', 'अवलोकन', 'Genel Bakış',
    'Ringkasan', 'Tổng quan', 'ภาพรวม', 'Muhtasari', 'Przegląd', 'Огляд', 'সংক্ষিপ্ত বিবরণ',
    'نمای کلی', 'جائزہ', 'סקירה כללית', 'Επισκόπηση', 'Översikt', 'Oversikt', 'Oversigt',
    'Yleiskatsaus', 'Gambaran keseluruhan',
  ],
  'Bank Connections': [
    'Bank Connections', 'Connexions bancaires', 'Conexiones bancarias', 'الاتصالات المصرفية',
    'Conexões bancárias', 'Bankverbindungen', 'Collegamenti bancari', 'Bankverbindingen',
    'Банковские подключения', '银行连接', '銀行接続', '은행 연결', 'बैंक कनेक्शन',
    'Banka Bağlantıları', 'Koneksi Bank', 'Kết nối ngân hàng', 'การเชื่อมต่อธนาคาร',
    'Miunganisho ya benki', 'Połączenia bankowe', 'Банківські підключення', 'ব্যাংক সংযোগ',
    'اتصال‌های بانکی', 'بینک کنکشنز', 'חיבורי בנק', 'Τραπεζικές συνδέσεις',
    'Bankanslutningar', 'Bankanslutninger', 'Bankforbindelser', 'Pankkiyhteydet',
    'Sambungan Bank',
  ],
  Funding: [
    'Funding', 'Financement', 'Financiación', 'التمويل', 'Financiamento', 'Finanzierung',
    'Finanziamento', 'Financiering', 'Пополнение', '资金', '資金', '자금 조달', 'फंडिंग',
    'Fonlama', 'Pendanaan', 'Nạp tiền', 'การเติมเงิน', 'Ufadhili', 'Zasilanie',
    'Поповнення', 'তহবিল', 'تأمین مالی', 'فنڈنگ', 'מימון', 'Χρηματοδότηση',
    'Finansiering', 'Finansiering', 'Finansiering', 'Rahoitus', 'Pembiayaan',
  ],
  'Receive Funds': [
    'Receive Funds', 'Recevoir des fonds', 'Recibir fondos', 'استلام الأموال',
    'Receber fundos', 'Geld empfangen', 'Ricevi fondi', 'Geld ontvangen',
    'Получить средства', '收款', '入金', '자금 받기', 'धन प्राप्त करें', 'Para Al',
    'Terima Dana', 'Nhận tiền', 'รับเงิน', 'Pokea fedha', 'Odbierz środki',
    'Отримати кошти', 'তহবিল গ্রহণ', 'دریافت وجوه', 'رقم وصول کریں', 'קבלת כספים',
    'Λήψη χρημάτων', 'Ta emot pengar', 'Motta penger', 'Modtag penge', 'Vastaanota varoja',
    'Terima Dana',
  ],
  'Server Funds': [
    'Server Funds', 'Fonds du serveur', 'Fondos del servidor', 'أموال الخادم',
    'Fundos do servidor', 'Server-Guthaben', 'Fondi del server', 'Servertegoeden',
    'Средства сервера', '服务器资金', 'サーバー資金', '서버 자금', 'सर्वर निधि',
    'Sunucu Fonları', 'Dana Server', 'Tiền máy chủ', 'เงินของเซิร์ฟเวอร์',
    'Fedha za seva', 'Środki serwera', 'Кошти сервера', 'সার্ভার তহবিল',
    'وجوه سرور', 'سرور فنڈز', 'כספי שרת', 'Κεφάλαια διακομιστή',
    'Servermedel', 'Servermidler', 'Servermidler', 'Palvelimen varat', 'Dana Pelayan',
  ],
  'IP Whitelist': [
    'IP Whitelist', 'Liste blanche IP', 'Lista blanca de IP', 'قائمة عناوين IP المسموح بها',
    'Lista de permissões de IP', 'IP-Zulassungsliste', 'Whitelist IP', 'IP-allowlist',
    'Белый список IP', 'IP 白名单', 'IP許可リスト', 'IP 허용 목록', 'IP अनुमति सूची',
    'IP İzin Listesi', 'Daftar IP yang Diizinkan', 'Danh sách IP cho phép',
    'รายการ IP ที่อนุญาต', 'Orodha ya IP zinazoruhusiwa', 'Biała lista IP',
    'Білий список IP', 'অনুমোদিত IP তালিকা', 'فهرست مجاز IP', 'آئی پی کی اجازت فہرست',
    'רשימת IP מורשים', 'Λίστα επιτρεπόμενων IP', 'IP-tillåtelselista',
    'IP-tillatelsesliste', 'IP-tilladelsesliste', 'Sallittujen IP-osoitteiden luettelo',
    'Senarai IP Dibenarkan',
  ],
  Settlement: [
    'Settlement', 'Règlement', 'Liquidación', 'التسوية', 'Liquidação', 'Abwicklung',
    'Regolamento', 'Vereffening', 'Расчёты', '结算', '決済', '정산', 'निपटान',
    'Mutabakat', 'Penyelesaian', 'Quyết toán', 'การชำระบัญชี', 'Malipo',
    'Rozliczenie', 'Розрахунок', 'নিষ্পত্তি', 'تسویه', 'تصفیہ', 'סליקה', 'Εκκαθάριση',
    'Avräkning', 'Oppgjør', 'Afregning', 'Tilitys', 'Penyelesaian',
  ],
  'Risk Engine': [
    'Risk Engine', 'Moteur de risque', 'Motor de riesgo', 'محرك المخاطر',
    'Motor de risco', 'Risikomodul', 'Motore di rischio', 'Risicomodule',
    'Модуль рисков', '风险引擎', 'リスクエンジン', '위험 엔진', 'जोखिम इंजन',
    'Risk Motoru', 'Mesin Risiko', 'Bộ máy rủi ro', 'ระบบจัดการความเสี่ยง',
    'Injini ya hatari', 'Silnik ryzyka', 'Модуль ризиків', 'ঝুঁকি ইঞ্জিন',
    'موتور ریسک', 'رسک انجن', 'מנוע סיכונים', 'Μηχανή κινδύνου',
    'Riskmotor', 'Risiko-motor', 'Risikomotor', 'Riskimoottori', 'Enjin Risiko',
  ],
  Monitoring: [
    'Monitoring', 'Surveillance', 'Monitorización', 'المراقبة', 'Monitoramento',
    'Überwachung', 'Monitoraggio', 'Bewaking', 'Мониторинг', '监控', '監視', '모니터링',
    'निगरानी', 'İzleme', 'Pemantauan', 'Giám sát', 'การตรวจสอบ', 'Ufuatiliaji',
    'Monitorowanie', 'Моніторинг', 'পর্যবেক্ষণ', 'نظارت', 'نگرانی', 'ניטור', 'Παρακολούθηση',
    'Övervakning', 'Overvåking', 'Overvågning', 'Valvonta', 'Pemantauan',
  ],
  Merchants: [
    'Merchants', 'Commerçants', 'Comerciantes', 'التجار', 'Comerciantes', 'Händler',
    'Commercianti', 'Handelaars', 'Продавцы', '商户', '加盟店', '가맹점', 'व्यापारी',
    'Üye İşyeri', 'Pedagang', 'Người bán', 'ร้านค้า', 'Wafanyabiashara',
    'Sprzedawcy', 'Продавці', 'ব্যবসায়ী', 'تاجران', 'تاجر', 'בתי עסק',
    'Έμποροι', 'Handlare', 'Forhandlere', 'Forhandlere', 'Kauppiaat', 'Peniaga',
  ],
  Merchant: [
    'Merchant', 'Commerçant', 'Comerciante', 'التاجر', 'Comerciante', 'Händler',
    'Commerciante', 'Handelaar', 'Продавец', '商户', '加盟店', '가맹점', 'व्यापारी',
    'Üye İşyeri', 'Pedagang', 'Người bán', 'ร้านค้า', 'Mfanyabiashara',
    'Sprzedawca', 'Продавець', 'ব্যবসায়ী', 'تاجر', 'تاجر', 'בית עסק',
    'Έμπορος', 'Handlare', 'Forhandler', 'Forhandler', 'Kauppias', 'Peniaga',
  ],
  'T2T Engine': [
    'T2T Engine', 'Moteur T2T', 'Motor T2T', 'محرك T2T', 'Motor T2T',
    'T2T-Modul', 'Motore T2T', 'T2T-module', 'Модуль T2T', 'T2T 引擎',
    'T2Tエンジン', 'T2T 엔진', 'T2T इंजन', 'T2T Motoru', 'Mesin T2T',
    'Bộ máy T2T', 'ระบบ T2T', 'Injini ya T2T', 'Silnik T2T', 'Модуль T2T',
    'T2T ইঞ্জিন', 'موتور T2T', 'T2T انجن', 'מנוע T2T', 'Μηχανή T2T',
    'T2T-motor', 'T2T-motor', 'T2T-motor', 'T2T-moottori', 'Enjin T2T',
  ],
  Dashboard: [
    'Dashboard', 'Tableau de bord', 'Panel', 'لوحة التحكم', 'Painel', 'Dashboard',
    'Dashboard', 'Dashboard', 'Панель управления', '仪表板', 'ダッシュボード', '대시보드',
    'डैशबोर्ड', 'Kontrol Paneli', 'Dasbor', 'Bảng điều khiển', 'แดชบอร์ด',
    'Dashibodi', 'Pulpit', 'Панель керування', 'ড্যাশবোর্ড', 'داشبورد', 'ڈیش بورڈ',
    'לוח בקרה', 'Πίνακας ελέγχου', 'Instrumentpanel', 'Dashbord', 'Dashboard',
    'Hallintapaneeli', 'Papan pemuka',
  ],
  'Send Money': [
    'Send Money', 'Envoyer de l’argent', 'Enviar dinero', 'إرسال الأموال',
    'Enviar dinheiro', 'Geld senden', 'Invia denaro', 'Geld verzenden',
    'Отправить деньги', '转账', '送金', '송금', 'पैसे भेजें', 'Para Gönder',
    'Kirim Uang', 'Gửi tiền', 'ส่งเงิน', 'Tuma pesa', 'Wyślij pieniądze',
    'Надіслати гроші', 'টাকা পাঠান', 'ارسال پول', 'رقم بھیجیں', 'שליחת כסף',
    'Αποστολή χρημάτων', 'Skicka pengar', 'Send penger', 'Send penge',
    'Lähetä rahaa', 'Hantar Wang',
  ],
  Payout: [
    'Payout', 'Paiement', 'Pago', 'صرف', 'Pagamento', 'Auszahlung', 'Pagamento',
    'Uitbetaling', 'Выплата', '付款', '支払い', '지급', 'भुगतान', 'Ödeme',
    'Pembayaran', 'Chi trả', 'การจ่ายเงิน', 'Malipo', 'Wypłata', 'Виплата',
    'পেআউট', 'پرداخت', 'ادائیگی', 'תשלום', 'Πληρωμή', 'Utbetalning',
    'Utbetaling', 'Udbetaling', 'Maksu', 'Pembayaran',
  ],
  Balance: [
    'Balance', 'Solde', 'Saldo', 'الرصيد', 'Saldo', 'Kontostand', 'Saldo', 'Saldo',
    'Баланс', '余额', '残高', '잔액', 'शेष राशि', 'Bakiye', 'Saldo', 'Số dư',
    'ยอดคงเหลือ', 'Salio', 'Saldo', 'Баланс', 'ব্যালেন্স', 'موجودی', 'بیلنس',
    'יתרה', 'Υπόλοιπο', 'Saldo', 'Saldo', 'Saldo', 'Saldo', 'Baki',
  ],
  Terminals: [
    'Terminals', 'Terminaux', 'Terminales', 'الأجهزة الطرفية', 'Terminais',
    'Terminals', 'Terminali', 'Terminals', 'Терминалы', '终端', '端末', '단말기',
    'टर्मिनल', 'Terminaller', 'Terminal', 'Thiết bị đầu cuối', 'เครื่องปลายทาง',
    'Vituo', 'Terminale', 'Термінали', 'টার্মিনাল', 'پایانه‌ها', 'ٹرمینلز',
    'מסופים', 'Τερματικά', 'Terminaler', 'Terminaler', 'Terminaler', 'Päätteet',
    'Terminal',
  ],
  'API Keys': [
    'API Keys', 'Clés API', 'Claves API', 'مفاتيح API', 'Chaves de API',
    'API-Schlüssel', 'Chiavi API', 'API-sleutels', 'Ключи API', 'API 密钥',
    'APIキー', 'API 키', 'API कुंजियाँ', 'API Anahtarları', 'Kunci API',
    'Khóa API', 'คีย์ API', 'Vifunguo vya API', 'Klucze API', 'Ключі API',
    'API কী', 'کلیدهای API', 'API کیز', 'מפתחות API', 'Κλειδιά API',
    'API-nycklar', 'API-nøkler', 'API-nøgler', 'API-avaimet', 'Kunci API',
  ],
  Operations: [
    'Operations', 'Opérations', 'Operaciones', 'العمليات', 'Operações',
    'Betrieb', 'Operazioni', 'Operaties', 'Операции', '运营', '運用', '운영',
    'संचालन', 'İşlemler', 'Operasi', 'Vận hành', 'การดำเนินงาน', 'Uendeshaji',
    'Operacje', 'Операції', 'কার্যক্রম', 'عملیات', 'آپریشنز', 'תפעול',
    'Λειτουργίες', 'Drift', 'Drift', 'Drift', 'Toiminnot', 'Operasi',
  ],
  'Ops Hub': [
    'Ops Hub', 'Centre des opérations', 'Centro de operaciones', 'مركز العمليات',
    'Centro de operações', 'Betriebszentrale', 'Centro operativo', 'Operationeel centrum',
    'Центр операций', '运营中心', '運用ハブ', '운영 허브', 'ऑप्स हब', 'Operasyon Merkezi',
    'Pusat Operasi', 'Trung tâm vận hành', 'ศูนย์ปฏิบัติการ', 'Kitovu cha Uendeshaji',
    'Centrum operacyjne', 'Центр операцій', 'অপারেশনস হাব', 'مرکز عملیات',
    'آپریشنز مرکز', 'מרכז תפעול', 'Κέντρο λειτουργιών', 'Driftcentral',
    'Driftssenter', 'Driftscenter', 'Toimintakeskus', 'Hab Operasi',
  ],
  'Terminal Ops': [
    'Terminal Ops', 'Opérations des terminaux', 'Operaciones de terminales',
    'عمليات الأجهزة الطرفية', 'Operações de terminais', 'Terminalbetrieb',
    'Operazioni terminali', 'Terminalbeheer', 'Операции с терминалами', '终端运维',
    '端末運用', '단말기 운영', 'टर्मिनल संचालन', 'Terminal İşlemleri',
    'Operasi Terminal', 'Vận hành thiết bị đầu cuối', 'การดำเนินงานเทอร์มินัล',
    'Uendeshaji wa Vituo', 'Obsługa terminali', 'Операції з терміналами',
    'টার্মিনাল পরিচালনা', 'عملیات پایانه', 'ٹرمینل آپریشنز', 'תפעול מסופים',
    'Λειτουργία τερματικών', 'Terminaldrift', 'Terminaldrift', 'Terminaldrift',
    'Päätteiden käyttö', 'Operasi Terminal',
  ],
  'Network / Keys': [
    'Network / Keys', 'Réseau / Clés', 'Red / Claves', 'الشبكة / المفاتيح',
    'Rede / Chaves', 'Netzwerk / Schlüssel', 'Rete / Chiavi', 'Netwerk / Sleutels',
    'Сеть / Ключи', '网络 / 密钥', 'ネットワーク / キー', '네트워크 / 키',
    'नेटवर्क / कुंजियाँ', 'Ağ / Anahtarlar', 'Jaringan / Kunci', 'Mạng / Khóa',
    'เครือข่าย / คีย์', 'Mtandao / Vifunguo', 'Sieć / Klucze', 'Мережа / Ключі',
    'নেটওয়ার্ক / কী', 'شبکه / کلیدها', 'نیٹ ورک / کیز', 'רשת / מפתחות',
    'Δίκτυο / Κλειδιά', 'Nätverk / Nycklar', 'Nettverk / Nøkler', 'Netværk / Nøgler',
    'Verkko / Avaimet', 'Rangkaian / Kunci',
  ],
  Online: [
    'Online', 'En ligne', 'En línea', 'متصل', 'Online', 'Online', 'Online',
    'Online', 'В сети', '在线', 'オンライン', '온라인', 'ऑनलाइन', 'Çevrimiçi',
    'Online', 'Trực tuyến', 'ออนไลน์', 'Mtandaoni', 'Online', 'У мережі',
    'অনলাইন', 'آنلاین', 'آن لائن', 'מקוון', 'Σε σύνδεση', 'Uppkopplad',
    'Tilkoblet', 'Online', 'Verkossa', 'Dalam talian',
  ],
  Offline: [
    'Offline', 'Hors ligne', 'Sin conexión', 'غير متصل', 'Offline', 'Offline',
    'Offline', 'Offline', 'Не в сети', '离线', 'オフライン', '오프라인',
    'ऑफ़लाइन', 'Çevrimdışı', 'Offline', 'Ngoại tuyến', 'ออฟไลน์', 'Nje ya mtandao',
    'Offline', 'Не в мережі', 'অফলাইন', 'آفلاین', 'آف لائن', 'לא מקוון',
    'Εκτός σύνδεσης', 'Frånkopplad', 'Frakoblet', 'Offline', 'Poissa verkosta',
    'Luar talian',
  ],
  Unknown: [
    'Unknown', 'Inconnu', 'Desconocido', 'غير معروف', 'Desconhecido',
    'Unbekannt', 'Sconosciuto', 'Onbekend', 'Неизвестно', '未知', '不明', '알 수 없음',
    'अज्ञात', 'Bilinmiyor', 'Tidak diketahui', 'Không xác định', 'ไม่ทราบ',
    'Haijulikani', 'Nieznany', 'Невідомо', 'অজানা', 'ناشناخته', 'نامعلوم',
    'לא ידוע', 'Άγνωστο', 'Okänd', 'Ukjent', 'Ukendt', 'Tuntematon', 'Tidak diketahui',
  ],
  'ISO 8583': Array(30).fill('ISO 8583'),
  Home: [
    'Home', 'Accueil', 'Inicio', 'الرئيسية', 'Início', 'Startseite', 'Home',
    'Startpagina', 'Главная', '首页', 'ホーム', '홈', 'मुखपृष्ठ', 'Ana Sayfa',
    'Beranda', 'Trang chủ', 'หน้าแรก', 'Nyumbani', 'Strona główna', 'Головна',
    'হোম', 'خانه', 'صفحہ اول', 'בית', 'Αρχική', 'Hem', 'Hjem', 'Hjem',
    'Etusivu', 'Laman Utama',
  ],
  Language: [
    'Language', 'Langue', 'Idioma', 'اللغة', 'Idioma', 'Sprache', 'Lingua',
    'Taal', 'Язык', '语言', '言語', '언어', 'भाषा', 'Dil', 'Bahasa',
    'Ngôn ngữ', 'ภาษา', 'Lugha', 'Język', 'Мова', 'ভাষা', 'زبان', 'زبان',
    'שפה', 'Γλώσσα', 'Språk', 'Språk', 'Sprog', 'Kieli', 'Bahasa',
  ],
  'Loading…': [
    'Loading…', 'Chargement…', 'Cargando…', 'جارٍ التحميل…', 'Carregando…',
    'Wird geladen…', 'Caricamento…', 'Laden…', 'Загрузка…', '加载中…', '読み込み中…',
    '로딩 중…', 'लोड हो रहा है…', 'Yükleniyor…', 'Memuat…', 'Đang tải…',
    'กำลังโหลด…', 'Inapakia…', 'Ładowanie…', 'Завантаження…', 'লোড হচ্ছে…',
    'در حال بارگذاری…', 'لوڈ ہو رہا ہے…', 'בטעינה…', 'Φόρτωση…', 'Läser in…',
    'Laster…', 'Indlæser…', 'Ladataan…', 'Memuatkan…',
  ],
};

const SPANISH_PHRASES = {
  Services: 'Servicios',
  'Quick Links': 'Enlaces rápidos',
  'System health good': 'El sistema funciona correctamente',
  connected: 'conectados',
  'Platform admin': 'Administrador de la plataforma',
  'Operations Overview': 'Resumen de operaciones',
  'Operations Dashboard': 'Panel de operaciones',
  'Platform Overview': 'Resumen de la plataforma',
  'Auto-refresh: 5s': 'Actualización automática: 5 s',
  'A little more in control.': 'Ahora tienes más control.',
  'Welcome back. Your payment switch is running smoothly.': 'Te damos la bienvenida. Tu plataforma de pagos funciona correctamente.',
  'All systems feel good': 'Todos los sistemas funcionan correctamente',
  'Online Services': 'Servicios en línea',
  'API Endpoints': 'Puntos de conexión de API',
  'DB Migrations': 'Migraciones de base de datos',
  'Test Suites': 'Conjuntos de pruebas',
  'Services (14)': 'Servicios (14)',
  'Checking...': 'Comprobando...',
  ERROR: 'ERROR',
  Phase: 'Fase',
  'Ledger Service': 'Servicio de contabilidad',
  'Auth Service': 'Servicio de autenticación',
  'Terminal Service': 'Servicio de terminales',
  'Transfer Service': 'Servicio de transferencias',
  'Audit Service': 'Servicio de auditoría',
  'Settlement Engine': 'Motor de liquidación',
  'Notification Service': 'Servicio de notificaciones',
  'Switch Core': 'Núcleo del conmutador',
  'Security Service': 'Servicio de seguridad',
  'Routing Engine': 'Motor de enrutamiento',
  'ISO 8583 Gateway': 'Pasarela ISO 8583',
  'API Gateway': 'Pasarela de API',
  'Double-entry accounting': 'Contabilidad por partida doble',
  'CIDR/INET filtering': 'Filtrado CIDR/INET',
  'HMAC verification': 'Verificación HMAC',
  'Terminal registry + TMS': 'Registro de terminales + TMS',
  'T2T, S2S, WALLET, BULK': 'T2T, S2S, BILLETERA, MASIVO',
  'Blacklist, velocity, AML': 'Lista negra, velocidad, AML',
  'INSERT-ONLY compliance log': 'Registro de cumplimiento de solo inserción',
  'Net settlement, NACHA, EOD': 'Liquidación neta, NACHA, cierre del día',
  'Email/SMS/webhook + i18n': 'Correo/SMS/webhook + i18n',
  'Transaction lifecycle engine': 'Motor del ciclo de vida de transacciones',
  'API keys, HMAC, RBAC': 'Claves API, HMAC, control de acceso basado en roles',
  'BIN routing + failover': 'Enrutamiento BIN + conmutación por error',
  'Parser, host connections': 'Analizador y conexiones con el host',
  'Single external entry': 'Punto de entrada externo único',
  'Gateway Health': 'Estado de la pasarela',
  'Risk Dashboard': 'Panel de riesgos',
  'Treasury Dashboard': 'Panel de tesorería',
  'EOD Summary': 'Resumen del cierre del día',
  'Switch Dashboard': 'Panel del conmutador',
  'MTI Reference': 'Referencia MTI',
  'Field Definitions': 'Definiciones de campos',
  'Terminal Mgmt': 'Gestión de terminales',
  'Fleet Overview': 'Resumen de la flota',
  'Terminal Groups': 'Grupos de terminales',
  'Expiring Keys': 'Claves por caducar',
  'Core Services': 'Servicios principales',
  Ledger: 'Contabilidad',
  Security: 'Seguridad',
  'Routing Dashboard': 'Panel de enrutamiento',
  'PrimeStack Switch — 14 Services / 16 Migrations / 9 Tests / 135 Files': 'PrimeStack Switch — 14 servicios / 16 migraciones / 9 pruebas / 135 archivos',
  'Requires HSM, PCI DSS, banking partner agreements for production.': 'Requiere HSM, PCI DSS y acuerdos con socios bancarios para producción.',
  'Admin Dashboard': 'Panel de administración',
  'Admin Dashboard — Sign in': 'Panel de administración — Iniciar sesión',
  'Demo merchant': 'Comercio de demostración',
  Transactions: 'Transacciones',
  Logout: 'Cerrar sesión',
  'Logged in as': 'Sesión iniciada como',
  'Your merchant dashboard at a glance.': 'Resumen de tu panel de comercio.',
  'Merchant Dashboard': 'Panel del comercio',
  Status: 'Estado',
  ACTIVE: 'ACTIVO',
  APPROVED: 'APROBADO',
  Country: 'País',
  Terminals: 'Terminales',
  Wallets: 'Billeteras',
  "Today's Transactions": 'Transacciones de hoy',
  Total: 'Total',
  Authorized: 'Autorizadas',
  Declined: 'Rechazadas',
  'Auth Rate': 'Tasa de autorización',
  Volume: 'Volumen',
  'Avg Response': 'Respuesta promedio',
  'Transfers Today': 'Transferencias de hoy',
  Wallet: 'Billetera',
  Completed: 'Completadas',
  Pending: 'Pendientes',
  Failed: 'Fallidas',
  'Last Batch': 'Último lote',
  'Net Amount': 'Importe neto',
  Fees: 'Comisiones',
  COMPLETED: 'COMPLETADO',
  Recon: 'Conciliación',
  MATCHED: 'CONCILIADO',
  'Decisions Today': 'Decisiones de hoy',
  Approved: 'Aprobadas',
  Review: 'Revisión',
  Blocked: 'Bloqueadas',
  'High Risk': 'Riesgo alto',
  'Velocity Alerts': 'Alertas de frecuencia',
  'Blacklist Hits': 'Coincidencias en lista negra',
  'Active Rules': 'Reglas activas',
  'Card Velocity': 'Frecuencia de tarjetas',
  'AML $10K': 'AML 10.000 $',
  'Geo Block': 'Bloqueo geográfico',
  'Device Fingerprint': 'Huella del dispositivo',
  'Off-Hours': 'Fuera del horario',
  'Round Amount': 'Importe redondo',
  ON: 'ACTIVADO',
  'AML Cases': 'Casos AML',
  Open: 'Abiertos',
  'Under Review': 'En revisión',
  'Closed (30d)': 'Cerrados (30 días)',
  'SAR Filed': 'Informes SAR presentados',
  'Total Flagged': 'Total señalado',
  'Terminal Fleet': 'Flota de terminales',
  Active: 'Activos',
  Online: 'En línea',
  Offline: 'Sin conexión',
  Degraded: 'Degradados',
  'Pending Updates': 'Actualizaciones pendientes',
  Firmware: 'Firmware',
  Deployments: 'Implementaciones',
  Rollbacks: 'Reversiones',
  'Key Lifecycle': 'Ciclo de vida de claves',
  'Master Keys': 'Claves maestras',
  'PIN Keys': 'Claves PIN',
  'MAC Keys': 'Claves MAC',
  'Expiring (30d)': 'Por caducar (30 días)',
  'Rotations (30d)': 'Rotaciones (30 días)',
  Compromised: 'Comprometidas',
  'Recent Transactions': 'Transacciones recientes',
  Reference: 'Referencia',
  Type: 'Tipo',
  Amount: 'Importe',
  Currency: 'Moneda',
  Risk: 'Riesgo',
  Code: 'Código',
  'Service Health (Live)': 'Estado de los servicios (en vivo)',
  Low: 'Bajo',
  Med: 'Medio',
  High: 'Alto',
  Critical: 'Crítico',
  Email: 'Correo electrónico',
  Password: 'Contraseña',
  'Sign In': 'Iniciar sesión',
  'Demo Credentials:': 'Credenciales de demostración:',
};

for (const [source, translation] of Object.entries(SPANISH_PHRASES)) {
  const existing = PHRASES[source] || LANGUAGE_CODES.map(() => source);
  PHRASES[source] = LANGUAGE_CODES.map((code, index) => code === 'es' ? translation : existing[index]);
}

const RTL_LANGUAGES = new Set(['ar', 'fa', 'ur', 'he']);

export const SUPPORTED_DASHBOARD_LANGUAGES = LANGUAGE_CODES.map((code, index) => ({
  code,
  name: LANGUAGE_NAMES[index],
}));

export const DASHBOARD_TRANSLATIONS = Object.fromEntries(
  Object.entries(PHRASES).map(([source, values]) => [
    source,
    Object.fromEntries(LANGUAGE_CODES.map((code, index) => [code, values[index]])),
  ]),
);

export function dashboardLocalizationScript() {
  const data = JSON.stringify({
    languages: SUPPORTED_DASHBOARD_LANGUAGES,
    translations: DASHBOARD_TRANSLATIONS,
    rtl: [...RTL_LANGUAGES],
  }).replace(/</g, '\\u003c');

  return `<script>
(function () {
  var catalog = __DASHBOARD_I18N_DATA__;
  var languageCodes = catalog.languages.map(function (item) { return item.code; });
  var storedLanguage;
  try { storedLanguage = localStorage.getItem('primestack-dashboard-language'); } catch (_) {}
  var currentLanguage = languageCodes.indexOf(storedLanguage) === -1 ? 'en' : storedLanguage;
  var textSources = new WeakMap();
  var textOutputs = new WeakMap();
  var attributeSources = new WeakMap();
  var attributeOutputs = new WeakMap();
  var titleSource;
  var titleOutput;
  var attributes = ['placeholder', 'title', 'aria-label', 'alt'];
  var phrases = catalog.translations;
  var phraseKeys = Object.keys(phrases).sort(function (left, right) {
    return right.length - left.length;
  });

  function translate(source, language) {
    var entry = phrases[source];
    if (entry && entry[language]) return entry[language];

    var lowerSource = source.toLowerCase();
    var translated = '';
    var position = 0;
    while (position < source.length) {
      var matchedKey = null;
      for (var index = 0; index < phraseKeys.length; index++) {
        var key = phraseKeys[index];
        var lowerKey = key.toLowerCase();
        if (lowerSource.slice(position, position + lowerKey.length) !== lowerKey) continue;
        var before = position === 0 ? '' : lowerSource.charAt(position - 1);
        var afterIndex = position + lowerKey.length;
        var after = afterIndex === lowerSource.length ? '' : lowerSource.charAt(afterIndex);
        var startsWithWord = /[a-z0-9]/i.test(key.charAt(0));
        var endsWithWord = /[a-z0-9]/i.test(key.charAt(key.length - 1));
        if ((!startsWithWord || !/[a-z0-9]/i.test(before))
          && (!endsWithWord || !/[a-z0-9]/i.test(after))) {
          matchedKey = key;
          break;
        }
      }
      if (!matchedKey) {
        translated += source.charAt(position);
        position += 1;
        continue;
      }
      var matchedText = source.slice(position, position + matchedKey.length);
      var replacement = phrases[matchedKey][language];
      if (matchedText === matchedText.toUpperCase()) replacement = replacement.toLocaleUpperCase(language);
      else if (matchedText === matchedText.toLowerCase()) replacement = replacement.toLocaleLowerCase(language);
      translated += replacement;
      position += matchedKey.length;
    }
    return translated;
  }

  function shouldSkip(node) {
    var parent = node.parentElement;
    return !parent || !!parent.closest('script,style,noscript,textarea,[contenteditable="true"],.dashboard-language-picker');
  }

  function translateNode(node, language) {
    if (shouldSkip(node)) return;
    var current = node.nodeValue;
    var previousOutput = textOutputs.get(node);
    var source = textSources.get(node);
    if (source === undefined || current !== previousOutput) {
      source = current;
      textSources.set(node, source);
    }
    var match = source.match(/^(\\s*)([\\s\\S]*?)(\\s*)$/);
    if (!match || !match[2]) return;
    var output = match[1] + translate(match[2], language) + match[3];
    textOutputs.set(node, output);
    if (current !== output) node.nodeValue = output;
  }

  function translateAttribute(element, attribute, language) {
    var sourceMap = attributeSources.get(element);
    var outputMap = attributeOutputs.get(element);
    if (!sourceMap) { sourceMap = {}; attributeSources.set(element, sourceMap); }
    if (!outputMap) { outputMap = {}; attributeOutputs.set(element, outputMap); }
    var current = element.getAttribute(attribute);
    if (current === null) return;
    if (sourceMap[attribute] === undefined || current !== outputMap[attribute]) {
      sourceMap[attribute] = current;
    }
    var output = translate(sourceMap[attribute], language);
    outputMap[attribute] = output;
    if (current !== output) element.setAttribute(attribute, output);
  }

  function translateTree() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) translateNode(node, currentLanguage);
    document.querySelectorAll('*').forEach(function (element) {
      attributes.forEach(function (attribute) {
        if (element.hasAttribute(attribute)) translateAttribute(element, attribute, currentLanguage);
      });
      if (element.matches('input[type="button"],input[type="submit"],input[type="reset"]')) {
        translateAttribute(element, 'value', currentLanguage);
      }
    });
    var title = document.title;
    if (titleOutput === undefined || title !== titleOutput) titleSource = title;
    var titleParts = titleSource.split(/(\\s[—–-]\\s)/);
    if (titleParts.length > 1) {
      titleOutput = titleParts.map(function (part) {
        return /^\s[—–-]\s$/.test(part) ? part : translate(part, currentLanguage);
      }).join('');
      if (document.title !== titleOutput) document.title = titleOutput;
    }
  }

  function applyLanguage(language) {
    currentLanguage = languageCodes.indexOf(language) === -1 ? 'en' : language;
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = catalog.rtl.indexOf(currentLanguage) === -1 ? 'ltr' : 'rtl';
    try { localStorage.setItem('primestack-dashboard-language', currentLanguage); } catch (_) {}
    var picker = document.getElementById('dashboard-language');
    if (picker) picker.value = currentLanguage;
    var label = document.querySelector('.dashboard-language-picker label');
    if (label) label.textContent = translate('Language', currentLanguage);
    translateTree();
  }

  function installPicker() {
    if (document.getElementById('dashboard-language')) return;
    var container = document.createElement('div');
    container.className = 'dashboard-language-picker';
    container.innerHTML = '<label for="dashboard-language"></label><select id="dashboard-language" aria-label="Language"></select>';
    var select = container.querySelector('select');
    catalog.languages.forEach(function (language) {
      var option = document.createElement('option');
      option.value = language.code;
      option.textContent = language.name;
      select.appendChild(option);
    });
    select.addEventListener('change', function () { applyLanguage(select.value); });
    var style = document.createElement('style');
    style.textContent = '.dashboard-language-picker{position:fixed;z-index:1000;top:12px;right:14px;display:flex;align-items:center;gap:7px;padding:7px 9px;background:var(--surf,#fff);border:1px solid var(--border,#ddd);border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12);font:500 12px system-ui,sans-serif;color:var(--text,#222)}.dashboard-language-picker label{display:inline!important;margin:0!important;font-size:12px!important}.dashboard-language-picker select{width:auto;min-width:120px;padding:5px 7px;font-size:12px}.dashboard-language-picker select:focus{outline:2px solid #1a56db;outline-offset:1px}html[dir="rtl"] .dashboard-language-picker{right:auto;left:14px}html[dir="rtl"] .sidebar{left:auto;right:0;border-right:0;border-left:1px solid var(--border)}html[dir="rtl"] .main{margin-left:0;margin-right:240px}html[dir="rtl"] .nav-item.active{border-right:0;border-left:2px solid var(--accent)}html[dir="rtl"] th{text-align:right}@media(max-width:700px){.dashboard-language-picker{top:8px;right:8px}.dashboard-language-picker label{display:none!important}html[dir="rtl"] .dashboard-language-picker{right:auto;left:8px}}';
    document.head.appendChild(style);
    document.body.appendChild(container);
    select.value = currentLanguage;
    applyLanguage(currentLanguage);
  }

  function start() {
    installPicker();
    var observer = new MutationObserver(function () { translateTree(); });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: attributes.concat(['value']) });
    translateTree();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}());
</script>`.replace('__DASHBOARD_I18N_DATA__', data);
}
