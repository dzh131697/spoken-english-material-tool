"""素材库验证：仅使用临时目录、合成视频和模拟 AI，不访问真实素材或密钥。"""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

import app


class LibraryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patch = patch.multiple(app, DATA=self.root / 'data', PROJECTS=self.root / 'projects')
        self.patch.start()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.patch.stop)

    def import_source(self, name='vlog', count=2):
        folder = self.root / name
        folder.mkdir(exist_ok=True)
        video = folder / (name + '.mp4')
        video.write_bytes(b'synthetic placeholder')
        subtitle = folder / (name + '.en.srt')
        subtitle.write_text('\n\n'.join(
            '{}\n00:{:02d}:{:02d},000 --> 00:{:02d}:{:02d},000\nHave you ever tried item {}?'.format(
                i + 1, (i * 2) // 60, (i * 2) % 60, (i * 2 + 1) // 60, (i * 2 + 1) % 60, i)
            for i in range(count)), encoding='utf-8')
        result = app.library_import(str(folder), lambda message: None)
        self.assertEqual(result['added'], 1)
        source = next(x for x in app.library_sources()['sources'] if x['title'] == name)
        return source, video, subtitle

    @staticmethod
    def answer(messages, key, max_tokens, json_output):
        rows = json.loads(messages[1]['content'])
        return json.dumps({'segments': [{'first': row['index'], 'last': row['index'],
            'chinese': '你曾经试过吗？', 'grammar': ['现在完成时'], 'patterns': ['Have you ever…?']}
            for row in rows]}), {'total_tokens': 10}

    def analyze(self, source):
        with patch.object(app, 'deepseek', side_effect=self.answer):
            result = app.library_analyze([source['id']], 'placeholder', lambda message: None)
        self.assertEqual(result['errors'], [])

    def test_import_matching_dedup_and_changed_subtitle_invalidation(self):
        source, video, subtitle = self.import_source()
        self.analyze(source)
        self.assertEqual(app.library_import(str(video.parent), lambda message: None)['skipped'], 1)
        self.assertEqual(app.library_search()['total'], 2)
        subtitle.write_text(subtitle.read_text(encoding='utf-8').replace('tried', 'seen'), encoding='utf-8')
        self.assertEqual(app.library_import(str(video.parent), lambda message: None)['added'], 1)
        self.assertEqual(app.library_search()['total'], 0)
        subtitle.rename(video.with_suffix('.zh.srt'))
        self.assertEqual(app.library_import(str(video.parent), lambda message: None)['missing'], [video.name])
        self.assertEqual(app.library_sources()['sources'][0]['done'], 0)

    def test_tolerates_unusual_grammar_labels_from_ai(self):
        source, _, _ = self.import_source(count=1)

        def answer(messages, key, max_tokens, json_output):
            rows = json.loads(messages[1]['content'])
            return json.dumps({'segments': [{
                'first': row['index'], 'last': row['index'], 'chinese': '你曾经试过吗？',
                'grammar': ['现在完成时/一般过去时', '现在完成进行时（持续到现在）', '自创的语法名称'],
                'patterns': ['Have you ever…?']} for row in rows]}), {'total_tokens': 10}

        with patch.object(app, 'deepseek', side_effect=answer):
            result = app.library_analyze([source['id']], 'placeholder', lambda message: None)
        self.assertEqual(result['errors'], [])
        tags = app.library_search()['items'][0]['grammar']
        self.assertIn('现在完成时', tags)
        self.assertIn('一般过去时', tags)
        self.assertIn('现在完成进行时', tags)
        self.assertNotIn('自创的语法名称', tags)

    def test_strict_tags_still_reject_user_typos(self):
        with self.assertRaises(ValueError):
            app.library_tags(['自创的语法名称'], True)
        self.assertEqual(app.library_tags(['现在完成时'], True), ['现在完成时'])

    def test_resume_after_failed_batch_and_only_text_sent_to_ai(self):
        source, video, subtitle = self.import_source(count=65)
        calls = []

        def interrupted(*args):
            calls.append(args)
            if len(calls) == 2:
                raise ValueError('模拟中断')
            return self.answer(*args)

        with patch.object(app, 'deepseek', side_effect=interrupted):
            result = app.library_analyze([source['id']], 'placeholder', lambda message: None)
        self.assertEqual(len(result['errors']), 1)
        self.assertEqual(app.library_sources()['sources'][0]['done'], 1)
        completed = app.library_search()['total']
        with patch.object(app, 'deepseek', side_effect=self.answer) as ai:
            result = app.library_analyze([source['id']], 'placeholder', lambda message: None)
            self.assertEqual(ai.call_count, 1)
            sent = json.loads(ai.call_args.args[0][1]['content'])
            self.assertEqual(sent[0]['index'], completed)
            self.assertEqual(set(sent[0]), {'index', 'text'})
            self.assertNotIn(str(video), json.dumps(ai.call_args.args[0]))
        self.assertEqual(result['errors'], [])
        self.assertEqual(app.library_search()['total'], 65)
        with patch.object(app, 'deepseek') as ai:
            app.library_analyze([source['id']], 'placeholder', lambda message: None)
            ai.assert_not_called()

    def test_malformed_ai_output_is_atomic_and_retryable(self):
        source, _, _ = self.import_source()
        invalid = {'segments': [
            {'first': 0, 'last': 0, 'chinese': '第一句', 'grammar': [], 'patterns': []},
            {'first': 0, 'last': 1, 'chinese': '重复范围', 'grammar': [], 'patterns': []}]}
        with patch.object(app, 'deepseek', return_value=(json.dumps(invalid), {})):
            result = app.library_analyze([source['id']], 'placeholder', lambda message: None)
        self.assertTrue(result['errors'])
        self.assertEqual(app.library_search()['total'], 0)
        self.assertEqual(app.library_sources()['sources'][0]['done'], 0)
        self.analyze(source)
        self.assertEqual(app.library_search()['total'], 2)

    def test_filter_edit_and_escaped_search(self):
        source, _, _ = self.import_source()
        self.analyze(source)
        self.assertEqual(app.library_search(grammar='现在完成时', pattern='have you EVER')['total'], 2)
        self.assertEqual(app.library_search(grammar='完成时')['total'], 0)
        self.assertEqual(app.library_search(query="' OR 1=1 --")['total'], 0)
        item = app.library_search()['items'][0]
        item.update(start=.1, end=.9, chinese='修改后的释义', grammar=['疑问句'], patterns=['Have you ever + 过去分词'])
        app.library_update(item)
        self.assertEqual(app.library_search(query='修改后', grammar='疑问句')['total'], 1)
        with self.assertRaises(ValueError):
            app.library_update({**item, 'end': float('nan')})
        with self.assertRaises(ValueError):
            app.library_update({**item, 'grammar': ['不存在的分类']})

    def test_dynamic_patterns_normalize_names_and_preserve_distinct_structures(self):
        source, _, _ = self.import_source(count=1)
        examples = [('I need a break.', ['I need+名词']),
                    ('I need some water.', ['i need + noun']),
                    ('I need to rest.', ['I need to + 动词原形']),
                    ('It takes me an hour to get there.', ['It takes + 人 + 时间 + to do']),
                    ('The more you practice, the better you get.', ['The more..., the more...'])]
        with app.library_db() as db:
            db.executemany('INSERT INTO sentences(source_id,start,end,english,chinese,grammar,patterns) VALUES (?,?,?,?,?,?,?)',
                           [(source['id'], i, i + 1, text, '例句', '[]', json.dumps(tags)) for i, (text, tags) in enumerate(examples)])
            before = [tuple(row) for row in db.execute('SELECT * FROM sentences ORDER BY id')]
        catalog = app.library_sources()['patterns']
        self.assertEqual(len(catalog), 4)
        self.assertEqual(catalog[0]['name'], 'I need + 名词')
        self.assertEqual(catalog[0]['count'], 2)
        self.assertEqual(app.library_search(pattern='I need + 名词')['total'], 2)
        self.assertEqual(app.library_search(pattern='I need to + 动词原形')['total'], 1)
        self.assertEqual(app.library_search(pattern='The more..., the more...')['total'], 1)
        with app.library_db() as db:
            self.assertEqual([tuple(row) for row in db.execute('SELECT * FROM sentences ORDER BY id')], before)

    def test_retag_resumes_without_touching_chinese_times_or_completed_rows(self):
        source, _, _ = self.import_source(count=1)
        with app.library_db() as db:
            db.executemany('INSERT INTO sentences(source_id,start,end,english,chinese,grammar,patterns) VALUES (?,?,?,?,?,?,?)',
                           [(source['id'], i, i + 1, 'I need a break.', '保留中文', '[]', '["旧标签"]') for i in range(21)])
        calls = []
        def answer(messages, key, max_tokens, json_output):
            calls.append(messages)
            if len(calls) == 2:
                raise ValueError('模拟网络中断')
            return json.dumps({'items': [{'id': row['id'], 'patterns': ['I need + 名词']} for row in json.loads(messages[1]['content'])]}), {'total_tokens': 5}
        with patch.object(app, 'deepseek', side_effect=answer):
            with self.assertRaisesRegex(ValueError, '模拟网络中断'):
                app.library_retag([source['id']], 'placeholder', lambda text: None)
            result = app.library_retag([source['id']], 'placeholder', lambda text: None)
        self.assertEqual(result['updated'], 1)
        self.assertEqual(len(json.loads(calls[-1][1]['content'])), 1)
        self.assertTrue(all(item['chinese'] == '保留中文' for item in app.library_search()['items']))
        self.assertEqual(app.library_sources()['sources'][0]['patterns_pending'], 0)
        self.assertEqual(app.library_search(pattern='I need + 名词')['total'], 21)

    def test_ai_prompt_extracts_open_ended_templates(self):
        source, _, _ = self.import_source(count=1)
        with patch.object(app, 'deepseek', side_effect=self.answer) as ai:
            app.library_analyze([source['id']], 'placeholder', lambda text: None)
        prompt = ai.call_args.args[0][0]['content']
        self.assertIn('不限种类', prompt)
        self.assertIn('I need + 名词 与 I need to + 动词原形 分开', prompt)

    def test_http_requires_token_and_media_uses_registered_source_only(self):
        source, video, _ = self.import_source()
        server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = 'http://127.0.0.1:{}'.format(server.server_port)
        for path in ['/library', '/api/library/sources', '/library-media?id='+source['id']]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(base + path)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
        request = urllib.request.Request(base + '/api/library/sources', headers={'X-App-Token': app.TOKEN})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(json.load(response)['sources'][0]['id'], source['id'])
        request = urllib.request.Request(base + '/library-media?id='+source['id']+'&token='+app.TOKEN,
                                         headers={'Range': 'bytes=0-3'})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.read(), video.read_bytes()[:4])
        uploaded = None
        for name, raw in [('phone.mp4', b'test video'), ('phone.en.srt', b'1\n00:00:00,100 --> 00:00:01,000\nI need a break.\n')]:
            request = urllib.request.Request(base + '/api/library/upload', data=raw,
                headers={'X-App-Token': app.TOKEN, 'X-Library-Batch': 'a' * 16, 'X-File-Name': name})
            with urllib.request.urlopen(request) as response:
                uploaded = json.load(response)['folder']
        self.assertEqual(app.library_import(uploaded, lambda text: None)['added'], 1)
        request = urllib.request.Request(base + '/api/library/upload', data=b'bad',
            headers={'X-App-Token': app.TOKEN, 'X-Library-Batch': 'a' * 16, 'X-File-Name': '..%2Fescape.mp4'})
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(request)
        self.assertEqual(error.exception.code, 400)
        error.exception.close()

    def test_topic_extracts_multiple_sources_and_preserves_originals(self):
        one, video_one, _ = self.import_source('one', 1)
        two, video_two, _ = self.import_source('two', 1)
        for video, color in [(video_one, 'red'), (video_two, 'blue')]:
            command = ['-f', 'lavfi', '-i', 'color=c={}:s=160x90:r=30:d=2'.format(color)]
            if video == video_one:
                command += ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac']
            app.run_ffmpeg(command + ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(video)])
        before = [video_one.read_bytes(), video_two.read_bytes()]
        self.analyze(one)
        self.analyze(two)
        records = app.library_search()['items']
        ids = [record['id'] for record in reversed(records)]
        project = app.library_topic(ids, '现在完成时专题', lambda message: None)
        self.assertEqual([x['sentence_id'] for x in project['library_origins']], ids)
        self.assertEqual(len(project['clips']), 2)
        self.assertEqual(project['clips'][0]['end'], project['clips'][1]['start'])
        path = app.project_dir(project['id']) / project['video']
        self.assertAlmostEqual(app.video_duration(path), project['clips'][-1]['end'], delta=.08)
        self.assertEqual([video_one.read_bytes(), video_two.read_bytes()], before)
        self.assertEqual(app.read_project(project['id'])['title'], '现在完成时专题')
        self.assertFalse(list(path.parent.glob('part_*')))
        self.assertEqual(len(project['rowZh']), 2)


if __name__ == '__main__':
    unittest.main()
