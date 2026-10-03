import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ClientApp from '@/anderhue/client/ClientApp';
import './index.css';
import './styles/anderhue-app.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <ClientApp />
  </BrowserRouter>,
);
