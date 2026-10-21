=== Ubersuggest SEO Tools ===
Contributors: devneilpatel
Tags: seo, site audit, meta description, core web vitals, ubersuggest
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 8.0
Stable tag: 1.2.2
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Audit your site, check Core Web Vitals, and apply AI-suggested fixes for titles, meta descriptions, and headings — from wp-admin.

== Description ==

Connect your WordPress site to Ubersuggest and work on your SEO without leaving wp-admin. The audit runs on Ubersuggest's crawler, AI generates the suggested fixes, and nothing is changed on your site until you approve it.

= Audit your site from wp-admin =

Start a crawl and watch it run: on-page SEO score, pages crawled, page status, and the number of issues found. The site audit is the same one that powers the Ubersuggest dashboard.

= Fix titles, meta descriptions, and headings with AI =

Every issue lists the pages it affects. For titles, meta descriptions, and H1 headings, the plugin generates a suggestion for each page. You can regenerate it, edit the wording yourself, and then apply it to one page or all affected pages at once.

Issues the plugin cannot fix for you still list every affected page, so you always know where to look. More fixable issue types are coming in future releases.

= Undo any fix in one click =

Changed your mind? One click restores exactly what was there before. Nothing is applied silently, and every change can be undone.

= Core Web Vitals =

See how your site scores on loading, responsiveness, and visual stability for both desktop and mobile.

= What you need =

The plugin is free. Connecting an Ubersuggest account is required because the crawler, SEO scoring, and AI suggestions all run on Ubersuggest. The Site Audit and Core Web Vitals work with any Ubersuggest account; AI fix suggestions are part of paid plans and use your monthly fix credits. A 7-day free trial is available from inside the plugin.

== Installation ==

= Minimum requirements =

* WordPress 6.0 or later
* PHP 8.0 or later
* An Ubersuggest account

= Automatic installation =

1. In wp-admin, go to Plugins → Add New.
2. Search for "Ubersuggest SEO Tools".
3. Click Install Now, then Activate.

= Manual installation =

1. Download the plugin zip.
2. In wp-admin, go to Plugins → Add New → Upload Plugin and choose the zip.
3. Click Install Now, then Activate.

= Connecting your account =

Open Ubersuggest SEO from the wp-admin menu and click Connect. You will be sent to Ubersuggest to authorize the connection and returned to your site. The first audit starts automatically after you connect your account.

== Frequently Asked Questions ==

= Do I need an Ubersuggest account? =

Yes. The crawler, SEO scoring, and AI suggestions all run on Ubersuggest, so the plugin cannot audit your site without an account. Connecting takes one click from inside the plugin.

= Is it free? =

The plugin is free, and the Site Audit and Core Web Vitals work with your account. AI fix suggestions are part of paid Ubersuggest plans and use your monthly fix credits. You can start a 7-day free trial from inside the plugin.

= Is my page content sent to Ubersuggest? =

To audit your site, the Ubersuggest crawler requests your public pages directly, just as a search engine crawler would. The plugin itself does not upload your page content to Ubersuggest. See "External services" below for the full list of data sent and when it is sent.

= Will the plugin change my posts on its own? =

Never. A suggestion is only written to a page when you click Apply, and you can edit the wording before you do. Everything the plugin changes is recorded and can be undone.

= How do I undo a fix? =

Open the fix and click Undo on the entry. The value that was there before is restored on that page, or removed if the page had no value before the fix.

= Why is my audit taking a while? =

A crawl visits every page of your site, so a large site can take several minutes. The progress screen shows how many pages have been crawled so far, and you can cancel the crawl at any point and keep the results of the last completed crawl.

= How do I disconnect my account? =

Open the plugin's settings and choose to disconnect. You will be asked to confirm first. Disconnecting removes the stored tokens from your site; your Ubersuggest account and its data are untouched.

= Where do I report a bug or ask for a feature? =

Click Send Feedback, or reach us through Ubersuggest at ubersuggest.com.

== External services ==

This plugin is a client for Ubersuggest, the SEO service at ubersuggest.com. The audit crawler, SEO scoring, and AI fix suggestions all run on that service, so an Ubersuggest account is required. Without one, the plugin cannot audit your site or propose fixes.

All requests are made from your server through the WordPress HTTP API, never from your visitors' browsers. They happen only inside wp-admin and only when a logged-in administrator performs an action.

What is sent, and when:

* **Your site's domain** — when you start or refresh a Site Audit, open the audit overview, request Core Web Vitals, or when the plugin creates the Ubersuggest project representing this site. The domain is normalized first (scheme and `www.` removed).
* **The address of a single page, plus your site's language** — when you generate an AI fix suggestion for that page and while the plugin polls for the result.
* **A fix suggestion you edited** — when you save your own wording over the AI-generated suggestion.
* **OAuth credentials** — when you connect your account, the plugin exchanges an authorization code for access and refresh tokens (PKCE, S256) and reads your Ubersuggest account details to confirm the connection.
* **Usage analytics** — when an administrator uses the plugin's screens, the plugin reports the action and its context (which screen was opened or which issue a fix was requested for), the plugin version, whether the linked account is on a free or paid plan, and who performed the action: your Ubersuggest account email once connected, or a random identifier before that. The identifier is created by the plugin, is not tied to anything personal, and is deleted on uninstall. Site owners can turn analytics off entirely with the `ubs_seo_tracking_enabled` filter.

**The plugin does not upload your page content to Ubersuggest.** Every on-page check that needs the body of a post runs locally in PHP on your own server. For Site Audit, Ubersuggest's crawler requests your public pages directly, just as a search engine crawler would.

Connecting the account is an explicit action taken by an administrator inside the plugin. Until you connect, the only data the plugin sends to Ubersuggest is the usage analytics described above, under the random identifier. Every other request is refused locally because no authentication token is available.

Ubersuggest Terms of Use: https://neilpatel.com/terms/
Ubersuggest Privacy Policy: https://npdigital.com/privacy-notice/

== Changelog ==

= 1.2.2 =

* Connecting your Ubersuggest account works again. The plugin now talks to ubersuggest.com, the service's new address.

= 1.2.1 =

* When connecting your Ubersuggest account fails, the message now names what refused it, so a block coming from your own hosting or firewall is no longer reported as a bare error code.

= 1.2.0 =

* New Fix History tab: every change the plugin writes to your site is listed with a before/after diff, filterable by issue type and page, and searchable by page title or URL.
* Undo any fix straight from that history, with the value that comes back shown before you confirm.
* Records survive the pages they point at, so a deleted page keeps its entry instead of disappearing from the log.
* A site health summary now appears on the WordPress dashboard, alongside a notice when an audit finishes.
* The plugin's own admin screens are translated into eight more languages.

= 1.1.0 =

* Cancel a running crawl and fall back to your last completed report.
* The Recrawl button now locks while a crawl is starting, preventing accidental duplicate crawls.
* Every link out to Ubersuggest carries its origin, and plugin usage is reported under its own analytics channel.

= 1.0.0 =

* Undo any applied fix in one click, from a full history of what was changed.
* A confirmation step before disconnecting your Ubersuggest account.
* An invitation to leave a review after your first applied fix.

= 0.8.3 =

* First release.

== Upgrade Notice ==

= 1.2.2 =
Fixes connecting your Ubersuggest account, which failed with a server error after the service moved to ubersuggest.com.

= 1.1.0 =
Adds a way to cancel a running crawl and prevents accidental duplicate crawls when clicking Recrawl.
