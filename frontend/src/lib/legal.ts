import type { Lang } from './i18n';

export interface LegalDoc { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] }

/** Must match TERMS_VERSION in backend/src/auth/auth.service.ts. Bump both when the text changes in a way people must accept again. */
export const LEGAL_VERSION = '2026-10-30';

const contactLine = (lang: Lang) => {
  const mail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  if (lang === 'ar') return mail ? `تواصل معنا على ${mail} أو من خلال زر المحادثة داخل الموقع.` : 'تواصل معنا من خلال زر المحادثة داخل الموقع.';
  return mail ? `Contact us at ${mail} or through the chat button on the site.` : 'Contact us through the chat button on the site.';
};

export function getLegal(kind: 'terms' | 'privacy', lang: Lang): LegalDoc {
  return (lang === 'ar' ? AR : EN)(kind);
}

const EN = (kind: 'terms' | 'privacy'): LegalDoc => kind === 'terms' ? {
  title: 'Terms of Use',
  updated: 'Last updated 30 October 2026',
  intro: 'These terms are the agreement between you and Codiq for using our website and classes. Please read them. If a child is using Codiq, a parent or guardian should read them too.',
  sections: [
    { h: '1. Who we are', p: ['Codiq is an online programming school in Egypt with three tracks: Kids (ages 8 to 16), School (the Egyptian secondary curriculum) and College. We teach through live classes and recorded lessons, with materials, assignments and quizzes.'] },
    { h: '2. Accounts and age', p: [
      'You must give correct information and keep your password private. One person, one account.',
      'Students under 18 may use Codiq only with the permission of a parent or legal guardian. By creating an account for yourself as a student under 18, you confirm that your parent or guardian knows about it and agrees. Parents can link to their child\'s account to follow progress (see the next section).',
      'A parent who signs up confirms that they are an adult and responsible for any child they link.',
    ] },
    { h: '3. Parents and guardians', p: [
      'A parent can ask to link to a student account. Nothing is shared until the student accepts the request. When a parent is linked they can see the student\'s courses, attendance, quiz scores, assignment grades and feedback, certificates, and they receive emails about new assignments, grades and weekly progress.',
      'When a parent asks to link a child, they confirm that they are the child\'s parent or legal guardian. Pretending to be someone\'s parent is a reason to close the account.',
    ] },
    { h: '4. Classes and content', p: [
      'Lessons, slides, recordings and other materials belong to Codiq or its instructors. You get a personal, non-transferable licence to use them for your own learning while your access is active.',
      'Do not share, resell, copy or publish recordings, materials, quiz answers or links to unlisted videos. Do not record live classes without permission.',
      'Your own work (assignments, code, drawings) stays yours. You allow us, your instructors and your linked parent to see it for teaching and grading.',
    ] },
    { h: '5. Behaviour in live classes', p: [
      'Be respectful. No bullying, insults, inappropriate content or spam. Hosts and co-hosts can mute you, ask you to turn your microphone or camera on or off, or remove you from a class, and an admin can remove an account that breaks these rules.',
      'During live classes we measure attendance and engagement: when you joined, how long you stayed, whether the class tab was open and in focus, how long your camera and microphone were on, and how often you took part (chat, raised hands, whiteboard, code). Instructors and linked parents can see this report. We do not record your camera or microphone for this; the video and audio of a class are recorded only when a host starts a recording, and the class is told.',
    ] },
    { h: '6. Prices, payment, renewal and refunds', p: [
      'Prices are in Egyptian pounds (EGP) and are shown before you pay. Payments are handled by our payment partners (card, wallet and instalment payments through Paymob, Fawry codes, or InstaPay with a receipt that we check). We never see or store your full card number.',
      'A one-time package gives access for as long as the package is offered to you. A monthly package gives access for 30 days from each payment. A monthly plan renews automatically only if you chose to save your card and turn automatic renewal on, and you can turn it off at any time before the renewal date. We email you before a plan ends.',
      'Refunds: if you ask within 7 days of your first payment for a package and have used less than a quarter of it, we refund the payment. After that, payments are not refundable, except where the law says otherwise or when we cancel a class and cannot replace it. Refunds go back to the original payment method and may take several days.',
    ] },
    { h: '7. Certificates', p: ['A certificate is issued when you finish every session of a package. Each certificate has a number anyone can check on our website. We may withdraw a certificate that was obtained by cheating.'] },
    { h: '8. What we do not promise', p: [
      'We work to keep Codiq running and accurate, but we cannot promise that it will always be available or free of errors. Live classes depend on your internet connection and device.',
      'To the extent the law allows, Codiq is not responsible for indirect losses, and our total responsibility for a claim is limited to the amount you paid for the package concerned.',
    ] },
    { h: '9. Ending your account', p: ['You can stop using Codiq at any time and delete your account from your profile page. We can suspend or close accounts that break these terms. Rules about refunds in section 6 still apply.'] },
    { h: '10. Changes and law', p: [
      'We may update these terms. If a change matters (for example, how we use data), we will tell you and ask you to accept it again. The date at the top shows the current version.',
      'These terms follow the laws of the Arab Republic of Egypt, and the courts of Cairo can hear disputes, unless the law gives you the right to go to court where you live.',
    ] },
    { h: '11. Contact', p: [contactLine('en')] },
  ],
} : {
  title: 'Privacy Policy',
  updated: 'Last updated 30 October 2026',
  intro: 'This explains what information Codiq collects, why, who sees it and what you can do about it. Many of our students are children, so we keep it to what we need to teach them. We handle personal data under the Egyptian Personal Data Protection Law (Law 151 of 2020).',
  sections: [
    { h: '1. What we collect', p: [
      'Account: name, email, mobile number (optional), password (stored only as a one-way hash), track, profile picture (optional), and your Google account name, email and picture if you sign in with Google.',
      'Learning: courses you joined, lessons completed and where you stopped watching, quiz answers and scores, assignment answers and files, grades and feedback, certificates.',
      'Live classes: attendance and engagement figures (join and leave times, time the class tab was in focus, camera and microphone time, number of interactions), chat messages, whiteboard and shared code. Video and audio travel live through our video provider; they are saved only if a host records the class.',
      'Payments: package, amount, status and reference of each payment, and the receipt image if you pay by InstaPay. Card numbers are entered on the payment provider\'s page and are not stored by Codiq. If you save a card for automatic renewal, the provider keeps the card and gives us a token and the last four digits.',
      'Support: messages you send to our team in the chat, and your contact details if you are not logged in.',
      'Technical: login sessions, language and theme choices, and basic logs (IP address, browser, time) to keep the service secure.',
    ] },
    { h: '2. Why we use it', p: [
      'To run your account, teach and grade, give you access to the classes you paid for, process payments, issue certificates, send reminders, answer support, keep the site secure and prevent fraud.',
      'To show progress to the people who should see it: you, your instructors and your linked parent.',
      'We do not sell personal data, we do not show advertising, and we do not build advertising profiles of children.',
    ] },
    { h: '3. Children', p: [
      'Students under 18 need the permission of a parent or legal guardian to use Codiq. A parent confirms they are the guardian when they link to a student account, and the student must accept before anything is shared.',
      'A linked parent can see the student\'s courses, attendance, engagement, quiz scores, grades and feedback and receives emails about assignments, grades and weekly progress. A parent can ask us to access, correct or delete their child\'s data at any time.',
    ] },
    { h: '4. Emails', p: ['We send account emails (welcome, password reset, payment receipts) and, unless you turn them off in your profile, class reminders, plan renewal reminders, grade and assignment notices to parents and a weekly progress summary to parents. Turning notifications off does not stop password and payment emails.'] },
    { h: '5. Who we share it with', p: [
      'Only the services that help us run Codiq, and only what they need: database hosting (a managed PostgreSQL provider), file storage (Cloudflare R2), live video (LiveKit), email delivery (Resend), payment processing (Paymob, Fawry, InstaPay), and Google for sign-in and for the YouTube player that plays our unlisted lesson videos. YouTube and Google may use their own cookies and process data under their own policies when a video plays.',
      'Instructors, assistants and admins at Codiq can see the information they need to teach and support you. We share data with authorities only when the law requires it.',
      'Some of these services keep data on servers outside Egypt. We choose providers that protect data with security measures such as encryption in transit.',
    ] },
    { h: '6. How long we keep it', p: ['We keep your account data while your account is active. When you delete your account we erase your personal data straight away (name, email, progress, submissions, certificates, chats and profile picture), except records we must keep by law, such as payment records for accounting, which stay without your name. Recordings of live classes are kept for as long as the package is offered, so students can review them.'] },
    { h: '7. Security', p: ['Passwords are hashed, connections use HTTPS, access to data is limited by role (for example, a parent sees only their linked child), and admin pages are protected. No system is perfectly secure; if there is a breach that affects you, we will tell you and the authorities as the law requires.'] },
    { h: '8. Cookies', p: ['We use only the cookies the site needs: your login session, your language and your theme. We do not use advertising cookies. Embedded YouTube videos and Google sign-in may set their own cookies.'] },
    { h: '9. Your rights', p: ['You can see your data, correct it, delete it, limit how we use it, or withdraw consent. In your profile you can change your name, phone and email preferences, download everything we hold about you as a file ("Download my data"), and delete your account yourself ("Delete my account"). Parents can ask us to do the same for a linked child. For anything else, ask us in the chat. If you are not satisfied, you can complain to the Personal Data Protection Centre in Egypt.'] },
    { h: '10. Changes', p: ['If we change this policy in a way that matters, we will tell you and, where needed, ask for your consent again. The date at the top shows the current version.'] },
    { h: '11. Contact', p: [contactLine('en')] },
  ],
};

