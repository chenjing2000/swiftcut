// Upstream documentation and support links retained by this derivative build.
//
// The app links to https://losslesscut.app/go/<name>, which redirects to the target for that name below: a page on the website,
// or another site (e.g. GitHub). The website build (website/scripts/appLinks.ts) writes those redirects, and fails if a page or
// #anchor on the website doesn't exist. So a target can move by changing it here, without breaking the links in app versions
// that are already released.
//
// Released app versions keep using the names, so never rename or remove one: only add names, and change targets.
//
// App versions from before this link to https://mifi.no/losslesscut/<name> (same names; thanks was https://mifi.no/thanks)
// instead, which the mifi.no infrastructure (not in this repo) redirects. For a change of target here to also reach those
// versions, mifi.no must redirect that name to https://losslesscut.app/go/<name>. Only these names, not everything under
// /losslesscut/: old versions also fetch https://mifi.no/losslesscut/config.json, which must keep working.

import { discordInviteUrl, githubUrl } from './links.ts';

export const websiteUrl = 'https://losslesscut.app';

export const appLinkTargets = {
  usage: '/docs/getting-started#your-first-cut',
  faq: '/docs/faq',
  troubleshooting: '/docs/troubleshooting',
  'file-name-template': '/docs/file-name-template',
  'select-segments-by-expression': '/docs/expressions#select-segments-by-expression',
  'edit-segments-by-expression': '/docs/expressions#edit-segments-by-expression',
  'select-tracks-by-expression': '/docs/expressions#select-tracks-by-expression',
  'privacy-policy': '/privacy-policy',
  // uploaded to each release by .github/workflows/build.yml
  licenses: `${githubUrl}/releases/latest/download/licenses.txt`,
  discussions: `${githubUrl}/discussions`,
  // the issue list, like mifi.no/losslesscut/bug-report
  'bug-report': `${githubUrl}/issues`,
  // the issue form in .github/ISSUE_TEMPLATE
  'feature-request': `${githubUrl}/issues/new?template=3-feature.yml`,
  thanks: 'https://mifi.no/thanks/',
  discord: discordInviteUrl,
} as const;

export type AppLinkName = keyof typeof appLinkTargets;

export const appLinkPrefix = '/go/';

export const getAppLinkUrl = (name: AppLinkName) => `${websiteUrl}${appLinkPrefix}${name}`;
