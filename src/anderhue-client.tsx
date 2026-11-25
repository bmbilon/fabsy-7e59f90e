import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ClientApp from '@/anderhue/client/ClientApp';
import './index.css';
import './styles/anderhue-app.css';

// Existing email links/auth callbacks keep their original root URL. New
// navigation is mounted under /paralegal without redirecting URL fragments.
const basename = window.location.pathname.startsWith('/paralegal/') ? '/paralegal' : '/';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={basename}>
    <ClientApp />
  </BrowserRouter>,
);
