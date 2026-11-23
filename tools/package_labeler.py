"""Package the labeller, optionally with prebuilt app and PostgreSQL images."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]


def source_files():
    files = [ROOT / p for p in (
        'compose.labeler.yaml', 'start-labeler.ps1', 'labeler.ps1', 'labeler.sh',
        'Open labeller.cmd', 'labeler.env.example', 'docker/Dockerfile.labeler',
        'docker/Dockerfile.labeler.dockerignore', 'docker/requirements-labeler.lock',
        'docker/requirements-labeler-core.lock', 'tools/package_labeler.py', 'tools/check_labeler.py',
        'eval/__init__.py', 'eval/label_tool.py', 'eval/tests/test_annotation.py',
        'eval/tests/test_annotation_media.py', 'tools/record_label_clips.py',
        'eval/tests/test_annotation_batches.py', 'eval/tests/test_annotation_transfer.py',
        'eval/tests/test_annotation_voice.py',
        'eval/tests/test_clip_export.py', 'eval/tests/test_cloud_notes.py',
        'eval/tests/test_grouped_clips.py',
        'eval/tests/test_clip_review_quality.py', 'eval/tests/test_annotation_cache.py',
        'eval/tests/test_snapshot_refresh.py',
        'eval/tests/fixtures/labeller/clips-manifest.json',
        'eval/tests/fixtures/labeller/cloud-notes-1-initial.json',
        'eval/tests/fixtures/labeller/cloud-notes-2-later-revision.json',
        'eval/tests/fixtures/labeller/cloud-notes-3-withdrawn.json',
        'eval/tests/fixtures/labeller/cloud-notes-grouped.json',
        'docs/LABELLER-CLOUD.md',
        'tools/test_label_replay.cjs', 'tools/test_record_label_clips.py',
        'tools/test_label_voice.cjs', 'tools/test_label_batches.cjs',
        'tools/test_label_navigation.cjs', 'tools/test_labeler_launcher.ps1', 'tools/test_labeler_launcher.sh',
        'docs/LABELER-SETUP.md', 'docs/LABELER-FRIEND-INSTRUCTIONS.txt',
        'docs/LABEL-TOOL.md', 'docs/planning/ROUND-LABELLING-GUIDE.md',
        'docs/coach/LABELLER-HANDOFF-2026-11-20.md',
        'docs/planning/LOCAL-LABELLING-TOOL-PLAN.md', 'docs/planning/FINAL-DELIVERY-PLAN.md',
    )]
    source = ROOT / 'apps' / 'api' / 'app'
    files.extend(p for p in source.rglob('*') if p.is_file() and '__pycache__' not in p.parts
                 and p.suffix in ('.py', '.json', '.md', '.html', '.js', '.css', '.png'))
    for name in ('builders', 'synthetic_demo', 'test_local_policy', 'test_untraded_death',
                 'test_shot_while_moving', 'test_good_plays', 'test_stats_and_ranker',
                 'test_unused_utility', 'test_team_flash', 'test_opening_duel', 'test_extract'):
        files.append(ROOT / f'apps/api/tests/analysis/{name}.py')
    return sorted(set(files))


def package(output, image=None, target='runtime'):
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    files = source_files()
    partial = output.with_name(output.name + '.partial')
    try:
        with tempfile.TemporaryDirectory(prefix='labeler-package-', dir=output.parent) as directory:
            image_archive = Path(directory) / 'labeler-image.tar'
            release = None
            if image:
                images = [image, 'postgres:17']
                info = json.loads(subprocess.check_output(['docker', 'image', 'inspect', *images], text=True))
                if info[0]['Os'] != 'linux' or info[0]['Architecture'] != 'amd64':
                    raise ValueError('Package a linux/amd64 labeller image.')
                subprocess.run(['docker', 'image', 'save', '--output', str(image_archive), *images], check=True)
                with image_archive.open('rb') as stream:
                    checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
                release = {
                    'format': 'round-reviewer-kit-v1',
                    'createdAt': datetime.now(timezone.utc).isoformat(),
                    'image': image, 'imageId': info[0]['Id'], 'buildTarget': target,
                    'imageArchiveSha256': checksum,
                    'postgresImage': 'postgres:17', 'postgresImageId': info[1]['Id'],
                }
            with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=1, allowZip64=True) as archive:
                manifest = {'format': 'round-reviewer-source-v1', 'files': {}}
                for file in files:
                    archive.write(file, file.relative_to(ROOT).as_posix())
                    manifest['files'][file.relative_to(ROOT).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
                archive.writestr('source-manifest.json', json.dumps(manifest, indent=2)+'\n')
                readme = (ROOT / 'docs' / 'LABELER-SETUP.md').read_text('utf-8')
                archive.writestr('README.md', readme.replace('(LABEL-TOOL.md', '(docs/LABEL-TOOL.md').replace('(LABELLER-CLOUD.md', '(docs/LABELLER-CLOUD.md'))
                archive.write(ROOT / 'docs/LABELER-FRIEND-INSTRUCTIONS.txt', 'START-HERE.txt')
                if release:
                    archive.write(image_archive, image_archive.name)
                    archive.writestr('release.json', json.dumps(release, indent=2) + '\n')
                    configuration = (ROOT / 'labeler.env.example').read_text('utf-8')
                    configuration = configuration.replace('LABELER_IMAGE=round-labeler-labeler', f'LABELER_IMAGE={image}')
                    configuration = configuration.replace('LABELER_BUILD_TARGET=runtime', f'LABELER_BUILD_TARGET={target}')
                    archive.writestr('labeler.env', configuration)
            partial.replace(output)
    finally:
        partial.unlink(missing_ok=True)
    print(output)
    print(f'{output.stat().st_size:,} bytes. Application kit with blank database credentials.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.local/releases/round-labeler.zip')
    parser.add_argument('--image', help='Include this existing Docker image and postgres:17 for offline installation.')
    parser.add_argument('--target', choices=['runtime', 'core'], default='runtime', help='Build target matching --image.')
    parser.add_argument('--check-git', action='store_true', help='Fail if a required source-kit file is missing from Git. Does not stage or commit.')
    args = parser.parse_args()
    if args.check_git:
        tracked = set(subprocess.check_output(['git','ls-files','-z'], cwd=ROOT).decode().split('\0'))
        missing = [p.relative_to(ROOT).as_posix() for p in source_files() if p.relative_to(ROOT).as_posix() not in tracked]
        if missing:
            raise SystemExit('Required source-kit files are not tracked by Git:\n' + '\n'.join(missing))
        print('Every required source-kit file is tracked by Git. Review and commit pending changes before pushing.')
        return
    package(args.output, args.image, args.target)


if __name__ == '__main__':
    main()