const AR = (kind: 'terms' | 'privacy'): LegalDoc => kind === 'terms' ? {
  title: 'شروط الاستخدام',
  updated: 'آخر تحديث ٣٠ أكتوبر ٢٠٢٦',
  intro: 'دي الشروط اللي بتنظّم استخدامك لموقع وحصص كوديك. من فضلك اقراها. ولو الطالب طفل، يبقى لازم ولي الأمر يقراها كمان.',
  sections: [
    { h: '١. إحنا مين', p: ['كوديك مدرسة برمجة أونلاين في مصر، فيها ثلاث مسارات: الأطفال (من ٨ لـ ١٦ سنة)، والمدرسة (منهج الثانوي المصري)، والجامعة. بنعلّم من خلال حصص لايف ودروس مسجّلة، ومعاها مواد وتكاليف وكويزات.'] },
    { h: '٢. الحسابات والسن', p: [
      'لازم تدّي بيانات صحيحة وتحافظ على سرية كلمة المرور. كل شخص ليه حساب واحد.',
      'الطلاب تحت ١٨ سنة ما يستخدموش كوديك إلا بموافقة ولي الأمر أو الوصي القانوني. لما تعمل حساب طالب وسنك أقل من ١٨، إنت بتأكد إن ولي أمرك عارف وموافق. وولي الأمر يقدر يربط حسابه بحساب ابنه عشان يتابع مستواه (اقرا البند اللي بعده).',
      'ولي الأمر اللي بيسجّل بيأكد إنه بالغ ومسؤول عن أي طفل بيربطه بحسابه.',
    ] },
    { h: '٣. أولياء الأمور', p: [
      'ولي الأمر يقدر يطلب ربط حسابه بحساب طالب. مفيش أي بيانات بتتشارك إلا بعد ما الطالب يوافق على الطلب. بعد الربط يقدر ولي الأمر يشوف كورسات الطالب وحضوره ودرجات الكويزات وتقييم التكاليف والتعليقات والشهادات، وبيوصله إيميلات بالتكاليف الجديدة والدرجات وتقرير أسبوعي.',
      'لما ولي الأمر يطلب ربط ابنه، بيأكد إنه والد الطفل أو وصيه القانوني. انتحال صفة ولي الأمر سبب لإغلاق الحساب.',
    ] },
    { h: '٤. الحصص والمحتوى', p: [
      'الدروس والشرائح والتسجيلات وباقي المواد ملك لكوديك أو لمدرّسيها. وإنت بتاخد ترخيص شخصي غير قابل للنقل لاستخدامها في تعلّمك إنت بس طول ما اشتراكك شغّال.',
      'ما تشاركش ولا تبيع ولا تنسخ ولا تنشر التسجيلات أو المواد أو إجابات الكويز أو روابط الفيديوهات غير المدرجة. وما تسجّلش الحصص اللايف من غير إذن.',
      'شغلك (التكاليف والكود والرسومات) يفضل ملكك. وإنت بتسمح لينا ولمدرّسيك ولولي أمرك المرتبط إنهم يشوفوه عشان التدريس والتقييم.',
    ] },
    { h: '٥. السلوك في الحصص اللايف', p: [
      'احترم الكل. ممنوع التنمر والإهانة والمحتوى غير المناسب والرسائل المزعجة. المضيف والمضيف المشارك يقدروا يكتموا صوتك، أو يطلبوا منك تفتح أو تقفل الميكروفون أو الكاميرا، أو يشيلوك من الحصة، والإدارة تقدر تقفل أي حساب بيخالف القواعد دي.',
      'في الحصص اللايف بنقيس الحضور والتفاعل: وقت دخولك، ومدة وجودك، وهل صفحة الحصة كانت مفتوحة ومركّز عليها، ومدة تشغيل الكاميرا والميكروفون، وعدد مرات مشاركتك (الشات، رفع اليد، السبورة، الكود). المدرّسون وولي الأمر المرتبط يقدروا يشوفوا التقرير ده. إحنا ما بنسجّلش كاميرتك أو ميكروفونك لده. صوت وصورة الحصة بيتسجّلوا بس لما المضيف يبدأ تسجيل، والحصة كلها بتعرف.',
    ] },
    { h: '٦. الأسعار والدفع والتجديد والاسترداد', p: [
      'الأسعار بالجنيه المصري وبتظهر قبل ما تدفع. الدفع بيتم من خلال شركائنا (كارت ومحافظ وتقسيط عن طريق باي موب، وأكواد فوري، أو إنستاباي مع إيصال بنراجعه). إحنا ما بنشوفش ولا بنخزّن رقم كارتك كامل.',
      'الباقة لمرة واحدة بتديك وصول طول ما الباقة متاحة لك. والباقة الشهرية بتديك وصول ٣٠ يوم من كل دفعة. الباقة الشهرية بتتجدد تلقائيًا بس لو إنت اخترت تحفظ كارتك وتفعّل التجديد التلقائي، وتقدر توقفه في أي وقت قبل موعد التجديد. وبنبعتلك إيميل قبل ما الباقة تخلص.',
      'الاسترداد: لو طلبت خلال ٧ أيام من أول دفعة للباقة وكنت استخدمت أقل من ربعها، بنرجّع المبلغ. بعد كده الدفعات مش بتترد، إلا لو القانون بيقول غير كده أو لو لغينا حصة وماقدرناش نعوّضها. الاسترداد بيرجع على وسيلة الدفع الأصلية وممكن ياخد كام يوم.',
    ] },
    { h: '٧. الشهادات', p: ['الشهادة بتتصدر لما تخلّص كل حصص الباقة. ولكل شهادة رقم يقدر أي حد يتأكد منه من موقعنا. ممكن نسحب أي شهادة اتحصل عليها بالغش.'] },
    { h: '٨. اللي مش بنضمنه', p: [
      'بنشتغل عشان كوديك يفضل شغّال ودقيق، بس مانقدرش نضمن إنه يكون متاح دايمًا أو من غير أخطاء. والحصص اللايف بتعتمد على النت والجهاز عندك.',
      'في حدود ما يسمح به القانون، كوديك مش مسؤولة عن الخسائر غير المباشرة، ومسؤوليتنا في أي مطالبة محدودة بالمبلغ اللي دفعته للباقة المعنية.',
    ] },
    { h: '٩. إنهاء الحساب', p: ['تقدر توقف استخدام كوديك في أي وقت وتمسح حسابك من ملفك الشخصي. ونقدر نوقف أو نقفل الحسابات اللي بتخالف الشروط دي. وقواعد الاسترداد في البند ٦ تفضل سارية.'] },
    { h: '١٠. التعديلات والقانون', p: [
      'ممكن نحدّث الشروط دي. ولو التعديل مهم (زي طريقة استخدام البيانات) هنبلّغك ونطلب موافقتك من جديد. التاريخ فوق بيوضح النسخة الحالية.',
      'الشروط دي بتخضع لقوانين جمهورية مصر العربية، ومحاكم القاهرة هي المختصة بأي نزاع، إلا لو القانون أعطاك الحق في اللجوء لمحكمة محل إقامتك.',
    ] },
    { h: '١١. التواصل', p: [contactLine('ar')] },
  ],
} : {
  title: 'سياسة الخصوصية',
  updated: 'آخر تحديث ٣٠ أكتوبر ٢٠٢٦',
  intro: 'هنا بنوضّح إيه المعلومات اللي بتجمعها كوديك، وليه، ومين بيشوفها، وإيه اللي تقدر تعمله فيها. كتير من طلابنا أطفال، فبنكتفي بالمطلوب للتعليم بس. وبنتعامل مع البيانات الشخصية وفق قانون حماية البيانات الشخصية المصري (القانون ١٥١ لسنة ٢٠٢٠).',
  sections: [
    { h: '١. إيه اللي بنجمعه', p: [
      'الحساب: الاسم، والإيميل، ورقم الموبايل (اختياري)، وكلمة المرور (بتتخزن مشفّرة في اتجاه واحد بس)، والمسار، وصورة الملف الشخصي (اختيارية)، واسم وإيميل وصورة حساب جوجل لو سجّلت دخول بجوجل.',
      'التعلّم: الكورسات اللي اشتركت فيها، والدروس اللي خلّصتها وآخر نقطة وقفت عندها في الفيديو، وإجابات ودرجات الكويزات، وإجابات وملفات التكاليف، والدرجات والتعليقات، والشهادات.',
      'الحصص اللايف: أرقام الحضور والتفاعل (وقت الدخول والخروج، ومدة تركيزك على صفحة الحصة، ومدة الكاميرا والميكروفون، وعدد المشاركات)، ورسائل الشات، والسبورة والكود المشترك. الصوت والصورة بيعدّوا لايف عن طريق مزوّد الفيديو، ومابيتحفظوش إلا لو المضيف سجّل الحصة.',
      'المدفوعات: الباقة والمبلغ وحالة كل دفعة ومرجعها، وصورة الإيصال لو دفعت بإنستاباي. أرقام الكروت بتتكتب في صفحة مزوّد الدفع ومابتتخزنش عندنا. ولو حفظت كارت للتجديد التلقائي، المزوّد هو اللي بيحتفظ بالكارت وبيدينا رمز وآخر ٤ أرقام.',
      'الدعم: الرسائل اللي بتبعتها لفريقنا في الشات، وبيانات التواصل لو مش مسجّل دخول.',
      'تقنية: جلسات الدخول، واختيارات اللغة والمظهر، وسجلات أساسية (عنوان IP والمتصفح والوقت) عشان نحافظ على أمان الخدمة.',
    ] },
    { h: '٢. ليه بنستخدمها', p: [
      'عشان نشغّل حسابك، ونعلّم ونقيّم، ونديك الوصول للحصص اللي دفعت ثمنها، ونتمّم الدفع، ونصدر الشهادات، ونبعت التذكيرات، ونرد على الدعم، ونحمي الموقع ونمنع الاحتيال.',
      'وعشان نعرض المستوى للأشخاص اللي من حقهم يشوفوه: إنت، ومدرّسينك، وولي أمرك المرتبط.',
      'مابنبيعش بيانات شخصية، ومابنعرضش إعلانات، ومابنعملش ملفات إعلانية للأطفال.',
    ] },
    { h: '٣. الأطفال', p: [
      'الطلاب تحت ١٨ سنة محتاجين موافقة ولي الأمر أو الوصي القانوني لاستخدام كوديك. ولي الأمر بيأكد إنه الوصي لما يربط حسابه بحساب طالب، والطالب لازم يوافق قبل ما أي حاجة تتشارك.',
      'ولي الأمر المرتبط يقدر يشوف كورسات الطالب وحضوره وتفاعله ودرجات الكويزات والتقييمات والتعليقات، وبتوصله إيميلات بالتكاليف والدرجات والتقرير الأسبوعي. وولي الأمر يقدر يطلب في أي وقت الاطلاع على بيانات ابنه أو تصحيحها أو حذفها.',
    ] },
    { h: '٤. الإيميلات', p: ['بنبعت إيميلات الحساب (الترحيب وإعادة تعيين كلمة المرور وإيصالات الدفع)، وكمان — إلا لو قفلتها من ملفك الشخصي — تذكيرات الحصص وتجديد الباقة، وإشعارات التكاليف والدرجات لأولياء الأمور، وتقرير أسبوعي لهم. قفل الإشعارات مابيوقفش إيميلات كلمة المرور والدفع.'] },
    { h: '٥. بنشارك البيانات مع مين', p: [
      'بس مع الخدمات اللي بتساعدنا نشغّل كوديك، وبس اللي بتحتاجه: استضافة قاعدة البيانات (مزوّد PostgreSQL مُدار)، وتخزين الملفات (Cloudflare R2)، والفيديو اللايف (LiveKit)، وإرسال الإيميلات (Resend)، ومعالجة الدفع (باي موب وفوري وإنستاباي)، وجوجل لتسجيل الدخول ولمشغّل يوتيوب اللي بيعرض فيديوهات الدروس غير المدرجة. يوتيوب وجوجل ممكن يستخدموا كوكيز خاصة بيهم ويعالجوا بيانات وفق سياساتهم لما الفيديو يشتغل.',
      'المدرّسون والمساعدون والإدارة في كوديك بيشوفوا المعلومات اللي بيحتاجوها للتدريس والدعم بس. ومابنشاركش بيانات مع الجهات الرسمية إلا لو القانون طلب كده.',
      'بعض الخدمات دي بتحفظ البيانات على سيرفرات خارج مصر. وبنختار مزوّدين بيحموا البيانات بإجراءات أمان زي التشفير أثناء النقل.',
    ] },
    { h: '٦. بنحتفظ بيها قد إيه', p: ['بنحتفظ ببيانات حسابك طول ما الحساب شغّال. ولما تمسح حسابك بنمسح بياناتك الشخصية فورًا (الاسم والإيميل والمستوى والتكاليف والشهادات والمحادثات وصورة الملف الشخصي)، ما عدا السجلات اللي القانون بيلزمنا نحتفظ بيها زي سجلات الدفع للمحاسبة، وبتفضل من غير اسمك. وتسجيلات الحصص اللايف بتفضل طول ما الباقة متاحة عشان الطلاب يراجعوها.'] },
    { h: '٧. الأمان', p: ['كلمات المرور بتتخزن مشفّرة، والاتصالات بتتم عبر HTTPS، والوصول للبيانات محدود حسب الدور (مثلًا ولي الأمر بيشوف ابنه المرتبط بس)، وصفحات الإدارة محمية. مفيش نظام آمن ١٠٠٪؛ ولو حصل اختراق يخصّك هنبلّغك والجهات المختصة زي ما القانون بيطلب.'] },
    { h: '٨. الكوكيز', p: ['بنستخدم بس الكوكيز اللازمة للموقع: جلسة الدخول، واللغة، والمظهر. مابنستخدمش كوكيز إعلانية. وفيديوهات يوتيوب المدمجة وتسجيل الدخول بجوجل ممكن يحطوا كوكيز خاصة بيهم.'] },
    { h: '٩. حقوقك', p: ['تقدر تشوف بياناتك أو تصحّحها أو تمسحها أو تقيّد استخدامها أو تسحب موافقتك. من ملفك الشخصي تقدر تغيّر اسمك وموبايلك وتفضيلات الإيميل، وتحمّل كل اللي عندنا عنك في ملف ("حمّل بياناتي")، وتمسح حسابك بنفسك ("امسح حسابي"). وأولياء الأمور يقدروا يطلبوا منّا نفس الحاجة لابنهم المرتبط. لأي حاجة تانية اطلب منّا في الشات. ولو مش راضي تقدر تقدّم شكوى لمركز حماية البيانات الشخصية في مصر.'] },
    { h: '١٠. التعديلات', p: ['لو عدّلنا السياسة دي بشكل مهم هنبلّغك وهنطلب موافقتك من جديد لو لزم. التاريخ فوق بيوضح النسخة الحالية.'] },
    { h: '١١. التواصل', p: [contactLine('ar')] },
  ],
};
