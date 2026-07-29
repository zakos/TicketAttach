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

auth_ensure_user_authenticated();

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

if( is_array( $t_files ) ) {
	foreach( $t_files as $t_file ) {
		# Üres / nem kiválasztott mezők átugrása.
		if( !isset( $t_file['name'] ) || is_blank( $t_file['name'] ) ) {
			continue;
		}
		if( isset( $t_file['error'] ) && $t_file['error'] == UPLOAD_ERR_NO_FILE ) {
			continue;
		}

		# A file_add() 9. paramétere a bugnote_id; itt nem adjuk meg,
		# így az alapértelmezett 0 marad -> a csatolmány a jegyhez kötődik.
		file_add( $f_bug_id, $t_file, 'bug' );
	}
}

form_security_purge( 'plugin_ticketattach_upload' );

# Visszairányítás a jegy nézetére. A ta_scroll paramétert a ticketattach.js olvassa,
# és a "Csatolt fájlok" szekcióhoz görget (a fragmentnél megbízhatóbb redirect után).
print_header_redirect( 'view.php?id=' . $f_bug_id . '&ta_scroll=1' );
