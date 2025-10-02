import { useEffect } from 'react';

type Opts = {
  title?: string | null;
  description?: string | null;
  canonical?: string | null;
  // add other meta tags as needed
};

function setOrCreateMeta(name: string, value: string) {
  if (!value) return;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;
  // try name= first, then property= (og:)
  let el = doc.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = doc.querySelector(`meta[property="${name}"]`);
  }
  if (!el) {
    el = doc.createElement('meta');
    // prefer name= for basic tags
    el.setAttribute('name', name);
    doc.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

export default function useSafeHead(opts: Opts) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prevTitle = document.title;
    if (opts.title) document.title = opts.title;

    if (opts.description) setOrCreateMeta('description', opts.description);
    if (opts.canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.href = opts.canonical;
    }

    // cleanup not strictly necessary for title/meta but restore title
    return () => {
      if (typeof document !== 'undefined') {
        document.title = prevTitle;
      }
    };
  }, [opts.title, opts.description, opts.canonical]);
}
