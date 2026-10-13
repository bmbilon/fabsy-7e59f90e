import { ApiError, ltbIntake, practiceIntake, type IntakeUploadTarget, type UploadFileSpec } from '../api';
import type { PracticeArea } from '../catalog';
import { ltbPayload, practicePayload, type IntakeFields } from './intake';

/** The opened file, normalised across ltb-intake (case) and practice-intake (matter). */
export interface OpenedFile {
  fileId: string;
  fileNumber: string;
  intakeToken: string;
  uploads: IntakeUploadTarget[];
}

export const UNCONFIRMED_MESSAGE = 'We could not confirm that your file was opened. Please contact us so nothing is missed.';

/** submit: landlord files go to ltb-intake, traffic and other matters to practice-intake. */
export async function openFile(area: PracticeArea, fields: IntakeFields, files: UploadFileSpec[], company: string, elapsedMs: number): Promise<OpenedFile> {
  if (area === 'ltb') {
    const response = await ltbIntake.submit(ltbPayload(fields, files, company, elapsedMs));
    if (!response.caseId || !response.caseNumber || !response.intakeToken) throw new ApiError(UNCONFIRMED_MESSAGE, 502);
    return { fileId: response.caseId, fileNumber: response.caseNumber, intakeToken: response.intakeToken, uploads: response.uploads || [] };
  }
  const response = await practiceIntake.submit(practicePayload(area, fields, files, company, elapsedMs));
  if (!response.matterId || !response.matterNumber || !response.intakeToken) throw new ApiError(UNCONFIRMED_MESSAGE, 502);
  return { fileId: response.matterId, fileNumber: response.matterNumber, intakeToken: response.intakeToken, uploads: response.uploads || [] };
}

/** finalize: tells the server which uploads finished so it can start reading them. */
export async function finalizeFile(area: PracticeArea, opened: OpenedFile, uploaded: string[]): Promise<number> {
  if (area === 'ltb') {
    const response = await ltbIntake.finalize({ caseId: opened.fileId, intakeToken: opened.intakeToken, uploaded });
    return response.received;
  }
  const response = await practiceIntake.finalize({ matterId: opened.fileId, intakeToken: opened.intakeToken, uploaded });
  return response.received;
}
