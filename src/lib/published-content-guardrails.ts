import { guardPublishedBlogFields } from './published-content-guardrails-core.js';

export type GuardedBlogPost = {
  slug: string;
  title: string;
  meta_description: string;
  content: string;
};

export function guardPublishedBlogPost<T extends GuardedBlogPost>(post: T): T {
  return guardPublishedBlogFields(post) as T;
}
