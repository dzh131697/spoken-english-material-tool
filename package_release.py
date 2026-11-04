"""从打包结果整理干净发行目录并验证换目录启动。"""
import hashlib
import json
import os
import shutil
import subprocess
import threading
import urllib.request
import urllib.parse
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent
RELEASE = ROOT / 'Windows便携版' / '口语素材工作台'
for secret in ('cookies.txt', 'deepseek.key'):
    if (RELEASE / secret).exists():
        raise RuntimeError('发行暂存目录存在 {}，请先移出该凭证再打包'.format(secret))
shutil.copytree(ROOT / 'dist' / '启动工具', RELEASE,
                ignore=shutil.ignore_patterns('data', '导出素材', 'cookies.txt', 'deepseek.key'), dirs_exist_ok=True)
process = subprocess.Popen([str(RELEASE / '启动工具.exe'), '--no-browser'],
                           cwd=RELEASE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           creationflags=0x08000000,
                           env={**os.environ, 'PATH': os.environ.get('WINDIR', 'C:/Windows') + '/System32',
                                'PYTHONPATH': '', 'LOCALAPPDATA': str(RELEASE / '__portable_check_profile__')})
timer = threading.Timer(20, process.kill)
timer.start()
try:
    while True:
        line = process.stdout.readline().decode('utf-8', errors='replace').strip()
        if not line and process.poll() is not None:
            raise RuntimeError('换目录启动失败：' + process.stderr.read().decode(errors='replace'))
        if line.startswith('http://127.0.0.1:'):
            url = line
            break
    parsed = urllib.parse.urlparse(url)
    token = urllib.parse.parse_qs(parsed.query)['token'][0]
    base = 'http://' + parsed.netloc
    req = urllib.request.Request(base + '/api/projects', headers={'X-App-Token': token})
    with urllib.request.urlopen(req, timeout=5) as response:
        result = json.load(response)
    assert result == {'projects': [], 'hasKey': False}, result
    req = urllib.request.Request(base + '/api/shutdown', data=b'{}', headers={'X-App-Token': token, 'Content-Type': 'application/json'})
    urllib.request.urlopen(req, timeout=5).close()
    assert process.wait(timeout=5) == 0
finally:
    timer.cancel()
    if process.poll() is None:
        process.kill()
archive = ROOT / '口语素材工作台_Windows便携版_v0.1.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
    for path in sorted(RELEASE.rglob('*')):
        if path.is_file():
            if any(part in ('data', '导出素材') for part in path.relative_to(RELEASE).parts):
                continue
            if path.name.lower() in ('cookies.txt', 'deepseek.key'):
                raise RuntimeError('发行暂存目录中发现凭证文件，请先移出再打包')
            output.write(path, Path('口语素材工作台') / path.relative_to(RELEASE))
with zipfile.ZipFile(archive) as output:
    assert output.testzip() is None
digest = hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest()
(ROOT / 'SHA256.txt').write_text(digest + '  ' + archive.name + '\n', encoding='utf-8')
print(json.dumps({'portable_check': 'PASS (PATH 无 Python/Node/FFmpeg)', 'archive': str(archive),
                  'size_mb': round(archive.stat().st_size / 1024 / 1024, 1), 'sha256': digest}, ensure_ascii=False))
