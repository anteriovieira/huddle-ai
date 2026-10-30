import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App.jsx';
import { TooltipProvider } from './ui/Tooltip.jsx';

const root = createRoot(document.getElementById('app'));
root.render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Toaster
        theme="dark"
        position="bottom-center"
        richColors
        toastOptions={{
          style: {
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-strong)',
          },
        }}
      />
    </TooltipProvider>
  </StrictMode>,
);
