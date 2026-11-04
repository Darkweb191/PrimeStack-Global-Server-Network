const translations: Record<string, string[]> = {
  "Back": ["Retour", "Volver", "رجوع", "Voltar"],
  "Back to Command Center": ["Retour au centre de commande", "Volver al centro de mando", "العودة إلى مركز التحكم", "Voltar ao Centro de Comando"],
  "Switch to light mode": ["Passer en mode clair", "Cambiar al modo claro", "التبديل إلى الوضع الفاتح", "Mudar para o modo claro"],
  "Switch to dark mode": ["Passer en mode sombre", "Cambiar al modo oscuro", "التبديل إلى الوضع الداكن", "Mudar para o modo escuro"],
  "Language": ["Langue", "Idioma", "اللغة", "Idioma"],
  "Theme": ["Thème", "Tema", "المظهر", "Tema"],
  "Command Center": ["Centre de commande", "Centro de mando", "مركز التحكم", "Centro de Comando"],
  "Merchant home preview": ["Aperçu de l'accueil marchand", "Vista previa del inicio del comercio", "معاينة الصفحة الرئيسية للتاجر", "Prévia da página inicial do comerciante"],
  "Merchant Acquiring": ["Acquisition commerçant", "Adquirencia de comercios", "خدمات قبول التجار", "Adquirência de comerciantes"],
  "Wallet Center": ["Centre de portefeuille", "Centro de billetera", "مركز المحافظ", "Central de carteiras"],
  "Asset Gateway": ["Passerelle d'actifs", "Pasarela de activos", "بوابة الأصول", "Gateway de ativos"],
  "Developer Platform": ["Plateforme développeur", "Plataforma para desarrolladores", "منصة المطورين", "Plataforma do desenvolvedor"],
  "Governance Center": ["Centre de gouvernance", "Centro de gobernanza", "مركز الحوكمة", "Central de governança"],
  "Intelligence": ["Intelligence", "Inteligencia", "الذكاء", "Inteligência"],
  "SWIFT payout draft": ["Brouillon de paiement SWIFT", "Borrador de pago SWIFT", "مسودة تحويل SWIFT", "Rascunho de pagamento SWIFT"],
  "PrimeStack | Command Center": ["PrimeStack | Centre de commande", "PrimeStack | Centro de mando", "PrimeStack | مركز التحكم", "PrimeStack | Centro de Comando"],
  "Wallet Center | PrimeStack": ["Centre de portefeuille | PrimeStack", "Centro de billetera | PrimeStack", "مركز المحافظ | PrimeStack", "Central de carteiras | PrimeStack"],
  "Merchant Home | PrimeStack": ["Accueil commerçant | PrimeStack", "Inicio del comercio | PrimeStack", "الصفحة الرئيسية للتاجر | PrimeStack", "Página inicial do comerciante | PrimeStack"],
  "Merchant Acquiring | PrimeStack": ["Acquisition commerçant | PrimeStack", "Adquirencia de comercios | PrimeStack", "خدمات قبول التجار | PrimeStack", "Adquirência de comerciantes | PrimeStack"],
  "SWIFT payout draft | PrimeStack": ["Brouillon de paiement SWIFT | PrimeStack", "Borrador de pago SWIFT | PrimeStack", "مسودة تحويل SWIFT | PrimeStack", "Rascunho de pagamento SWIFT | PrimeStack"],
  "PrimeStack Asset Gateway": ["Passerelle d'actifs PrimeStack", "Pasarela de activos PrimeStack", "بوابة أصول PrimeStack", "Gateway de ativos PrimeStack"],
  "PrimeStack Developer Platform": ["Plateforme développeur PrimeStack", "Plataforma para desarrolladores PrimeStack", "منصة مطوري PrimeStack", "Plataforma do desenvolvedor PrimeStack"],
  "PrimeStack Governance Center": ["Centre de gouvernance PrimeStack", "Centro de gobernanza PrimeStack", "مركز حوكمة PrimeStack", "Central de governança PrimeStack"],
  "PrimeStack Intelligence": ["Intelligence PrimeStack", "Inteligencia PrimeStack", "معلومات PrimeStack", "Inteligência PrimeStack"],
  "API reference": ["Référence API", "Referencia de API", "مرجع API", "Referência da API"],
  "Administrator sign-in": ["Connexion administrateur", "Inicio de sesión de administrador", "تسجيل دخول المسؤول", "Acesso do administrador"],
  "Sign in": ["Se connecter", "Iniciar sesión", "تسجيل الدخول", "Entrar"],
  "Sign out": ["Se déconnecter", "Cerrar sesión", "تسجيل الخروج", "Sair"],
  "Email": ["E-mail", "Correo electrónico", "البريد الإلكتروني", "E-mail"],
  "Password": ["Mot de passe", "Contraseña", "كلمة المرور", "Senha"],
  "Refresh": ["Actualiser", "Actualizar", "تحديث", "Atualizar"],
  "Search": ["Rechercher", "Buscar", "بحث", "Pesquisar"],
  "Search...": ["Rechercher...", "Buscar...", "بحث...", "Pesquisar..."],
  "Overview": ["Vue d'ensemble", "Resumen", "نظرة عامة", "Visão geral"],
  "Actions": ["Actions", "Acciones", "الإجراءات", "Ações"],
  "Status": ["Statut", "Estado", "الحالة", "Status"],
  "Active": ["Actif", "Activo", "نشط", "Ativo"],
  "Pending": ["En attente", "Pendiente", "قيد الانتظار", "Pendente"],
  "Completed": ["Terminé", "Completado", "مكتمل", "Concluído"],
  "Failed": ["Échec", "Fallido", "فشل", "Falhou"],
  "ACTIVE": ["ACTIF", "ACTIVO", "نشط", "ATIVO"],
  "PENDING": ["EN ATTENTE", "PENDIENTE", "قيد الانتظار", "PENDENTE"],
  "COMPLETED": ["TERMINÉ", "COMPLETADO", "مكتمل", "CONCLUÍDO"],
  "FAILED": ["ÉCHEC", "FALLIDO", "فشل", "FALHOU"],
  "SUCCEEDED": ["RÉUSSI", "EXITOSO", "ناجح", "BEM-SUCEDIDO"],
  "VERIFIED": ["VÉRIFIÉ", "VERIFICADO", "تم التحقق", "VERIFICADO"],
  "SCHEDULED": ["PLANIFIÉ", "PROGRAMADO", "مجدول", "AGENDADO"],
  "CANCELLED": ["ANNULÉ", "CANCELADO", "ملغى", "CANCELADO"],
  "SETTLED": ["RÉGLÉ", "LIQUIDADO", "تمت التسوية", "LIQUIDADO"],
  "DECLINED": ["REFUSÉ", "RECHAZADO", "مرفوض", "RECUSADO"],
  "APPROVED": ["APPROUVÉ", "APROBADO", "موافق عليه", "APROVADO"],
  "REJECTED": ["REJETÉ", "RECHAZADO", "مرفوض", "REJEITADO"],
  "IN_PROGRESS": ["EN COURS", "EN CURSO", "قيد التنفيذ", "EM ANDAMENTO"],
  "Save": ["Enregistrer", "Guardar", "حفظ", "Salvar"],
  "Cancel": ["Annuler", "Cancelar", "إلغاء", "Cancelar"],
  "Create": ["Créer", "Crear", "إنشاء", "Criar"],
  "Delete": ["Supprimer", "Eliminar", "حذف", "Excluir"],
  "Edit": ["Modifier", "Editar", "تعديل", "Editar"],
  "Submit": ["Soumettre", "Enviar", "إرسال", "Enviar"],
  "Name": ["Nom", "Nombre", "الاسم", "Nome"],
  "Type": ["Type", "Tipo", "النوع", "Tipo"],
  "Date": ["Date", "Fecha", "التاريخ", "Data"],
  "Amount": ["Montant", "Importe", "المبلغ", "Valor"],
  "Currency": ["Devise", "Moneda", "العملة", "Moeda"],
  "Description": ["Description", "Descripción", "الوصف", "Descrição"],
  "Reference": ["Référence", "Referencia", "المرجع", "Referência"],
  "Country": ["Pays", "País", "البلد", "País"],
  "Merchant": ["Commerçant", "Comercio", "التاجر", "Comerciante"],
  "Merchants": ["Commerçants", "Comercios", "التجار", "Comerciantes"],
  "Transactions": ["Transactions", "Transacciones", "المعاملات", "Transações"],
  "Transactions today": ["Transactions aujourd'hui", "Transacciones de hoy", "معاملات اليوم", "Transações de hoje"],
  "Wallets": ["Portefeuilles", "Billeteras", "المحافظ", "Carteiras"],
  "Wallet inventory": ["Inventaire des portefeuilles", "Inventario de billeteras", "قائمة المحافظ", "Inventário de carteiras"],
  "Create wallet": ["Créer un portefeuille", "Crear billetera", "إنشاء محفظة", "Criar carteira"],
  "Wallet transfer": ["Transfert de portefeuille", "Transferencia de billetera", "تحويل بين المحافظ", "Transferência entre carteiras"],
  "Wallet holds": ["Fonds réservés", "Fondos retenidos", "الأموال المحجوزة", "Valores retidos"],
  "Beneficiary": ["Bénéficiaire", "Beneficiario", "المستفيد", "Beneficiário"],
  "Merchant registry": ["Registre des commerçants", "Registro de comercios", "سجل التجار", "Registro de comerciantes"],
  "Onboard merchant": ["Intégrer un commerçant", "Registrar comercio", "إضافة تاجر", "Cadastrar comerciante"],
  "Verification & risk": ["Vérification et risque", "Verificación y riesgo", "التحقق والمخاطر", "Verificação e risco"],
  "Setup & pricing": ["Configuration et tarification", "Configuración y precios", "الإعداد والتسعير", "Configuração e preços"],
  "Ledger": ["Grand livre", "Libro mayor", "دفتر الأستاذ", "Livro-razão"],
  "Settlement": ["Règlement", "Liquidación", "التسوية", "Liquidação"],
  "Risk": ["Risque", "Riesgo", "المخاطر", "Risco"],
  "Network": ["Réseau", "Red", "الشبكة", "Rede"],
  "Terminals": ["Terminaux", "Terminales", "الأجهزة الطرفية", "Terminais"],
  "Fees": ["Frais", "Comisiones", "الرسوم", "Tarifas"],
  "Total": ["Total", "Total", "الإجمالي", "Total"],
  "Revenue": ["Revenu", "Ingresos", "الإيرادات", "Receita"],
  "Loading...": ["Chargement...", "Cargando...", "جارٍ التحميل...", "Carregando..."],
  "No data available": ["Aucune donnée disponible", "No hay datos disponibles", "لا توجد بيانات", "Nenhum dado disponível"],
  "Admin sign-in required": ["Connexion administrateur requise", "Se requiere acceso de administrador", "يلزم تسجيل دخول المسؤول", "É necessário acesso do administrador"],
  "Use your PrimeStack admin account to access wallet operations.": ["Utilisez votre compte administrateur PrimeStack pour accéder aux opérations de portefeuille.", "Use su cuenta de administrador de PrimeStack para acceder a las operaciones de billetera.", "استخدم حساب مسؤول PrimeStack للوصول إلى عمليات المحفظة.", "Use sua conta de administrador PrimeStack para acessar as operações de carteira."],
  "Ledger-backed wallets, holds, statements, and digital accounts": ["Portefeuilles adossés au grand livre, réserves, relevés et comptes numériques", "Billeteras respaldadas por el libro mayor, retenciones, estados de cuenta y cuentas digitales", "محافظ مدعومة بدفتر الأستاذ والحجوزات والكشوف والحسابات الرقمية", "Carteiras lastreadas no livro-razão, retenções, extratos e contas digitais"],
  "Load wallets": ["Charger les portefeuilles", "Cargar billeteras", "تحميل المحافظ", "Carregar carteiras"],
  "Wallet number": ["Numéro de portefeuille", "Número de billetera", "رقم المحفظة", "Número da carteira"],
  "Owner": ["Propriétaire", "Titular", "المالك", "Titular"],
  "Balance": ["Solde", "Saldo", "الرصيد", "Saldo"],
  "Held": ["Réservé", "Retenido", "محجوز", "Retido"],
  "Available": ["Disponible", "Disponible", "متاح", "Disponível"],
  "From wallet": ["Portefeuille source", "Billetera de origen", "من المحفظة", "Carteira de origem"],
  "To wallet": ["Portefeuille destinataire", "Billetera de destino", "إلى المحفظة", "Carteira de destino"],
  "Transfer through ledger": ["Transférer via le grand livre", "Transferir mediante el libro mayor", "التحويل عبر دفتر الأستاذ", "Transferir pelo livro-razão"],
  "Place ledger hold": ["Réserver des fonds dans le grand livre", "Retener fondos en el libro mayor", "حجز الأموال في دفتر الأستاذ", "Reter fundos no livro-razão"],
  "Beneficiary name": ["Nom du bénéficiaire", "Nombre del beneficiario", "اسم المستفيد", "Nome do beneficiário"],
  "Beneficiary identifier": ["Identifiant du bénéficiaire", "Identificador del beneficiario", "معرّف المستفيد", "Identificador do beneficiário"],
  "Add beneficiary": ["Ajouter un bénéficiaire", "Agregar beneficiario", "إضافة مستفيد", "Adicionar beneficiário"],
  "Virtual account": ["Compte virtuel", "Cuenta virtual", "حساب افتراضي", "Conta virtual"],
  "Create virtual account": ["Créer un compte virtuel", "Crear cuenta virtual", "إنشاء حساب افتراضي", "Criar conta virtual"],
  "Fee rules": ["Règles de frais", "Reglas de comisiones", "قواعد الرسوم", "Regras de tarifas"],
  "Transaction type": ["Type de transaction", "Tipo de transacción", "نوع المعاملة", "Tipo de transação"],
  "Fee type": ["Type de frais", "Tipo de comisión", "نوع الرسوم", "Tipo de tarifa"],
  "Statement & limits": ["Relevé et limites", "Estado de cuenta y límites", "الكشف والحدود", "Extrato e limites"],
  "Daily limit": ["Limite quotidien", "Límite diario", "الحد اليومي", "Limite diário"],
  "Monthly limit": ["Limite mensuel", "Límite mensual", "الحد الشهري", "Limite mensal"],
  "Yearly limit": ["Limite annuel", "Límite anual", "الحد السنوي", "Limite anual"],
  "Save limits": ["Enregistrer les limites", "Guardar límites", "حفظ الحدود", "Salvar limites"],
  "View recent statement": ["Afficher le relevé récent", "Ver estado de cuenta reciente", "عرض الكشف الأخير", "Ver extrato recente"],
  "Balances are read from linked ledger accounts; the wallet record does not store a separate balance.": ["Les soldes proviennent des comptes liés du grand livre ; le portefeuille ne stocke pas de solde distinct.", "Los saldos se leen de las cuentas vinculadas del libro mayor; la billetera no almacena un saldo independiente.", "تُقرأ الأرصدة من حسابات دفتر الأستاذ المرتبطة؛ ولا يسجل المحفظة رصيدًا منفصلًا.", "Os saldos são lidos das contas vinculadas do livro-razão; a carteira não armazena um saldo separado."],
  "DRAFT ONLY — this creates XML for review. It does not submit a payment, contact SWIFT or a bank, reserve funds, or confirm settlement. Production acceptance depends on your bank's certified CBPR+ profile.": ["BROUILLON UNIQUEMENT — crée un XML à vérifier. Aucun paiement n'est envoyé, aucun contact SWIFT ou bancaire n'est établi, aucun fonds n'est réservé et aucun règlement n'est confirmé. L'acceptation en production dépend du profil CBPR+ certifié de votre banque.", "SOLO BORRADOR: crea XML para revisión. No envía pagos, no contacta con SWIFT ni con un banco, no reserva fondos ni confirma liquidaciones. La aceptación en producción depende del perfil CBPR+ certificado de su banco.", "مسودة فقط — ينشئ ملف XML للمراجعة. لا يرسل دفعة ولا يتصل بـ SWIFT أو بالبنك ولا يحجز الأموال أو يؤكد التسوية. يعتمد القبول في الإنتاج على ملف CBPR+ المعتمد لدى البنك.", "APENAS RASCUNHO — cria XML para revisão. Não envia pagamentos, não contata a SWIFT ou um banco, não reserva fundos nem confirma liquidação. A aceitação em produção depende do perfil CBPR+ certificado do seu banco."],
  "Settlement method": ["Méthode de règlement", "Método de liquidación", "طريقة التسوية", "Método de liquidação"],
  "Settlement date": ["Date de règlement", "Fecha de liquidación", "تاريخ التسوية", "Data de liquidação"],
  "Interbank settlement amount": ["Montant du règlement interbancaire", "Importe de liquidación interbancaria", "مبلغ التسوية بين البنوك", "Valor da liquidação interbancária"],
  "Settlement currency": ["Devise de règlement", "Moneda de liquidación", "عملة التسوية", "Moeda de liquidação"],
  "Instructed amount": ["Montant ordonné", "Importe instruido", "المبلغ المأمور به", "Valor instruído"],
  "Instructed currency": ["Devise ordonnée", "Moneda instruida", "العملة المأمور بها", "Moeda instruída"],
  "Charge bearer": ["Payeur des frais", "Responsable de los gastos", "متحمل الرسوم", "Responsável pelas tarifas"],
  "End-to-end ID (optional)": ["Identifiant de bout en bout (facultatif)", "ID de extremo a extremo (opcional)", "المعرّف من البداية إلى النهاية (اختياري)", "ID ponta a ponta (opcional)"],
  "Remittance information": ["Informations de remise", "Información de remesa", "معلومات التحويل", "Informações da remessa"],
  "Generate draft XML": ["Générer le brouillon XML", "Generar borrador XML", "إنشاء مسودة XML", "Gerar rascunho XML"],
  "Download XML draft": ["Télécharger le brouillon XML", "Descargar borrador XML", "تنزيل مسودة XML", "Baixar rascunho XML"],
  "Print review copy": ["Imprimer une copie de vérification", "Imprimir copia de revisión", "طباعة نسخة للمراجعة", "Imprimir cópia para revisão"],
  "Assets": ["Actifs", "Activos", "الأصول", "Ativos"],
  "Networks": ["Réseaux", "Redes", "الشبكات", "Redes"],
  "Asset routes": ["Routes d'actifs", "Rutas de activos", "مسارات الأصول", "Rotas de ativos"],
  "Liquidity pools": ["Pools de liquidité", "Fondos de liquidez", "مجمعات السيولة", "Pools de liquidez"],
  "Register asset": ["Enregistrer un actif", "Registrar activo", "تسجيل أصل", "Registrar ativo"],
  "Asset code": ["Code de l'actif", "Código del activo", "رمز الأصل", "Código do ativo"],
  "Add network": ["Ajouter un réseau", "Agregar red", "إضافة شبكة", "Adicionar rede"],
  "Configure asset route": ["Configurer une route d'actif", "Configurar ruta de activo", "إعداد مسار أصل", "Configurar rota de ativo"],
  "Set conversion rate": ["Définir le taux de conversion", "Establecer tipo de conversión", "تعيين سعر التحويل", "Definir taxa de conversão"],
  "Create liquidity pool": ["Créer un pool de liquidité", "Crear fondo de liquidez", "إنشاء مجمع سيولة", "Criar pool de liquidez"],
  "Update liquidity snapshot": ["Mettre à jour l'instantané de liquidité", "Actualizar instantánea de liquidez", "تحديث لقطة السيولة", "Atualizar snapshot de liquidez"],
  "Smart route recommendation": ["Recommandation de routage intelligent", "Recomendación de ruta inteligente", "توصية المسار الذكي", "Recomendação de rota inteligente"],
  "Observed success rate": ["Taux de réussite observé", "Tasa de éxito observada", "معدل النجاح المرصود", "Taxa de sucesso observada"],
  "Successful": ["Réussies", "Exitosas", "ناجحة", "Bem-sucedidas"],
  "Declined": ["Refusées", "Rechazadas", "مرفوضة", "Recusadas"],
  "Informational recommendations": ["Recommandations informatives", "Recomendaciones informativas", "توصيات للمعلومات فقط", "Recomendações informativas"],
  "Observed baseline": ["Référence observée", "Referencia observada", "خط الأساس المرصود", "Referência observada"],
  "Record an intelligence event": ["Enregistrer un événement d'intelligence", "Registrar evento de inteligencia", "تسجيل حدث معلوماتي", "Registrar evento de inteligência"],
  "Record observation": ["Enregistrer l'observation", "Registrar observación", "تسجيل الملاحظة", "Registrar observação"],
  "Record an analyst/system observation only; it does not trigger an operational action.": ["Enregistre uniquement une observation d'analyste ou de système ; aucune action opérationnelle n'est déclenchée.", "Solo registra una observación del analista o del sistema; no activa ninguna acción operativa.", "يسجل ملاحظة للمحلل أو النظام فقط ولا يؤدي إلى إجراء تشغيلي.", "Registra apenas uma observação de analista ou sistema; nenhuma ação operacional é iniciada."],
  "Merchant onboarding, risk, pricing, MID and terminal operations": ["Intégration des commerçants, risques, tarification, MID et opérations des terminaux", "Registro de comercios, riesgos, precios, MID y operaciones de terminales", "إعداد التجار والمخاطر والتسعير ومعرّفات التجار وعمليات الأجهزة الطرفية", "Integração de comerciantes, riscos, preços, MID e operações de terminais"],
  "Sign in with your PrimeStack admin account.": ["Connectez-vous avec votre compte administrateur PrimeStack.", "Inicie sesión con su cuenta de administrador de PrimeStack.", "سجّل الدخول باستخدام حساب مسؤول PrimeStack.", "Entre com sua conta de administrador PrimeStack."],
  "Selected merchant": ["Commerçant sélectionné", "Comercio seleccionado", "التاجر المحدد", "Comerciante selecionado"],
  "KYC documents": ["Documents KYC", "Documentos KYC", "مستندات اعرف عميلك", "Documentos KYC"],
  "Risk profile": ["Profil de risque", "Perfil de riesgo", "ملف المخاطر", "Perfil de risco"],
  "Merchant IDs & terminals": ["Identifiants commerçant et terminaux", "ID de comercio y terminales", "معرّفات التجار والأجهزة الطرفية", "IDs de comerciante e terminais"],
  "Pricing plans": ["Plans tarifaires", "Planes de precios", "خطط الأسعار", "Planos de preços"],
  "Agent network": ["Réseau d'agents", "Red de agentes", "شبكة الوكلاء", "Rede de agentes"],
  "Onboarding / review": ["Intégration / examen", "Registro / revisión", "الإعداد / المراجعة", "Integração / análise"],
  "Code": ["Code", "Código", "الرمز", "Código"],
  "Legal / display name": ["Nom légal / affiché", "Nombre legal / comercial", "الاسم القانوني / المعروض", "Nome legal / de exibição"],
  "Category": ["Catégorie", "Categoría", "الفئة", "Categoria"],
  "KYC": ["KYC", "KYC", "اعرف عميلك", "KYC"],
  "Merchant code": ["Code commerçant", "Código de comercio", "رمز التاجر", "Código do comerciante"],
  "Legal name": ["Nom légal", "Nombre legal", "الاسم القانوني", "Nome legal"],
  "Display name": ["Nom affiché", "Nombre comercial", "الاسم المعروض", "Nome de exibição"],
  "MCC": ["MCC", "MCC", "رمز فئة التاجر", "MCC"],
  "Business category": ["Catégorie d'activité", "Categoría de negocio", "فئة النشاط التجاري", "Categoria comercial"],
  "Create pending merchant": ["Créer un commerçant en attente", "Crear comercio pendiente", "إنشاء تاجر قيد الانتظار", "Criar comerciante pendente"],
  "Merchant IDs & terminal assignment": ["Identifiants commerçant et attribution des terminaux", "ID de comercio y asignación de terminales", "معرّفات التاجر وتعيين الأجهزة الطرفية", "IDs de comerciante e atribuição de terminais"],
  "Create MID": ["Créer un MID", "Crear MID", "إنشاء معرّف تاجر", "Criar MID"],
  "Assign terminal": ["Attribuer un terminal", "Asignar terminal", "تعيين جهاز طرفي", "Atribuir terminal"],
  "Document type": ["Type de document", "Tipo de documento", "نوع المستند", "Tipo de documento"],
  "Document reference": ["Référence du document", "Referencia del documento", "مرجع المستند", "Referência do documento"],
  "Add reference": ["Ajouter une référence", "Agregar referencia", "إضافة مرجع", "Adicionar referência"],
  "Chargeback limit": ["Limite de rétrofacturation", "Límite de contracargos", "حد رد المبالغ المدفوعة", "Limite de contestação"],
  "Save risk profile": ["Enregistrer le profil de risque", "Guardar perfil de riesgo", "حفظ ملف المخاطر", "Salvar perfil de risco"],
  "Plan name": ["Nom du plan", "Nombre del plan", "اسم الخطة", "Nome do plano"],
  "Transaction fee %": ["Frais de transaction %", "Comisión por transacción %", "رسوم المعاملة %", "Tarifa da transação %"],
  "Settlement fee %": ["Frais de règlement %", "Comisión de liquidación %", "رسوم التسوية %", "Tarifa de liquidação %"],
  "Payout fee %": ["Frais de versement %", "Comisión de pago %", "رسوم الدفع %", "Tarifa de pagamento %"],
  "Create plan": ["Créer un plan", "Crear plan", "إنشاء خطة", "Criar plano"],
  "Assign plan": ["Attribuer le plan", "Asignar plan", "تعيين الخطة", "Atribuir plano"],
  "Assign to merchant": ["Attribuer au commerçant", "Asignar al comercio", "تعيين للتاجر", "Atribuir ao comerciante"],
  "Agent code": ["Code agent", "Código de agente", "رمز الوكيل", "Código do agente"],
  "Commission %": ["Commission %", "Comisión %", "العمولة %", "Comissão %"],
  "Create agent": ["Créer un agent", "Crear agente", "إنشاء وكيل", "Criar agente"],
  "Assign agent": ["Attribuer un agent", "Asignar agente", "تعيين وكيل", "Atribuir agente"],
  "Active applications": ["Applications actives", "Aplicaciones activas", "التطبيقات النشطة", "Aplicativos ativos"],
  "API products": ["Produits API", "Productos de API", "منتجات API", "Produtos de API"],
  "Rate plans": ["Plans tarifaires", "Planes de tarifas", "خطط الأسعار", "Planos de tarifas"],
  "Active webhooks": ["Webhooks actifs", "Webhooks activos", "خطافات الويب النشطة", "Webhooks ativos"],
  "Pending certifications": ["Certifications en attente", "Certificaciones pendientes", "الشهادات قيد الانتظار", "Certificações pendentes"],
  "Register application": ["Enregistrer une application", "Registrar aplicación", "تسجيل تطبيق", "Registrar aplicativo"],
  "Application name": ["Nom de l'application", "Nombre de la aplicación", "اسم التطبيق", "Nome do aplicativo"],
  "Application type": ["Type d'application", "Tipo de aplicación", "نوع التطبيق", "Tipo de aplicativo"],
  "Create API product": ["Créer un produit API", "Crear producto de API", "إنشاء منتج API", "Criar produto de API"],
  "Product name": ["Nom du produit", "Nombre del producto", "اسم المنتج", "Nome do produto"],
  "Create rate plan": ["Créer un plan tarifaire", "Crear plan de tarifas", "إنشاء خطة أسعار", "Criar plano de tarifas"],
  "Requests per minute": ["Requêtes par minute", "Solicitudes por minuto", "الطلبات في الدقيقة", "Solicitações por minuto"],
  "Register webhook endpoint": ["Enregistrer un endpoint webhook", "Registrar endpoint webhook", "تسجيل نقطة نهاية webhook", "Registrar endpoint de webhook"],
  "Register endpoint": ["Enregistrer le endpoint", "Registrar endpoint", "تسجيل نقطة النهاية", "Registrar endpoint"],
  "Register SDK version": ["Enregistrer une version du SDK", "Registrar versión del SDK", "تسجيل إصدار SDK", "Registrar versão do SDK"],
  "Register SDK metadata": ["Enregistrer les métadonnées du SDK", "Registrar metadatos del SDK", "تسجيل بيانات SDK الوصفية", "Registrar metadados do SDK"],
  "Register partner": ["Enregistrer un partenaire", "Registrar socio", "تسجيل شريك", "Registrar parceiro"],
  "Start certification": ["Démarrer la certification", "Iniciar certificación", "بدء الاعتماد", "Iniciar certificação"],
  "Applications and credentials": ["Applications et identifiants", "Aplicaciones y credenciales", "التطبيقات وبيانات الاعتماد", "Aplicativos e credenciais"],
  "Secrets are shown only once when created or rotated. Only administrators can manage credentials.": ["Les secrets ne sont affichés qu'une seule fois lors de leur création ou rotation. Seuls les administrateurs peuvent gérer les identifiants.", "Los secretos solo se muestran una vez al crearlos o rotarlos. Solo los administradores pueden gestionar credenciales.", "تُعرض الأسرار مرة واحدة فقط عند إنشائها أو تدويرها. يمكن للمسؤولين فقط إدارة بيانات الاعتماد.", "Os segredos são exibidos apenas uma vez quando criados ou rotacionados. Somente administradores podem gerenciar credenciais."],
  "Copy this API secret now": ["Copiez ce secret API maintenant", "Copie este secreto de API ahora", "انسخ سر API الآن", "Copie este segredo de API agora"],
  "The secret is not stored in recoverable form and will not be shown again.": ["Le secret n'est pas stocké sous une forme récupérable et ne sera plus affiché.", "El secreto no se almacena en un formato recuperable y no volverá a mostrarse.", "لا يُخزّن السر بصيغة قابلة للاستعادة ولن يُعرض مرة أخرى.", "O segredo não é armazenado em formato recuperável e não será exibido novamente."],
  "Open risks": ["Risques ouverts", "Riesgos abiertos", "المخاطر المفتوحة", "Riscos abertos"],
  "DR plans": ["Plans de reprise après sinistre", "Planes de recuperación ante desastres", "خطط التعافي من الكوارث", "Planos de recuperação de desastres"],
  "Backup failures": ["Échecs de sauvegarde", "Fallos de copia de seguridad", "إخفاقات النسخ الاحتياطي", "Falhas de backup"],
  "Active key records": ["Enregistrements de clés actifs", "Registros de claves activos", "سجلات المفاتيح النشطة", "Registros de chaves ativos"],
  "Active data policies": ["Politiques de données actives", "Políticas de datos activas", "سياسات البيانات النشطة", "Políticas de dados ativas"],
  "Pending changes": ["Modifications en attente", "Cambios pendientes", "التغييرات المعلقة", "Alterações pendentes"],
  "Pending reports": ["Rapports en attente", "Informes pendientes", "التقارير المعلقة", "Relatórios pendentes"],
  "Active vendors": ["Fournisseurs actifs", "Proveedores activos", "الموردون النشطون", "Fornecedores ativos"],
  "Record enterprise risk": ["Enregistrer un risque d'entreprise", "Registrar riesgo empresarial", "تسجيل مخاطر المؤسسة", "Registrar risco empresarial"],
  "Disaster-recovery plan record": ["Enregistrement d'un plan de reprise après sinistre", "Registro del plan de recuperación ante desastres", "سجل خطة التعافي من الكوارث", "Registro do plano de recuperação de desastres"],
  "Record backup evidence": ["Enregistrer une preuve de sauvegarde", "Registrar evidencia de copia de seguridad", "تسجيل دليل النسخ الاحتياطي", "Registrar evidência de backup"],
  "Record key metadata": ["Enregistrer les métadonnées de clé", "Registrar metadatos de clave", "تسجيل بيانات المفتاح الوصفية", "Registrar metadados da chave"],
  "Data-retention policy record": ["Enregistrement d'une politique de conservation des données", "Registro de política de retención de datos", "سجل سياسة الاحتفاظ بالبيانات", "Registro da política de retenção de dados"],
  "Submit change request": ["Soumettre une demande de modification", "Enviar solicitud de cambio", "إرسال طلب تغيير", "Enviar solicitação de alteração"],
  "Submit for review": ["Soumettre pour examen", "Enviar para revisión", "إرسال للمراجعة", "Enviar para análise"],
  "Regulatory report record": ["Enregistrement de rapport réglementaire", "Registro de informe reglamentario", "سجل تقرير تنظيمي", "Registro de relatório regulatório"],
  "Record planned report": ["Enregistrer le rapport prévu", "Registrar informe planificado", "تسجيل التقرير المخطط", "Registrar relatório planejado"],
  "Vendor register": ["Registre des fournisseurs", "Registro de proveedores", "سجل الموردين", "Registro de fornecedores"],
  "Record vendor": ["Enregistrer un fournisseur", "Registrar proveedor", "تسجيل مورد", "Registrar fornecedor"],
  "Continuity test record": ["Enregistrement d'un test de continuité", "Registro de prueba de continuidad", "سجل اختبار الاستمرارية", "Registro de teste de continuidade"],
  "Record test": ["Enregistrer le test", "Registrar prueba", "تسجيل الاختبار", "Registrar teste"],
  "Enterprise risks": ["Risques d'entreprise", "Riesgos empresariales", "مخاطر المؤسسة", "Riscos empresariais"],
  "Backup evidence": ["Preuves de sauvegarde", "Evidencia de copia de seguridad", "أدلة النسخ الاحتياطي", "Evidências de backup"],
  "Key lifecycle metadata": ["Métadonnées du cycle de vie des clés", "Metadatos del ciclo de vida de claves", "بيانات دورة حياة المفاتيح", "Metadados do ciclo de vida das chaves"],
  "Data-retention policies": ["Politiques de conservation des données", "Políticas de retención de datos", "سياسات الاحتفاظ بالبيانات", "Políticas de retenção de dados"],
  "Change requests": ["Demandes de modification", "Solicitudes de cambio", "طلبات التغيير", "Solicitações de alteração"],
  "Regulatory report records": ["Enregistrements de rapports réglementaires", "Registros de informes reglamentarios", "سجلات التقارير التنظيمية", "Registros de relatórios regulatórios"],
  "Business-continuity tests": ["Tests de continuité d'activité", "Pruebas de continuidad del negocio", "اختبارات استمرارية الأعمال", "Testes de continuidade dos negócios"],
  "Operations overview": ["Vue d'ensemble des opérations", "Resumen de operaciones", "نظرة عامة على العمليات", "Visão geral das operações"],
  "Your network at a glance. Activity reflects recorded platform data · Updated": ["Aperçu de votre réseau. L'activité reflète les données enregistrées de la plateforme · Mis à jour", "Vista general de su red. La actividad refleja los datos registrados de la plataforma · Actualizado", "نظرة عامة على شبكتك. يعكس النشاط بيانات المنصة المسجلة · تم التحديث", "Visão geral da sua rede. A atividade reflete os dados registrados da plataforma · Atualizado"],
  "Reporting period": ["Période de rapport", "Período del informe", "فترة التقرير", "Período do relatório"],
  "Last 7 days": ["7 derniers jours", "Últimos 7 días", "آخر 7 أيام", "Últimos 7 dias"],
  "Last 30 days": ["30 derniers jours", "Últimos 30 días", "آخر 30 يومًا", "Últimos 30 dias"],
  "Last 90 days": ["90 derniers jours", "Últimos 90 días", "آخر 90 يومًا", "Últimos 90 dias"],
  "Network status": ["État du réseau", "Estado de la red", "حالة الشبكة", "Status da rede"],
  "Recorded host and terminal status summary": ["Résumé des états enregistrés des hôtes et terminaux", "Resumen del estado registrado de hosts y terminales", "ملخص حالة المضيفين والأجهزة الطرفية المسجلة", "Resumo do status registrado de hosts e terminais"],
  "Awaiting data": ["En attente de données", "Esperando datos", "بانتظار البيانات", "Aguardando dados"],
  "Details": ["Détails", "Detalles", "التفاصيل", "Detalhes"],
  "Successful transaction volume": ["Volume des transactions réussies", "Volumen de transacciones exitosas", "حجم المعاملات الناجحة", "Volume de transações bem-sucedidas"],
  "Amounts remain separated by currency; not settled revenue": ["Les montants restent séparés par devise ; ils ne représentent pas des revenus réglés", "Los importes se mantienen separados por moneda; no son ingresos liquidados", "تظل المبالغ منفصلة حسب العملة ولا تمثل إيرادات تمت تسويتها", "Os valores permanecem separados por moeda; não representam receita liquidada"],
  "Recent transaction activity": ["Activité récente des transactions", "Actividad reciente de transacciones", "نشاط المعاملات الأخير", "Atividade recente de transações"],
  "Latest recorded transactions · refreshes every 15 seconds": ["Dernières transactions enregistrées · actualisation toutes les 15 secondes", "Últimas transacciones registradas · se actualiza cada 15 segundos", "أحدث المعاملات المسجلة · يتم التحديث كل 15 ثانية", "Transações registradas mais recentes · atualiza a cada 15 segundos"],
  "Transaction APIs": ["API de transactions", "API de transacciones", "واجهات المعاملات", "APIs de transações"],
  "Active liquidity pool snapshots": ["Instantanés des pools de liquidité actifs", "Instantáneas de fondos de liquidez activos", "لقطات مجمعات السيولة النشطة", "Snapshots dos pools de liquidez ativos"],
  "Configured pool values; not independently verified cash positions": ["Valeurs configurées des pools ; positions de trésorerie non vérifiées indépendamment", "Valores configurados de fondos; posiciones de efectivo no verificadas de forma independiente", "قيم المجمعات المُعدّة؛ وليست أرصدة نقدية تم التحقق منها بشكل مستقل", "Valores configurados dos pools; posições de caixa não verificadas de forma independente"],
  "Settlement batches": ["Lots de règlement", "Lotes de liquidación", "دفعات التسوية", "Lotes de liquidação"],
  "Current recorded batch statuses": ["États actuels des lots enregistrés", "Estados actuales de los lotes registrados", "حالات الدفعات المسجلة الحالية", "Status atuais dos lotes registrados"],
  "Top merchant activity": ["Activité des principaux commerçants", "Actividad de los principales comercios", "نشاط أبرز التجار", "Atividade dos principais comerciantes"],
  "By successful transaction count in the selected period": ["Selon le nombre de transactions réussies sur la période choisie", "Por número de transacciones exitosas en el período seleccionado", "حسب عدد المعاملات الناجحة في الفترة المحددة", "Por número de transações bem-sucedidas no período selecionado"],
  "Intelligence activity": ["Activité d'intelligence", "Actividad de inteligencia", "نشاط المعلومات", "Atividade de inteligência"],
  "Recent analyst/system observations": ["Observations récentes d'analystes ou de systèmes", "Observaciones recientes de analistas o sistemas", "ملاحظات المحللين أو الأنظمة الأخيرة", "Observações recentes de analistas ou sistemas"],
  "View all": ["Tout afficher", "Ver todo", "عرض الكل", "Ver tudo"],
  "Risk evaluations": ["Évaluations des risques", "Evaluaciones de riesgo", "تقييمات المخاطر", "Avaliações de risco"],
  "Recorded evaluation levels in the selected period; not open case counts": ["Niveaux d'évaluation enregistrés sur la période choisie ; pas le nombre de dossiers ouverts", "Niveles de evaluación registrados en el período seleccionado; no son casos abiertos", "مستويات التقييم المسجلة في الفترة المحددة وليست عدد الحالات المفتوحة", "Níveis de avaliação registrados no período selecionado; não representam casos abertos"],
  "Open an available operations interface": ["Ouvrir une interface opérationnelle disponible", "Abrir una interfaz de operaciones disponible", "فتح واجهة عمليات متاحة", "Abrir uma interface operacional disponível"],
  "Accessibility": ["Accessibilité", "Accesibilidad", "إمكانية الوصول", "Acessibilidade"],
  "Accessibility preferences": ["Préférences d'accessibilité", "Preferencias de accesibilidad", "إعدادات إمكانية الوصول", "Preferências de acessibilidade"],
  "High contrast": ["Contraste élevé", "Alto contraste", "تباين عالٍ", "Alto contraste"],
  "Larger text": ["Texte plus grand", "Texto más grande", "نص أكبر", "Texto maior"],
  "Reduce motion": ["Réduire les animations", "Reducir movimiento", "تقليل الحركة", "Reduzir movimento"],
  "Pause automatic refresh": ["Suspendre l'actualisation automatique", "Pausar actualización automática", "إيقاف التحديث التلقائي مؤقتًا", "Pausar atualização automática"],
  "Screen-reader mode (pause live updates)": ["Mode lecteur d'écran (suspendre les mises à jour en direct)", "Modo lector de pantalla (pausar actualizaciones en vivo)", "وضع قارئ الشاشة (إيقاف التحديثات المباشرة)", "Modo leitor de tela (pausar atualizações ao vivo)"],
  "Keyboard navigation (always show focus)": ["Navigation au clavier (toujours afficher le focus)", "Navegación por teclado (mostrar siempre el foco)", "التنقل بلوحة المفاتيح (إظهار التركيز دائمًا)", "Navegação por teclado (sempre mostrar o foco)"],
  "Welcome back": ["Bon retour", "Bienvenido de nuevo", "مرحبًا بعودتك", "Bem-vindo de volta"],
  "Sign in to Command Center": ["Se connecter au centre de commande", "Iniciar sesión en el centro de mando", "تسجيل الدخول إلى مركز التحكم", "Entrar no Centro de Comando"],
  "Merchant home": ["Accueil commerçant", "Inicio del comercio", "الصفحة الرئيسية للتاجر", "Página inicial do comerciante"],
  "Welcome to PrimeStack": ["Bienvenue sur PrimeStack", "Bienvenido a PrimeStack", "مرحبًا بك في PrimeStack", "Bem-vindo à PrimeStack"],
  "Read-only activity overview. Transaction volume is not revenue; balances are ledger account snapshots. Updated": ["Aperçu de l'activité en lecture seule. Le volume des transactions n'est pas un revenu ; les soldes sont des instantanés des comptes du grand livre. Mis à jour", "Resumen de actividad de solo lectura. El volumen de transacciones no son ingresos; los saldos son instantáneas de cuentas del libro mayor. Actualizado", "نظرة عامة على النشاط للقراءة فقط. حجم المعاملات ليس إيرادًا؛ الأرصدة لقطات لحسابات دفتر الأستاذ. تم التحديث", "Visão geral de atividade somente leitura. O volume de transações não é receita; os saldos são snapshots das contas do livro-razão. Atualizado"],
  "Preview merchant": ["Aperçu du commerçant", "Vista previa del comercio", "معاينة التاجر", "Prévia do comerciante"],
  "Select a merchant for the admin preview": ["Sélectionner un commerçant pour l'aperçu administrateur", "Seleccionar un comercio para la vista previa del administrador", "اختر تاجرًا لمعاينة المسؤول", "Selecionar um comerciante para a prévia do administrador"],
  "Recent transactions": ["Transactions récentes", "Transacciones recientes", "المعاملات الأخيرة", "Transações recentes"],
  "Latest merchant transactions · statuses and amounts from recorded transactions": ["Dernières transactions du commerçant · statuts et montants des transactions enregistrées", "Últimas transacciones del comercio · estados e importes de transacciones registradas", "أحدث معاملات التاجر · حالات ومبالغ المعاملات المسجلة", "Transações recentes do comerciante · status e valores das transações registradas"],
  "Settlements": ["Règlements", "Liquidaciones", "التسويات", "Liquidações"],
  "Wallet & ledger balances": ["Soldes des portefeuilles et du grand livre", "Saldos de billetera y libro mayor", "أرصدة المحافظ ودفتر الأستاذ", "Saldos de carteira e livro-razão"],
  "Merchant settlement accounts by currency": ["Comptes de règlement du commerçant par devise", "Cuentas de liquidación del comercio por moneda", "حسابات تسوية التاجر حسب العملة", "Contas de liquidação do comerciante por moeda"],
  "Status from the latest recorded terminal health data": ["État basé sur les dernières données de santé enregistrées des terminaux", "Estado según los últimos datos de salud registrados de los terminales", "الحالة حسب أحدث بيانات صحة مسجلة للأجهزة الطرفية", "Status dos dados de integridade mais recentes dos terminais"],
  "Quick access": ["Accès rapide", "Acceso rápido", "الوصول السريع", "Acesso rápido"],
  "Available merchant workspaces": ["Espaces de travail commerçant disponibles", "Espacios de trabajo comerciales disponibles", "مساحات عمل التاجر المتاحة", "Espaços de trabalho do comerciante disponíveis"],
  "Admin preview sign-in": ["Connexion à l'aperçu administrateur", "Inicio de sesión de vista previa del administrador", "تسجيل الدخول لمعاينة المسؤول", "Acesso à prévia do administrador"],
  "Sign in with a PrimeStack administrator account to preview merchant activity.": ["Connectez-vous avec un compte administrateur PrimeStack pour afficher l'activité du commerçant.", "Inicie sesión con una cuenta de administrador de PrimeStack para ver la actividad del comercio.", "سجّل الدخول بحساب مسؤول PrimeStack لمعاينة نشاط التاجر.", "Entre com uma conta de administrador PrimeStack para visualizar a atividade do comerciante."],
};

