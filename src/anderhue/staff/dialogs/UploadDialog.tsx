import StaffUploader from '../file/StaffUploader';
import type { FileView } from '../file/types';
import { Button, StaffDialog } from '../ui';

export default function UploadDialog({ open, onOpenChange, view }: {
  open: boolean; onOpenChange: (open: boolean) => void; view: FileView;
}) {
  return <StaffDialog open={open} onOpenChange={onOpenChange} title="Upload documents" className="!max-w-[560px]"
    description={`${view.number} · ${view.file.clientName}. Staff only unless you share them.`}
    footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button>}>
    <StaffUploader area={view.area} id={view.id} updatesOn={view.updatesOn} onUploaded={view.refresh} />
  </StaffDialog>;
}
