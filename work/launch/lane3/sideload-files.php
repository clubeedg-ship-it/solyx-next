<?php
/**
 * Second sideload pass: every file type, not just images.
 *
 * media_sideload_image() only accepts images, so the first pass left behind the
 * PDFs (product manuals, the privacy statement linked from both forms), a video
 * and some webp files — all still hosted on the legacy domain and all due to
 * die with it. This uses download_url + wp_handle_sideload, which is type
 * agnostic.
 *
 * Batched for the 120s execution limit; progress is kept in an option so
 * repeated admin requests continue where the last stopped.
 *
 * Report: get_option( 'solyx_files_report' )
 */

if ( ! defined( 'ABSPATH' ) ) { return; }
if ( ! is_admin() ) { return; }
if ( ! current_user_can( 'upload_files' ) ) { return; }

$state = get_option( 'solyx_files_state', array( 'map' => array(), 'log' => array(), 'done' => array() ) );
if ( ! empty( $state['finished'] ) ) { return; }

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$LEGACY     = 'www.solyxenergy.nl';
$BATCH_FILES = 4;   // downloads per request — PDFs can be several MB
$imported    = 0;

$q = new WP_Query( array(
	'post_type'      => array( 'post', 'page' ),
	'post_status'    => 'any',
	'posts_per_page' => -1,
	'fields'         => 'ids',
) );

foreach ( $q->posts as $pid ) {
	if ( $imported >= $BATCH_FILES ) { break; }

	$post = get_post( $pid );
	if ( ! $post ) { continue; }
	$content = $post->post_content;

	preg_match_all(
		'#https?://' . preg_quote( $LEGACY, '#' ) . '/wp-content/uploads/[^\s"\'<>\)]+#i',
		$content,
		$m
	);
	$urls = array_unique( $m[0] );
	if ( empty( $urls ) ) { continue; }

	$changed = false;
	foreach ( $urls as $url ) {
		if ( $imported >= $BATCH_FILES ) { break; }
		$clean = html_entity_decode( $url );

		// Already fetched for another post — just rewrite.
		if ( isset( $state['map'][ $clean ] ) ) {
			$content = str_replace( $url, $state['map'][ $clean ], $content );
			$changed = true;
			continue;
		}
		if ( isset( $state['done'][ $clean ] ) ) { continue; } // known failure, skip

		$tmp = download_url( $clean, 60 );
		if ( is_wp_error( $tmp ) ) {
			$state['done'][ $clean ] = 1;
			$state['log'][]          = 'DL FAIL ' . $tmp->get_error_message() . ' :: ' . substr( $clean, -55 );
			continue;
		}

		$name = basename( parse_url( $clean, PHP_URL_PATH ) );
		$file = array( 'name' => $name, 'tmp_name' => $tmp );
		$side = wp_handle_sideload( $file, array( 'test_form' => false ) );

		if ( ! empty( $side['error'] ) ) {
			@unlink( $tmp );
			$state['done'][ $clean ] = 1;
			$state['log'][]          = 'SIDELOAD FAIL ' . $side['error'] . ' :: ' . $name;
			continue;
		}

		$attach_id = wp_insert_attachment(
			array(
				'post_mime_type' => $side['type'],
				'post_title'     => sanitize_file_name( $name ),
				'post_content'   => '',
				'post_status'    => 'inherit',
			),
			$side['file'],
			$pid
		);
		if ( ! is_wp_error( $attach_id ) ) {
			wp_update_attachment_metadata( $attach_id, wp_generate_attachment_metadata( $attach_id, $side['file'] ) );
		}

		$state['map'][ $clean ] = $side['url'];
		$content                = str_replace( $url, $side['url'], $content );
		$changed                = true;
		$imported++;
	}

	if ( $changed ) {
		wp_update_post( array( 'ID' => $pid, 'post_content' => $content ) );
	}
}

// Count what is left across all content.
$remaining = 0;
foreach ( $q->posts as $pid ) {
	$post = get_post( $pid );
	if ( ! $post ) { continue; }
	$remaining += preg_match_all(
		'#https?://' . preg_quote( $LEGACY, '#' ) . '/wp-content/uploads/#i',
		$post->post_content,
		$ignore
	);
}
if ( 0 === $remaining ) { $state['finished'] = true; }

update_option( 'solyx_files_state', $state, false );
update_option(
	'solyx_files_report',
	array(
		'filesImported' => count( $state['map'] ),
		'permanentFail' => count( $state['done'] ),
		'remainingRefs' => $remaining,
		'lastErrors'    => array_slice( $state['log'], -10 ),
		'finished'      => ! empty( $state['finished'] ),
	),
	false
);
