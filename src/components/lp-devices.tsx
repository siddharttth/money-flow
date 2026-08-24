import type { ReactNode } from 'react';
import { ScaleFrame } from './lp-scale';

/**
 * Device chrome for the marketing page.
 *
 * Hand-built rather than pulled from a device-frameset package: those ship
 * notch-era iPhones with fixed light/dark chrome that cannot be tinted into
 * this palette. CSS gradients give us the aluminium and titanium facets, the
 * camera housing and the Dynamic Island in the same colour system.
 *
 * Both frames render at a fixed design width inside a ScaleFrame. A mockup
 * that reflows is a broken mockup — at phone widths the dashboard's columns
 * would collapse and every label would truncate.
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
          <div className="mb-hinge" aria-hidden />
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
            <div className="ip-inner">
              <div className="ip-screen lp-screen-bg text-left">
                {/* Content flows behind the island, as it does in iOS. */}
                <div className="ip-island" aria-hidden />
                {children}
              </div>
            </div>
          </div>
          <span className="ip-btn ip-btn-action" aria-hidden />
          <span className="ip-btn ip-btn-vol-up" aria-hidden />
          <span className="ip-btn ip-btn-vol-down" aria-hidden />
          <span className="ip-btn ip-btn-power" aria-hidden />
          <div className="lp-reflect !w-[72%] !h-16" aria-hidden />
        </div>
      </ScaleFrame>
    </div>
  );
}
