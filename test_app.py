import importlib.util
import json
import math
import re
import subprocess
import sys
import tempfile
import threading
import types
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

import app
from PIL import Image


class WorkflowTest(unittest.TestCase):
    def test_srt_vtt_and_invalid_boundaries(self):
        rows = app.parse_subtitles('WEBVTT\n\n00:01.000 --> 00:02.500 align:start\n<c>Hello &amp; goodbye.</c>\n\n00:02.500 --> 00:03.000\nHello &amp; goodbye.\n')
        self.assertEqual(rows, [{'start': 1, 'end': 3, 'text': 'Hello & goodbye.'}])
        rows = app.parse_subtitles('\ufeff1\r\n00:00:01,250 --> 00:00:03,600\r\nHow are you?\r\n')
        self.assertEqual(rows[0]['start'], 1.25)
        for start, end in [(0, 0), (-1, 2), (0, float('nan')), (0, float('inf')), (0, 601)]:
            with self.assertRaises(ValueError):
                app.validate_clip({'start': start, 'end': end})
        with self.assertRaises(ValueError):
            app.project_dir('../escape')

    def test_translation_payload_does_not_send_video(self):
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def read(self):
                return json.dumps({'choices': [{'message': {'content': '你周末过得怎么样？'}}],
                                   'usage': {'total_tokens': 100}}).encode()
        with patch('app.urllib.request.urlopen', return_value=Response()) as request:
            result = app.translate('How was your weekend?', 'test-key')
            self.assertEqual(result['chinese'], '你周末过得怎么样？')
            payload = json.loads(request.call_args[0][0].data)
            self.assertEqual(payload['messages'][1]['content'], 'How was your weekend?')
            self.assertEqual(payload['model'], 'deepseek-chat')
        with self.assertRaises(ValueError):
            app.translate('Hello', '')

    def test_real_video_and_card_export(self):
        with tempfile.TemporaryDirectory(prefix='口语测试_') as directory:
            root = Path(directory)
            with patch.object(app, 'ROOT', root), patch.object(app, 'PROJECTS', root / 'projects'), patch.object(app, 'OUTPUT', root / 'output'):
                (root / 'tools').mkdir()
                source_ffmpeg = next((Path(__file__).parent.parent / '.build-deps/imageio_ffmpeg/binaries').glob('ffmpeg*.exe'))
                # 使用已打包工具路径，避免拷贝大文件。
                with patch.object(app, 'ffmpeg', return_value=str(source_ffmpeg)):
                    pid = '0123456789abcdef'
                    folder = app.project_dir(pid)
                    folder.mkdir(parents=True)
                    app.run_ffmpeg(['-f', 'lavfi', '-i', 'color=c=navy:s=640x360:r=25:d=5',
                                    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5',
                                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', str(folder / 'source.mp4')])
                    app.save_project({'id': pid, 'title': '测试素材', 'url': '', 'video': 'source.mp4', 'subtitles': [], 'clips': []})
                    result = app.export_clips(pid, [{'start': 1.2, 'end': 3.6, 'english': 'How was your weekend?',
                                                    'chinese': '你周末过得怎么样？'}], False, lambda message: None)
                    output = Path(result['folder'])
                    with Image.open(output / '001_中文题卡.png') as image:
                        self.assertEqual(image.size, (1920, 1080))
                        self.assertGreater(len(image.getcolors(100000) or []), 20)
                    app.make_card('我本来想提这件事，但觉得当时不是时候。', output / 'portrait.png', True)
                    with Image.open(output / 'portrait.png') as image:
                        self.assertEqual(image.size, (1080, 1920))
                    probe = subprocess.run([str(source_ffmpeg), '-i', str(output / '001_原视频.mp4'), '-f', 'null', '-'], capture_output=True)
                    self.assertEqual(probe.returncode, 0)
                    self.assertIn(b'Duration: 00:00:02.40', probe.stderr)
                    self.assertIn('How was your weekend?', (output / '001_中英文本.txt').read_text(encoding='utf-8-sig'))

    def test_cookie_file_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            cookie_path = Path(directory) / 'cookies.txt'
            with patch.object(app, 'COOKIES', cookie_path):
                self.assertFalse(app.cookies_status()['enabled'])
                sample = ('# Netscape HTTP Cookie File\n'
                          '.youtube.com\tTRUE\t/\tTRUE\t1893456000\tSID\tabc\n'
                          '.youtube.com\tTRUE\t/\tFALSE\t1893456000\tPREF\tzh-CN\n')
                status = app.save_cookies(sample.encode('utf-8'))
                self.assertEqual(status['cookies'], 2)
                self.assertTrue(status['logged_in'])
                self.assertTrue(cookie_path.exists())
                self.assertTrue(app.cookies_status()['enabled'])
                with self.assertRaises(ValueError):
                    app.save_cookies(b'not a cookie file')
                with self.assertRaises(ValueError):
                    app.save_cookies(b'.example.com\tTRUE\t/\tFALSE\t1893456000\tA\t1\n')
                cookie_path.unlink()
                self.assertFalse(app.cookies_status()['enabled'])

    def test_download_passes_cookie_file_only_when_present(self):
        captured = {}
        state = {'error': '网络错误'}

        class FakeYDL:
            def __init__(self, options):
                captured.clear()
                captured.update(options)

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def extract_info(self, url, download=True):
                raise RuntimeError(state['error'])

        fake = types.SimpleNamespace(YoutubeDL=FakeYDL,
                                     utils=types.SimpleNamespace(DownloadError=RuntimeError))
        bot_check = "ERROR: [youtube] abc: Sign in to confirm you're not a bot."
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cookie_path = root / 'cookies.txt'
            with patch.object(app, 'COOKIES', cookie_path), patch.object(app, 'PROJECTS', root / 'projects'), \
                    patch.dict(sys.modules, {'yt_dlp': fake}):
                state['error'] = bot_check
                with self.assertRaises(ValueError) as error:
                    app.download_video('https://www.youtube.com/watch?v=abc', lambda message: None)
                self.assertNotIn('cookiefile', captured)
                self.assertIn('Cookie 设置', str(error.exception))
                cookie_path.write_text('.youtube.com\tTRUE\t/\tTRUE\t1893456000\tSID\tabc\n', encoding='utf-8')
                with self.assertRaises(ValueError) as error:
                    app.download_video('https://www.youtube.com/watch?v=abc', lambda message: None)
                self.assertEqual(captured['cookiefile'], str(cookie_path))
                self.assertIn('已过期', str(error.exception))

    def test_youtube_rolling_captions_become_sentences(self):
        # YouTube 自动字幕：每个 cue 上行是残留、下行是正在累积的当前行，并带逐词时间戳。
        sample = ('WEBVTT\n\n'
                  '00:00:00.216 --> 00:00:01.480 align:start position:0%\n \n'
                  'Hello <00:00:00.621><c>everyone </c><00:00:01.026><c>and</c>\n\n'
                  '00:00:01.480 --> 00:00:01.512 align:start position:0%\n'
                  'Hello everyone and\n \n\n'
                  '00:00:01.512 --> 00:00:02.744 align:start position:0%\n'
                  'Hello everyone and\n'
                  'welcome <00:00:01.911><c>to </c><00:00:02.310><c>my </c><00:00:02.709><c>channel.</c>\n\n'
                  '00:00:02.744 --> 00:00:04.039 align:start position:0%\n'
                  'welcome to my channel.\n \n\n'
                  '00:00:04.039 --> 00:00:04.935 align:start position:0%\n \n'
                  'Today <00:00:04.252><c>I </c><00:00:04.465><c>want </c><00:00:04.678><c>to</c>\n')
        rows = app.parse_subtitles(sample)
        self.assertEqual(rows[0]['text'], 'Hello everyone and welcome to my channel.')
        self.assertAlmostEqual(rows[0]['start'], 0.216, places=3)
        self.assertLess(rows[0]['end'], 4.04)
        self.assertEqual(len(rows), 2)
        self.assertNotIn('Hello everyone and welcome', rows[1]['text'])

    def test_compose_video_with_cards(self):
        with tempfile.TemporaryDirectory(prefix='合成测试_') as directory:
            root = Path(directory)
            with patch.object(app, 'ROOT', root), patch.object(app, 'PROJECTS', root / 'projects'), \
                    patch.object(app, 'OUTPUT', root / 'output'):
                (root / 'tools').mkdir()
                source_ffmpeg = next((Path(__file__).parent.parent / '.build-deps/imageio_ffmpeg/binaries').glob('ffmpeg*.exe'))
                with patch.object(app, 'ffmpeg', return_value=str(source_ffmpeg)):
                    pid = '0123456789abcdef'
                    folder = app.project_dir(pid)
                    folder.mkdir(parents=True)
                    app.run_ffmpeg(['-f', 'lavfi', '-i', 'color=c=navy:s=640x360:r=25:d=6',
                                    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
                                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', str(folder / 'source.mp4')])
                    app.save_project({'id': pid, 'title': '测试素材', 'url': '', 'video': 'source.mp4',
                                      'subtitles': [], 'clips': []})
                    clips = [{'start': 0.5, 'end': 1.5, 'english': 'How was your weekend?', 'chinese': '你周末过得怎么样？'},
                             {'start': 3.0, 'end': 4.5, 'english': 'I had a great time.', 'chinese': '我过得很开心。'}]
                    result = app.compose_video(pid, clips, False, 1, lambda message: None)
                    output = Path(result['file'])
                    self.assertTrue(output.exists())
                    self.assertEqual(output.name, '成片_横版.mp4')
                    probe = subprocess.run([str(source_ffmpeg), '-i', str(output), '-f', 'null', '-'],
                                           capture_output=True, text=True)
                    self.assertIn('1920x1080', probe.stderr)
                    # 两张题卡各 1 秒 + 1.0 秒 + 1.5 秒 = 4.5 秒
                    duration = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe.stderr)
                    seconds = int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3])
                    self.assertAlmostEqual(seconds, 4.5, delta=0.4)
                    self.assertIn('Audio:', probe.stderr)

    def test_subtitle_track_prefers_manual_then_original(self):
        rolling = 'WEBVTT\nLanguage: en\n\n00:00:00.000 --> 00:00:01.000\nHello <00:00:00.500><c>everyone</c>\n'
        manual = 'WEBVTT\nLanguage: en\n\n00:00:00.000 --> 00:00:01.000\nHello everyone.\n'
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / 'source.en.vtt').write_text(rolling, encoding='utf-8')
            (folder / 'source.en-orig.vtt').write_text(rolling, encoding='utf-8')
            self.assertEqual(app.pick_subtitle_file(folder).name, 'source.en-orig.vtt')
            (folder / 'source.en.vtt').write_text(manual, encoding='utf-8')
            self.assertEqual(app.pick_subtitle_file(folder).name, 'source.en.vtt')
            (folder / 'source.en-orig.vtt').unlink()
            self.assertEqual(app.pick_subtitle_file(folder).name, 'source.en.vtt')
            self.assertIsNone(app.pick_subtitle_file(Path(directory) / 'missing'))

    def test_http_auth_upload_and_range(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(app, 'PROJECTS', Path(directory)):
            server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = 'http://127.0.0.1:' + str(server.server_port)
            try:
                with self.assertRaises(urllib.error.HTTPError) as denied:
                    urllib.request.urlopen(base + '/api/projects')
                self.assertEqual(denied.exception.code, 403)
                req = urllib.request.Request(base + '/api/upload', data=b'0123456789', headers={
                    'X-App-Token': app.TOKEN, 'X-File-Kind': 'video', 'X-File-Name': 'test.mp4'})
                with urllib.request.urlopen(req) as response:
                    p = json.load(response)
                req = urllib.request.Request(base + '/media?id=' + p['id'] + '&token=' + app.TOKEN, headers={'Range': 'bytes=2-5'})
                with urllib.request.urlopen(req) as response:
                    self.assertEqual(response.status, 206)
                    self.assertEqual(response.read(), b'2345')
                    self.assertEqual(response.headers['Content-Range'], 'bytes 2-5/10')
            finally:
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
