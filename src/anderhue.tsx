import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import AnderHuePortal from '@/pages/AnderHuePortal';
import './index.css';
import './styles/anderhue-portal.css';

const queryClient = new QueryClient();
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter><AnderHuePortal /></BrowserRouter>
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>,
);
