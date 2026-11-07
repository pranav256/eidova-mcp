"""Recover only shipped shared source contents into a fixed vendor directory."""
import hashlib
import json
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'vendor/upstream/src'
PREFIX = '../../shared/src/'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_map', type=Path, help='Published better-design@0.49.1 dist/index.js.map')
    parser.add_argument('license', type=Path, help='MIT license for that package')
    args = parser.parse_args()
    map_path = args.source_map.resolve()
    if 'MIT License' not in args.license.read_text(encoding='utf-8'):
        raise ValueError('Expected the upstream MIT license')
    if hashlib.sha256(map_path.read_bytes()).hexdigest() != '0ed332448cb3f1d9744153b041e88b30255de43523402cb7b5df7f922a77a333':
        raise ValueError('Source map does not match the recorded better-design@0.49.1 artifact')
    source_map = json.loads(map_path.read_text(encoding='utf-8'))
    records = []
    for name, content in zip(source_map['sources'], source_map['sourcesContent'], strict=True):
        if not name.startswith(PREFIX) or content is None:
            continue
        relative = Path(name[len(PREFIX):])
        target = (DEST / relative).resolve()
        if not target.is_relative_to(DEST.resolve()):
            raise ValueError(f'Unsafe source path: {name}')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
        records.append({'source': name, 'path': str(target.relative_to(ROOT)).replace('\\', '/'), 'sha256': hashlib.sha256(content.encode()).hexdigest()})
    (DEST.parent / 'provenance.json').write_text(json.dumps({
        'package': 'better-design@0.49.1',
        'sourceMapSha256': hashlib.sha256(map_path.read_bytes()).hexdigest(),
        'license': 'MIT',
        'files': records,
    }, indent=2), encoding='utf-8')
    (DEST.parent / 'LICENSE').write_bytes(args.license.read_bytes())
    print(json.dumps({'recovered': len(records), 'destination': str(DEST)}))


if __name__ == '__main__':
    main()
