import testimonials from "./client-testimonials.json";

export const VERIFIED_CLIENT_TESTIMONIALS = testimonials.filter(
  (testimonial) => testimonial.publicationPermissionConfirmed,
);
