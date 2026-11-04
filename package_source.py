"""仅按白名单打包源码与交接文档，不包含视频、密钥或运行环境。"""
import ast
import hashlib
import json
import zipfile
from pathlib import Path

root = Path(__file__).parent
names = [
    'app.py', 'build.py', 'package_release.py', 'package_source.py', 'test_app.py',
    'test_browser.cjs', 'web/index.html', 'requirements-dev.txt', 'package.json',
    'setup-dev.ps1', '.gitignore', 'AGENTS.md', 'README.md', '使用说明.md',
    '开发说明.md', '第三方说明.md', '交接说明.md', '接手提示词.md', '提示词/翻译提示词.md',
]
manifest = []
for name in names:
    path = root / name
    text = path.read_text(encoding='utf-8')
    if path.suffix == '.py':
        ast.parse(text, filename=name)
    elif path.suffix == '.json':
        json.loads(text)
    manifest.append({'file': name, 'bytes': path.stat().st_size,
                     'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
# 验证提示词副本与实际运行文本一致。
tree = ast.parse((root / 'app.py').read_text(encoding='utf-8'))
prompts = [n.value for n in ast.walk(tree) if isinstance(n, ast.Constant)
           and isinstance(n.value, str) and n.value.startswith('你是英语口语练习的中文编辑。')]
assert len(prompts) == 1 and prompts[0] in (root / '提示词/翻译提示词.md').read_text(encoding='utf-8')
archive = root / '口语素材工作台_源码与Agent交接_v0.1.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
    for name in names:
        output.write(root / name, '口语素材工具/' + name)
    output.writestr('口语素材工具/源码清单.json', json.dumps(manifest, ensure_ascii=False, indent=2))
with zipfile.ZipFile(archive) as output:
    assert output.testzip() is None
    assert len(output.namelist()) == len(names) + 1
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(root / '源码包_SHA256.txt').write_text(digest + '  ' + archive.name + '\n', encoding='utf-8')
print(json.dumps({'files': len(names) + 1, 'size_kb': round(archive.stat().st_size / 1024, 1),
                  'sha256': digest, 'archive': str(archive)}, ensure_ascii=False))
