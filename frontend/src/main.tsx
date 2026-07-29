import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './app/AuthProvider';
import { App } from './App';
import { registerServiceWorker } from './lib/pwa';
import './styles/tokens.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A school portal is not a trading terminal: refetching on every window
      // focus is noise. Data is refreshed on navigation and after mutations.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// Offline shell + install prompt (F22). Never blocks first paint, and a failed
// registration leaves a perfectly usable online-only app.
void registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
