import type { Metadata } from 'next';
import { DM_Sans, JetBrains_Mono, Noto_Sans_Arabic } from 'next/font/google';
import { I18nProvider } from '@/components/i18n-provider';
import { getLang } from '@/lib/i18n-server';
import { Providers } from '@/components/providers';
import { ScrollProgress } from '@/components/scroll-progress';
import { SiteBackdrop } from '@/components/site-backdrop';
import { ChatLauncher } from '@/components/chat-launcher';
import { cookies } from 'next/headers';
import './globals.css';

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });
const arabic = Noto_Sans_Arabic({ subsets: ['arabic'], variable: '--font-noto-arabic', weight: ['400', '500', '700'] });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', weight: ['500', '700'] });

export const metadata: Metadata = {
  title: 'Codiq: Think it. Code it.',
  description: 'Programming classes for kids, secondary students and college students in Egypt.',
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon-180.png' },
};

const THEME_INIT = `try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  // UI hint only (hides the chat button for staff); the API checks the real session on every request.
  let role: string | null = null;
  try { role = JSON.parse(Buffer.from((await cookies()).get('access_token')?.value.split('.')[1] ?? '', 'base64url').toString()).role ?? null; } catch { /* signed out */ }
  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} className={`${sans.variable} ${mono.variable} ${arabic.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <I18nProvider lang={lang}><SiteBackdrop /><ScrollProgress /><Providers>{children}<ChatLauncher role={role} /></Providers></I18nProvider>
      </body>
    </html>
  );
}
