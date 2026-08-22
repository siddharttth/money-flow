import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Serif, Montserrat, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

/**
 * Plex, because a ledger should read like a record, not a marketing page.
 * Mono carries every rupee figure — fixed-width digits are the whole reason
 * passbook columns are scannable. Serif is reserved for the wordmark.
 * next/font self-hosts these at build time, so there is no runtime request.
 */
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

const serif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-serif',
  display: 'swap',
});

/** Marketing-only faces. The app itself never uses these. */
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700', '900'],
  variable: '--font-display',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Money Flow — precision in every entry',
  description:
    'A personal expense ledger that separates what you spent on from who it was with. Replace the spreadsheet, keep the speed.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the header/nav sit under the notch on iOS.
  viewportFit: 'cover',
  // Android Chrome resizes the layout around the keyboard with this; iOS is
  // handled via visualViewport in the Modal.
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0e141d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${serif.variable} ${montserrat.variable} ${jakarta.variable}`}>
      <head>
        {/* Applies the saved theme before first paint so there is no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('mf-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
