import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import StaffToaster from '@/anderhue/staff/StaffToaster';
import StaffApp from '@/anderhue/staff/StaffApp';
import './index.css';
import './styles/anderhue-app.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } });
// Existing email links/auth callbacks keep their original root URL. New
// navigation is mounted under /paralegal without redirecting URL fragments.
const basename = window.location.pathname.startsWith('/paralegal/') ? '/paralegal' : '/';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter basename={basename}><StaffApp /></BrowserRouter>
      <StaffToaster />
    </TooltipProvider>
  </QueryClientProvider>,
);
