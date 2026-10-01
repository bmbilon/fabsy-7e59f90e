import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { areaFromParam, type PracticeArea } from '../catalog';
import { revokePreview, type PickedFile } from '../lib/files';
import { useDocumentTitle } from '../lib/hooks';
import AreaChooser from './AreaChooser';
import { clearSent, loadSent, saveSent, stepPath, type SentSummary } from './intake';
import SuccessScreen from './SuccessScreen';
import Wizard from './Wizard';

type FilesByArea = Record<PracticeArea, PickedFile[]>;

/** /start: area chooser, the four-step uploader, then the confirmation. */
export default function StartPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const area = areaFromParam(params.get('area'));
  const step = params.get('step');
  const [filesByArea, setFilesByArea] = useState<FilesByArea>({ ltb: [], traffic: [], general: [] });
  const [sent, setSent] = useState<SentSummary | null>(() => loadSent());
  const filesRef = useRef(filesByArea);
  const showSent = Boolean(area && step === 'sent' && sent && sent.area === area);

  useDocumentTitle(showSent ? 'File received' : 'Start a file');

  useEffect(() => {
    filesRef.current = filesByArea;
  }, [filesByArea]);

  // Release thumbnail memory when leaving the uploader.
  useEffect(() => () => {
    Object.values(filesRef.current).flat().forEach(revokePreview);
  }, []);

  const setAreaFiles = useCallback((target: PracticeArea, next: PickedFile[]) => {
    setFilesByArea(previous => ({ ...previous, [target]: next }));
  }, []);

  const onSent = useCallback((summary: SentSummary) => {
    filesRef.current[summary.area].forEach(revokePreview);
    setAreaFiles(summary.area, []);
    saveSent(summary);
    setSent(summary);
    navigate(stepPath(summary.area, 'sent'), { replace: true });
  }, [navigate, setAreaFiles]);

  const startAnother = useCallback(() => {
    clearSent();
    setSent(null);
    navigate('/start');
  }, [navigate]);

  if (!area) return <AreaChooser />;
  if (showSent && sent) return <SuccessScreen summary={sent} onStartAnother={startAnother} />;
  return (
    <Wizard
      key={area}
      area={area}
      files={filesByArea[area]}
      onFilesChange={next => setAreaFiles(area, next)}
      onSent={onSent}
    />
  );
}
