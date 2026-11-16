// The "+" tools menu in the chat input. A dropdown (Radix DropdownMenu) with the "Web search"
// toggle. When a Firecrawl key is configured the row is a checkbox that flips web search on/off for
// this conversation; when it is not, the row is dimmed and acts as a shortcut into Settings (its
// preferences icon) so the user can add the key.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useT } from '../lib/i18n.js';
import { Icon } from './Icon.jsx';

const stop = (event) => event.stopPropagation();

export function ChatToolsMenu({ webSearch, available, onToggleWebSearch, onOpenSettings }) {
  const t = useT();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={`chatdock__tools${webSearch && available ? ' chatdock__tools--on' : ''}`}
          type="button"
          aria-label={t('chat.tools')}
          onClick={stop}
        >
          <Icon name="plus" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu chat-tools" side="top" align="start" sideOffset={6} collisionPadding={8} onClick={stop}>
          <div className="chat-tools__label">{t('chat.tools')}</div>
          {available ? (
            <DropdownMenu.CheckboxItem
              className="menu__item chat-tools__item"
              checked={webSearch}
              onCheckedChange={onToggleWebSearch}
              onSelect={(event) => event.preventDefault()}
            >
              <Icon name="globe" className="icon chat-tools__lead" />
              <span className="chat-tools__name">{t('chat.webSearch')}</span>
              <span className={`toggle-visual${webSearch ? ' toggle-visual--on' : ''}`} aria-hidden="true">
                <span className="toggle-visual__knob" />
              </span>
            </DropdownMenu.CheckboxItem>
          ) : (
            <DropdownMenu.Item
              className="menu__item chat-tools__item chat-tools__item--off"
              onSelect={onOpenSettings}
              aria-label={t('chat.webSearchNeedKey')}
            >
              <Icon name="globe" className="icon chat-tools__lead" />
              <span className="chat-tools__name">{t('chat.webSearch')}</span>
              <Icon name="sliders" className="icon chat-tools__prefs" />
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
