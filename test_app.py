import importlib.util
import io
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import threading
import types
import unittest
import urllib.error
import urllib.request
import wave
from array import array
from pathlib import Path
from unittest.mock import patch

import app
from PIL import Image


class WorkflowTest(unittest.TestCase):
    def ffmpeg_binary(self):
        configured = os.environ.get('TEST_FFMPEG')
        if configured:
            return Path(configured)
        return next((Path(__file__).parent.parent / '.build-deps/imageio_ffmpeg/binaries').glob('ffmpeg*.exe'))

    def test_key_is_encrypted_and_restored_without_portable_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'profile' / 'deepseek.key'
            with patch.object(app, 'key_path', return_value=path):
                self.assertEqual(app.load_key(), '')
                app.save_key('test-placeholder-only')
                self.assertNotIn(b'test-placeholder-only', path.read_bytes())
                self.assertEqual(app.load_key(), 'test-placeholder-only')
                path.unlink()
                self.assertEqual(app.load_key(), '')

    def test_ai_segments_cover_video_without_gaps_and_merge_overlap(self):
        rows = [{'start': 1.0, 'end': 2.5, 'text': 'Hello there.'},
                {'start': 2.4, 'end': 3.0, 'text': 'How are you?'},
                {'start': 5.0, 'end': 6.0, 'text': 'I am fine.'}]
        answer = {'segments': [{'start': i, 'end': i, 'chinese': text} for i, text in enumerate(('你好。', '你好吗？', '我很好。'))]}
        with patch.object(app, 'read_project', return_value={'video': 'test.mp4', 'subtitles': rows}), \
                patch.object(app, 'video_duration', return_value=8.0), \
                patch.object(app, 'deepseek', return_value=(json.dumps(answer), {'total_tokens': 123})) as request:
            result = app.suggest_segments('0123456789abcdef', {'mode': 'continuous', 'length': 'medium'},
                                          'test-key', lambda text: None)
        clips = result['clips']
        self.assertEqual(len(clips), 2)
        self.assertEqual(clips[0]['english'], 'Hello there. How are you?')
        self.assertEqual(clips[0]['chinese'], '你好。\n你好吗？')
        self.assertEqual(clips[0]['start'], 0)
        self.assertEqual(clips[0]['end'], clips[1]['start'])
        self.assertEqual(clips[-1]['end'], 8)
        self.assertEqual(result['tokens'], 123)
        self.assertNotIn('test.mp4', json.dumps(request.call_args.args[0]))

    def test_ai_rejects_missing_or_unordered_subtitle_ranges(self):
        rows = [{'start': i * 2, 'end': i * 2 + 1, 'text': 'Sentence {}.'.format(i)} for i in range(3)]
        with patch.object(app, 'read_project', return_value={'video': 'test.mp4', 'subtitles': rows}), \
                patch.object(app, 'video_duration', return_value=6.0):
            for segments in ([{'start': 0, 'end': 0, 'chinese': '一'}, {'start': 2, 'end': 2, 'chinese': '三'}],
                             [{'start': 1, 'end': 2, 'chinese': '二三'}, {'start': 0, 'end': 0, 'chinese': '一'}],
                             [{'start': 0, 'end': 2, 'chinese': ''}]):
                with patch.object(app, 'deepseek', return_value=(json.dumps({'segments': segments}), {})):
                    with self.assertRaisesRegex(ValueError, '未修改素材列表'):
                        app.suggest_segments('0123456789abcdef', {'mode': 'continuous', 'length': 'medium'},
                                          'test-key', lambda text: None)
            answer = {'segments': [{'start': 1, 'end': 1, 'chinese': '第二句'}]}
            with patch.object(app, 'deepseek', return_value=(json.dumps(answer), {})):
                result = app.suggest_segments('0123456789abcdef', {'mode': 'highlights', 'count': 4, 'length': 'medium'},
                                          'test-key', lambda text: None)
            self.assertEqual(result['clips'][0]['start'], 2)
            self.assertEqual(result['clips'][0]['end'], 3)

    def test_ai_continuous_batches_keep_original_order(self):
        rows = [{'start': i * 2, 'end': i * 2 + 1, 'text': 'Sentence {}.'.format(i)} for i in range(125)]

        def fake_deepseek(messages, key, max_tokens, json_output):
            items = json.loads(messages[1]['content'])
            groups = [{'start': item['index'], 'end': item['index'], 'chinese': '第{}句'.format(item['index'])}
                      for item in items]
            return json.dumps({'segments': groups}), {'total_tokens': 10}

        with patch.object(app, 'read_project', return_value={'video': 'test.mp4', 'subtitles': rows}), \
                patch.object(app, 'video_duration', return_value=250), \
                patch.object(app, 'deepseek', side_effect=fake_deepseek) as request:
            result = app.suggest_segments('0123456789abcdef', {'mode': 'continuous', 'length': 'medium'},
                                          'test-key', lambda text: None)
        self.assertGreater(request.call_count, 1)
        self.assertEqual(len(result['clips']), len(rows))
        self.assertEqual([clip['english'] for clip in result['clips']], [row['text'] for row in rows])
        self.assertEqual(result['clips'][0]['start'], 0)
        self.assertEqual(result['clips'][-1]['end'], 250)
        for previous, following in zip(result['clips'], result['clips'][1:]):
            self.assertEqual(previous['end'], following['start'])

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
                source_ffmpeg = self.ffmpeg_binary()
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
                    for theme in app.CARD_THEMES:
                        image = app.render_card('这是一段题卡。', False, theme)
                        self.assertEqual(image.getpixel((0, 0)), Image.new('RGB', (1, 1), app.CARD_THEMES[theme]['background']).getpixel((0, 0)))
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
                source_ffmpeg = self.ffmpeg_binary()
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
                                           capture_output=True)
                    stderr = probe.stderr.decode('utf-8', errors='replace')
                    self.assertIn('1920x1080', stderr)
                    # 两张题卡各 1 秒 + 1.0 秒 + 1.5 秒 = 4.5 秒
                    duration = re.search(r'Duration: (\d+):(\d+):([\d.]+)', stderr)
                    seconds = int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3])
                    self.assertAlmostEqual(seconds, 4.5, delta=0.4)
                    self.assertIn('Audio:', stderr)
                    saved = app.read_project(pid)['outputs']
                    self.assertEqual(saved[0]['id'], result['id'])
                    self.assertEqual(saved[0]['name'], output.name)
                    with self.assertRaisesRegex(ValueError, '未连续覆盖'):
                        app.compose_video(pid, clips, False, 1, lambda message: None, 'midnight', True)
                    clips[0].update(start=0, end=2)
                    clips[1].update(start=2, end=6)
                    continuous = app.compose_video(pid, clips, False, 1, lambda message: None, 'paper', True)
                    self.assertEqual(continuous['seconds'], 8)

    def test_ai_splits_on_complete_sentences_only(self):
        # 一句话被字幕拆成两行时，AI 只能在整句边界切分。
        rows = [{'start': 0.0, 'end': 1.0, 'text': 'I wanted to tell you'},
                {'start': 1.0, 'end': 2.0, 'text': 'something important.'},
                {'start': 3.0, 'end': 4.0, 'text': 'So I called you.'}]
        units = app.sentence_units(rows)
        self.assertEqual([unit['first'] for unit in units], [0, 2])
        self.assertEqual(units[0]['text'], 'I wanted to tell you something important.')
        answer = {'segments': [{'start': 0, 'end': 0, 'chinese': '我想告诉你一件重要的事。'},
                               {'start': 1, 'end': 1, 'chinese': '所以我给你打了电话。'}]}
        with patch.object(app, 'read_project', return_value={'video': 'test.mp4', 'subtitles': rows}), \
                patch.object(app, 'video_duration', return_value=5.0), \
                patch.object(app, 'deepseek', return_value=(json.dumps(answer), {})):
            result = app.suggest_segments('0123456789abcdef', {'mode': 'highlights', 'count': 2, 'length': 'short'},
                                          'test-key', lambda text: None)
        self.assertEqual([clip['english'] for clip in result['clips']],
                         ['I wanted to tell you something important.', 'So I called you.'])
        self.assertEqual(result['clips'][0]['start'], 0)
        self.assertEqual(result['clips'][0]['end'], 2)
        self.assertEqual(result['requested'], 2)

    def test_ai_count_limit_and_adjacent_mode(self):
        rows = [{'start': i * 2.0, 'end': i * 2.0 + 1.5, 'text': 'Sentence number {} is here.'.format(i)}
                for i in range(8)]
        many = {'segments': [{'start': i, 'end': i, 'chinese': '第{}句'.format(i)} for i in range(8)]}
        with patch.object(app, 'read_project', return_value={'video': 'test.mp4', 'subtitles': rows}), \
                patch.object(app, 'video_duration', return_value=16.0), \
                patch.object(app, 'deepseek', return_value=(json.dumps(many), {})):
            result = app.suggest_segments('0123456789abcdef', {'mode': 'highlights', 'count': 3, 'length': 'short'},
                                          'test-key', lambda text: None)
        self.assertEqual(len(result['clips']), 3)

        scattered = {'segments': [{'start': 0, 'end': 0, 'chinese': '一'},
                                  {'start': 1, 'end': 2, 'chinese': '二三'},
                                  {'start': 5, 'end': 5, 'chinese': '六'},
                                  {'start': 6, 'end': 6, 'chinese': '七'}],
                     'quality': 4}
        with patch.object(app, 'read_project', return_value={'video': 'test.mp4', 'subtitles': rows}), \
                patch.object(app, 'video_duration', return_value=16.0), \
                patch.object(app, 'deepseek', return_value=(json.dumps(scattered), {})):
            result = app.suggest_segments('0123456789abcdef', {'mode': 'adjacent', 'count': 3, 'length': 'short'},
                                          'test-key', lambda text: None)
        self.assertEqual(len(result['clips']), 2)
        self.assertEqual(result['clips'][0]['english'], 'Sentence number 0 is here.')
        self.assertEqual(result['clips'][0]['end'], result['clips'][1]['start'])
        self.assertEqual(result['clips'][1]['english'],
                         'Sentence number 1 is here. Sentence number 2 is here.')
        with self.assertRaises(ValueError):
            app.suggest_segments('0123456789abcdef', {'mode': 'highlights', 'count': 0, 'length': 'short'},
                                 'test-key', lambda text: None)

    def test_card_sound_options(self):
        self.assertIsNone(app.card_sound('none', 5))
        for bad in ('noise', ''):
            with self.assertRaises(ValueError):
                app.card_sound(bad, 5)
        with self.assertRaises(ValueError):
            app.card_sound('tick', 0)
        for name in app.CARD_SOUNDS:
            if name == 'none':
                continue
            with wave.open(io.BytesIO(app.card_sound(name, 4))) as file:
                self.assertEqual(file.getframerate(), 48000)
                self.assertEqual(file.getnchannels(), 1)
                self.assertAlmostEqual(file.getnframes() / 48000, 4, delta=0.02)
                frames = array('h', file.readframes(file.getnframes()))
            self.assertGreater(max(abs(value) for value in frames), 1000, name)
        with wave.open(io.BytesIO(app.card_sound('countdown', 6))) as file:
            head = array('h', file.readframes(48000 * 2))
        self.assertLess(max(abs(value) for value in head), 300)

    def test_align_chinese_uses_time_overlap(self):
        rows = [{'start': 0.0, 'end': 2.0, 'text': 'How was your weekend?'},
                {'start': 2.0, 'end': 4.0, 'text': 'I had a great time.'}]
        zh = [{'start': 0.2, 'end': 1.8, 'text': '你周末过得怎么样？'},
              {'start': 2.2, 'end': 3.9, 'text': '我过得很开心。'}]
        mapping = app.align_chinese(rows, zh)
        self.assertEqual(mapping[0], '你周末过得怎么样？')
        self.assertEqual(mapping[1], '我过得很开心。')
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            self.assertEqual(app.parse_chinese_subtitles(folder), [])
            (folder / 'source.zh-Hans.vtt').write_text(
                'WEBVTT\n\n00:00:00.200 --> 00:00:02.000\n你周末过得怎么样？\n', encoding='utf-8')
            self.assertEqual(app.pick_chinese_subtitle_file(folder).name, 'source.zh-Hans.vtt')
            parsed = app.parse_chinese_subtitles(folder)
            self.assertEqual(parsed[0]['text'], '你周末过得怎么样？')
            self.assertAlmostEqual(parsed[0]['start'], 0.2, places=3)

    def test_translate_rows_returns_indexed_chinese(self):
        answer = {'items': [{'index': 0, 'chinese': '你好。'}, {'index': 3, 'chinese': '再见。'}]}
        items = [{'index': 0, 'text': 'Hello.'}, {'index': 3, 'text': 'Bye.'}]
        with patch.object(app, 'deepseek', return_value=(json.dumps(answer), {'total_tokens': 9})) as request:
            mapping, usage = app.translate_rows(items, 'test-key')
        self.assertEqual(mapping, {0: '你好。', 3: '再见。'})
        self.assertEqual(usage['total_tokens'], 9)
        payload = json.loads(request.call_args.args[0][1]['content'])
        self.assertEqual([item['index'] for item in payload], [0, 3])
        self.assertIn('逐条', request.call_args.args[0][0]['content'])
        short = {'items': [{'index': 0, 'chinese': '你好。'}]}
        with patch.object(app, 'deepseek', return_value=(json.dumps(short), {})):
            with self.assertRaisesRegex(ValueError, '不完整'):
                app.translate_rows(items, 'test-key')

    def test_waveform_and_snap_follow_silence(self):
        with tempfile.TemporaryDirectory(prefix='波形测试_') as directory:
            root = Path(directory)
            with patch.object(app, 'ROOT', root), patch.object(app, 'PROJECTS', root / 'projects'), \
                    patch.object(app, 'OUTPUT', root / 'output'):
                (root / 'tools').mkdir()
                ffmpeg_binary = self.ffmpeg_binary()
                with patch.object(app, 'ffmpeg', return_value=str(ffmpeg_binary)):
                    pid = '0123456789abcdef'
                    folder = app.project_dir(pid)
                    folder.mkdir(parents=True)
                    app.run_ffmpeg([
                        '-f', 'lavfi', '-i', 'color=c=navy:s=320x180:r=25:d=7',
                        '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=1',
                        '-f', 'lavfi', '-i', 'sine=f=440:d=2',
                        '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=1',
                        '-f', 'lavfi', '-i', 'sine=f=440:d=2',
                        '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=1',
                        '-filter_complex', '[1:a][2:a][3:a][4:a][5:a]concat=n=5:v=0:a=1[a]',
                        '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-shortest', str(folder / 'source.mp4')])
                    app.save_project({'id': pid, 'title': '波形', 'url': '', 'video': 'source.mp4',
                                      'subtitles': [], 'clips': []})
                    data = app.waveform(pid, .8, 3.2)
                    self.assertAlmostEqual(data['from'], .8, places=2)
                    self.assertGreater(len(data['peaks']), 100)
                    self.assertLess(max(data['peaks'][:8]), .05)
                    self.assertGreater(max(data['peaks'][50:70]), .05)
                    self.assertGreater(data['threshold'], .01)
                    result = app.snap_clip(pid, 1.5, 5.5)
                    self.assertAlmostEqual(result['start'], .94, delta=.08)
                    self.assertAlmostEqual(result['end'], 6.06, delta=.08)
                    self.assertTrue(result['changed'])
                    with self.assertRaisesRegex(ValueError, '有效的起止时间'):
                        app.snap_clip(pid, 5, 2)

                    silent = folder / 'silent.mp4'
                    app.run_ffmpeg(['-f', 'lavfi', '-i', 'color=c=navy:s=320x180:r=25:d=2',
                                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(silent)])
                    project = app.read_project(pid)
                    project['video'] = 'silent.mp4'
                    app.save_project(project)
                    with self.assertRaisesRegex(ValueError, '没有音轨'):
                        app.waveform(pid, 0, 1)

    def test_compose_writes_subtitle_versions(self):
        with tempfile.TemporaryDirectory(prefix='版本测试_') as directory:
            root = Path(directory)
            with patch.object(app, 'ROOT', root), patch.object(app, 'PROJECTS', root / 'projects'), \
                    patch.object(app, 'OUTPUT', root / 'output'):
                (root / 'tools').mkdir()
                source_ffmpeg = self.ffmpeg_binary()
                with patch.object(app, 'ffmpeg', return_value=str(source_ffmpeg)):
                    pid = '0123456789abcdef'
                    folder = app.project_dir(pid)
                    folder.mkdir(parents=True)
                    app.run_ffmpeg(['-f', 'lavfi', '-i', 'color=c=navy:s=640x360:r=25:d=5',
                                    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5',
                                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
                                    str(folder / 'source.mp4')])
                    rows = [{'start': .2, 'end': 1.4, 'text': 'How was your weekend?'},
                            {'start': 1.4, 'end': 2.0, 'text': 'I had a great time.'}]
                    app.save_project({'id': pid, 'title': '测试素材', 'url': '', 'video': 'source.mp4',
                                      'subtitles': rows, 'clips': [], 'subZh': [], 'rowZh': {}})
                    clips = [{'start': .2, 'end': 2.0, 'english': 'How was your weekend? I had a great time.',
                              'chinese': '你周末过得怎么样？我过得很开心。'}]
                    with self.assertRaisesRegex(ValueError, 'DeepSeek API Key'):
                        app.compose_video(pid, clips, False, 1, lambda message: None, 'midnight', False,
                                          ['plain', 'bilingual'], 'tick')
                    project = app.read_project(pid)
                    project['subZh'] = [{'start': .2, 'end': 1.4, 'text': '你周末过得怎么样？'},
                                        {'start': 1.4, 'end': 2.0, 'text': '我过得很开心。'}]
                    app.save_project(project)
                    result = app.compose_video(pid, clips, False, 1, lambda message: None, 'midnight', False,
                                               ['plain', 'en', 'bilingual'], 'tick')
                    names = [item['name'] for item in result['files']]
                    self.assertEqual(names, ['成片_横版.mp4', '成片_横版_英文字幕.mp4', '成片_横版_双语字幕.mp4'])
                    self.assertEqual(app.read_project(pid)['outputs'][0]['files'], result['files'])
                    for name, subtitled in zip(names, (False, True, True)):
                        path = Path(result['folder']) / name
                        self.assertTrue(path.exists(), name)
                        probe = subprocess.run([str(source_ffmpeg), '-i', str(path), '-f', 'null', '-'],
                                               capture_output=True)
                        self.assertIn(b'Audio:', probe.stderr)
                        shot = Path(directory) / (name + '.png')
                        subprocess.run([str(source_ffmpeg), '-y', '-ss', '1.2', '-i', str(path), '-frames:v', '1',
                                        str(shot)], capture_output=True)
                        with Image.open(shot) as image:
                            bottom = image.crop((0, image.height * 2 // 3, image.width, image.height)).convert('L')
                            bright = sum(bottom.histogram()[201:])
                        self.assertEqual(bright > 200, subtitled, name)
                    ass_file = Path(directory) / 'bilingual.ass'
                    app.write_ass(ass_file, [{'start': 0, 'end': 1.5, 'text': 'See you tomorrow.',
                                              'chinese': '明天见。'}], True, 1920, 1080)
                    content = ass_file.read_text(encoding='utf-8')
                    self.assertIn('See you tomorrow.', content)
                    self.assertIn('明天见。', content)
                    self.assertIn('Dialogue: 0,0:00:00.00,0:00:01.50', content)
                    app.write_ass(ass_file, [{'start': 0, 'end': 1.5, 'text': 'See you tomorrow.',
                                              'chinese': '明天见。'}], False, 1920, 1080)
                    self.assertNotIn('明天见。', ass_file.read_text(encoding='utf-8'))


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
        with tempfile.TemporaryDirectory() as directory, patch.object(app, 'PROJECTS', Path(directory) / 'projects'), \
                patch.object(app, 'OUTPUT', Path(directory) / 'outputs'):
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
                output_id = '20261104_123456_abcdef'
                output_dir = app.OUTPUT / output_id
                output_dir.mkdir(parents=True)
                (output_dir / '成片_横版.mp4').write_bytes(b'abcdefghij')
                p['outputs'] = [{'id': output_id, 'name': '成片_横版.mp4', 'count': 1, 'seconds': 3}]
                app.save_project(p)
                url = base + '/output-media?id=' + p['id'] + '&output=' + output_id + '&token=' + app.TOKEN
                with urllib.request.urlopen(urllib.request.Request(url, headers={'Range': 'bytes=3-6'})) as response:
                    self.assertEqual(response.read(), b'defg')
                with self.assertRaises(urllib.error.HTTPError):
                    urllib.request.urlopen(url.replace(app.TOKEN, 'wrong-token'))
                with self.assertRaises(urllib.error.HTTPError):
                    urllib.request.urlopen(url.replace(output_id, '20261104_123456_111111'))
                data = json.dumps({'text': '请试着用英语表达。', 'theme': 'paper', 'portrait': False}).encode('utf-8')
                req = urllib.request.Request(base + '/api/card-preview', data=data, headers={
                    'X-App-Token': app.TOKEN, 'Content-Type': 'application/json'})
                with urllib.request.urlopen(req) as response:
                    self.assertEqual(response.headers['Content-Type'], 'image/png')
                    self.assertTrue(response.read().startswith(b'\x89PNG'))
            finally:
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
