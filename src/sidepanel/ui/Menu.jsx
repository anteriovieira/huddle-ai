// A three-dots "kebab" menu (Radix DropdownMenu). `items` is a list of
// { label, icon?, onSelect, danger?, disabled? }; falsy entries are skipped. A { separator: true }
// entry draws a divider between groups (leading, trailing and doubled dividers are dropped, so
// groups made of conditional items stay tidy). `footer` is a muted, non-interactive last line.
// `size="md"` matches the regular 32px icon buttons; the default "sm" fits list rows.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useT } from '../lib/i18n.js';
import { Icon } from './Icon.jsx';

const stop = (event) => event.stopPropagation();

function tidy(items) {
  const out = [];
  for (const item of items) {
    if (!item) continue;
    if (item.separator && (out.length === 0 || out.at(-1).separator)) continue;
    out.push(item);
  }
  while (out.at(-1)?.separator) out.pop();
  return out;
}

export function KebabMenu({ label, items, side = 'bottom', align = 'end', size = 'sm', footer }) {
  const t = useT();
  const triggerLabel = label ?? t('menu.actions');
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={size === 'sm' ? 'icon-button icon-button--sm kebab' : 'icon-button kebab'}
          type="button"
          aria-label={triggerLabel}
          onClick={stop}
        >
          <Icon name="dots" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" side={side} align={align} sideOffset={4} collisionPadding={8} onClick={stop}>
          {tidy(items).map((item, i) =>
            item.separator ? (
              <DropdownMenu.Separator key={i} className="menu__sep" />
            ) : (
              <DropdownMenu.Item
                key={i}
                className={item.danger ? 'menu__item menu__item--danger' : 'menu__item'}
                disabled={item.disabled}
                onSelect={item.onSelect}
              >
                {item.icon && <Icon name={item.icon} />}
                <span>{item.label}</span>
              </DropdownMenu.Item>
            ),
          )}
          {footer && (
            <>
              <DropdownMenu.Separator className="menu__sep" />
              <DropdownMenu.Label className="menu__footer">{footer}</DropdownMenu.Label>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
