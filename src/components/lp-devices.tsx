import type { ReactNode } from 'react';
import { ScaleFrame } from './lp-scale';

/**
 * Device frames for the marketing page.
 *
 * Deliberately restrained: a near-black shell, a hairline white border, a
 * generous radius, and one large directional shadow — the register medicoHUB
 * uses for its mock-UI panels. Rendered aluminium and titanium read as
 * metallic noise once a device scales down, and they compete with the screen,
 * which is the actual subject.
 *
 * Both render at a fixed design width inside a ScaleFrame. A mockup that
 * reflows is a broken mockup: at phone widths the dashboard's columns would
 * collapse and every label would truncate.
 */

const MACBOOK_DESIGN_WIDTH = 940;
const IPHONE_DESIGN_WIDTH = 300;

export function MacBook({ children }: { children: ReactNode }) {
  return (
    <div className="lp-stage w-full">
      <ScaleFrame designWidth={MACBOOK_DESIGN_WIDTH}>
        <div className="mb">
          <div className="mb-body">
            <div className="mb-screen lp-screen-bg text-left">
              <div className="mb-notch" aria-hidden />
              {children}
            </div>
          </div>
          <div className="mb-base" aria-hidden />
          <div className="lp-reflect" aria-hidden />
        </div>
      </ScaleFrame>
    </div>
  );
}

export function IPhone({ children }: { children: ReactNode }) {
  return (
    <div className="lp-stage w-full">
      <ScaleFrame designWidth={IPHONE_DESIGN_WIDTH} className="flex justify-center">
        <div className="ip">
          <div className="ip-body">
            <div className="ip-screen lp-screen-bg text-left">
              {/* Content flows behind the island, as it does in iOS. */}
              <div className="ip-island" aria-hidden />
              {children}
            </div>
          </div>
        </div>
      </ScaleFrame>
    </div>
  );
}
