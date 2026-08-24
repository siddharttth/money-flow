import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono, Montserrat, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

/**
 * One type system across the marketing page and the app.
 *
 * Montserrat carries headings and the wordmark; Plus Jakarta Sans is the UI
 * face. Plex Mono stays for rupee figures only — fixed-width digits are why a
 * ledger column is scannable, and no proportional face gives that.
 */
const display = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700', '900'],
  variable: '--ff-display',
  display: 'swap',
});

const ui = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--ff-ui',
  display: 'swap',
});

/*
 * Landing page only. A high-contrast display serif with real character —
 * Fraunces' optical-size axis lets the huge hero settings tighten the way
 * watch-dial and masthead type does. The app never loads it for layout.
 */
const serif = Fraunces({
  subsets: ['latin'],
  // Variable font: the full weight range plus the optical-size axis, so the
  // huge hero settings can tighten the way display type should.
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--ff-serif',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--ff-mono',
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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${ui.variable} ${mono.variable} ${serif.variable}`}>
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
