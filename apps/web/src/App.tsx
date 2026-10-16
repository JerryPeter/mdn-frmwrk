import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/Toaster';
import { useBootstrapSession } from '@/hooks/useBootstrapSession';
import { AppRouter } from '@/routes/AppRouter';
import { ApiError } from '@/api/errors';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // Error 4xx (akses, validasi) tidak perlu diulang
      retry: (count, err) => !(err instanceof ApiError && err.status && err.status < 500) && count < 2,
    },
  },
});

function SessionBootstrap() {
  useBootstrapSession();
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionBootstrap />
      <AppRouter />
      <Toaster />
    </QueryClientProvider>
  );
}
