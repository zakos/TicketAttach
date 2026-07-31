<?php
# TicketAttach plugin
# Jegy-szintű (megjegyzéshez NEM kötött) fájlfeltöltés a MantisBT 2.28 jegy nézetében,
# az 1.2.x viselkedés szerint. A fájl bugnote_id = 0 értékkel kerül a jegyhez, így a
# felső "Csatolt fájlok" panelben jelenik meg, nem egy komment alatt.
#
# A feltöltő doboz vizuálisan a "Hibajegy részleteinek megjelenítése" doboz ALÁ kerül
# (a külső JS pozícionálja oda), drag & drop felülettel és kliensoldali ellenőrzéssel.

require_api( 'file_api.php' );
require_api( 'bug_api.php' );
require_api( 'utility_api.php' );
require_api( 'print_api.php' );

class TicketAttachPlugin extends MantisPlugin {

	function register() {
		$this->name        = 'Ticket Attach';
		$this->description  = 'Jegy-szintű (megjegyzéshez nem kötött) fájlfeltöltés a jegy nézetében, az 1.2.x viselkedés szerint. Drag & drop, kliensoldali ellenőrzés.';
		$this->page         = '';
		$this->version      = '1.2.1';
		$this->requires     = array( 'MantisCore' => '2.0.0' );
		$this->author       = 'Laurel Kft.';
		$this->contact      = '';
		$this->url          = '';
	}

	function hooks() {
		# Az EVENT_VIEW_BUG_EXTRA tisztán (a dobozokon kívül) hagy minket HTML-t kiírni;
		# a tényleges pozíciót (a "Hibajegy részletei" doboz alá) a ticketattach.js állítja be.
		return array(
			'EVENT_VIEW_BUG_EXTRA'   => 'show_upload_form',
			'EVENT_LAYOUT_RESOURCES' => 'add_resources',
		);
	}

	/**
	 * Stíluslap beszúrása a lap fejlécébe.
	 *
	 * A <link> a body-ban érvénytelen HTML és villanást okozhat; a core erre az
	 * eseményre gyűjti a plugin-erőforrásokat (layout_page_header_end). Minden
	 * lapon lefut, de a fájl pár kilobájt és a böngésző gyorsítótárazza.
	 *
	 * Az esemény EVENT_TYPE_OUTPUT, tehát a visszaadott sztringet írja ki.
	 *
	 * @return string
	 */
	function add_resources() {
		return '<link rel="stylesheet" type="text/css" href="'
			. plugin_file( 'ticketattach.css' ) . '"/>' . "\n";
	}

	/**
	 * Feltöltő űrlap kiírása. A JS áthelyezi a "Hibajegy részletei" doboz alá.
	 *
	 * @param string  $p_event  Esemény neve.
	 * @param integer $p_bug_id Hibajegy azonosító.
	 * @return void
	 */
	function show_upload_form( $p_event, $p_bug_id ) {
		# Csak akkor, ha a feltöltés a beépített szabályok szerint engedélyezett
		# ennek a felhasználónak erre a jegyre (allow_file_upload + threshold).
		if( !file_allow_bug_upload( $p_bug_id ) ) {
			return;
		}

		# Lezárt (readonly) jegynél ne jelenjen meg az űrlap.
		if( bug_is_readonly( $p_bug_id ) ) {
			return;
		}

		$t_action     = plugin_page( 'upload' );
		$t_js         = plugin_file( 'ticketattach.js' );
		# A TÉNYLEGES korlát: min( upload_max_filesize, post_max_size, $g_max_file_size ).
		# Ugyanazt mutatjuk, amit a beépített (komment alatti) feltöltő is.
		$t_max_size   = (int)file_get_max_file_size();
		$t_allowed    = config_get( 'allowed_files' );
		$t_disallowed = config_get( 'disallowed_files' );
		# A post_max_size az EGÉSZ POST törzsre vonatkozik, nem fájlonként. Több fájl
		# feltöltésénél ezt külön is ki kell adnunk a kliensnek, mert a fenti
		# $t_max_size már összemosta a fájlonkénti korláttal.
		$t_post_max   = (int)ini_get_number( 'post_max_size' );

		echo '<div id="ticketattach-wrap" class="col-md-12 col-xs-12">';
		echo '<div class="space-10"></div>';
		echo '<div class="widget-box widget-color-blue2">';
		echo '<div class="widget-header widget-header-small">';
		echo '<h4 class="widget-title lighter">';
		echo '<i class="ace-icon fa fa-paperclip"></i> Fájl csatolása a jegyhez';
		echo '</h4>';
		echo '</div>';
		echo '<div class="widget-body"><div class="widget-main">';

		echo '<form method="post" enctype="multipart/form-data" action="' . $t_action . '">';
		echo form_security_field( 'plugin_ticketattach_upload' );
		echo '<input type="hidden" name="bug_id" value="' . (int)$p_bug_id . '"/>';
		# A PHP mágikus mezőneve NAGYBETŰS - kisbetűvel a mező semmit nem csinál,
		# és a core sem olvassa. Így viszont a PHP a túl nagy fájlt már feldolgozás
		# előtt UPLOAD_ERR_FORM_SIZE-zal jelöli, amit az upload.php fájlonként jelent.
		# A mezőnek meg kell előznie a file inputot, különben hatástalan.
		echo '<input type="hidden" name="MAX_FILE_SIZE" value="' . $t_max_size . '"/>';

		echo '<div class="ticketattach-dropzone" '
			. 'data-max-size="' . $t_max_size . '" '
			. 'data-post-max="' . $t_post_max . '" '
			. 'data-allowed="' . string_attribute( $t_allowed ) . '" '
			. 'data-disallowed="' . string_attribute( $t_disallowed ) . '">';
		echo '<i class="ace-icon fa fa-cloud-upload bigger-250 grey"></i>';
		echo '<div class="ticketattach-hint">Húzd ide a feltöltendő fájlokat, vagy kattints a kiválasztáshoz</div>';
		echo '<input type="file" name="ufile[]" multiple="multiple" '
			. 'aria-label="Feltöltendő fájlok kiválasztása"/>';
		echo '<div class="ticketattach-filelist"></div>';
		echo '</div>';

		echo '<div class="space-6"></div>';
		echo '<input type="submit" class="btn btn-primary btn-sm btn-white btn-round ticketattach-submit" value="Feltöltés a jegyhez"/>';
		# A core saját helperje: ugyanúgy formáz, mint a beépített feltöltő, és a
		# title-ben a pontos bájtszámot is megmutatja.
		echo '<span class="small grey"> &#160; Maximális méret fájlonként: </span>';
		print_max_filesize( $t_max_size );
		echo '</form>';

		echo '</div></div>'; # widget-main, widget-body
		echo '</div>'; # widget-box
		echo '</div>'; # ticketattach-wrap

		echo '<script type="text/javascript" src="' . $t_js . '"></script>';
	}
}
