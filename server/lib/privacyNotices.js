/**
 * Privacy notice content served by GET /api/privacy/notices/current.
 *
 * The notice and its version are code constants on purpose (R20 D61, D65):
 * a consent record points at a version, and a version must map to exactly
 * the text that was reviewed. Nothing here is injected from the environment.
 *
 * The text states technical facts only. When the wording changes in a
 * material way, bump PRIVACY_NOTICE_VERSION so every account is asked to
 * confirm again (the pending "privacy_consent" step is derived from it).
 *
 * Self-hosters: replace the operator, hosting and third-party facts with your
 * own before opening registration.
 */
export const PRIVACY_NOTICE_VERSION = '2026.11.1';

// The day this version of the notice takes effect, as an ISO day so every
// time zone shows the same date. Set when the version was released.
export const PRIVACY_EFFECTIVE_DATE = '2026-11-24';

export const PRIVACY_OPERATOR = Object.freeze({
    name: '张心一',
    contactEmail: 'hi@tonyxyz.com',
});

export const PRIVACY_PLACEHOLDER_PATTERN = /^\{\{[A-Z0-9_]+\}\}$/;

export const SUPPORTED_NOTICE_LANGS = Object.freeze(['en', 'fr-CA', 'zh-Hans']);

const HOST_PROVIDER = 'Vultr';
// Same place, named in each notice language.
const HOST_LOCATION = Object.freeze({
    'zh-Hans': '新加坡',
    en: 'Singapore',
    'fr-CA': 'Singapour',
});

