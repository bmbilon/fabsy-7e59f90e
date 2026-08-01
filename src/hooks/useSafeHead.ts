import { useEffect } from 'react';

type Opts = {
  title?: string | null;
  description?: string | null;
  canonical?: string | null;
  ogType?: string | null;
  robots?: string | null;
};

function setOrCreateMeta(name: string, value: string): () => void {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return () => undefined;
  // try name= first, then property= (og:)
  let el = doc.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = doc.querySelector(`meta[property="${name}"]`);
  }
  const created = !el;
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute(name.startsWith('og:') ? 'property' : 'name', name);
    doc.head.appendChild(el);
  }
  const previousContent = el.getAttribute('content');
  el.setAttribute('content', value);

  return () => {
    if (created) {
      el?.remove();
    } else if (previousContent === null) {
      el?.removeAttribute('content');
    } else {
      el?.setAttribute('content', previousContent);
    }
  };
}

export default function useSafeHead(opts: Opts) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prevTitle = document.title;
    const restorers: Array<() => void> = [];
    if (opts.title) document.title = opts.title;

    if (opts.description) {
      restorers.push(setOrCreateMeta('description', opts.description));
      restorers.push(setOrCreateMeta('og:description', opts.description));
      restorers.push(setOrCreateMeta('twitter:description', opts.description));
    }
    if (opts.title) {
      restorers.push(setOrCreateMeta('og:title', opts.title));
      restorers.push(setOrCreateMeta('twitter:title', opts.title));
    }
    restorers.push(setOrCreateMeta('og:type', opts.ogType || 'website'));
    restorers.push(setOrCreateMeta('robots', opts.robots || 'index, follow'));
    if (opts.canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      const created = !link;
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      const previousHref = link.getAttribute('href');
      link.href = opts.canonical;
      restorers.push(() => {
        if (created) {
          link?.remove();
        } else if (previousHref === null) {
          link?.removeAttribute('href');
        } else {
          link?.setAttribute('href', previousHref);
        }
      });
      restorers.push(setOrCreateMeta('og:url', opts.canonical));
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.title = prevTitle;
        restorers.reverse().forEach((restore) => restore());
      }
    };
  }, [opts.title, opts.description, opts.canonical, opts.ogType, opts.robots]);
}
