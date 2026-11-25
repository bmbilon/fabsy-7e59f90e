/** Forward only the practice inbox to Brett's explicitly designated recipients. */
export default {
  async email(message) {
    if (message.to.toLowerCase() !== 'hello@anderhue.ca') {
      message.setReject('Unknown recipient');
      return;
    }
    const results = await Promise.allSettled([
      message.forward('info@onlineparalegals.ca'),
      message.forward('brett@execom.ca'),
    ]);
    // Surface any delivery failure to Cloudflare rather than silently dropping it.
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('AnderHue forwarding destination failed');
    }
  },
};
