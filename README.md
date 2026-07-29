# TicketAttach

MantisBT plugin for ticket-level (bugnote-independent) file attachments.

**[English](#english) · [Magyar](#magyar)**

---

## English

### Overview

In MantisBT 1.2.x you could attach a file directly to an issue. From 2.x onward the
built-in uploader is bound to a bugnote, so every attachment ends up under a comment.

**TicketAttach** restores the old behaviour: it adds an upload box to the issue view
that stores files with `bugnote_id = 0`, meaning they appear in the top-level
**Attachments** panel of the issue instead of below a note.

Tested with MantisBT 2.28.

### Features

- Ticket-level upload — the file is attached to the issue, not to a comment.
- Drag & drop area with multi-file selection.
- Selected files can be listed **and removed one by one** before uploading
  (the `FileList` is rebuilt via `DataTransfer`).
- Client-side validation: file size and extension are checked against the
  server configuration (`allowed_files` / `disallowed_files`), the submit button
  stays disabled while any file is invalid.
- The upload box is positioned right below the *Issue Details* box by the JS.
- After a successful upload the page scrolls back to the **Attachments** section.
- Permissions follow the MantisBT built-in rules (`file_allow_bug_upload()`),
  the form is hidden on read-only issues.
- CSS/JS are served as separate files through `plugin_file.php`, so the plugin
  works under a `script-src 'self'` Content Security Policy.

### Requirements

| | |
|---|---|
| MantisBT | 2.0.0 or newer (developed against 2.28) |
| PHP | whatever your MantisBT instance requires |
| Browser | `DataTransfer` support for per-file removal (all modern browsers) |

File uploads must be enabled in MantisBT itself
(`$g_allow_file_upload = ON;` and the user must meet the `upload_bug_file_threshold`).

### Installation

1. Copy the plugin into your MantisBT plugin directory. **The folder must be named
   `TicketAttach`** — the plugin page URL is derived from it:

   ```
   <mantisbt>/plugins/TicketAttach/
   ├── TicketAttach.php
   ├── files/
   │   ├── ticketattach.css
   │   └── ticketattach.js
   └── pages/
       └── upload.php
   ```

2. Log in to MantisBT as administrator.
3. Go to **Manage → Manage Plugins**.
4. Click **Install** next to *Ticket Attach*.

### Usage

1. Open any issue (`view.php?id=…`).
2. The **Attach file to issue** box appears below the *Issue Details* box.
3. Drag files onto the dashed area, or click it to open the file picker.
4. Review the list; remove anything you don't want with the `×` button.
5. Click **Upload to issue**.
6. The page reloads and scrolls to the **Attachments** section.

The maximum size shown next to the button is
`min(upload_max_filesize, post_max_size, $g_max_file_size)` — exactly the same
limit the built-in uploader enforces.

### How it works

| File | Role |
|---|---|
| `TicketAttach.php` | Plugin class. Registers on the `EVENT_VIEW_BUG_EXTRA` hook and renders the upload form. Checks `file_allow_bug_upload()` and `bug_is_readonly()` before printing anything. |
| `pages/upload.php` | Upload handler, reachable at `plugin.php?page=TicketAttach/upload`. Validates the CSRF token, re-checks permissions, transposes the `ufile[]` array with `helper_array_transpose()` and calls `file_add()` per file. |
| `files/ticketattach.js` | Moves the box below the *Issue Details* widget, drives the drag & drop UI, validates size/extension client-side, and handles the post-upload scroll via the `ta_scroll` query parameter. |
| `files/ticketattach.css` | Styling of the dropzone, the file list and the remove buttons. |

The key detail is in `upload.php`: `file_add( $bug_id, $file, 'bug' )` is called
**without** the 9th (`bugnote_id`) argument, so it defaults to `0` and the
attachment binds to the issue itself.

### Security

- `form_security_validate()` / `form_security_purge()` — CSRF protection.
- `auth_ensure_user_authenticated()` — authenticated users only.
- `bug_ensure_exists()` — the issue must exist.
- `file_allow_bug_upload()` + `bug_is_readonly()` are re-checked server-side on
  upload, so hiding the form is not the only line of defence.
- Client-side validation is convenience only; the actual extension/size
  enforcement is done by MantisBT's `file_add()`.

### Localisation

The user-facing strings are currently Hungarian, hard-coded in
`TicketAttach.php` and `ticketattach.js`. To translate, edit those strings
directly (or wire them up to MantisBT's `lang_get()` if you need real
multi-language support).

### Metadata

| | |
|---|---|
| Name | Ticket Attach |
| Version | 1.2.1 |
| Author | Laurel Kft. |
| Requires | MantisCore 2.0.0 |

---

## Magyar

### Áttekintés

A MantisBT 1.2.x-ben egy fájlt közvetlenül a hibajegyhez lehetett csatolni.
A 2.x-től a beépített feltöltő megjegyzéshez (bugnote) kötött, így minden
csatolmány egy komment alatt köt ki.

A **TicketAttach** visszahozza a régi viselkedést: a jegy nézetébe tesz egy
feltöltő dobozt, amely `bugnote_id = 0` értékkel tárolja a fájlokat, így azok a
jegy felső **Csatolt fájlok** paneljében jelennek meg, nem egy megjegyzés alatt.

MantisBT 2.28-cal tesztelve.

### Funkciók

- Jegy-szintű feltöltés — a fájl a jegyhez kerül, nem egy kommenthez.
- Drag & drop felület, több fájl egyszerre választható.
- A kiválasztott fájlok listázhatók **és egyenként törölhetők** feltöltés előtt
  (a `FileList` `DataTransfer`-rel épül újra).
- Kliensoldali ellenőrzés: méret és kiterjesztés a szerver beállításai szerint
  (`allowed_files` / `disallowed_files`); hibás fájl esetén a küldés gomb tiltott
  marad.
- A feltöltő dobozt a JS közvetlenül a *Hibajegy részletei* doboz alá helyezi.
- Sikeres feltöltés után az oldal a **Csatolt fájlok** szekcióhoz görget.
- A jogosultságok a MantisBT beépített szabályait követik
  (`file_allow_bug_upload()`); lezárt (readonly) jegynél az űrlap nem jelenik meg.
- A CSS/JS külön fájlként, a `plugin_file.php`-n keresztül szolgálódik ki, így a
  plugin `script-src 'self'` CSP mellett is működik.

### Követelmények

| | |
|---|---|
| MantisBT | 2.0.0 vagy újabb (2.28-ra fejlesztve) |
| PHP | amit a MantisBT példány megkövetel |
| Böngésző | `DataTransfer` támogatás a fájlonkénti törléshez (minden modern böngésző) |

A fájlfeltöltésnek engedélyezettnek kell lennie magában a MantisBT-ben
(`$g_allow_file_upload = ON;`, és a felhasználónak el kell érnie az
`upload_bug_file_threshold` szintet).

### Telepítés

1. Másold a plugint a MantisBT plugin könyvtárába. **A mappa neve kötelezően
   `TicketAttach`** — a plugin oldal URL-je ebből képződik:

   ```
   <mantisbt>/plugins/TicketAttach/
   ├── TicketAttach.php
   ├── files/
   │   ├── ticketattach.css
   │   └── ticketattach.js
   └── pages/
       └── upload.php
   ```

2. Lépj be a MantisBT-be adminisztrátorként.
3. Nyisd meg a **Kezelés → Bővítmények kezelése** menüt.
4. Kattints a *Ticket Attach* melletti **Telepítés** gombra.

### Használat

1. Nyiss meg egy hibajegyet (`view.php?id=…`).
2. A *Hibajegy részletei* doboz alatt megjelenik a **Fájl csatolása a jegyhez** doboz.
3. Húzd a fájlokat a szaggatott keretű területre, vagy kattints rá a tallózáshoz.
4. Nézd át a listát; a `×` gombbal bármelyik elem eltávolítható.
5. Kattints a **Feltöltés a jegyhez** gombra.
6. Az oldal újratöltődik és a **Csatolt fájlok** szekcióhoz görget.

A gomb mellett kiírt maximális méret a
`min(upload_max_filesize, post_max_size, $g_max_file_size)` érték — pontosan az,
amit a beépített feltöltő is érvényesít.

### Működés

| Fájl | Szerep |
|---|---|
| `TicketAttach.php` | A plugin osztály. Az `EVENT_VIEW_BUG_EXTRA` hookra iratkozik fel, és kiírja a feltöltő űrlapot. Kiírás előtt ellenőrzi a `file_allow_bug_upload()` és `bug_is_readonly()` feltételeket. |
| `pages/upload.php` | A feltöltés-feldolgozó, elérhető a `plugin.php?page=TicketAttach/upload` címen. Ellenőrzi a CSRF tokent, újraellenőrzi a jogosultságot, a `ufile[]` tömböt a `helper_array_transpose()`-zal bontja fájlonkénti tömbökre, majd fájlonként hívja a `file_add()`-et. |
| `files/ticketattach.js` | A dobozt a *Hibajegy részletei* widget alá mozgatja, kezeli a drag & drop felületet, kliensoldalon ellenőrzi a méretet/kiterjesztést, és a `ta_scroll` query paraméter alapján görget feltöltés után. |
| `files/ticketattach.css` | A dropzone, a fájllista és a törlő gombok megjelenése. |

A lényegi részlet az `upload.php`-ban van: a `file_add( $bug_id, $file, 'bug' )`
hívás **nem** kapja meg a 9. (`bugnote_id`) paramétert, így az alapértelmezett `0`
marad, és a csatolmány magához a jegyhez kötődik.

### Biztonság

- `form_security_validate()` / `form_security_purge()` — CSRF védelem.
- `auth_ensure_user_authenticated()` — csak bejelentkezett felhasználók.
- `bug_ensure_exists()` — a jegynek léteznie kell.
- A `file_allow_bug_upload()` + `bug_is_readonly()` feltöltéskor szerveroldalon
  újra ellenőrződik, tehát nem csak az űrlap elrejtése véd.
- A kliensoldali ellenőrzés kényelmi funkció; a tényleges kiterjesztés- és
  méretkorlátozást a MantisBT `file_add()` függvénye végzi.

### Honosítás

A felületi szövegek jelenleg magyarul, fixen be vannak égetve a
`TicketAttach.php` és a `ticketattach.js` fájlokba. Fordításhoz ezeket a
sztringeket kell átírni (vagy a MantisBT `lang_get()` mechanizmusára kötni, ha
valódi többnyelvűség kell).

### Metaadatok

| | |
|---|---|
| Név | Ticket Attach |
| Verzió | 1.2.1 |
| Szerző | Laurel Kft. |
| Függőség | MantisCore 2.0.0 |
