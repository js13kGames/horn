"""Build a standard single-file DEFLATE ZIP with Zopfli and verify the 13KB cap."""
from pathlib import Path
import struct
import sys
import zipfile
import zlib

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'work/packer-py'))
import zopfli.zlib

data = (root / 'dist/index.html').read_bytes()
compressed = zopfli.zlib.compress(data, numiterations=30)[2:-4]
name = b'index.html'
crc = zlib.crc32(data)
date = ((2026 - 1980) << 9) | (9 << 5) | 12
local = struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, 8, 0, date, crc, len(compressed), len(data), len(name), 0) + name
central = struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, 20, 0, 8, 0, date, crc, len(compressed), len(data), len(name), 0, 0, 0, 0, 0, 0) + name
end = struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, 1, 1, len(central), len(local) + len(compressed), 0)
archive = local + compressed + central + end
assert len(archive) <= 13312, f'Over the js13k size limit: {len(archive)} bytes'
out = root / 'outputs'
out.mkdir(exist_ok=True)
(out / 'horn.zip').write_bytes(archive)
(out / 'horn.html').write_bytes(data)
with zipfile.ZipFile(out / 'horn.zip') as check:
    assert check.testzip() is None
    assert check.read('index.html') == data
print(f'Verified horn.zip: {len(archive):,} / 13,312 bytes; {13312-len(archive)} bytes free.')
