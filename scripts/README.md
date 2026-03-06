# Scripts

## `mdb2sqlite.py`

This tool converts a CSV exported from a Microsoft Access Database (`.mdb`) into a SQLite database and extracts embedded OLE image covers under a `covers/` directory.

### Extracting the CSV from MDB

To prepare the data for this script, you must first extract the relevant table (`discos`) into a CSV file. Use `mdb-export` with the `-b hex` parameter so that the binary OLE fields (for images) are correctly dumped as hexadecimal strings:

```bash
mdb-export <mdb> discos -b hex > <CSV FILE>
```

### Usage

Convert the created CSV into your output directory using:

```bash
python scripts/mdb2sqlite.py <CSV FILE> <SQLITE FILE>
```

- This processes the CSV and unpacks OLE DIB Image blobs.
- It will automatically create a `covers/` directory in the same directory as the target `SQLITE` file.
- Cover images are saved as JPEG files into nested folders based on sanitized versions of their titles.

### Source Schema

The expected schema inside the constructed `discos` CSV includes the following fields:

| Field Name   | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| `GRUPO`      | The artist or group name.                                          |
| `TITULO`     | The title of the release.                                          |
| `FORMATO`    | The physical or digital format.                                    |
| `ANIO`       | The year of release.                                               |
| `ESTILO`     | The style or genre.                                                |
| `PAIS`       | Country of origin or release.                                      |
| `CANCIONES`  | Songs/Tracklist details.                                           |
| `CREDITOS`   | Credits associated with the release.                               |
| `OBSERV`     | Observations or miscellaneous notes.                               |
| `Portada CD` | Hex-encoded binary OLE DIB image data containing the CD cover art. |
| `Portada LP` | Hex-encoded binary OLE DIB image data containing the LP cover art. |
