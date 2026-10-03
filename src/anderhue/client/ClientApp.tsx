import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Shell from './components/Shell';
import { captureTokenFromLocation } from './lib/token';
import FileDetailPage from './portal/FileDetailPage';
import FilesPage from './portal/FilesPage';
import PortalLayout from './portal/PortalLayout';
import StartPage from './start/StartPage';
import './client.css';

// Runs before BrowserRouter reads the URL: a #t= portal token moves into
// sessionStorage and leaves the address bar (ARCHITECTURE.md 5.2).
captureTokenFromLocation();

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

/**
 * AnderHue client app (ARCHITECTURE.md 5.2):
 *   /start               the "Start a file" uploader
 *   /files               sign in by email link, or the list of files
 *   /files/:area/:id     one file
 */
export default function ClientApp() {
  return (
    <Shell>
      <ScrollToTop />
      <Routes>
        <Route path="/start" element={<StartPage />} />
        <Route path="/files" element={<PortalLayout />}>
          <Route index element={<FilesPage />} />
          <Route path=":area/:id" element={<FileDetailPage />} />
          <Route path="*" element={<Navigate to="/files" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/start" replace />} />
      </Routes>
    </Shell>
  );
}