const controlMarkup = `
  <nav class="ps-global-controls" aria-label="Display and language settings" data-ps-skip-translation>
    <button class="ps-back" type="button" aria-label="Back to Command Center" title="Back to Command Center"><span aria-hidden="true">←</span><span class="ps-back-label">Back</span></button>
    <label class="ps-language-label"><span class="ps-visually-hidden">Language</span>
      <select class="ps-language" aria-label="Language">
        <option value="en">English</option><option value="fr">Français</option><option value="es">Español</option><option value="ar">العربية</option><option value="pt">Português</option>
      </select>
    </label>
    <button class="ps-theme" type="button" aria-pressed="false"><span class="ps-theme-icon" aria-hidden="true">☀</span><span class="ps-theme-label">Switch to light mode</span></button>
  </nav>`;

const controlStyles = `
  <style id="ps-admin-ui-styles">
    @import url("https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&display=swap");
    :root{color-scheme:light;--ps-ui-bg:#eef3f8;--ps-ui-panel:#ffffff;--ps-ui-raised:#f8f9fa;--ps-ui-border:#dfe1e2;--ps-ui-text:#1b1b1b;--ps-ui-muted:#71767a;--ps-ui-accent:#005ea2;--ps-ui-success:#18743a;--ps-ui-danger:#b50909;--ps-ui-warn:#805200}
    html[data-ps-theme="dark"]{color-scheme:dark;--ps-ui-bg:#0b1220;--ps-ui-panel:#121c2c;--ps-ui-raised:#182538;--ps-ui-border:#2a3a52;--ps-ui-text:#e7edf6;--ps-ui-muted:#9baac0;--ps-ui-accent:#73b3e7;--ps-ui-success:#39b978;--ps-ui-danger:#f07178;--ps-ui-warn:#e7b44c}
    html[data-ps-theme="light"]{color-scheme:light;--ps-ui-bg:#eef3f8;--ps-ui-panel:#ffffff;--ps-ui-raised:#f8f9fa;--ps-ui-border:#dfe1e2;--ps-ui-text:#1b1b1b;--ps-ui-muted:#71767a;--ps-ui-accent:#005ea2;--ps-ui-success:#18743a;--ps-ui-danger:#b50909;--ps-ui-warn:#805200}
    html[data-ps-theme="dark"],html[data-ps-theme="light"]{--bg:var(--ps-ui-bg);--panel:var(--ps-ui-panel);--raised:var(--ps-ui-raised);--panel-raised:var(--ps-ui-raised);--border:var(--ps-ui-border);--text:var(--ps-ui-text);--muted:var(--ps-ui-muted);--accent:var(--ps-ui-accent);--cyan:var(--ps-ui-accent)}
    html[data-ps-theme="light"]{--sidebar:#f8f9fa;--success:#18743a;--green:#18743a;--warning:#805200;--yellow:#805200;--risk:#b50909;--red:#b50909}
    html[data-ps-theme="dark"]{--sidebar:#101a29;--success:#39b978;--green:#39b978;--warning:#e7b44c;--yellow:#e7b44c;--risk:#f07178;--red:#f07178}
    html[data-ps-theme] body{background:var(--ps-ui-bg)!important;color:var(--ps-ui-text)!important;font-family:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;font-size:14px!important;line-height:1.55}
    html[data-ps-theme="light"] body{background-image:url("data:image/svg+xml,%3Csvg viewBox=%22-20 -5 60 40%22 width=%22140%22 xmlns=%22http://www.w3.org/2000/svg%22 opacity=%220.2%22%3E%3Cpath d=%22M1 8l11-7 11 7v8l-11 7-11-7zm0 0l11 8 11-8m0 8L12 8 1 16M12 1v7m0 8v7%22 fill=%22none%22 stroke=%22%230b1f3a%22 stroke-linejoin=%22round%22 stroke-width=%222%22/%3E%3Ctext x=%22-12%22 y=%2232%22 font-size=%225%22 font-family=%22monospace%22 fill=%22%230b1f3a%22%3EBuilt on CodePen%3C/text%3E%3C/svg%3E"),linear-gradient(rgb(17 46 81 / .025) 1px,transparent 1px),linear-gradient(90deg,rgb(17 46 81 / .025) 1px,transparent 1px),radial-gradient(50% 40% at 8% 12%,rgb(0 94 162 / .06),transparent 70%),radial-gradient(45% 35% at 92% 88%,rgb(181 9 9 / .05),transparent 70%),radial-gradient(140% 100% at 50% -20%,#fff 0%,#f0f5fa 30%,#e2ebf3 65%,#d4e0ec 100%)!important;background-position:center center,0 0,0 0,0 0,0 0,0 0!important;background-repeat:no-repeat,repeat,repeat,no-repeat,no-repeat,no-repeat!important;background-size:140px auto,32px 32px,32px 32px,auto,auto,cover!important;background-attachment:fixed!important}
    html[data-ps-theme] h1,html[data-ps-theme] h2,html[data-ps-theme] h3,html[data-ps-theme] h4,html[data-ps-theme] h5,html[data-ps-theme] h6{font-family:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;letter-spacing:-.02em}
    html[data-ps-theme] .greeting h1,html[data-ps-theme] .page-header h1,html[data-ps-theme] .page-head h1,html[data-ps-theme] .page-heading h1,html[data-ps-theme] .login-box h1,html[data-ps-theme] .login-card h2{font-family:"Source Serif 4",Georgia,serif!important;color:var(--ps-ui-text)!important;font-weight:700!important}
    html[data-ps-theme] .card h2,html[data-ps-theme] .card h3,html[data-ps-theme] .panel h2,html[data-ps-theme] .panel h3,html[data-ps-theme] .link-card h3{font-family:"Source Serif 4",Georgia,serif!important;color:var(--ps-ui-text)!important;font-weight:700!important}
    html[data-ps-theme] .section-title{color:#0b1f3a!important;border-bottom:2px solid #112e51!important;letter-spacing:.08em!important}
    html[data-ps-theme="dark"] .section-title{color:#e7edf6!important;border-color:#73b3e7!important}
    html[data-ps-theme] .stat-value,html[data-ps-theme] .stat-val,html[data-ps-theme] .value{font-variant-numeric:tabular-nums}
    html[data-ps-theme] code,html[data-ps-theme] pre,html[data-ps-theme] .input-mono{font-family:"JetBrains Mono",ui-monospace,"SFMono-Regular",Consolas,monospace!important}
    html[data-ps-theme] body{padding-top:46px!important}
    html[data-ps-theme] header,html[data-ps-theme] .topbar,html[data-ps-theme] .sidebar,html[data-ps-theme] .merchant-nav,html[data-ps-theme] .card,html[data-ps-theme] .panel,html[data-ps-theme] .metric,html[data-ps-theme] .login,html[data-ps-theme] .login-card,html[data-ps-theme] .quick-link,html[data-ps-theme] .balance-item,html[data-ps-theme] .settlement-item,html[data-ps-theme] .terminal-item,html[data-ps-theme] .status-banner,html[data-ps-theme] .merchant-submenu,html[data-ps-theme] .stat,html[data-ps-theme] .link-card{background:var(--ps-ui-panel)!important;color:var(--ps-ui-text)!important;border-color:var(--ps-ui-border)!important;border-radius:8px!important;box-shadow:0 1px 2px rgb(11 31 58 / .06),0 4px 12px -2px rgb(11 31 58 / .08)!important}
    html[data-ps-theme="dark"] header,html[data-ps-theme="dark"] .topbar,html[data-ps-theme="dark"] .sidebar,html[data-ps-theme="dark"] .merchant-nav,html[data-ps-theme="dark"] .card,html[data-ps-theme="dark"] .panel,html[data-ps-theme="dark"] .metric,html[data-ps-theme="dark"] .login,html[data-ps-theme="dark"] .login-card,html[data-ps-theme="dark"] .quick-link,html[data-ps-theme="dark"] .balance-item,html[data-ps-theme="dark"] .settlement-item,html[data-ps-theme="dark"] .terminal-item,html[data-ps-theme="dark"] .status-banner,html[data-ps-theme="dark"] .merchant-submenu,html[data-ps-theme="dark"] .stat,html[data-ps-theme="dark"] .link-card{box-shadow:0 1px 2px rgba(0,0,0,.25),0 4px 12px -2px rgba(0,0,0,.3)!important}
    html[data-ps-theme="light"] .card,html[data-ps-theme="light"] .panel,html[data-ps-theme="light"] .stat,html[data-ps-theme="light"] .metric,html[data-ps-theme="light"] .link-card{box-shadow:inset 3px 0 0 #005ea2,0 1px 2px rgb(11 31 58 / .06),0 4px 12px -2px rgb(11 31 58 / .08)!important}
    html[data-ps-theme="dark"] .card,html[data-ps-theme="dark"] .panel,html[data-ps-theme="dark"] .stat,html[data-ps-theme="dark"] .metric,html[data-ps-theme="dark"] .link-card{box-shadow:inset 3px 0 0 #73b3e7,0 1px 2px rgba(0,0,0,.25),0 4px 12px -2px rgba(0,0,0,.3)!important}
    html[data-ps-theme] .sidebar,html[data-ps-theme] .topbar{background:var(--ps-ui-panel)!important}
    html[data-ps-theme] .nav a,html[data-ps-theme] nav a,html[data-ps-theme] .nav-group summary,html[data-ps-theme] .nav-label,html[data-ps-theme] .sidebar-foot,html[data-ps-theme] .sidebar-foot strong,html[data-ps-theme] .muted,html[data-ps-theme] .subtitle,html[data-ps-theme] .sub,html[data-ps-theme] .meta,html[data-ps-theme] .panel-note,html[data-ps-theme] .label{color:var(--ps-ui-muted)!important}
    html[data-ps-theme] .nav a:hover,html[data-ps-theme] .nav-group summary:hover,html[data-ps-theme] nav a:hover{background:var(--ps-ui-raised)!important;color:var(--ps-ui-text)!important}
    html[data-ps-theme] .nav a.active,html[data-ps-theme] .nav-link.selected,html[data-ps-theme] .nav-item.active,html[data-ps-theme] nav a[aria-current="page"]{background:color-mix(in srgb,var(--ps-ui-accent) 10%,var(--ps-ui-panel))!important;color:var(--ps-ui-accent)!important;border-color:color-mix(in srgb,var(--ps-ui-accent) 24%,var(--ps-ui-border))!important}
    html[data-ps-theme="light"] .card:hover,html[data-ps-theme="light"] .panel:hover,html[data-ps-theme="light"] .metric:hover,html[data-ps-theme="light"] .quick-link:hover,html[data-ps-theme="light"] .link-card:hover{box-shadow:inset 4px 0 0 #b50909,0 6px 18px -4px rgb(11 31 58 / .14)!important;border-color:#aacdec!important;transform:translateY(-2px)}
    html[data-ps-theme="dark"] .card:hover,html[data-ps-theme="dark"] .panel:hover,html[data-ps-theme="dark"] .metric:hover,html[data-ps-theme="dark"] .quick-link:hover,html[data-ps-theme="dark"] .link-card:hover{box-shadow:inset 4px 0 0 #f07178,0 6px 18px -4px rgba(0,0,0,.4)!important;transform:translateY(-2px)}
    html[data-ps-theme] .brand-mark,html[data-ps-theme] .logo-icon{background:var(--ps-ui-accent)!important;color:#fff!important}
    html[data-ps-theme] .brand-mark{font-family:"Source Serif 4",Georgia,serif!important}
    html[data-ps-theme] input,html[data-ps-theme] select,html[data-ps-theme] textarea,html[data-ps-theme] button:not(.primary):not(.button-primary):not(.btn-primary):not(.btn-success):not(.btn-danger):not(.btn-warn),html[data-ps-theme] .button:not(.primary):not(.button-primary){background:var(--ps-ui-panel)!important;color:var(--ps-ui-text)!important;border-color:var(--ps-ui-border)!important}
    html[data-ps-theme="dark"] input,html[data-ps-theme="dark"] select,html[data-ps-theme="dark"] textarea{color-scheme:dark}
    html[data-ps-theme] .btn-primary,html[data-ps-theme] button.primary,html[data-ps-theme] .button-primary{background:linear-gradient(180deg,var(--ps-ui-accent),color-mix(in srgb,var(--ps-ui-accent) 78%,#061529))!important;color:#fff!important;border-color:var(--ps-ui-accent)!important;box-shadow:0 1px 0 rgb(255 255 255 / .18) inset,0 4px 12px -2px color-mix(in srgb,var(--ps-ui-accent) 30%,transparent)}
    html[data-ps-theme] .btn-success,html[data-ps-theme] .success{background:color-mix(in srgb,var(--ps-ui-success) 9%,var(--ps-ui-panel))!important;border-color:color-mix(in srgb,var(--ps-ui-success) 35%,var(--ps-ui-border))!important;color:var(--ps-ui-success)!important}
    html[data-ps-theme] .btn-danger,html[data-ps-theme] .danger{background:color-mix(in srgb,var(--ps-ui-danger) 8%,var(--ps-ui-panel))!important;border-color:color-mix(in srgb,var(--ps-ui-danger) 35%,var(--ps-ui-border))!important;color:var(--ps-ui-danger)!important}
    html[data-ps-theme] button,html[data-ps-theme] .button{border-radius:8px}
    html[data-ps-theme] h1{font-size:clamp(22px,2.1vw,28px)!important}
    html[data-ps-theme] h2{font-size:17px!important}
    html[data-ps-theme] .card,html[data-ps-theme] .panel{padding:15px!important}
    html[data-ps-theme] .metric,html[data-ps-theme] .stat{padding:13px!important}
    html[data-ps-theme] .status-banner{min-height:42px;padding:9px 11px!important}
    html[data-ps-theme] .quick-link,html[data-ps-theme] .balance-item,html[data-ps-theme] .settlement-item,html[data-ps-theme] .terminal-item{min-height:44px;padding:8px 10px!important}
    html[data-ps-theme] .topbar{min-height:58px!important;padding-block:7px!important}
    html[data-ps-theme] main,html[data-ps-theme] .content,html[data-ps-theme] .dashboard{padding-top:18px!important}
    html[data-ps-theme] input,html[data-ps-theme] select,html[data-ps-theme] textarea{min-height:34px!important;padding:6px 9px!important;font-size:13px!important}
    html[data-ps-theme] table th,html[data-ps-theme] table td{padding:7px 9px!important;font-size:12px!important}
    html[data-ps-theme] button,html[data-ps-theme] .button{min-height:32px;padding:5px 10px;font-size:12px}
    html[data-ps-theme] :focus-visible{outline:3px solid color-mix(in srgb,var(--ps-ui-accent) 55%,transparent);outline-offset:2px}
    html[data-ps-theme] table th{background:var(--ps-ui-raised)!important;color:var(--ps-ui-muted)!important;border-color:var(--ps-ui-border)!important}
    html[data-ps-theme] table td{color:var(--ps-ui-text)!important;border-color:var(--ps-ui-border)!important}
    html[data-ps-theme] .badge,html[data-ps-theme] .status{border-radius:6px}
    html[data-ps-theme] .badge-green,html[data-ps-theme] .badge.green{background:color-mix(in srgb,var(--ps-ui-success) 10%,var(--ps-ui-panel))!important;color:var(--ps-ui-success)!important}
    html[data-ps-theme] .badge-red,html[data-ps-theme] .badge.red{background:color-mix(in srgb,var(--ps-ui-danger) 10%,var(--ps-ui-panel))!important;color:var(--ps-ui-danger)!important}
    html[data-ps-theme] .badge-yellow,html[data-ps-theme] .badge.yellow{background:color-mix(in srgb,var(--ps-ui-warn) 12%,var(--ps-ui-panel))!important;color:var(--ps-ui-warn)!important}
    html[data-ps-theme] .badge-blue{background:color-mix(in srgb,var(--ps-ui-accent) 10%,var(--ps-ui-panel))!important;color:var(--ps-ui-accent)!important}
    html[data-ps-theme] .warning,html[data-ps-theme] .notice,html[data-ps-theme] .error{background:var(--ps-ui-raised)!important;color:var(--ps-ui-text)!important;border-color:var(--ps-ui-border)!important}
    html[data-ps-theme] .warning,html[data-ps-theme] .notice.warning{background:color-mix(in srgb,var(--ps-ui-warn) 9%,var(--ps-ui-panel))!important;border-color:color-mix(in srgb,var(--ps-ui-warn) 34%,var(--ps-ui-border))!important;color:color-mix(in srgb,var(--ps-ui-warn) 72%,var(--ps-ui-text))!important}
    html[data-ps-theme] .error,html[data-ps-theme] .notice.error{background:color-mix(in srgb,var(--ps-ui-danger) 9%,var(--ps-ui-panel))!important;border-color:color-mix(in srgb,var(--ps-ui-danger) 34%,var(--ps-ui-border))!important;color:color-mix(in srgb,var(--ps-ui-danger) 72%,var(--ps-ui-text))!important}
    html[data-ps-theme] .login-wrap{background:rgba(238,242,247,.94)!important}
    html[data-ps-theme] :is(.login-wrap .login-card,.login-screen .login-box,#login.panel,#login.login,#login-panel.login,#login-panel.panel){max-width:min(430px,calc(100vw - 32px));padding:24px!important;border:1px solid var(--ps-ui-border)!important;border-radius:14px!important;background:var(--ps-ui-panel)!important;box-shadow:0 18px 48px rgba(16,24,40,.12)!important}
    html[data-ps-theme] .ps-global-controls{position:fixed;z-index:10000;top:10px;right:12px;display:flex;align-items:center;gap:6px;padding:5px;border:1px solid var(--ps-ui-border);border-radius:9px;background:var(--ps-ui-panel);color:var(--ps-ui-text);box-shadow:0 2px 6px #10182812;font:12px/1.2 "Public Sans","Segoe UI",Arial,sans-serif}
    html[dir="rtl"] .ps-global-controls{right:auto;left:12px}
    html[data-ps-theme] .ps-global-controls button,html[data-ps-theme] .ps-global-controls select{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:34px;padding:0 9px;border:1px solid var(--ps-ui-border)!important;border-radius:6px;background:var(--ps-ui-panel)!important;color:var(--ps-ui-text)!important;font:inherit;cursor:pointer}
    html[data-ps-theme] .ps-global-controls button:hover,html[data-ps-theme] .ps-global-controls select:hover{border-color:var(--ps-ui-accent)!important;background:var(--ps-ui-raised)!important}
    .ps-global-controls .ps-language{min-width:95px}
    .ps-global-controls .ps-back>span:first-child{font-size:18px}
    .ps-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    @media(max-width:560px){html[data-ps-theme] body{padding-top:42px!important}html[data-ps-theme] input,html[data-ps-theme] select,html[data-ps-theme] textarea,html[data-ps-theme] button,html[data-ps-theme] .button{min-height:38px!important}html[data-ps-theme] .ps-global-controls{top:6px;right:6px;gap:3px;padding:3px}html[dir="rtl"] .ps-global-controls{right:auto;left:6px}html[data-ps-theme] .ps-global-controls button,html[data-ps-theme] .ps-global-controls select{min-height:30px!important;padding:0 6px}.ps-global-controls .ps-language{min-width:82px}.ps-back-label{display:none}}
    html[data-ps-theme] .stats,html[data-ps-theme] .metrics,html[data-ps-theme] .kpis{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr))!important;gap:12px!important}
    html[data-ps-theme] .grid,html[data-ps-theme] .grid-2,html[data-ps-theme] .grid-3,html[data-ps-theme] .grid-4,html[data-ps-theme] .portal-grid,html[data-ps-theme] .svc-grid,html[data-ps-theme] .health-grid,html[data-ps-theme] .links-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))!important;gap:14px!important}
    @media(prefers-reduced-motion:reduce){html[data-ps-theme] *,html[data-ps-theme] *:before,html[data-ps-theme] *:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
  </style>`;

