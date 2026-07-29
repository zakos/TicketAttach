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

	/* A feltöltőt a "Hibajegy részletei" (első kék) doboz külső oszlopa után helyezi. */
	function relocate(wrap) {
		var boxes = document.querySelectorAll('.widget-box.widget-color-blue2');
		var firstBox = null;
		for (var i = 0; i < boxes.length; i++) {
			if (!wrap.contains(boxes[i])) {
				firstBox = boxes[i];
				break;
			}
		}
		if (!firstBox) {
			return;
		}
		var col = firstBox.closest('.col-md-12') || firstBox.parentNode;
		if (col && col.parentNode) {
			col.parentNode.insertBefore(wrap, col.nextSibling);
		}
	}

	/* Feltöltés után: görgetés a "Csatolt fájlok" szekcióhoz, majd a query param eltávolítása. */
	function maybeScrollToAttachments() {
		var params = new URLSearchParams(window.location.search);
		if (!params.get('ta_scroll')) {
			return;
		}

		window.setTimeout(function () {
			var target = document.querySelector('.bug-attach-tags');
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
		var allowed = parseList(zone.getAttribute('data-allowed'));
		var disallowed = parseList(zone.getAttribute('data-disallowed'));

		zone.addEventListener('click', function (e) {
			if (e.target !== input && !isRemoveButton(e.target)) {
				input.click();
			}
		});

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

		input.addEventListener('change', function () {
			addFiles(input.files);
		});

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

			selected.forEach(function (f, idx) {
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
					del.setAttribute('aria-label', 'Eltavolitas');
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

			if (submit) {
				submit.disabled = (selected.length === 0) || hasError;
			}
		}

		function validate(f) {
			if (maxSize > 0 && f.size > maxSize) {
				return 'tul nagy (max ' + formatSize(maxSize) + ')';
			}
			var ext = (f.name.indexOf('.') !== -1 ? f.name.split('.').pop() : '').toLowerCase();
			if (disallowed.length && disallowed.indexOf(ext) !== -1) {
				return 'tiltott tipus (.' + ext + ')';
			}
			if (allowed.length && allowed.indexOf(ext) === -1) {
				return 'nem engedelyezett tipus (.' + ext + ')';
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
