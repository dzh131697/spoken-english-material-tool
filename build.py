"""在已安装依赖的 Windows Python 上打包便携目录。"""
import json
import importlib.metadata
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
BASE = ROOT.parent
DEPS = BASE / '.build-deps'
sys.path.insert(0, str(DEPS))
os.environ['PYTHONPATH'] = str(DEPS)

import PyInstaller.__main__

PyInstaller.__main__.run([
    str(ROOT / 'app.py'), '--name', '启动工具', '--noconfirm', '--clean', '--onedir',
    '--distpath', str(ROOT / 'dist'), '--workpath', str(ROOT / 'build'),
    '--specpath', str(ROOT / 'build'), '--add-data', str(ROOT / 'web') + ';web',
    '--collect-all', 'yt_dlp', '--collect-all', 'yt_dlp_ejs', '--hidden-import', 'PIL.ImageFont',
])
bundle = ROOT / 'dist' / '启动工具'
tools = bundle / 'tools'
tools.mkdir(exist_ok=True)
ffmpeg = next((DEPS / 'imageio_ffmpeg' / 'binaries').glob('ffmpeg*.exe'))
shutil.copy2(ffmpeg, tools / 'ffmpeg.exe')
node_binary = ROOT / 'tools' / 'node.exe'
if not node_binary.exists():
    node_binary = Path(shutil.which('node'))
shutil.copy2(node_binary, tools / 'node.exe')
shutil.copy2(ROOT / '使用说明.md', bundle / '使用说明.md')
licenses = bundle / '第三方许可'
licenses.mkdir(exist_ok=True)
for directory in DEPS.glob('*.dist-info'):
    if directory.name.startswith(('yt_dlp-', 'yt_dlp_ejs-', 'imageio_ffmpeg-')):
        for path in directory.rglob('*'):
            if path.is_file() and ('license' in path.name.lower() or path.name == 'METADATA'):
                shutil.copy2(path, licenses / (directory.name + '_' + path.name))
for name, path in [('Node', node_binary.parent / 'LICENSE')]:
    if path.exists():
        shutil.copy2(path, licenses / (name + '_LICENSE.txt'))
for component in ('pillow', 'pyinstaller'):
    dist = importlib.metadata.distribution(component)
    for file in dist.files or []:
        if any(x in file.name.lower() for x in ('license', 'copying')) and file.suffix.lower() in ('.txt', '.md', ''):
            origin = dist.locate_file(file)
            if origin.is_file():
                shutil.copy2(origin, licenses / (component + '_' + file.name))
python_license = Path(sys.base_prefix) / 'LICENSE.txt'
if python_license.exists():
    shutil.copy2(python_license, licenses / 'Python_LICENSE.txt')
for flag, name in [('-L', 'FFmpeg_LICENSE.txt'), ('-buildconf', 'FFmpeg_BUILD.txt')]:
    result = subprocess.run([str(tools / 'ffmpeg.exe'), flag], capture_output=True)
    (licenses / name).write_bytes(result.stdout + result.stderr)
shutil.copy2(ROOT / '第三方说明.md', licenses / '第三方说明.md')
manifest = {'python': sys.version, 'yt_dlp': __import__('yt_dlp.version', fromlist=['__version__']).__version__,
            'node': subprocess.check_output([str(tools / 'node.exe'), '--version'], text=True).strip(),
            'ffmpeg': subprocess.check_output([str(tools / 'ffmpeg.exe'), '-version'], text=True).splitlines()[0]}
(bundle / '版本信息.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print('便携目录：', bundle)
