// A three-dots "kebab" menu (Radix DropdownMenu). `items` is a list of
// { label, icon?, onSelect, danger?, disabled? }; falsy entries are skipped.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Icon } from './Icon.jsx';

const stop = (event) => event.stopPropagation();

export function KebabMenu({ label = 'Ações', items, side = 'bottom', align = 'end' }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="icon-button icon-button--sm kebab" type="button" aria-label={label} onClick={stop}>
          <Icon name="dots" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" side={side} align={align} sideOffset={4} collisionPadding={8} onClick={stop}>
          {items.filter(Boolean).map((item, i) => (
            <DropdownMenu.Item
              key={i}
              className={item.danger ? 'menu__item menu__item--danger' : 'menu__item'}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.icon && <Icon name={item.icon} />}
              <span>{item.label}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
