# Bible packages

SimpleWorship uses `.swbible` packages at runtime. The current app does not open
or bundle `bible.db`. A `.db` file is accepted only by the maintainer converter
described below.

## Convert a compatible database on Windows

The easiest method is to drag `bible.db` onto `CONVERT-BIBLE.bat` in the project
root. The converter validates the database, reads the name from
`verses.version`, and creates the package beside the input file. For example,
an RTPV05 database becomes `RTPV05.swbible`. The original `.db` is unchanged.

You can also double-click `CONVERT-BIBLE.bat` and paste the input path, or run:

```powershell
Set-Location "C:\Users\KB\Desktop\My Apps\SimpleWorship-v1.0.1-source\SimpleWorship\github-ready\SimpleWorship"
npm ci
npm run bible:convert -- "C:\Bibles\bible.db" "C:\Bibles\RTPV05.swbible"
```

For a database containing exactly one version, omit the output path:

```powershell
npm run bible:convert -- "C:\Bibles\bible.db"
```

The converter will not overwrite an existing package. Choose another output
name, or intentionally replace it with:

```powershell
npm run bible:convert -- "C:\Bibles\bible.db" "C:\Bibles\RTPV05.swbible" --force
```

Close any program using the database first. Conversion is refused while a
non-empty `.db-wal` or `.db-journal` file exists.

## Compatible input schema

This converter packages the SQLite schema already used by SimpleWorship; it is
not a general converter for arbitrary Bible database formats. The input needs
these columns (extra columns are allowed):

```text
books:  id, book_order, code, name, chapters
verses: id, version, book_id, chapter, verse, text, display_verse
```

The converter checks SQLite integrity, IDs and references, duplicate records,
non-empty text and version values, chapter ranges, and a 512 MB size limit. It
then marks and re-validates the new package as SimpleWorship Bible format 1.

## Import into SimpleWorship

1. Start the current app with `RUN-SIMPLEWORSHIP.bat`.
2. On a new installation, choose **Choose .swbible file...** in the required
   first-run dialog.
3. Select the newly created package.
4. To add another translation later, open the Bible tab and choose
   **Install .swbible package**.
5. When two or more translations are installed, use the version selector in
   the Bible tab. The selected version is remembered.

Each imported package is copied into the current Windows user's SimpleWorship
app-data folder. Removing or moving the original package afterward does not
remove the installed copy.

## Include packages in a private installer

Only do this when you have permission to redistribute the translation.

1. Put each authorized `.swbible` file in `distribution-bibles`.
2. Run `npm run bible:validate-distribution`.
3. Run `npm run build:win:unsigned:with-bibles` for a local test installer, or
   `npm run build:win:with-bibles` with your own signing certificate.

The public GitHub/SignPath build intentionally contains no Bible text. Database
and `.swbible` files are ignored by Git so copyrighted translations cannot be
committed accidentally. Permission to use a translation does not automatically
grant permission to redistribute it.

## If you still see `bible.db`

You are running or packaging an older source snapshot or an older installed
build. Use the Git repository at `github-ready\SimpleWorship`, rebuild, and
install that result. The old `v1.2.6-work` snapshot should not be used.
