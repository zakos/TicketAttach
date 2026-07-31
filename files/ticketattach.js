/*
 * TicketAttach - kliensoldali logika (v1.2).
 *  1) A feltöltő dobozt a "Hibajegy részletei" doboz alá helyezi.
 *  2) Drag & drop felület; a kiválasztott fájlok listázhatók ÉS egyenként törölhetők
 *     feltöltés előtt (DataTransfer-rel újraépített FileList).
 *  3) Kliensoldali méret- és kiterjesztés-ellenőrzés.
 *  4) Feltöltés után a "Csatolt fájlok" szekcióhoz görget (ta_scroll query param alapján).
 *
 * Külön fájlként szolgáljuk ki (plugin_file.php), hogy a CSP script-src 'self'
 * mellett is lefusson.
 */
(function () {
	'use strict';

	function init() {
		var wrap = document.getElementById('ticketattach-wrap');
		if (wrap) {
			relocate(wrap);
			setupDropzone(wrap);
		}
		maybeScrollToAttachments();
	}

	/* A feltöltőt a "Hibajegy részletei" doboz külső oszlopa után helyezi. */
	function relocate(wrap) {
		var box = findDetailsBox(wrap);
		if (!box) {
			return;
		}
		var col = box.closest('.col-md-12') || box.parentNode;
		if (col && col.parentNode) {
			col.parentNode.insertBefore(wrap, col.nextSibling);
		}
	}

	/*
	 * A "Hibajegy részletei" doboz megkeresése.
	 *
	 * Az "első blue2 widget" heurisztika eltéved, ha egy másik plugin egy korábbi
	 * hookon kirak egy ilyen dobozt. A core-ban viszont a jegy-részletek az egyetlen
	 * id NÉLKÜLI blue2 widget (a #monitors, #history, #relationships mind kap id-t),
	 * ezért a jegyazonosító cellájából kapaszkodunk felfelé - az mindig kirajzolódik.
	 */
	function findDetailsBox(wrap) {
		var idCell = document.querySelector('td.bug-id');
		var box = idCell && idCell.closest('.widget-box');
		if (box && !wrap.contains(box)) {
			return box;
		}

		// tartalék: az első blue2 doboz a feltöltőn kívül
		var boxes = document.querySelectorAll('.widget-box.widget-color-blue2');
		for (var i = 0; i < boxes.length; i++) {
			if (!wrap.contains(boxes[i])) {
				return boxes[i];
			}
		}
		return null;
	}

	/* Feltöltés után: görgetés a "Csatolt fájlok" szekcióhoz, majd a query param eltávolítása. */
	function maybeScrollToAttachments() {
		var params = new URLSearchParams(window.location.search);
		if (!params.get('ta_scroll')) {
			return;
		}

		window.setTimeout(function () {
			var target = findAttachmentsCell();
			if (!target) {
				// nincs csatolmány szekció -> a felső doboz tetejére
				target = document.querySelector('.widget-box.widget-color-blue2');
			}
			if (target) {
				target.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}, 80);

		// A query param eltávolítása, hogy frissítésnél ne görgessen újra.
		if (window.history && window.history.replaceState) {
			params.delete('ta_scroll');
			var q = params.toString();
			var newUrl = window.location.pathname + (q ? '?' + q : '') + window.location.hash;
			window.history.replaceState({}, document.title, newUrl);
		}
	}

	/*
	 * A "Csatolt fájlok" cella megkeresése.
	 *
	 * A core a bug-attach-tags osztályt KÉT soron is használja (bug_view_inc.php):
	 * előbb a "Címkék hozzáadása" űrlapon, csak utána a csatolmányokon. Egy sima
	 * querySelector ezért a címke-űrlapot találná el. A csatolmányokat a core
	 * .well dobozokban rajzolja ki (print_bug_attachment), erre szűrünk, hátulról.
	 */
	function findAttachmentsCell() {
		var cells = document.querySelectorAll('td.bug-attach-tags');
		for (var i = cells.length - 1; i >= 0; i--) {
			if (cells[i].querySelector('.well')) {
				return cells[i];
			}
		}
		return null;
	}

	function setupDropzone(wrap) {
		var zone = wrap.querySelector('.ticketattach-dropzone');
		var input = wrap.querySelector('input[type="file"]');
		var list = wrap.querySelector('.ticketattach-filelist');
		var submit = wrap.querySelector('.ticketattach-submit');
		if (!zone || !input) {
			return;
		}

		// A natív FileList nem szerkeszthető; saját tömbben tartjuk a kiválasztást,
		// és DataTransfer-rel írjuk vissza az inputba minden módosításkor.
		var selected = [];
		var canEdit = (typeof DataTransfer !== 'undefined');

		var maxSize = parseInt(zone.getAttribute('data-max-size'), 10) || 0;
		var postMax = parseInt(zone.getAttribute('data-post-max'), 10) || 0;
		var allowed = parseList(zone.getAttribute('data-allowed'));
		var disallowed = parseList(zone.getAttribute('data-disallowed'));

		zone.addEventListener('click', function (e) {
			// A fájllistán belüli kattintás (fájlnév, törlő gomb) ne nyissa újra
			// a fájlválasztót - csak a zóna üres része nyisson.
			if (e.target === input || isRemoveButton(e.target) || list.contains(e.target)) {
				return;
			}
			input.click();
		});

		// DataTransfer nélkül nem tudjuk visszaírni az input.files-t, így a drag & drop
		// csak látszólag működne: a behúzott fájlok megjelennének a listán, de a form
		// üresen menne el. Ilyenkor inkább be sem kötjük, és a szöveget is igazítjuk.
		if (canEdit) {
			['dragenter', 'dragover'].forEach(function (ev) {
				zone.addEventListener(ev, function (e) {
					e.preventDefault();
					e.stopPropagation();
					zone.classList.add('ticketattach-dragover');
				});
			});
			['dragleave', 'drop'].forEach(function (ev) {
				zone.addEventListener(ev, function (e) {
					e.preventDefault();
					e.stopPropagation();
					zone.classList.remove('ticketattach-dragover');
				});
			});

			zone.addEventListener('drop', function (e) {
				if (e.dataTransfer && e.dataTransfer.files) {
					addFiles(e.dataTransfer.files);
				}
			});
		} else {
			var hint = zone.querySelector('.ticketattach-hint');
			if (hint) {
				hint.textContent = 'Kattints a feltöltendő fájlok kiválasztásához';
			}
		}

		input.addEventListener('change', function () {
			if (!canEdit) {
				// Csak azt mutathatjuk, amit a böngésző ténylegesen el fog küldeni:
				// a korábbi kiválasztást az input maga is eldobta.
				selected = Array.prototype.slice.call(input.files);
				render();
				return;
			}
			addFiles(input.files);
		});

		// Dupla küldés elleni védelem: nagy fájloknál a feltöltés eltarthat, és a
		// türelmetlen második kattintás mindent még egyszer felöltene. A letiltás
		// setTimeout-ban megy, hogy a böngésző még az eredeti submitot elküldje.
		var form = wrap.querySelector('form');
		if (form && submit) {
			form.addEventListener('submit', function () {
				window.setTimeout(function () {
					submit.disabled = true;
					submit.value = 'Feltöltés folyamatban…';
				}, 0);
			});
		}

		render();

		function addFiles(fileList) {
			for (var i = 0; i < fileList.length; i++) {
				var f = fileList[i];
				var dup = selected.some(function (s) {
					return s.name === f.name && s.size === f.size && s.lastModified === f.lastModified;
				});
				if (!dup) {
					selected.push(f);
				}
			}
			syncInput();
			render();
		}

		function removeFile(idx) {
			selected.splice(idx, 1);
			syncInput();
			render();
		}

		/* A kiválasztott fájlok visszaírása az inputba, hogy a form helyesen küldje. */
		function syncInput() {
			if (!canEdit) {
				return;
			}
			var dt = new DataTransfer();
			selected.forEach(function (f) { dt.items.add(f); });
			input.files = dt.files;
		}

		function render() {
			list.innerHTML = '';
			var hasError = false;
			var total = 0;

			selected.forEach(function (f, idx) {
				total += f.size;

				var problem = validate(f);

				var row = document.createElement('div');
				row.className = 'ticketattach-fileitem' + (problem ? ' ticketattach-fileitem-error' : '');

				var label = document.createElement('span');
				label.className = 'ticketattach-filename';
				label.textContent = f.name + ' (' + formatSize(f.size) + ')' + (problem ? ' \u2014 ' + problem : '');
				row.appendChild(label);

				if (canEdit) {
					var del = document.createElement('button');
					del.type = 'button';
					del.className = 'ticketattach-remove';
					del.setAttribute('aria-label', 'Eltávolítás: ' + f.name);
					del.setAttribute('title', 'Eltávolítás');
					del.innerHTML = '&times;';
					del.addEventListener('click', function (e) {
						e.preventDefault();
						e.stopPropagation();
						removeFile(idx);
					});
					row.appendChild(del);
				}

				list.appendChild(row);
				if (problem) { hasError = true; }
			});

			// A fájlonkénti korlát nem véd a post_max_size ellen: az az EGÉSZ POST
			// törzsre vonatkozik. Túllépve a PHP eldobja a $_POST-ot és a $_FILES-t
			// is, azaz minden fájl elveszne - ezért itt fogjuk meg, küldés előtt.
			var overflow = postMax > 0 && selected.length > 0
				&& (total + postOverhead(selected.length)) > postMax;

			if (overflow) {
				var warn = document.createElement('div');
				warn.className = 'ticketattach-fileitem';
				var warnLabel = document.createElement('span');
				warnLabel.className = 'ticketattach-warning';
				warnLabel.textContent = 'A kiválasztott fájlok együtt túl nagyok: '
					+ formatSize(total) + ' — a szerver egy feltöltésben legfeljebb '
					+ formatSize(postMax) + ' méretet fogad';
				warn.appendChild(warnLabel);
				list.appendChild(warn);
			}

			if (submit) {
				submit.disabled = (selected.length === 0) || hasError || overflow;
			}
		}

		function validate(f) {
			if (maxSize > 0 && f.size > maxSize) {
				return 'túl nagy (max ' + formatSize(maxSize) + ')';
			}
			var ext = (f.name.indexOf('.') !== -1 ? f.name.split('.').pop() : '').toLowerCase();
			if (disallowed.length && disallowed.indexOf(ext) !== -1) {
				return 'tiltott típus (.' + ext + ')';
			}
			if (allowed.length && allowed.indexOf(ext) === -1) {
				return 'nem engedélyezett típus (.' + ext + ')';
			}
			return null;
		}
	}

	function isRemoveButton(el) {
		return el && el.classList && el.classList.contains('ticketattach-remove');
	}

	function parseList(s) {
		if (!s) { return []; }
		return s.split(',').map(function (x) {
			return x.trim().toLowerCase().replace(/^\./, '');
		}).filter(function (x) { return x.length; });
	}

	/*
	 * A multipart törzs nagyobb a fájlok nyers összméreténél (határolók, fejlécek,
	 * rejtett mezők), ezért a post_max_size ellenőrzésnél tartunk egy ráhagyást.
	 */
	function postOverhead(count) {
		return 2048 + count * 512;
	}

	function formatSize(bytes) {
		if (bytes >= 1048576) { return (bytes / 1048576).toFixed(1) + ' MiB'; }
		if (bytes >= 1024) { return Math.round(bytes / 1024) + ' KiB'; }
		return bytes + ' B';
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
