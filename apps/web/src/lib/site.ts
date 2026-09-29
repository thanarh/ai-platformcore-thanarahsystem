const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const siteUrl = new URL(
  configuredSiteUrl || 'https://ai.thanarah.com',
).origin;