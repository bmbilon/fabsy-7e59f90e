/** Preserve actual control state when a browser-rendered assessment becomes HTML. */
export function preserveAssessmentSnapshotState(document = globalThis.document) {
  const assessment = document.querySelector('#instant-ticket-assessment');
  if (!assessment) return;
  for (const select of assessment.querySelectorAll('select')) {
    for (const option of select.options) option.toggleAttribute('selected', option.selected);
  }
  for (const input of assessment.querySelectorAll('input:not([type="file"])')) {
    if (input.type === 'radio' || input.type === 'checkbox') {
      input.toggleAttribute('checked', input.checked);
    } else {
      input.setAttribute('value', input.value);
    }
  }
}
