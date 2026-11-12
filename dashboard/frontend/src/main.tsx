import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Toaster, toast } from 'sonner';
import App from './App';
import { ConfirmHost } from './components/ConfirmDialog';
import { AuthProvider } from './context/AuthContext';
import { getErrorMessage } from './hooks/useGuildConfig';
import './styles/globals.css';

const queryClient = new QueryClient({
  // Mutations that handle their own errors (inline form errors) opt out by defining onError.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (!mutation.options.onError) toast.error(getErrorMessage(error as AxiosError));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <ConfirmHost />
          <Toaster theme="dark" position="bottom-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
