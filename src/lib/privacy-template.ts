/**
 * Auto-generated privacy policy template for LinkBreeze pages.
 *
 * When an operator hasn't written a custom privacy policy, this function
 * generates one from their actual page configuration. The template reflects
 * which features are enabled (analytics, email capture, embeds, external
 * analytics scripts) so it's always accurate to what the page actually does.
 */

export interface PrivacyTemplateInput {
  /** Display name from the page (e.g. "Jane Doe") */
  displayName: string;
  /** Public slug (e.g. "jane") */
  slug: string;
  /** Whether built-in analytics are active (always true for LinkBreeze) */
  hasAnalytics: boolean;
  /** Whether email capture is enabled on this page */
  hasEmailCapture: boolean;
  /** Whether any links have embeds (YouTube, Spotify, etc.) */
  hasEmbeds: boolean;
  /** Whether an external analytics script is configured */
  hasExternalAnalytics: boolean;
  /** Analytics retention in days, or 0 for infinite */
  analyticsRetentionDays: number;
  /** Contact email for privacy inquiries (from user record) */
  contactEmail?: string;
}

export function generatePrivacyPolicy(input: PrivacyTemplateInput): string {
  const name = input.displayName || "This site";
  const contactLine = input.contactEmail
    ? `Contact: ${input.contactEmail}`
    : `Contact: See the links on the page.`;
  const retentionText =
    input.analyticsRetentionDays > 0
      ? `${input.analyticsRetentionDays} days`
      : "until manually deleted";

  const sections: string[] = [];

  sections.push(
    `# Privacy Policy for ${name}`,
    ``,
    `*Last updated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*`,
    ``,
    `This privacy policy explains what information is collected when you visit this page and how it is used.`,
    ``,
  );

  // Analytics section
  if (input.hasAnalytics) {
    sections.push(
      `## Analytics`,
      ``,
      `This page uses privacy-respecting, cookieless analytics. The following data is collected automatically when you visit:`,
      ``,
      `- **Page views and clicks** — counted to measure engagement`,
      `- **Device type** — categorized as mobile, desktop, or tablet`,
      `- **Approximate country** — derived from your IP address`,
      `- **Referring website** — only the origin (e.g. instagram.com), not the full URL`,
      ``,
      `Your IP address is **never stored**. Instead, a one-way hash of your IP address and browser type is computed using SHA-256 with a daily-rotating salt. This hash cannot be reversed to recover your IP address and changes every day, so it cannot be used to track you across visits on different days.`,
      ``,
      `Analytics data is retained for ${retentionText}.`,
      ``,
    );
  }

  // Email capture section
  if (input.hasEmailCapture) {
    sections.push(
      `## Email Address`,
      ``,
      `If you choose to subscribe with your email address, it is stored in the site's database and may be used to send updates or newsletters. Your email is never sold or shared with third parties.`,
      ``,
      `You can request deletion of your email at any time. ${contactLine}`,
      ``,
    );
  }

  // External analytics
  if (input.hasExternalAnalytics) {
    sections.push(
      `## Third-Party Analytics`,
      ``,
      `This page loads a third-party analytics script. The provider may collect additional data according to their own privacy policy, including cookies. Review the provider's terms for details.`,
      ``,
    );
  }

  // Embeds
  if (input.hasEmbeds) {
    sections.push(
      `## Embedded Content`,
      ``,
      `This page contains embedded content from third-party platforms (such as YouTube, Spotify, Vimeo, SoundCloud, Bandcamp, Twitch, Dailymotion, Rumble, Odysee, TikTok, Google Forms, Tally, Cal.com, Google Maps, or GitHub). When you view or interact with an embed, the platform may collect data according to their own privacy policies. YouTube uses youtube-nocookie.com which limits but does not fully prevent tracking. Tap-to-open embeds (TikTok, Cal.com, Google Forms, Tally) only contact the platform after you open them.`,
      ``,
    );
  }

  // Cookies
  sections.push(
    `## Cookies`,
    ``,
    `This page does **not** use cookies${
      input.hasExternalAnalytics ? " of its own" : ""
    }. No tracking cookies are set when you visit this page${
      input.hasExternalAnalytics
        ? ". If a third-party analytics provider is configured, they may set their own cookies."
        : "."
    }`,
    ``,
  );

  // Your rights
  sections.push(
    `## Your Rights`,
    ``,
    `Depending on your location (EU/EEA, UK, California, etc.), you may have the right to:`,
    ``,
    `- Request access to data held about you`,
    `- Request deletion of your data`,
    `- Object to processing`,
    `- Withdraw consent (where applicable)`,
    ``,
    `Because analytics data is pseudonymized (your IP is hashed and never stored), individual records cannot be linked back to you.${
      input.hasEmailCapture
        ? " Email subscribers can request deletion at any time."
        : ""
    }`,
    ``,
    `${contactLine}`,
    ``,
  );

  // Data controller
  sections.push(
    `## Data Controller`,
    ``,
    `This page is powered by LinkBreeze, a self-hosted link-in-bio tool. The page owner is the data controller for any personal data collected here. LinkBreeze's developers do not have access to any data from this deployment.`,
    ``,
  );

  // Children's privacy
  sections.push(
    `## Children's Privacy`,
    ``,
    `This page is not directed at children under 13 (or the applicable age in your jurisdiction). No knowingly personal data is collected from children.`,
    ``,
  );

  // Changes
  sections.push(
    `## Changes to This Policy`,
    ``,
    `This privacy policy may be updated from time to time. The "Last updated" date at the top of this page reflects the most recent revision.`,
  );

  return sections.join("\n");
}
