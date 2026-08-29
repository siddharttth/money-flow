import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

/**
 * One type system across the marketing page and the app.
 *
 * Montserrat carries headings and the wordmark; Plus Jakarta Sans is the UI
 * face. Plex Mono stays for rupee figures only — fixed-width digits are why a
 * ledger column is scannable, and no proportional face gives that.
 */
/*
 * Landing page only. A high-contrast display serif with real character —
 * Fraunces' optical-size axis lets the huge hero settings tighten the way
 * watch-dial and masthead type does. The app never loads it for layout.
 */
const serif = Fraunces({
  subsets: ['latin'],
  // Both styles: without 'italic' next/font ships only the roman, and the
  // browser fakes the italic by slanting it. Fraunces has a true italic with
  // different letterforms, which is what the emphasis lines are set in.
  style: ['normal', 'italic'],
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--ff-serif',
  display: 'swap',
});

/* The UI face, across the marketing page and the app. */
const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--ff-grotesk',
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
    <html lang="en" suppressHydrationWarning className={`${serif.variable} ${grotesk.variable} ${mono.variable}`}>
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
