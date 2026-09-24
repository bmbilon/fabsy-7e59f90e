(() => {
  'use strict';
  const params = new URLSearchParams(window.location.hash.slice(1));
  const id = params.get('id') || '';
  const signature = params.get('signature') || '';
  // Keep the unsubscribe capability out of copied URLs and referrers.
  window.history.replaceState(null, '', window.location.pathname);
  const form = document.getElementById('preferences-form');
  const button = document.getElementById('stop-reminders');
  const result = document.getElementById('result');
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(signature)) {
    result.textContent = 'Open the reminder-preferences link in your email, or email hello@fabsy.ca for help.';
    return;
  }
  button.disabled = false;
  result.textContent = '';
  let pending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    button.disabled = true;
    result.textContent = 'Saving your preference…';
    const query = new URLSearchParams({action: 'unsubscribe', id, signature});
    try {
      const response = await fetch(`https://gcasbisxfrssonllpqrw.supabase.co/functions/v1/process-ticket-recovery?${query}`, {method: 'POST', credentials: 'omit'});
      const body = await response.json();
      if (!response.ok || body.unsubscribed !== true) throw new Error('Unable to save preference');
      result.textContent = 'Your preference is saved. These checkout reminders have been stopped.';
      button.textContent = 'Reminders stopped';
    } catch {
      pending = false;
      button.disabled = false;
      result.textContent = 'We couldn’t save that yet. Please try again, or email hello@fabsy.ca.';
    }
  });
})();
