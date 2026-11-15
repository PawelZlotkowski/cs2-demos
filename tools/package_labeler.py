"""Create a shareable source ZIP containing only label-tool code and instructions."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]


def main():
    output = ROOT / '.local' / 'releases' / 'round-labeler.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    files = [ROOT / p for p in (
        'compose.labeler.yaml', 'start-labeler.ps1', 'docker/Dockerfile.labeler',
        'docker/Dockerfile.labeler.dockerignore', 'docker/requirements-labeler.lock',
        'eval/__init__.py', 'eval/label_tool.py', 'eval/tests/test_annotation.py',
        'eval/tests/test_annotation_media.py', 'tools/record_label_clips.py',
        'eval/tests/test_annotation_batches.py',
        'eval/tests/test_annotation_voice.py',
        'tools/test_label_replay.cjs', 'tools/test_record_label_clips.py',
        'tools/test_label_voice.cjs', 'tools/test_label_batches.cjs',
        'docs/LABEL-TOOL.md', 'docs/planning/ROUND-LABELLING-GUIDE.md',
        'docs/planning/LOCAL-LABELLING-TOOL-PLAN.md', 'docs/planning/FINAL-DELIVERY-PLAN.md',
    )]
    source = ROOT / 'apps' / 'api' / 'app'
    files.extend(p for p in source.rglob('*') if p.is_file() and '__pycache__' not in p.parts
                 and p.suffix in ('.py', '.json', '.md', '.html', '.js', '.css', '.png'))
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for file in sorted(set(files)):
            archive.write(file, file.relative_to(ROOT).as_posix())
        archive.writestr('README.md', (ROOT / 'docs' / 'LABEL-TOOL.md').read_text('utf-8'))
    print(output)
    print(f'{len(set(files)) + 1} files; no demos, labels, databases, .env files or installed dependencies.')


if __name__ == '__main__':
    main()
