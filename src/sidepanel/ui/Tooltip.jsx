// Accessible tooltips via Radix. `Provider` wraps the app once; `Tooltip` wraps any single
// focusable/hoverable element and shows `label` on hover or keyboard focus. With no label it
// renders the child untouched, so it is safe to use everywhere.

import * as RadixTooltip from '@radix-ui/react-tooltip';

export function TooltipProvider({ children }) {
  return (
    <RadixTooltip.Provider delayDuration={250} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({ label, children, side = 'top', align = 'center' }) {
  if (!label) return children;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip" side={side} align={align} sideOffset={6} collisionPadding={8}>
          {label}
          <RadixTooltip.Arrow className="tooltip__arrow" width={11} height={6} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
