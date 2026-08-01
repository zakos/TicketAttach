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
 *
 * Célplatform: modern böngészők. A kód épít a DataTransfer, URLSearchParams,
 * Element.closest és replaceChildren API-kra; ezekhez nincs fallback (a
 * DataTransfer hiányát külön kezeljük, ott a natív input viselkedésre esünk vissza).
 */
(function () {
	'use strict';

	function init() {
		const wrap = document.getElementById('ticketattach-wrap');
		if (wrap) {
			relocate(wrap);
			setupDropzone(wrap);
		}
		maybeScrollToAttachments();
	}

	/* A feltöltőt a "Hibajegy részletei" doboz külső oszlopa után helyezi. */
	function relocate(wrap) {
		const box = findDetailsBox(wrap);
		if (!box) {
			return;
		}
		const col = box.closest('.col-md-12') || box.parentNode;
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
		const idCell = document.querySelector('td.bug-id');
		const box = idCell && idCell.closest('.widget-box');
		if (box && !wrap.contains(box)) {
			return box;
		}

		// tartalék: az első blue2 doboz a feltöltőn kívül
		const boxes = document.querySelectorAll('.widget-box.widget-color-blue2');
		for (const candidate of boxes) {
			if (!wrap.contains(candidate)) {
				return candidate;
			}
		}
		return null;
	}

	/* Feltöltés után: görgetés a "Csatolt fájlok" szekcióhoz, majd a query param eltávolítása. */
	function maybeScrollToAttachments() {
		const params = new URLSearchParams(window.location.search);
		if (!params.get('ta_scroll')) {
			return;
		}

		window.setTimeout(() => {
			// nincs csatolmány szekció -> a felső doboz tetejére
			const target = findAttachmentsCell()
				|| document.querySelector('.widget-box.widget-color-blue2');
			if (target) {
				target.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}, 80);

		// A query param eltávolítása, hogy frissítésnél ne görgessen újra.
		if (window.history && window.history.replaceState) {
			params.delete('ta_scroll');
			const q = params.toString();
			const newUrl = window.location.pathname + (q ? '?' + q : '') + window.location.hash;
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
		const cells = document.querySelectorAll('td.bug-attach-tags');
		for (let i = cells.length - 1; i >= 0; i--) {
			if (cells[i].querySelector('.well')) {
				return cells[i];
			}
		}
		return null;
	}

	function setupDropzone(wrap) {
		const zone = wrap.querySelector('.ticketattach-dropzone');
		const input = wrap.querySelector('input[type="file"]');
		const list = wrap.querySelector('.ticketattach-filelist');
		const submit = wrap.querySelector('.ticketattach-submit');
		if (!zone || !input) {
			return;
		}

		// A natív FileList nem szerkeszthető; saját tömbben tartjuk a kiválasztást,
		// és DataTransfer-rel írjuk vissza az inputba minden módosításkor.
		let selected = [];
		const canEdit = (typeof DataTransfer !== 'undefined');

		const maxSize = parseInt(zone.getAttribute('data-max-size'), 10) || 0;
		const postMax = parseInt(zone.getAttribute('data-post-max'), 10) || 0;
		const allowed = parseList(zone.getAttribute('data-allowed'));
		const disallowed = parseList(zone.getAttribute('data-disallowed'));

		zone.addEventListener('click', (e) => {
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
			for (const ev of ['dragenter', 'dragover']) {
				zone.addEventListener(ev, (e) => {
					e.preventDefault();
					e.stopPropagation();
					zone.classList.add('ticketattach-dragover');
				});
			}
			for (const ev of ['dragleave', 'drop']) {
				zone.addEventListener(ev, (e) => {
					e.preventDefault();
					e.stopPropagation();
					zone.classList.remove('ticketattach-dragover');
				});
			}

			zone.addEventListener('drop', (e) => {
				if (e.dataTransfer && e.dataTransfer.files) {
					addFiles(e.dataTransfer.files);
				}
			});
		} else {
			const hint = zone.querySelector('.ticketattach-hint');
			if (hint) {
				hint.textContent = 'Kattints a feltöltendő fájlok kiválasztásához';
			}
		}

		input.addEventListener('change', () => {
			if (!canEdit) {
				// Csak azt mutathatjuk, amit a böngésző ténylegesen el fog küldeni:
				// a korábbi kiválasztást az input maga is eldobta.
				selected = Array.from(input.files);
				render();
				return;
			}
			addFiles(input.files);
		});

		// Dupla küldés elleni védelem: nagy fájloknál a feltöltés eltarthat, és a
		// türelmetlen második kattintás mindent még egyszer felöltene. A letiltás
		// setTimeout-ban megy, hogy a böngésző még az eredeti submitot elküldje.
		const form = wrap.querySelector('form');
		if (form && submit) {
			const submitLabel = submit.value;

			form.addEventListener('submit', () => {
				window.setTimeout(() => {
					submit.disabled = true;
					submit.value = 'Feltöltés folyamatban…';
				}, 0);
			});

			// A Vissza gomb a bfcache-ből a MENTETT DOM-ot állítja vissza, benne a
			// letiltott gombbal és a "folyamatban" felirattal - ez örökre ottragadna.
			window.addEventListener('pageshow', (e) => {
				if (e.persisted) {
					submit.value = submitLabel;
					render();
				}
			});
		}

		render();

		function addFiles(fileList) {
			for (const f of fileList) {
				const dup = selected.some((s) =>
					s.name === f.name && s.size === f.size && s.lastModified === f.lastModified);
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
			const dt = new DataTransfer();
			for (const f of selected) {
				dt.items.add(f);
			}
			input.files = dt.files;
		}

		function render() {
			list.replaceChildren();
			let hasError = false;
			let total = 0;

			selected.forEach((f, idx) => {
				total += f.size;

				const problem = validate(f);

				const row = document.createElement('div');
				row.className = 'ticketattach-fileitem' + (problem ? ' ticketattach-fileitem-error' : '');

				const label = document.createElement('span');
				label.className = 'ticketattach-filename';
				label.textContent = `${f.name} (${formatSize(f.size)})` + (problem ? ` — ${problem}` : '');
				row.appendChild(label);

				if (canEdit) {
					const del = document.createElement('button');
					del.type = 'button';
					del.className = 'ticketattach-remove';
					del.setAttribute('aria-label', `Eltávolítás: ${f.name}`);
					del.setAttribute('title', 'Eltávolítás');
					del.textContent = '×';
					del.addEventListener('click', (e) => {
						e.preventDefault();
						e.stopPropagation();
						removeFile(idx);
					});
					row.appendChild(del);
				}

				list.appendChild(row);
				if (problem) {
					hasError = true;
				}
			});

			// A fájlonkénti korlát nem véd a post_max_size ellen: az az EGÉSZ POST
			// törzsre vonatkozik. Túllépve a PHP eldobja a $_POST-ot és a $_FILES-t
			// is, azaz minden fájl elveszne - ezért itt fogjuk meg, küldés előtt.
			const overflow = postMax > 0 && selected.length > 0
				&& (total + postOverhead(selected.length)) > postMax;

			if (overflow) {
				const warn = document.createElement('div');
				warn.className = 'ticketattach-fileitem';
				const warnLabel = document.createElement('span');
				warnLabel.className = 'ticketattach-warning';
				warnLabel.textContent = `A kiválasztott fájlok együtt túl nagyok: ${formatSize(total)}`
					+ ` — a szerver egy feltöltésben legfeljebb ${formatSize(postMax)} méretet fogad`;
				warn.appendChild(warnLabel);
				list.appendChild(warn);
			}

			if (submit) {
				submit.disabled = (selected.length === 0) || hasError || overflow;
			}
		}

		function validate(f) {
			if (maxSize > 0 && f.size > maxSize) {
				return `túl nagy (max ${formatSize(maxSize)})`;
			}
			const ext = (f.name.includes('.') ? f.name.split('.').pop() : '').toLowerCase();
			if (disallowed.length && disallowed.includes(ext)) {
				return `tiltott típus (.${ext})`;
			}
			if (allowed.length && !allowed.includes(ext)) {
				return `nem engedélyezett típus (.${ext})`;
			}
			return null;
		}
	}

	function isRemoveButton(el) {
		return el && el.classList && el.classList.contains('ticketattach-remove');
	}

	function parseList(s) {
		if (!s) {
			return [];
		}
		return s.split(',')
			.map((x) => x.trim().toLowerCase().replace(/^\./, ''))
			.filter((x) => x.length);
	}

	/*
	 * A multipart törzs nagyobb a fájlok nyers összméreténél (határolók, fejlécek,
	 * rejtett mezők), ezért a post_max_size ellenőrzésnél tartunk egy ráhagyást.
	 */
	function postOverhead(count) {
		return 2048 + count * 512;
	}

	function formatSize(bytes) {
		if (bytes >= 1048576) {
			return (bytes / 1048576).toFixed(1) + ' MiB';
		}
		if (bytes >= 1024) {
			return Math.round(bytes / 1024) + ' KiB';
		}
		return bytes + ' B';
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
