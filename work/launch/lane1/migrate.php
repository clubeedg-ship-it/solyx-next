<?php
/**
 * Solyx Lane 1 — one-shot Gravity Forms backend migration.
 *
 * Finishes the form backend without touching any page content or frontend
 * markup. Every step is idempotent: re-running changes nothing once applied.
 *
 * Steps
 *   1. Form 4 (Boilergarant) gains the "Horizontale boiler" choice its wizard
 *      already offers, so that answer stops being dropped.
 *   2. Forms 1 and 4 accept every extension the wizard's accept="image/*"
 *      lets a visitor pick.
 *   3. Dutch validation messages on required fields — the site locale is
 *      en_US, so Gravity Forms would otherwise answer a Dutch form in English.
 *   4. Forms 5 (FAQ contact) and 6 (installer purchase info) are created to
 *      back the two UIs that currently discard their submissions.
 *   5. Every form confirms receipt to the person who submitted it.
 *   6. Personal-data export/erase mapping, so a GDPR request returns the
 *      fields that actually hold personal data.
 *
 * Guarded: administrators only, and only with the deploy-time token.
 * Deploy, run and remove with: node work/launch/lane1/scripts/deploy-migration.js
 *
 * Source of truth: work/launch/lane1/migrate.php
 */

if ( ! defined( 'ABSPATH' ) ) { return; }

if ( ! defined( 'SOLYX_LANE1_MIGRATE_TOKEN' ) ) {
	define( 'SOLYX_LANE1_MIGRATE_TOKEN', '__MIGRATE_TOKEN__' );
}