const NOTICES = Object.freeze({
    'zh-Hans': {
        title: '隐私说明',
        intro: '本说明介绍 Debate Match Timer（辩论赛计时器）收集哪些个人信息、用途、留存期限、涉及的第三方，以及你的权利和联系方式。',
        sections: [
            {
                heading: '一、我们收集的信息',
                items: [
                    '账号信息：你设置的用户名和密码。密码只以不可逆的散列形式保存，我们无法查看原文。',
                    '两步验证信息（普通账号可选，管理员账号必须开启）：用于生成动态口令的密钥（加密保存）、一次性恢复码（只保存散列）、最近一次使用的动态口令时间步。',
                    '登录与安全记录：注册、登录、两步验证、账号与管理操作的记录，包括事件类型、时间、涉及的账号、来源 IP 地址。登录失败时还会记录输入的用户名，但仅在它符合用户名格式时记录。',
                    '隐私说明同意记录：你同意的本说明版本与时间。',
                    '你保存的内容：赛制模板（名称、阶段设置、队名，以及你自愿填写的署名）和比赛记录。发布到模板广场的模板对所有人可见，但不显示归属账号；署名只在你自愿填写时展示。',
                    '本服务不收集：电子邮箱、手机号码、真实姓名、出生日期、设备标识、精确地理位置。页面不包含统计分析或广告脚本。',
                    '保存在你设备上的数据：界面语言、深色模式、提示音偏好、最近使用的模板和远程控制角色记忆保存在浏览器的本地存储中，不发送到服务器。应用外壳由浏览器的 Service Worker 缓存，以便离线打开。',
                ],
            },
            {
                heading: '二、用途',
                items: [
                    '创建和管理账号，保持你的登录状态。',
                    '保障账号与系统安全：对登录、注册和两步验证的尝试按来源 IP 和账号限流；记录登录成功与失败，供管理员排查未授权访问。',
                    '记录管理员对账号、注册开关和广场内容的操作，便于事后核对。',
                    '保存你创建的模板与比赛记录，并按你的选择发布到模板广场。',
                ],
            },
            {
                heading: '三、留存期限',
                items: [
                    '登录与安全记录：自记录之日起 184 天，到期由数据库自动删除（删除在到期后约一分钟内执行）。',
                    '两步验证信息与隐私说明同意记录：保存至账号删除为止；隐私说明发布新版本后，以新的同意记录为准。',
                    '账号与你保存的内容：保存至账号被删除为止。',
                    '数据库备份：保留最近 14 天，到期自动清理。从备份恢复后，已到期的安全记录会被再次清除，已删除账号在安全记录中的标识也会被再次清除。',
                    '登录状态 Cookie：30 天。',
                ],
            },
            {
                heading: '四、涉及的第三方',
                items: [
                    '本服务没有接入广告或数据分析服务，也没有向其他第三方提供你个人信息的接口。为运行本服务，以下第三方会处理你的部分信息：',
                    `${HOST_PROVIDER}：托管 API 与数据库，所在地为${HOST_LOCATION['zh-Hans']}。第一节列出的数据都保存在这里。`,
                    'GitHub, Inc.（GitHub Pages）：托管网页前端。你打开网页时，你的 IP 地址与浏览器的标准请求头会经过其服务器。',
                    'Google LLC（Google Fonts）：网页加载 Roboto 字体时，你的浏览器会向 Google 的服务器发送请求，其中包含你的 IP 地址与浏览器标识。',
                    'Cloudflare, Inc.：提供域名解析。网页域名经其网络转发，你访问网页的请求会经过其服务器；API 域名只使用其域名解析。',
                    '你自己选定的身份验证器应用：绑定两步验证时，密钥只发送到你的设备，动态口令由该应用在你的设备上生成。我们不知道你使用哪一款应用。',
                    `数据存放地：API 与数据库位于${HOST_LOCATION['zh-Hans']}。无论你从哪里访问，你的个人信息都会传输到${HOST_LOCATION['zh-Hans']}并在那里处理；如果你在中国大陆，同样如此。`,
                ],
            },
            {
                heading: '五、你的权利与选择',
                items: [
                    '查阅：在设置页的「我的登录记录」中查看你自己账号的登录记录。',
                    '更正：密码可以由管理员重置；用户名目前不能更改。',
                    `删除：目前没有自助删除入口。如需删除账号，请联系 ${PRIVACY_OPERATOR.contactEmail}。账号删除后，登录与安全记录中与该账号关联的标识和 IP 地址会被清除，或随记录一并删除。`,
                    '两步验证：普通账号可以在设置页自行开启或关闭。',
                    '撤回同意：你可以在确认页选择「不同意并退出」，之后需要重新确认才能继续使用本服务。',
                    `投诉：如果你对本说明或个人信息处理有疑问或投诉，请联系 ${PRIVACY_OPERATOR.contactEmail}；你也可以向你所在地的个人信息保护机构反映。`,
                ],
            },
            {
                heading: '六、本说明的变更',
                items: [
                    '本说明内容变更时会发布新版本。新版本生效后，你下次使用时需要重新阅读并确认。',
                ],
            },
            {
                heading: '七、联系方式',
                items: [`运营者：${PRIVACY_OPERATOR.name}`, `联系邮箱：${PRIVACY_OPERATOR.contactEmail}`],
            },
        ],
    },
    en: {
        title: 'Privacy Notice',
        intro: 'This notice explains what personal information Debate Match Timer collects, why, how long it is kept, which third parties are involved, and your rights and how to contact us.',
        sections: [
            {
                heading: '1. Information we collect',
                items: [
                    'Account information: the username and password you choose. The password is stored only as a non-reversible hash; we cannot view it.',
                    'Two-factor verification information (optional for standard accounts, required for administrator accounts): the key used to generate one-time codes (stored encrypted), one-time recovery codes (only hashes are stored), and the time step of the most recently used code.',
                    'Sign-in and security records: records of registration, sign-in, two-factor verification, and account and administration actions, including the event type, time, account involved, and source IP address. When a sign-in fails, the username that was entered is also recorded, but only if it matches the username format.',
                    'Privacy notice consent record: the version of this notice you agreed to, and when.',
                    'Content you save: debate templates (name, stage settings, team names, and a credit name if you choose to provide one) and match records. A template published to the template gallery is visible to everyone, but the owning account is not shown; a credit name appears only if you provide one.',
                    'This service does not collect: email addresses, phone numbers, real names, dates of birth, device identifiers, or precise location. The pages contain no analytics or advertising scripts.',
                    'Data kept on your device: your interface language, dark mode setting, sound preferences, most recently used template, and remote-control role memory are stored in your browser\'s local storage and are not sent to the server. The app shell is cached by the browser\'s service worker so that it can open offline.',
                ],
            },
            {
                heading: '2. Why we use it',
                items: [
                    'To create and manage your account and keep you signed in.',
                    'To protect accounts and the system: sign-in, registration, and two-factor attempts are rate-limited by source IP and by account; successful and failed sign-ins are recorded so that the administrator can investigate unauthorized access.',
                    'To record administrator actions on accounts, the registration switch, and gallery content, so that they can be reviewed afterwards.',
                    'To store the templates and match records you create, and to publish templates to the gallery when you choose to.',
                ],
            },
            {
                heading: '3. How long we keep it',
                items: [
                    'Sign-in and security records: 184 days from the time of the record, then deleted automatically by the database (deletion runs within about a minute after expiry).',
                    'Two-factor verification information and the privacy notice consent record: until the account is deleted; when a new version of this notice is published, the newer consent record applies.',
                    'Your account and the content you save: until the account is deleted.',
                    'Database backups: the most recent 14 days are kept and older ones are removed automatically. After a restore from backup, security records that have already expired are removed again, and the identifiers of deleted accounts are removed from the security records again.',
                    'Sign-in cookie: 30 days.',
                ],
            },
            {
                heading: '4. Third parties involved',
                items: [
                    'This service does not use advertising or analytics services and has no interface that passes your personal information to any other third party. To run the service, the following third parties process some of your information:',
                    `${HOST_PROVIDER}: hosts the API and database, located in ${HOST_LOCATION.en}. The data listed in section 1 is stored here.`,
                    'GitHub, Inc. (GitHub Pages): hosts the web front end. When you open the site, your IP address and your browser\'s standard request headers pass through its servers.',
                    'Google LLC (Google Fonts): when the page loads the Roboto font, your browser sends a request to Google\'s servers that includes your IP address and browser identifier.',
                    'Cloudflare, Inc.: provides domain name resolution. The website domain is routed through its network, so your requests to the website pass through its servers; the API domain uses its domain name resolution only.',
                    'The authenticator app you choose yourself: when you enrol in two-factor verification, the key is sent only to your device, and the app generates one-time codes on your device. We do not know which app you use.',
                    `Where the data is kept: the API and database are located in ${HOST_LOCATION.en}. Regardless of where you access the service from, your personal information is transferred to and processed in ${HOST_LOCATION.en}.`,
                ],
            },
            {
                heading: '5. Your rights and choices',
                items: [
                    'Access: view the sign-in records of your own account under "My sign-in history" on the settings page.',
                    'Rectification: your password can be reset by an administrator; your username currently cannot be changed.',
                    `Deletion: there is currently no self-service deletion. To delete your account, contact ${PRIVACY_OPERATOR.contactEmail}. After an account is deleted, the identifiers and IP addresses linked to that account in the sign-in and security records are removed, or the records are deleted together with it.`,
                    'Two-factor verification: standard accounts can turn it on or off on the settings page.',
                    'Withdrawing consent: you can choose "Disagree and sign out" on the confirmation page; you will need to confirm again before continuing to use the service.',
                    `Complaints: if you have a question or complaint about this notice or about how personal information is handled, contact ${PRIVACY_OPERATOR.contactEmail}. You may also contact the data protection authority where you live.`,
                ],
            },
            {
                heading: '6. Changes to this notice',
                items: [
                    'When the content of this notice changes, a new version is published. After a new version takes effect, you will need to read and confirm it again the next time you use the service.',
                ],
            },
            {
                heading: '7. Contact',
                items: [`Operator: ${PRIVACY_OPERATOR.name}`, `Email: ${PRIVACY_OPERATOR.contactEmail}`],
            },
        ],
    },
    'fr-CA': {
        title: 'Avis de confidentialité',
        intro: 'Le présent avis explique quelles informations personnelles Debate Match Timer recueille, dans quel but, pendant combien de temps elles sont conservées, quels tiers interviennent, ainsi que vos droits et nos coordonnées.',
        sections: [
            {
                heading: '1. Informations que nous recueillons',
                items: [
                    'Informations de compte : le nom d’utilisateur et le mot de passe que vous choisissez. Le mot de passe est conservé uniquement sous forme d’empreinte irréversible ; nous ne pouvons pas le consulter.',
                    'Informations de vérification en deux étapes (facultatives pour les comptes ordinaires, obligatoires pour les comptes administrateurs) : la clé servant à générer les codes à usage unique (conservée chiffrée), les codes de récupération à usage unique (seule l’empreinte est conservée) et l’intervalle de temps du dernier code utilisé.',
                    'Journal de connexion et de sécurité : enregistrements des inscriptions, connexions, vérifications en deux étapes et opérations de compte et d’administration, comprenant le type d’événement, l’heure, le compte concerné et l’adresse IP source. Lorsqu’une connexion échoue, le nom d’utilisateur saisi est aussi enregistré, mais seulement s’il respecte le format des noms d’utilisateur.',
                    'Registre de consentement : la version du présent avis que vous avez acceptée, et le moment de l’acceptation.',
                    'Contenu que vous enregistrez : modèles de débat (nom, réglages des étapes, noms des équipes et, si vous choisissez d’en fournir un, nom de signature) et relevés de matchs. Un modèle publié sur la galerie de modèles est visible par tous, mais le compte propriétaire n’est pas affiché ; un nom de signature apparaît uniquement si vous en fournissez un.',
                    'Ce service ne recueille pas : adresse courriel, numéro de téléphone, nom réel, date de naissance, identifiants d’appareil ni position géographique précise. Les pages ne contiennent aucun script de statistiques ou de publicité.',
                    'Données conservées sur votre appareil : langue de l’interface, mode sombre, préférences sonores, modèle utilisé le plus récemment et mémoire du rôle de télécommande sont stockés dans le stockage local de votre navigateur et ne sont pas envoyés au serveur. La coquille de l’application est mise en cache par le service worker du navigateur afin de pouvoir s’ouvrir hors ligne.',
                ],
            },
            {
                heading: '2. Finalités',
                items: [
                    'Créer et gérer votre compte et vous maintenir connecté.',
                    'Protéger les comptes et le système : les tentatives de connexion, d’inscription et de vérification en deux étapes sont limitées par adresse IP source et par compte ; les connexions réussies et échouées sont enregistrées afin que l’administrateur puisse examiner les accès non autorisés.',
                    'Consigner les actions des administrateurs sur les comptes, l’interrupteur d’inscription et le contenu de la galerie, afin de pouvoir les vérifier après coup.',
                    'Conserver les modèles et relevés de matchs que vous créez, et publier des modèles sur la galerie lorsque vous le choisissez.',
                ],
            },
            {
                heading: '3. Durées de conservation',
                items: [
                    'Journal de connexion et de sécurité : 184 jours à compter de l’enregistrement, puis suppression automatique par la base de données (la suppression s’exécute dans environ une minute après l’expiration).',
                    'Informations de vérification en deux étapes et registre de consentement : jusqu’à la suppression du compte ; lorsqu’une nouvelle version du présent avis est publiée, le consentement le plus récent fait foi.',
                    'Votre compte et le contenu que vous enregistrez : jusqu’à la suppression du compte.',
                    'Sauvegardes de la base de données : les 14 derniers jours sont conservés, les plus anciennes sont supprimées automatiquement. Après une restauration à partir d’une sauvegarde, les enregistrements de sécurité déjà expirés sont supprimés de nouveau, et les identifiants des comptes supprimés sont de nouveau retirés du journal.',
                    'Témoin de connexion : 30 jours.',
                ],
            },
            {
                heading: '4. Tiers concernés',
                items: [
                    'Ce service n’utilise aucun service de publicité ou de statistiques et ne comporte aucune interface transmettant vos informations personnelles à un autre tiers. Pour fonctionner, les tiers suivants traitent une partie de vos informations :',
                    `${HOST_PROVIDER} : héberge l’API et la base de données, situés à ${HOST_LOCATION['fr-CA']}. Les données énumérées à la section 1 sont conservées ici.`,
                    'GitHub, Inc. (GitHub Pages) : héberge le front-end web. Lorsque vous ouvrez le site, votre adresse IP et les en-têtes de requête standard de votre navigateur passent par ses serveurs.',
                    'Google LLC (Google Fonts) : lorsque la page charge la police Roboto, votre navigateur envoie une requête aux serveurs de Google contenant votre adresse IP et l’identifiant de votre navigateur.',
                    'Cloudflare, Inc. : fournit la résolution de noms de domaine. Le domaine du site web est acheminé par son réseau, donc vos requêtes vers le site web passent par ses serveurs ; le domaine de l’API n’utilise que sa résolution de noms.',
                    'L’application d’authentification que vous choisissez vous-même : lors de l’activation de la vérification en deux étapes, la clé n’est envoyée qu’à votre appareil, et l’application génère les codes à usage unique sur votre appareil. Nous ne savons pas quelle application vous utilisez.',
                    `Lieu de conservation des données : l’API et la base de données sont situées à ${HOST_LOCATION['fr-CA']}. Quel que soit l’endroit d’où vous accédez au service, vos informations personnelles sont transférées à ${HOST_LOCATION['fr-CA']} et y sont traitées.`,
                ],
            },
            {
                heading: '5. Vos droits et vos choix',
                items: [
                    'Accès : consultez l’historique de connexion de votre propre compte dans « Historique de mes connexions » à la page des paramètres.',
                    'Rectification : votre mot de passe peut être réinitialisé par un administrateur ; votre nom d’utilisateur ne peut actuellement pas être modifié.',
                    `Suppression : il n’existe actuellement aucune suppression autonome. Pour supprimer votre compte, écrivez à ${PRIVACY_OPERATOR.contactEmail}. Après la suppression d’un compte, les identifiants et adresses IP liés à ce compte dans le journal de connexion et de sécurité sont retirés, ou les enregistrements sont supprimés avec lui.`,
                    'Vérification en deux étapes : les comptes ordinaires peuvent l’activer ou la désactiver à la page des paramètres.',
                    'Retrait du consentement : vous pouvez choisir « Refuser et se déconnecter » à la page de confirmation ; vous devrez confirmer de nouveau avant de continuer à utiliser le service.',
                    `Plaintes : pour toute question ou plainte concernant le présent avis ou le traitement des informations personnelles, écrivez à ${PRIVACY_OPERATOR.contactEmail}. Vous pouvez aussi vous adresser à l’organisme de protection des renseignements personnels de votre lieu de résidence.`,
                ],
            },
            {
                heading: '6. Modifications du présent avis',
                items: [
                    'Lorsque le contenu du présent avis change, une nouvelle version est publiée. Après l’entrée en vigueur d’une nouvelle version, vous devrez la lire et la confirmer de nouveau à votre prochaine utilisation du service.',
                ],
            },
            {
                heading: '7. Coordonnées',
                items: [`Responsable : ${PRIVACY_OPERATOR.name}`, `Courriel : ${PRIVACY_OPERATOR.contactEmail}`],
            },
        ],
    },
});

