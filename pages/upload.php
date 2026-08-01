<?php
# TicketAttach - feltöltés-feldolgozó.
# A kiválasztott fájl(oka)t bugnote_id = 0 értékkel csatolja a jegyhez,
# tehát tisztán a jegyhez, NEM egy megjegyzéshez. Ezután visszairányít a jegy nézetére.
# Elérés: plugin.php?page=TicketAttach/upload  (a plugin_page('upload') ezt adja).

require_api( 'file_api.php' );
require_api( 'bug_api.php' );
require_api( 'gpc_api.php' );
require_api( 'helper_api.php' );
require_api( 'access_api.php' );
require_api( 'authentication_api.php' );
require_api( 'print_api.php' );
require_api( 'lang_api.php' );
require_api( 'layout_api.php' );
require_api( 'string_api.php' );

auth_ensure_user_authenticated();

# Ha a POST törzs meghaladja a php.ini post_max_size értékét, a PHP eldobja a
# $_POST-ot ÉS a $_FILES-t is. Ilyenkor az alábbi CSRF ellenőrzés hasalna el egy
# teljesen félrevezető üzenettel, ezért ezt az esetet előbb külön kezeljük.
if( empty( $_POST ) && (int)( $_SERVER['CONTENT_LENGTH'] ?? 0 ) > 0 ) {
	trigger_error( ERROR_FILE_TOO_BIG, ERROR );
}

form_security_validate( 'plugin_ticketattach_upload' );

$f_bug_id = gpc_get_int( 'bug_id' );
$f_files  = gpc_get_file( 'ufile', array() );

bug_ensure_exists( $f_bug_id );

# Jogosultság: ugyanaz a szabály, mint a beépített (komment alatti) feltöltésnél.
if( !file_allow_bug_upload( $f_bug_id ) || bug_is_readonly( $f_bug_id ) ) {
	access_denied();
}

# Több fájl kezelése: a ufile[] szerkezetét fájlonkénti tömbökre bontjuk
# (ugyanúgy, ahogy a bugnote_add.php teszi).
$t_files = helper_array_transpose( $f_files );

$t_added  = 0;
$t_failed = array();

if( is_array( $t_files ) ) {
	foreach( $t_files as $t_file ) {
		# Üres / nem kiválasztott mezők átugrása.
		if( !isset( $t_file['name'] ) || is_blank( $t_file['name'] ) ) {
			continue;
		}
		if( isset( $t_file['error'] ) && $t_file['error'] == UPLOAD_ERR_NO_FILE ) {
			continue;
		}

		# Fájlonként kapjuk el a hibát. A file_add() a file_ensure_uploaded()-en
		# keresztül kivételt dob tiltott kiterjesztésre, méretre vagy csonka
		# feltöltésre; kezeletlenül ez megszakítaná a ciklust, így a hibás fájl
		# UTÁNI fájlok némán kimaradnának, az előttiek pedig már mentve lennének.
		try {
			# A file_add() 9. paramétere a bugnote_id; itt nem adjuk meg,
			# így az alapértelmezett 0 marad -> a csatolmány a jegyhez kötődik.
			file_add( $f_bug_id, $t_file, 'bug' );
			$t_added++;
		} catch( Exception $e ) {
			# Listát gyűjtünk, nem fájlnév szerinti tömböt: két azonos nevű, de
			# különböző fájl is kiválasztható, és a kulcsos tárolás elnyelné az egyiket.
			$t_failed[] = array(
				'name'    => $t_file['name'],
				'message' => $e->getMessage(),
			);
		}
	}
}

# Egyetlen fájl sem érkezett (JS nélkül a küldés gomb nincs letiltva, így üresen is
# elküldhető az űrlap). Redirect helyett szóljunk, különben néma no-op lenne.
if( 0 == $t_added && empty( $t_failed ) ) {
	trigger_error( ERROR_FILE_NO_UPLOAD_FAILURE, ERROR );
}

form_security_purge( 'plugin_ticketattach_upload' );

if( empty( $t_failed ) ) {
	# Visszairányítás a jegy nézetére. A ta_scroll paramétert a ticketattach.js olvassa,
	# és a "Csatolt fájlok" szekcióhoz görget (a fragmentnél megbízhatóbb redirect után).
	print_header_redirect( 'view.php?id=' . $f_bug_id . '&ta_scroll=1' );
}

# Legalább egy fájl elbukott: redirect helyett kiírjuk, mi ment át és mi nem,
# hogy ne legyen néma részleges feltöltés.
layout_page_header( plugin_lang_get( 'attach_file_to_issue' ) );
layout_page_begin();

echo '<div class="col-md-12 col-xs-12">';
echo '<div class="space-10"></div>';
echo '<div class="widget-box widget-color-red">';
echo '<div class="widget-header widget-header-small">';
echo '<h4 class="widget-title lighter">';
echo '<i class="ace-icon fa fa-exclamation-triangle"></i> ' . plugin_lang_get( 'upload_failed_title' );
echo '</h4>';
echo '</div>';
echo '<div class="widget-body"><div class="widget-main">';

echo '<p>' . sprintf( plugin_lang_get( 'uploaded_count' ), (int)$t_added ) . '</p>';
echo '<p>' . plugin_lang_get( 'failed_list_intro' ) . '</p>';
echo '<ul>';
foreach( $t_failed as $t_fail ) {
	echo '<li><strong>' . string_display_line( $t_fail['name'] ) . '</strong> &ndash; '
		. string_display_line( $t_fail['message'] ) . '</li>';
}
echo '</ul>';

echo '<div class="space-10"></div>';
print_link_button( 'view.php?id=' . $f_bug_id, lang_get( 'proceed' ) );

echo '</div></div>'; # widget-main, widget-body
echo '</div>'; # widget-box
echo '</div>'; # col

layout_page_end();
