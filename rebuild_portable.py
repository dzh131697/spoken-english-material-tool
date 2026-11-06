"""一键重建 Windows 便携版，并安全覆盖到日常使用的便携目录。

用法：
    python rebuild_portable.py                # 重建 + 隔离自检 + 覆盖使用目录
    python rebuild_portable.py --skip-verify # 跳过换目录启动自检（较快）
    python rebuild_portable.py --only-copy   # 不重新打包，只把 dist 的现有结果覆盖到使用目录

只覆盖程序文件，绝不删除或清空 data/、导出素材/、cookies.txt 等用户数据。
"""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).parent
DEPS = Path(os.environ.get('SPOKEN_TOOL_BUILD_DEPS', ROOT.parent / '.build-deps'))
BUNDLE = ROOT / 'dist' / '启动工具'
PORTABLE = ROOT.parent / '口语素材工作台_便携版'
RELEASE = ROOT / 'Windows便携版' / '口语素材工作台'
PROGRAM_FILES = ('启动工具.exe', '版本信息.json', '使用说明.md')
PROGRAM_DIRS = ('_internal', 'tools', '第三方许可')
USER_DATA = ('data', '导出素材', 'cookies.txt')


def fail(message):
    print('\n[失败] ' + message)
    sys.exit(1)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def portable_running():
    """检测便携版 exe 是否仍在运行，运行中覆盖会失败或留下半新半旧的程序。"""
    try:
        out = subprocess.run(['tasklist', '/FO', 'CSV', '/NH'], capture_output=True,
                             timeout=15).stdout.decode('gbk', errors='replace')
        return '启动工具.exe' in out
    except Exception:
        return False


def run(script, env):
    print('\n>>> ' + script)
    subprocess.run([sys.executable, str(ROOT / script)], cwd=ROOT, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description='重建并更新 Windows 便携版')
    parser.add_argument('--skip-verify', action='store_true', help='跳过换目录启动自检')
    parser.add_argument('--only-copy', action='store_true', help='不打包，只覆盖 dist 的现有结果')
    args = parser.parse_args()

    print('源码目录：', ROOT)
    print('使用目录：', PORTABLE)

    if not PORTABLE.is_dir():
        fail('找不到日常使用的便携目录：' + str(PORTABLE))
    if portable_running():
        fail('启动工具.exe 正在运行。请先关闭程序（含托盘/后台进程）再重建。')

    env = {**os.environ, 'PYTHONPATH': str(DEPS)}
    started = time.time()

    if args.only_copy:
        print('\n[1/4] 按参数跳过打包，直接使用 dist/启动工具 的现有结果。')
        print('[2/4] 按参数跳过换目录启动自检。')
    else:
        if sys.version_info < (3, 14):
            fail('打包依赖按 Python 3.14 编译，请用 Python 3.14 运行本脚本（当前 %s）。'
                 % sys.version.split()[0])
        for path in (DEPS, ROOT / 'build.py', ROOT / 'package_release.py'):
            if not path.exists():
                fail('缺少构建环境：' + str(path))

        # 1. 重新打包，产出 dist/启动工具
        print('\n[1/4] 重新打包程序（PyInstaller，可能需要几分钟）…')
        try:
            run('build.py', env)
        except subprocess.CalledProcessError:
            fail('build.py 打包失败，未改动使用目录。请查看上方 PyInstaller 输出。')

        # 2. 在隔离的发行暂存目录做换目录启动自检，不碰真实素材
        if args.skip_verify:
            print('\n[2/4] 已按参数跳过换目录启动自检。')
        else:
            print('\n[2/4] 换目录启动自检（隔离目录，不读取真实素材）…')
            for secret in ('cookies.txt', 'deepseek.key'):
                if (RELEASE / secret).exists():
                    fail('发行暂存目录存在 %s，请先移出凭证再自检：%s' % (secret, RELEASE))
            try:
                run('package_release.py', env)
            except subprocess.CalledProcessError:
                fail('换目录启动自检失败，未改动使用目录。可用 --skip-verify 跳过自检后重试。')

    if not (BUNDLE / '启动工具.exe').is_file():
        fail('没有找到打包结果 ' + str(BUNDLE / '启动工具.exe'))

    # 3. 只覆盖程序文件，用户数据一律不碰
    print('\n[3/4] 覆盖程序文件到使用目录…')
    if portable_running():
        fail('检测到启动工具.exe 又在运行，已停止覆盖，未改动使用目录。')
    try:
        for name in PROGRAM_FILES:
            src = BUNDLE / name
            if src.is_file():
                shutil.copy2(src, PORTABLE / name)
                print('  文件', name)
        for name in PROGRAM_DIRS:
            src = BUNDLE / name
            if src.is_dir():
                shutil.copytree(src, PORTABLE / name, dirs_exist_ok=True)
                print('  目录', name)
    except OSError as error:
        fail('复制失败，程序可能处于半更新状态：%s\n请重新运行本脚本完成覆盖。' % error)

    # 4. 校验程序文件确实来自本次构建，且用户数据仍在
    print('\n[4/4] 校验结果…')
    for name in PROGRAM_FILES:
        src, dst = BUNDLE / name, PORTABLE / name
        if src.is_file() and (not dst.is_file() or digest(src) != digest(dst)):
            fail('%s 与本次打包结果不一致，请重新运行本脚本。' % name)
    for src in (ROOT / 'web').iterdir():
        if src.is_file():
            dst = PORTABLE / '_internal' / 'web' / src.name
            if not dst.is_file() or digest(src) != digest(dst):
                fail('网页资源 %s 未更新成功，请重新运行本脚本。' % src.name)
    kept = [name for name in USER_DATA if (PORTABLE / name).exists()]
    print('  程序文件与网页资源：与本次打包一致')
    print('  已保留用户数据：', '、'.join(kept) if kept else '（当前目录没有这些数据）')
    print('\n[完成] 用时 %.1f 分钟。双击「启动工具.exe」即可使用新版本。'
          % ((time.time() - started) / 60))


if __name__ == '__main__':
    main()
