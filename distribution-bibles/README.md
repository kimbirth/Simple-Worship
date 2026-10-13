# Licensed Bible distribution files

Place `.swbible` files here only for a private installer that you are legally
allowed to distribute. The files are ignored by Git and are never included by
the normal public build.

Validate the local files:

```bash
npm run bible:validate-distribution
```

Build the optional private installer:

```bash
npm run build:win:unsigned:with-bibles
```

At first launch, SimpleWorship lists these packages and requires the operator
to import at least one. Importing copies the selected package into that Windows
user's app-data Bible library. It does not silently activate every included
translation.

Possessing a Bible database or having permission to use it locally does not by
itself grant permission to redistribute it. Keep the package out of this folder
unless the translation owner has granted the necessary redistribution rights.
