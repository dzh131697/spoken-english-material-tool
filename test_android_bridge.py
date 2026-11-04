import importlib.util
import os
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import yt_dlp


path = Path(__file__).parent / 'android/app/src/main/python/mobile.py'
spec = importlib.util.spec_from_file_location('mobile_test', path)
mobile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mobile)


class MobileBridgeTest(unittest.TestCase):
    def test_mobile_paths_key_and_youtube_runtime_are_isolated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            native = root / 'native'
            native.mkdir()
            (native / 'libffmpeg.so').touch()
            (native / 'libqjs.so').touch()
            bridge = Mock()
            bridge.loadKey.return_value = 'test-key'
            bridge.keyPath.return_value = str(root / 'private-profile/deepseek.key')
            application = types.SimpleNamespace(TOKEN='test-token', Handler=object)
            server = Mock()
            server.server_port = 12345
            captured = []

            def youtube_dl(options):
                captured.append(options)
                return object()

            with patch.object(mobile, 'app', application), patch.object(mobile, 'SERVER', None), \
                    patch.object(mobile, 'ORIGINAL_YOUTUBE_DL', youtube_dl), \
                    patch.object(mobile, 'ThreadingHTTPServer', return_value=server), \
                    patch.object(yt_dlp, 'YoutubeDL'), patch.dict(os.environ, {}, clear=False):
                url = mobile.start(str(root / 'private-data'), str(native), str(root / 'packages'), bridge)
                self.assertEqual(url, 'http://127.0.0.1:12345/?token=test-token')
                self.assertEqual(application.KEY, 'test-key')
                self.assertEqual(application.ffmpeg(), str(native / 'libffmpeg.so'))
                self.assertEqual(application.key_path(), root / 'private-profile/deepseek.key')
                application.save_key('new-test-key')
                bridge.saveKey.assert_called_once_with('new-test-key')
                yt_dlp.YoutubeDL({'js_runtimes': {'node': {}}, 'compat_opts': ['no-certifi']})
                self.assertEqual(captured[0]['js_runtimes'], {'quickjs': {'path': str(native / 'libqjs.so')}})
                self.assertEqual(captured[0]['compat_opts'], [])
                mobile.stop()
                server.shutdown.assert_called_once()
                server.server_close.assert_called_once()

    def test_missing_native_components_fails_before_starting(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(mobile, 'SERVER', None):
            with self.assertRaisesRegex(ValueError, '缺少 Android 视频处理组件'):
                mobile.start(directory, directory, directory, Mock())


if __name__ == '__main__':
    unittest.main(verbosity=2)
