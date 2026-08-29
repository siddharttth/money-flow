import Image from 'next/image';

/**
 * The Money Flow mark.
 *
 * It is a symbol rather than a wordmark, and its darker half is close in value
 * to the deep greens it sits on, so `onDark` lifts it rather than letting it
 * sink into the surface. The alt text carries the brand name, since the mark
 * alone does not spell it.
 */
export function Logo({
  height = 26,
  onDark = false,
  className = '',
}: {
  height?: number;
  onDark?: boolean;
  className?: string;
}) {
  // Intrinsic 759x344 after trimming.
  const width = Math.round((height * 759) / 344);

  return (
    <Image
      src="/logo.png"
      alt="Money Flow"
      width={width}
      height={height}
      priority
      className={className}
      style={
        onDark
          ? { filter: 'brightness(1.65) saturate(0.9)', height, width: 'auto' }
          : { height, width: 'auto' }
      }
    />
  );
}
