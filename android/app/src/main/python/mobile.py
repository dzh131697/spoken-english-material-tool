"""Android 运行环境：复用桌面后端，替换平台相关的路径和密钥存储。"""
import os
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import certifi
import yt_dlp

import app

SERVER = None
ORIGINAL_YOUTUBE_DL = yt_dlp.YoutubeDL


def start(root_path, native_path, packages_path, bridge):
    global SERVER
    if SERVER is not None:
        return 'http://127.0.0.1:{}/?token={}'.format(SERVER.server_port, app.TOKEN)

    root = Path(root_path)
    native = Path(native_path)
    packages = Path(packages_path)
    ffmpeg = native / 'libffmpeg.so'
    quickjs = native / 'libqjs.so'
    if not ffmpeg.is_file() or not quickjs.is_file():
        raise ValueError('缺少 Android 视频处理组件')

    library_paths = [str(packages / 'ffmpeg' / 'usr' / 'lib'), str(packages / 'python' / 'usr' / 'lib'), str(native)]
    if os.environ.get('LD_LIBRARY_PATH'):
        library_paths.append(os.environ['LD_LIBRARY_PATH'])
    os.environ['LD_LIBRARY_PATH'] = ':'.join(library_paths)
    os.environ['SSL_CERT_FILE'] = certifi.where()

    app.ROOT = root
    app.ASSETS = root
    app.DATA = root / 'data'
    app.PROJECTS = app.DATA / 'projects'
    app.OUTPUT = root / '导出素材'
    app.COOKIES = root / 'cookies.txt'
    app.ffmpeg = lambda: str(ffmpeg)
    app.key_path = lambda: Path(str(bridge.keyPath()))
    app.save_key = lambda key: bridge.saveKey(key)
    app.load_key = lambda: str(bridge.loadKey())

    def font_path():
        for name in ('NotoSansCJK-Regular.ttc', 'NotoSansSC-Regular.ttf', 'NotoSansCJK-Regular.otf',
                     'NotoSansHans-Regular.otf', 'DroidSansFallback.ttf'):
            path = Path('/system/fonts') / name
            if path.is_file():
                return str(path)
        raise ValueError('手机缺少可用的中文字体')

    app.font_path = font_path
    app.subtitle_font = lambda: 'Noto Sans CJK SC'
    app.subtitle_font_dir = lambda: '/system/fonts'
    def youtube_dl(options):
        options = dict(options)
        options['js_runtimes'] = {'quickjs': {'path': str(quickjs)}}
        options['compat_opts'] = []
        return ORIGINAL_YOUTUBE_DL(options)

    yt_dlp.YoutubeDL = youtube_dl
    try:
        app.KEY = app.load_key()
        app.KEY_ERROR = ''
    except Exception:
        app.KEY = ''
        app.KEY_ERROR = '无法读取已保存的密钥，请在翻译设置中重新保存。'
    app.PROJECTS.mkdir(parents=True, exist_ok=True)
    SERVER = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
    threading.Thread(target=SERVER.serve_forever, daemon=True).start()
    return 'http://127.0.0.1:{}/?token={}'.format(SERVER.server_port, app.TOKEN)


def stop():
    global SERVER
    if SERVER is not None:
        SERVER.shutdown()
        SERVER.server_close()
        SERVER = None
