import Image from 'next/image';

/**
 * The Money Flow mark.
 *
 * It is a symbol rather than a wordmark, and its darker half is close in value
 * to the deep greens it sits on, so on an ink background it has to be lifted or
 * it sinks into the surface. That lift is a token, `--logo-filter`, set once per
 * theme — a boolean prop could not follow a theme the user changes at runtime,
 * and got it wrong on every screen where the surface and the theme disagreed.
 *
 * The alt text carries the brand name, since the mark alone does not spell it.
 */
export function Logo({
  height = 26,
  /** Forces the lift for a mark sitting on a dark panel inside a light theme —
   *  the landing page's forest sections, which never follow the app's theme. */
  onDark = false,
  className = '',
}: {
  height?: number;
  onDark?: boolean;
  className?: string;
}) {
  // Intrinsic 900x409, trimmed to the mark's own bounds.
  const width = Math.round((height * 900) / 409);

  return (
    <Image
      src="/logo.png"
      alt="Money Flow"
      width={width}
      height={height}
      priority
      className={className}
      style={{ filter: onDark ? 'brightness(1.7) saturate(0.85)' : 'var(--logo-filter)', height, width: 'auto' }}
    />
  );
}
