<?php
/**
 * Pull media off the legacy domain into this site's own library.
 *
 * Imported blog posts and migrated pages still reference images and PDFs at
 * www.solyxenergy.nl. They render only while the legacy site is up and break
 * the instant it is switched off, so every file has to be re-hosted here and
 * the content rewritten to the local URL.
 *
 * Runs in batches because PHP max_execution_time is 120s and each file is a
 * download. Progress is stored in an option so repeated requests continue where
 * the last one stopped; re-running after completion is a no-op.
 *
 * Read the report with: get_option( 'solyx_sideload_report' )
 */

if ( ! defined( 'ABSPATH' ) ) { return; }
if ( ! is_admin() ) { return; }               // only run in wp-admin requests
if ( ! current_user_can( 'upload_files' ) ) { return; }

$state = get_option( 'solyx_sideload_state', array( 'done' => array(), 'map' => array(), 'log' => array() ) );
if ( ! empty( $state['finished'] ) ) { return; }

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$BATCH_POSTS = 6;   // posts processed per request
$LEGACY       = 'www.solyxenergy.nl';

$q = new WP_Query( array(
	'post_type'      => array( 'post', 'page' ),
	'post_status'    => 'any',
	'posts_per_page' => -1,
	'fields'         => 'ids',
) );

$processed = 0;
$imported  = 0;
$failed    = 0;

foreach ( $q->posts as $pid ) {
	if ( $processed >= $BATCH_POSTS ) { break; }
	if ( in_array( $pid, $state['done'], true ) ) { continue; }

	$post = get_post( $pid );
	if ( ! $post ) { $state['done'][] = $pid; continue; }
	$content = $post->post_content;

	// Every legacy upload URL in this post.
	preg_match_all(
		'#https?://' . preg_quote( $LEGACY, '#' ) . '/wp-content/uploads/[^\s"\'<>\)]+#i',
		$content,
		$m
	);
	$urls = array_unique( $m[0] );

	if ( empty( $urls ) ) {
		$state['done'][] = $pid;
		continue;
	}

	foreach ( $urls as $url ) {
		$clean = html_entity_decode( $url );

		if ( isset( $state['map'][ $clean ] ) ) {
			$content = str_replace( $url, $state['map'][ $clean ], $content );
			continue;
		}

		// media_sideload_image downloads server-side and attaches to the post.
		$new = media_sideload_image( $clean, $pid, null, 'src' );
		if ( is_wp_error( $new ) ) {
			$failed++;
			$state['log'][] = 'FAIL ' . $new->get_error_message() . ' :: ' . substr( $clean, -60 );
			continue;
		}
		$state['map'][ $clean ] = $new;
		$content                = str_replace( $url, $new, $content );
		$imported++;
	}

	if ( $content !== $post->post_content ) {
		wp_update_post( array( 'ID' => $pid, 'post_content' => $content ) );
	}
	$state['done'][] = $pid;
	$processed++;
}

$remaining = 0;
foreach ( $q->posts as $pid ) {
	if ( ! in_array( $pid, $state['done'], true ) ) { $remaining++; }
}
if ( 0 === $remaining ) { $state['finished'] = true; }

update_option( 'solyx_sideload_state', $state, false );
update_option(
	'solyx_sideload_report',
	array(
		'postsTotal'     => count( $q->posts ),
		'postsDone'      => count( $state['done'] ),
		'postsRemaining' => $remaining,
		'filesImported'  => count( $state['map'] ),
		'failures'       => array_slice( $state['log'], -12 ),
		'finished'       => ! empty( $state['finished'] ),
	),
	false
);
