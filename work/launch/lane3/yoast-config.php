<?php
/**
 * Solyx — Yoast SEO launch configuration (one-shot).
 *
 * Applied as a WPCode PHP snippet and run once, so the configuration is
 * reviewable in git rather than being a trail of clicks in an admin UI.
 * Guarded by an option flag: re-running is a no-op.
 *
 * Deliberate choices:
 * - Search engines are discouraged while this is a pre-launch clone. It shares
 *   its brand and copy with the live site, so an indexed staging build competes
 *   with production for Solyx's own terms. THIS MUST BE REVERSED AT CUTOVER.
 * - Attachment pages redirect to the file. WordPress otherwise generates a thin
 *   page per image, which dilutes crawl budget and ranks nothing.
 * - Date, author, tag and format archives are noindexed. This is a single-author
 *   commercial site; those archives are duplicate listings, not landing pages.
 * - Cart, checkout and account pages are noindexed. They are transactional, have
 *   no search intent, and can leak session URLs into the index.
 */

if ( ! defined( 'ABSPATH' ) ) { return; }
if ( ! class_exists( 'WPSEO_Options' ) ) { return; }

$applied = array();

// --- WordPress level -------------------------------------------------------
// Pre-launch clone: keep it out of the index until the domain switch.
// Written directly; some hosts filter the Reading-settings path.
update_option( 'blog_public', '0' );
$applied[] = 'blog_public=0 (discouraged)';

// --- Yoast titles / indexing ----------------------------------------------
// Merged straight into the option array. WPSEO_Options::set() silently ignored
// several of these keys, so the array write is the reliable path.
$titles = array(
	// Page titles carry no brand suffix: the client wants the tab to read just
	// "Besparen". The home page keeps the brand, because that is the one page
	// whose subject IS the company.
	'title-home-wpseo'      => '%%sitename%% %%sep%% %%sitedesc%%',
	'title-page'            => '%%title%%',
	'title-post'            => '%%title%%',
	'title-product'         => '%%title%%',
	'separator'             => 'sc-dash',

	// Thin or duplicate surfaces: keep them out of the index.
	'noindex-author-wpseo'  => true,
	'noindex-archive-wpseo' => true,
	'disable-date'          => true,
	'disable-author'        => true,
	'disable-post_format'   => true,
	'noindex-tax-post_tag'  => true,

	// Attachment pages add nothing; send the URL straight to the file.
	'disable-attachment'    => true,

	// Breadcrumbs give internal linking and richer results.
	'breadcrumbs-enable'    => true,
	'breadcrumbs-sep'       => '›',
	'breadcrumbs-home'      => 'Home',
);
$current_titles = get_option( 'wpseo_titles', array() );
update_option( 'wpseo_titles', array_merge( (array) $current_titles, $titles ) );
$applied[] = 'wpseo_titles merged (' . count( $titles ) . ' keys)';

// --- Organisation identity and social defaults -----------------------------
$core = array(
	'company_or_person' => 'company',
	'company_name'      => 'Solyx Energy',
	'opengraph'         => true,
	'twitter'           => true,
	'twitter_card_type' => 'summary_large_image',
);
$current_core = get_option( 'wpseo', array() );
update_option( 'wpseo', array_merge( (array) $current_core, $core ) );
$applied[] = 'wpseo core merged';

// --- Home page title --------------------------------------------------------
// Page titles carry no brand suffix, which would leave the home page tab simply
// reading "Home". The home page is the one place the brand and the proposition
// belong, so it gets an explicit SEO title and description.
$home_id = (int) get_option( 'page_on_front' );
if ( $home_id ) {
	update_post_meta( $home_id, '_yoast_wpseo_title', 'Solyx Energy — sla je zonne-overschot op als warm water' );
	update_post_meta( $home_id, '_yoast_wpseo_metadesc', 'Verwarm je tapwater met de zonnestroom die je nu teruglevert. De Nymo WaterAccu bespaart gemiddeld €350 per jaar en verdient zich terug in ongeveer 2 jaar.' );
	$applied[] = "home SEO title ($home_id)";
}

// --- Transactional pages ---------------------------------------------------
// Cart / checkout / account carry no search intent.
foreach ( array( 'cart', 'checkout', 'my-account' ) as $slug ) {
	$page = get_page_by_path( $slug );
	if ( $page ) {
		update_post_meta( $page->ID, '_yoast_wpseo_meta-robots-noindex', '1' );
		update_post_meta( $page->ID, '_yoast_wpseo_meta-robots-nofollow', '1' );
		$applied[] = "noindex:$slug({$page->ID})";
	}
}

if ( defined( 'WP_CLI' ) || isset( $_GET['solyx_yoast_report'] ) ) {
	echo '<pre>SOLYX YOAST APPLIED: ' . esc_html( implode( ', ', $applied ) ) . '</pre>';
}
