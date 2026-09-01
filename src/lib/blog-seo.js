const SITE = 'https://fabsy.ca';
const SITE_TIME_ZONE = 'America/Edmonton';
const editorialDateFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: SITE_TIME_ZONE,
});
const editorialDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: SITE_TIME_ZONE,
});

export const blogSeoTitle = (title) => `${String(title || '').trim()} | Fabsy`;

export const blogCanonical = (slug) => `${SITE}/blog/${String(slug || '').trim()}`;

export const formatBlogEditorialDate = (value) => editorialDateFormatter.format(new Date(value));

export const blogEditorialDateKey = (value) => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return '';
  return editorialDateKeyFormatter.format(new Date(value));
};

export const latestEditorialDate = (post) => {
  const candidates = [post?.published_at, post?.updated_at, post?.reviewed_at]
    .filter((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)));
  if (candidates.length === 0) return undefined;
  return candidates.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
};

export const blogEditorialDateDisplay = (post) => {
  const publishedAt = post?.published_at;
  const modifiedAt = latestEditorialDate(post) || publishedAt;
  const reviewedAt = typeof post?.reviewed_at === 'string' && !Number.isNaN(Date.parse(post.reviewed_at))
    ? post.reviewed_at
    : undefined;
  const publishedKey = blogEditorialDateKey(publishedAt);
  const modifiedKey = blogEditorialDateKey(modifiedAt);
  const reviewedKey = blogEditorialDateKey(reviewedAt);
  const modifiedIsSeparate = Boolean(modifiedKey && modifiedKey !== publishedKey);

  return {
    published: publishedAt ? {
      value: publishedAt,
      reviewed: Boolean(reviewedKey && reviewedKey === publishedKey),
    } : null,
    modified: modifiedIsSeparate ? {
      value: modifiedAt,
      reviewed: Boolean(reviewedKey && reviewedKey === modifiedKey),
    } : null,
    reviewed: reviewedAt && reviewedKey !== publishedKey && (!modifiedIsSeparate || reviewedKey !== modifiedKey)
      ? { value: reviewedAt }
      : null,
  };
};

export const officialBlogSources = (sourceData) => {
  if (!sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) return [];
  const sources = sourceData.official_sources;
  if (!Array.isArray(sources)) return [];
  const validSources = sources.flatMap((value) => {
    if (typeof value !== 'string') return [];
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? [url.href] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(validSources)];
};

export const buildBlogPostingSchema = (post) => {
  const url = blogCanonical(post.slug);
  const sources = officialBlogSources(post.source_data);
  const dateModified = latestEditorialDate(post);
  const authorName = String(post.author || 'Fabsy Editorial Team').trim();

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.meta_description,
    ...(post.featured_image ? { image: post.featured_image } : {}),
    author: {
      '@type': 'Organization',
      name: authorName,
      url: `${SITE}/about`,
    },
    publisher: {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'Fabsy Traffic Ticket Services',
      logo: {
        '@type': 'ImageObject',
        url: `${SITE}/favicon.svg`,
      },
    },
    datePublished: post.published_at,
    ...(dateModified ? { dateModified } : {}),
    ...(Array.isArray(post.keywords) && post.keywords.length > 0 ? { keywords: post.keywords.join(', ') } : {}),
    ...(post.category ? { articleSection: post.category } : {}),
    ...(sources.length > 0 ? { citation: sources } : {}),
    inLanguage: 'en-CA',
    url,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };
};