function controlsScript(): string {
  return `<script id="ps-admin-ui-script">
    (() => {
      const phrases = ${JSON.stringify(translations)};
      const languageSelect = document.querySelector('.ps-language');
      const themeButton = document.querySelector('.ps-theme');
      const themeLabel = document.querySelector('.ps-theme-label');
      const themeIcon = document.querySelector('.ps-theme-icon');
      const backButton = document.querySelector('.ps-back');
      const backLabel = document.querySelector('.ps-back-label');
      const backIcon = document.querySelector('.ps-back>span:first-child');
      const textOriginals = new WeakMap();
      const textRendered = new WeakMap();
      const titleElement = document.querySelector('title');
      const originalTitle = titleElement?.textContent || document.title;
      const readPreference = (key, fallback) => {
        try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
      };
      const savePreference = (key, value) => {
        try { localStorage.setItem(key, value); } catch { /* Preferences remain active for this page. */ }
      };
      let language = ['en', 'fr', 'es', 'ar', 'pt'].includes(readPreference('ps-language', 'en')) ? readPreference('ps-language', 'en') : 'en';
      let theme = readPreference('ps-theme', 'light') === 'dark' ? 'dark' : 'light';
      const translate = (value) => {
        const key = value.trim();
        const entry = phrases[key] || phrases[key.toLowerCase()];
        if (!entry) return value;
        const languageIndex = ['fr', 'es', 'ar', 'pt'].indexOf(language);
        const translated = languageIndex < 0 ? key : entry[languageIndex] || key;
        return value.replace(key, translated);
      };
      const translatePage = () => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.parentElement?.closest('[data-ps-skip-translation],script,style,noscript,code,pre')) continue;
          const current = node.nodeValue || '';
          if (!textOriginals.has(node) || (textRendered.has(node) && textRendered.get(node) !== current)) textOriginals.set(node, current);
          const original = textOriginals.get(node);
          const translated = translate(original);
          textRendered.set(node, translated);
          if (translated !== current) node.nodeValue = translated;
        }
        document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach((element) => {
          const original = element.dataset.psOriginalPlaceholder || element.getAttribute('placeholder') || '';
          element.dataset.psOriginalPlaceholder = original;
          element.setAttribute('placeholder', translate(original));
        });
        document.querySelectorAll('[title]:not([data-ps-skip-translation]),[aria-label]:not([data-ps-skip-translation]),img[alt]').forEach((element) => {
          for (const attribute of ['title', 'aria-label', 'alt']) {
            if (!element.hasAttribute(attribute)) continue;
            const key = 'psOriginal' + attribute.replace(/(^|-)([a-z])/g, (_, _separator, letter) => letter.toUpperCase()).replace(/-/g, '');
            const original = element.dataset[key] || element.getAttribute(attribute) || '';
            element.dataset[key] = original;
            element.setAttribute(attribute, translate(original));
          }
        });
        document.title = translate(originalTitle);
        backButton.setAttribute('aria-label', translate('Back to Command Center'));
        backButton.setAttribute('title', translate('Back to Command Center'));
        const translatedBackLabel = translate('Back');
        if (backLabel.textContent !== translatedBackLabel) backLabel.textContent = translatedBackLabel;
        const translatedBackIcon = language === 'ar' ? '→' : '←';
        if (backIcon.textContent !== translatedBackIcon) backIcon.textContent = translatedBackIcon;
      };
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const inputUrl = input instanceof Request ? input.url : input.toString();
        if (new URL(inputUrl, location.href).origin !== location.origin) return originalFetch(input, init);
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('Accept-Language', language);
        return originalFetch(input, { ...init, headers });
      };
      const applyTheme = () => {
        document.documentElement.dataset.psTheme = theme;
        document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
        const key = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        const label = translate(key);
        themeLabel.textContent = label;
        themeButton.setAttribute('aria-label', label);
        themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
        themeIcon.textContent = theme === 'dark' ? '☾' : '☀';
      };
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
      languageSelect.value = language;
      document.documentElement.lang = language;
      languageSelect.addEventListener('change', () => {
        language = languageSelect.value;
        savePreference('ps-language', language);
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = language;
        translatePage();
        applyTheme();
      });
      themeButton.addEventListener('click', () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        savePreference('ps-theme', theme);
        applyTheme();
      });
      document.querySelector('.ps-back').addEventListener('click', () => {
        const fallback = '/admin/dashboard';
        if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {
          history.back();
        } else if (location.pathname !== fallback) {
          location.assign(fallback);
        }
      });
      translatePage();
      applyTheme();
      new MutationObserver(() => translatePage()).observe(document.body, { childList: true, characterData: true, subtree: true });
    })();
  </script>`;
}

export function enhanceAdminHtml(html: string): string {
  if (!html.includes("</body>") || html.includes('id="ps-admin-ui-styles"')) return html;
  return html.replace("</body>", `${controlMarkup}${controlStyles}${controlsScript()}</body>`);
}