function resolveLang(lng) {
    return SUPPORTED_NOTICE_LANGS.includes(lng) ? lng : 'en';
}

/** The current notice in `lng` (falls back to English), ready to be sent as JSON. */
export function getNotice(lng) {
    const resolved = resolveLang(lng);
    const notice = NOTICES[resolved];
    return {
        version: PRIVACY_NOTICE_VERSION,
        effectiveDate: PRIVACY_EFFECTIVE_DATE,
        lng: resolved,
        operator: { ...PRIVACY_OPERATOR },
        title: notice.title,
        intro: notice.intro,
        sections: notice.sections.map((section) => ({ heading: section.heading, items: [...section.items] })),
    };
}

/**
 * Placeholders still present in the notice ({{EFFECTIVE_DATE}} is expected
 * until release). Anything else here means the text was shipped unfinished.
 */
export function findUnresolvedPlaceholders() {
    const found = new Set();
    const scan = (text) => {
        for (const match of text.matchAll(/\{\{[A-Z0-9_]+\}\}/g)) {
            found.add(match[0]);
        }
    };
    for (const lng of SUPPORTED_NOTICE_LANGS) {
        const notice = getNotice(lng);
        scan(notice.title);
        scan(notice.intro);
        scan(notice.effectiveDate);
        for (const section of notice.sections) {
            scan(section.heading);
            section.items.forEach(scan);
        }
    }
    return [...found];
}
