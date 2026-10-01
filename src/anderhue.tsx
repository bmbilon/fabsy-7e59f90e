import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import StaffApp from '@/anderhue/staff/StaffApp';
import './index.css';
import './styles/anderhue-app.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter><StaffApp /></BrowserRouter>
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>,
);
