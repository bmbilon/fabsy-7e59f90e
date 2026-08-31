import slugs from "@/config/photoRadarPages.json";

export const isPhotoRadarContentSlug = (slug: string): boolean => slugs.includes(slug);

// These three reviewed pages ship with the site so an older database row
// cannot replace the current legal copy or route owner notices to the $198 SKU.
export async function loadPhotoRadarContent(slug: string): Promise<Record<string, unknown> | null> {
  switch (slug) {
    case "photo-radar-ticket-alberta":
      return (await import("@/content/pages/photo-radar-ticket-alberta.json")).default;
    case "photo-radar-ticket-edmonton":
      return (await import("@/content/pages/photo-radar-ticket-edmonton.json")).default;
    case "fight-photo-radar-ticket-calgary":
      return (await import("@/content/pages/fight-photo-radar-ticket-calgary.json")).default;
    default:
      return null;
  }
}