add_action( 'admin_init', function () {
	if ( ! isset( $_GET['solyx_lane1_migrate'] ) ) {
		return;
	}
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( ! hash_equals( SOLYX_LANE1_MIGRATE_TOKEN, (string) $_GET['solyx_lane1_migrate'] ) ) {
		return;
	}
	if ( ! class_exists( 'GFAPI' ) ) {
		wp_send_json( array( 'ok' => false, 'error' => 'GFAPI unavailable' ) );
	}

	$dry     = ! empty( $_GET['dry'] );
	$changes = array();
	$log     = function ( $msg ) use ( &$changes ) { $changes[] = $msg; };

	// ---------------------------------------------------------------- helpers

	/** Find a form id by exact title, so re-runs reuse instead of duplicating. */
	$form_id_by_title = function ( $title ) {
		foreach ( GFAPI::get_forms( true, false ) as $f ) {
			if ( isset( $f['title'] ) && $f['title'] === $title ) {
				return (int) $f['id'];
			}
		}
		foreach ( GFAPI::get_forms( false, false ) as $f ) {
			if ( isset( $f['title'] ) && $f['title'] === $title ) {
				return (int) $f['id'];
			}
		}
		return 0;
	};

	/** Required-field message in Dutch; GF falls back to English otherwise. */
	$nl_required = 'Dit veld is verplicht.';
	$nl_email    = 'Vul een geldig e-mailadres in.';

	$confirmation_ok = function ( $id ) {
		return array(
			'id'          => $id,
			'name'        => 'Default Confirmation',
			'isDefault'   => true,
			'type'        => 'message',
			// The bridge watches for this marker to distinguish a real success
			// from a validation failure. Do not change without changing bridge.js.
			'message'     => '<div class="solyx-gf-ok">ok</div>',
			'url'         => '',
			'pageId'      => '',
			'queryString' => '',
		);
	};

	// ------------------------------------------------- 1..3, 5: forms 1 and 4

	$image_ext = 'jpg,jpeg,png,heic,heif,webp,gif,bmp,tif,tiff,avif';

	foreach ( array( 1, 4 ) as $form_id ) {
		$form = GFAPI::get_form( $form_id );
		if ( ! $form ) {
			$log( "form {$form_id}: MISSING — skipped" );
			continue;
		}
		$dirty = false;

		foreach ( $form['fields'] as $field ) {
			// 1. Boilergarant offers "Horizontale boiler"; form 4 never accepted it.
			if ( 4 === $form_id && 8 === (int) $field->id ) {
				$values = array_map( function ( $c ) { return $c['value']; }, (array) $field->choices );
				if ( ! in_array( 'horizontal', $values, true ) ) {
					$choices = (array) $field->choices;
					// Keep "Anders" last so the list reads naturally.
					$anders  = array_pop( $choices );
					$choices[] = array(
						'text'       => 'Horizontale boiler',
						'value'      => 'horizontal',
						'isSelected' => false,
						'price'      => '',
					);
					$choices[]      = $anders;
					$field->choices = array_values( $choices );
					$dirty          = true;
					$log( 'form 4 field 8: added choice horizontal (Horizontale boiler)' );
				}
			}

			// 2. Match the wizard's accept="image/*" so a valid pick cannot be
			//    rejected after the visitor has already filled in 17 steps.
			if ( 'fileupload' === $field->type && $field->allowedExtensions !== $image_ext ) {
				$field->allowedExtensions = $image_ext;
				$dirty                    = true;
				$log( "form {$form_id} field {$field->id}: allowedExtensions widened" );
			}

			// 3. Dutch validation messages.
			if ( ! empty( $field->isRequired ) && empty( $field->errorMessage ) ) {
				$field->errorMessage = ( 'email' === $field->type ) ? $nl_email : $nl_required;
				$dirty               = true;
				$log( "form {$form_id} field {$field->id}: Dutch error message" );
			}
			if ( 'email' === $field->type && $field->errorMessage !== $nl_email ) {
				$field->errorMessage = $nl_email;
				$dirty               = true;
				$log( "form {$form_id} field {$field->id}: Dutch email message" );
			}
		}

		// 5. Confirm receipt to the person who submitted.
		$ack_id = 'solyxack' . $form_id;
		if ( empty( $form['notifications'][ $ack_id ] ) ) {
			$form['notifications'][ $ack_id ] = array(
				'id'                => $ack_id,
				'isActive'          => true,
				'to'                => '{E-mailadres:3}',
				'toType'            => 'field',
				'toField'           => '3',
				'name'              => 'Bevestiging naar aanvrager',
				'event'             => 'form_submission',
				'from'              => '{admin_email}',
				'fromName'          => 'Solyx Energy',
				'replyTo'           => 'info@solyxenergy.nl',
				'subject'           => 'We hebben je aanvraag ontvangen',
				'message'           => "Hallo {Voornaam:1},\n\n"
					. "Bedankt voor je aanvraag. We hebben je gegevens ontvangen en nemen zo snel mogelijk contact met je op om de installatie in te plannen.\n\n"
					. "Heb je in de tussentijd een vraag? Je kunt gewoon op deze mail antwoorden.\n\n"
					. "Met vriendelijke groet,\nSolyx Energy",
				'disableAutoformat' => false,
			);
			$dirty = true;
			$log( "form {$form_id}: added submitter confirmation notification" );
		}

		// 6. GDPR: identify by email, and map the fields that hold personal data.
		$personal = isset( $form['personalData'] ) ? $form['personalData'] : array();
		$want_ids = array( 1, 2, 3, 4, 5, 6, 14, 17, 18, 19, 20, 21, 22, 23, 24 );
		if ( empty( $personal['exportingAndErasing']['enabled'] ) ) {
			$personal['exportingAndErasing'] = array(
				'enabled'             => true,
				'identificationField' => '3',
				'columns'             => array(
					'ip'         => array( 'export' => true, 'erase' => true ),
					'source_url' => array( 'export' => true, 'erase' => false ),
					'user_agent' => array( 'export' => true, 'erase' => true ),
				),
				'fields'              => array(),
			);
			foreach ( $want_ids as $fid ) {
				$personal['exportingAndErasing']['fields'][ $fid ] = array( 'export' => true, 'erase' => true );
			}
			$form['personalData'] = $personal;
			$dirty                = true;
			$log( "form {$form_id}: personal-data export/erase mapping set" );
		}

		if ( $dirty && ! $dry ) {
			$res = GFAPI::update_form( $form );
			if ( is_wp_error( $res ) ) {
				$log( "form {$form_id}: UPDATE FAILED " . $res->get_error_message() );
			}
		}
	}

	// ------------------------------------------------ 4. form 5: FAQ contact

	$contact_title = 'Contactvraag';
	$contact_id    = $form_id_by_title( $contact_title );
	if ( ! $contact_id && ! $dry ) {
		$meta = array(
			'title'          => $contact_title,
			'description'    => '',
			'labelPlacement' => 'top_label',
			'button'         => array( 'type' => 'text', 'text' => 'Verstuur bericht' ),
			'fields'         => array(
				array( 'id' => 1, 'type' => 'text', 'label' => 'Naam', 'adminLabel' => 'naam', 'isRequired' => true, 'errorMessage' => $nl_required ),
				array( 'id' => 2, 'type' => 'email', 'label' => 'E-mail', 'adminLabel' => 'email', 'isRequired' => true, 'errorMessage' => $nl_email ),
				array( 'id' => 3, 'type' => 'text', 'label' => 'Woonplaats', 'adminLabel' => 'woonplaats', 'isRequired' => true, 'errorMessage' => $nl_required ),
				array( 'id' => 4, 'type' => 'phone', 'label' => 'Telefoonnummer', 'adminLabel' => 'telefoon', 'isRequired' => true, 'phoneFormat' => 'standard', 'errorMessage' => $nl_required ),
				array( 'id' => 5, 'type' => 'number', 'label' => 'Aantal personen in huishouden', 'adminLabel' => 'personen', 'isRequired' => true, 'numberFormat' => 'decimal_dot', 'errorMessage' => $nl_required ),
				array( 'id' => 6, 'type' => 'number', 'label' => 'Aantal zonnepanelen', 'adminLabel' => 'zonnepanelen', 'isRequired' => true, 'numberFormat' => 'decimal_dot', 'errorMessage' => $nl_required ),
				array(
					'id' => 7, 'type' => 'select', 'label' => 'Huidige manier van tapwaterverwarming', 'adminLabel' => 'tapwater',
					'isRequired' => true, 'errorMessage' => $nl_required, 'enableChoiceValue' => true,
					// Values mirror the frontend <option> text exactly — that markup
					// has no value attributes, so the browser reports the text.
					'choices' => array(
						array( 'text' => 'CV-combiketel', 'value' => 'CV-combiketel', 'isSelected' => false, 'price' => '' ),
						array( 'text' => 'Elektrische boiler', 'value' => 'Elektrische boiler', 'isSelected' => false, 'price' => '' ),
					),
				),
				array( 'id' => 8, 'type' => 'textarea', 'label' => 'Bericht', 'adminLabel' => 'bericht', 'isRequired' => true, 'errorMessage' => $nl_required ),
				array(
					'id' => 9, 'type' => 'checkbox', 'label' => 'Marketing opt-in', 'adminLabel' => 'marketingOptIn',
					'isRequired' => false, 'enableChoiceValue' => true,
					'inputs'  => array( array( 'id' => '9.1', 'label' => 'Opt-in', 'name' => '' ) ),
					'choices' => array( array( 'text' => 'Houd me op de hoogte van ontwikkelingen van Solyx', 'value' => 'ja', 'isSelected' => false, 'price' => '' ) ),
				),
				array( 'id' => 10, 'type' => 'hidden', 'label' => 'Bron', 'adminLabel' => 'source', 'defaultValue' => 'faq-contact' ),
				array( 'id' => 11, 'type' => 'hidden', 'label' => 'Pagina', 'adminLabel' => 'pageUrl', 'defaultValue' => '' ),
			),
			'notifications'  => array(
				'solyxc1' => array(
					'id' => 'solyxc1', 'isActive' => true, 'to' => 'info@solyxenergy.nl', 'toType' => 'email',
					'name' => 'Contactvraag naar Solyx', 'event' => 'form_submission',
					'from' => '{admin_email}', 'fromName' => 'Solyx Energy website', 'replyTo' => '{E-mail:2}',
					'subject' => 'Contactvraag: {Naam:1} — {Woonplaats:3}', 'message' => '{all_fields}', 'disableAutoformat' => false,
				),
				'solyxc2' => array(
					'id' => 'solyxc2', 'isActive' => true, 'to' => '{E-mail:2}', 'toType' => 'field', 'toField' => '2',
					'name' => 'Bevestiging naar afzender', 'event' => 'form_submission',
					'from' => '{admin_email}', 'fromName' => 'Solyx Energy', 'replyTo' => 'info@solyxenergy.nl',
					'subject' => 'We hebben je bericht ontvangen',
					'message' => "Hallo {Naam:1},\n\nBedankt voor je bericht. We nemen zo snel mogelijk persoonlijk contact met je op.\n\nMet vriendelijke groet,\nSolyx Energy",
					'disableAutoformat' => false,
				),
			),
			'confirmations'  => array( 'solyxcc' => $confirmation_ok( 'solyxcc' ) ),
			'enableHoneypot' => true,
			'requireLogin'   => false,
			'is_active'      => '1',
			'is_trash'       => '0',
		);
		$new = GFAPI::add_form( $meta );
		if ( is_wp_error( $new ) ) {
			$log( 'form Contactvraag: CREATE FAILED ' . $new->get_error_message() );
		} else {
			$contact_id = (int) $new;
			$log( "form Contactvraag: created as id {$contact_id}" );
		}
	} elseif ( $contact_id ) {
		$log( "form Contactvraag: already exists as id {$contact_id}" );
	}

	// --------------------------------------- 4. form 6: installer purchase info

	$inst_title = 'Installateurs inkoopinformatie';
	$inst_id    = $form_id_by_title( $inst_title );
	if ( ! $inst_id && ! $dry ) {
		$meta = array(
			'title'          => $inst_title,
			'description'    => '',
			'labelPlacement' => 'top_label',
			'button'         => array( 'type' => 'text', 'text' => 'Verzenden' ),
			'fields'         => array(
				array( 'id' => 1, 'type' => 'email', 'label' => 'E-mailadres', 'adminLabel' => 'email', 'isRequired' => true, 'errorMessage' => $nl_email ),
				array( 'id' => 2, 'type' => 'hidden', 'label' => 'Bron', 'adminLabel' => 'source', 'defaultValue' => 'installateurs-hero' ),
				array( 'id' => 3, 'type' => 'hidden', 'label' => 'Pagina', 'adminLabel' => 'pageUrl', 'defaultValue' => '' ),
			),
			'notifications'  => array(
				'solyxi1' => array(
					'id' => 'solyxi1', 'isActive' => true, 'to' => 'info@solyxenergy.nl', 'toType' => 'email',
					'name' => 'Installateur vraagt inkoopinformatie', 'event' => 'form_submission',
					'from' => '{admin_email}', 'fromName' => 'Solyx Energy website', 'replyTo' => '{E-mailadres:1}',
					'subject' => 'Installateur vraagt inkoopinformatie: {E-mailadres:1}', 'message' => '{all_fields}', 'disableAutoformat' => false,
				),
				'solyxi2' => array(
					'id' => 'solyxi2', 'isActive' => true, 'to' => '{E-mailadres:1}', 'toType' => 'field', 'toField' => '1',
					'name' => 'Bevestiging naar installateur', 'event' => 'form_submission',
					'from' => '{admin_email}', 'fromName' => 'Solyx Energy', 'replyTo' => 'info@solyxenergy.nl',
					'subject' => 'Je aanvraag voor de zakelijke inkoopinformatie',
					'message' => "Hallo,\n\nBedankt voor je interesse. We sturen je de zakelijke inkoopinformatie zo snel mogelijk toe.\n\nMet vriendelijke groet,\nSolyx Energy",
					'disableAutoformat' => false,
				),
			),
			'confirmations'  => array( 'solyxic' => $confirmation_ok( 'solyxic' ) ),
			'enableHoneypot' => true,
			'requireLogin'   => false,
			'is_active'      => '1',
			'is_trash'       => '0',
		);
		$new = GFAPI::add_form( $meta );
		if ( is_wp_error( $new ) ) {
			$log( 'form Installateurs: CREATE FAILED ' . $new->get_error_message() );
		} else {
			$inst_id = (int) $new;
			$log( "form Installateurs: created as id {$inst_id}" );
		}
	} elseif ( $inst_id ) {
		$log( "form Installateurs: already exists as id {$inst_id}" );
	}

	// ------------------------------------------- 7. phone format: NL, not US
	// GF's "standard" phone format is the US pattern (###) ###-####. It masks a
	// Dutch 06-number into US shape and rejects anything international, so every
	// phone field on this site must use the unvalidated international format.
	foreach ( array_filter( array( 1, 4, (int) $contact_id ) ) as $form_id ) {
		$form = GFAPI::get_form( $form_id );
		if ( ! $form ) {
			continue;
		}
		$dirty = false;
		foreach ( $form['fields'] as $field ) {
			if ( 'phone' === $field->type && 'international' !== $field->phoneFormat ) {
				$field->phoneFormat = 'international';
				$dirty              = true;
				$log( "form {$form_id} field {$field->id}: phoneFormat standard -> international" );
			}
		}
		if ( $dirty && ! $dry ) {
			$res = GFAPI::update_form( $form );
			if ( is_wp_error( $res ) ) {
				$log( "form {$form_id}: PHONE UPDATE FAILED " . $res->get_error_message() );
			}
		}
	}

	wp_send_json(
		array(
			'ok'         => true,
			'dry'        => (bool) $dry,
			'contactId'  => (int) $contact_id,
			'installId'  => (int) $inst_id,
			'changes'    => $changes,
		)
	);
}, 1 );
