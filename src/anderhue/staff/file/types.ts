import type { PracticeArea } from '../catalog';
import type { CaseRow, ClientRecord, DocumentRow, EventRow, NoticeRow, Signals, StaffFile } from '../model';

/** Everything a file detail card needs, built once by FilePage. */
export interface FileView {
  area: PracticeArea;
  id: string;
  number: string;
  record: CaseRow & Record<string, unknown>;
  client: ClientRecord;
  documents: DocumentRow[];
  events: EventRow[];
  notices: NoticeRow[];
  file: StaffFile;
  signals: Signals;
  /** Documents are still being read; row edits wait until reading finishes. */
  reading: boolean;
  /** ltb_practices.client_updates_enabled */
  updatesOn: boolean;
  refresh: () => void;
}
