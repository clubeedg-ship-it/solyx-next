<?php
/**
 * Solyx Lane 1 — installation form backend.
 *
 * Renders a real Gravity Form (hidden, AJAX) on the two installation wizard
 * pages and loads the bridge that submits the approved wizard UI into it.
 * The migrated page content is not modified.
 *
 * Source of truth: work/launch/lane1/{snippet.php,bridge.js}
 * Redeploy with: node work/launch/lane1/scripts/deploy-snippet.js
 */

if ( ! defined( 'ABSPATH' ) ) { return; }

if ( ! function_exists( 'solyx_lane1_form_id' ) ) {
	/**
	 * Page ID => Gravity Forms form ID.
	 * 800 Installatie Formulier · 807 Installatie Formulier Boilergarant
	 */
	function solyx_lane1_form_id() {
		if ( is_admin() || ! is_page() ) {
			return 0;
		}
		$map = array(
			800 => 1,
			807 => 4,
		);
		$id  = (int) get_queried_object_id();
		return isset( $map[ $id ] ) ? (int) $map[ $id ] : 0;
	}
}

// WPCode evaluates the snippet body more than once per request; without this
// guard the hooks register twice and the form renders twice.
if ( defined( 'SOLYX_LANE1_LOADED' ) ) {
	return;
}
define( 'SOLYX_LANE1_LOADED', true );

add_action( 'wp_enqueue_scripts', function () {
	$form_id = solyx_lane1_form_id();
	if ( ! $form_id || ! function_exists( 'gravity_form_enqueue_scripts' ) ) {
		return;
	}
	// AJAX mode; must be enqueued here because the form renders in the footer.
	gravity_form_enqueue_scripts( $form_id, true );
} );

add_action( 'wp_footer', function () {
	// Process-wide, not a closure static: WPCode can evaluate the body twice,
	// producing two separate closures that each keep their own static.
	$form_id = solyx_lane1_form_id();
	if ( ! empty( $GLOBALS['solyx_lane1_rendered'] ) || ! $form_id || ! function_exists( 'gravity_form' ) ) {
		return;
	}
	$GLOBALS['solyx_lane1_rendered'] = true;
	?>
	<!-- solyx-lane1 build __BUILD_ID__ -->
	<div id="solyx-gf-host" aria-hidden="true" style="position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;">
		<?php gravity_form( $form_id, false, false, false, null, true, 1 ); ?>
	</div>
	<script>
	window.SOLYX_GF_BRIDGE = { formId: <?php echo (int) $form_id; ?> };
	(function(){
		// Keep the off-screen duplicate out of the tab order.
		document.addEventListener('DOMContentLoaded', function(){
			var host = document.getElementById('solyx-gf-host');
			if(!host) return;
			host.querySelectorAll('input,select,textarea,button,a').forEach(function(el){ el.tabIndex = -1; });
		});
	})();
	</script>
	<script><?php echo base64_decode( '__BRIDGE_B64__' ); // phpcs:ignore ?></script>
	<?php
}, 99 );
