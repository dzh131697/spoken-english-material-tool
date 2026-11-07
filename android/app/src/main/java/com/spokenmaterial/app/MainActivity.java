package com.spokenmaterial.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.chaquo.python.Python;
import com.chaquo.python.PyObject;
import com.chaquo.python.android.AndroidPlatform;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Collections;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 1;
    private static final int SAVE_FILE = 2;
    private static final String KEY_ALIAS = "spoken_material_deepseek";
    private static final Pattern OUTPUT_ID = Pattern.compile("\\d{8}_\\d{6}_[a-f0-9]{6}");
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private File pendingSave;
    private PyObject backend;
    private AndroidUpdate updater;
    private volatile boolean destroyed;
    private int serverPort;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        updater = new AndroidUpdate(this);
        TextView loading = new TextView(this);
        loading.setText("正在准备本地视频组件，请稍候…");
        loading.setTextSize(18);
        loading.setPadding(32, 80, 32, 32);
        setContentView(loading);
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), (view, windowInsets) -> {
            Insets safeArea = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(safeArea.left, safeArea.top, safeArea.right, safeArea.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(findViewById(android.R.id.content));
        new Thread(this::startBackend, "app-start").start();
    }

    private void startBackend() {
        try {
            YoutubeDL.getInstance().init(getApplicationContext());
            FFmpeg.getInstance().init(getApplicationContext());
            copyWebPage();
            if (!Python.isStarted()) {
                Python.start(new AndroidPlatform(getApplicationContext()));
            }
            backend = Python.getInstance().getModule("mobile");
            String url = backend.callAttr("start", getFilesDir().getAbsolutePath(),
                    getApplicationInfo().nativeLibraryDir,
                    new File(getNoBackupFilesDir(), "youtubedl-android/packages").getAbsolutePath(),
                    new AndroidHost()).toString();
            if (destroyed) {
                backend.callAttr("stop");
                return;
            }
            serverPort = Uri.parse(url).getPort();
            runOnUiThread(() -> showWebView(url));
        } catch (Exception error) {
            runOnUiThread(() -> {
                TextView message = new TextView(this);
                message.setText("无法启动本地组件：" + error.getMessage());
                message.setPadding(32, 80, 32, 32);
                setContentView(message);
            });
        }
    }

    private void copyWebPage() throws IOException {
        File directory = new File(getFilesDir(), "web");
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IOException("无法创建网页目录");
        }
        for (String name : new String[]{"index.html", "publish.js", "publish.css", "library.html", "studio.html"}) {
            try (InputStream input = getAssets().open(name);
                 OutputStream output = new FileOutputStream(new File(directory, name))) {
                copy(input, output);
            }
        }
    }

    private void showWebView(String url) {
        if (destroyed) return;
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new AndroidHost(), "AndroidHost");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isLocal(request.getUrl());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri) || "blob".equals(uri.getScheme()) || "data".equals(uri.getScheme())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                        Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("确定", (dialog, which) -> result.confirm())
                        .setNegativeButton("取消", (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) intent.setType("*/*");
                    startActivityForResult(intent, PICK_FILE);
                    return true;
                } catch (Exception error) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    toast("无法打开文件选择器");
                    return false;
                }
            }
        });
        setContentView(webView);
        webView.loadUrl(url);
        updater.check(false);
    }

    private boolean isLocal(Uri uri) {
        return "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()) && uri.getPort() == serverPort;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && fileCallback != null) {
            if (resultCode == RESULT_OK && data != null && data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                Uri[] uris = new Uri[count];
                for (int i = 0; i < count; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
                fileCallback.onReceiveValue(uris);
            } else {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            }
            fileCallback = null;
        } else if (requestCode == SAVE_FILE) {
            File source = pendingSave;
            pendingSave = null;
            if (source != null && resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri target = data.getData();
                new Thread(() -> saveToUri(source, target), "save-output").start();
            }
        } else if (requestCode == AndroidUpdate.INSTALL_PERMISSION) {
            updater.onInstallPermissionResult();
        }
    }

    private void requestSave(File source, String mime, String name) {
        runOnUiThread(() -> {
            if (pendingSave != null) {
                toast("请先完成当前保存操作");
                return;
            }
            pendingSave = source;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TITLE, name);
            try {
                startActivityForResult(intent, SAVE_FILE);
            } catch (Exception error) {
                pendingSave = null;
                toast("无法打开保存位置选择器");
            }
        });
    }

    private void saveToUri(File source, Uri target) {
        try (InputStream input = new FileInputStream(source);
             OutputStream output = getContentResolver().openOutputStream(target, "w")) {
            if (output == null) throw new IOException("无法写入目标文件");
            copy(input, output);
            toast("已保存到手机");
        } catch (Exception error) {
            toast("保存失败，请检查存储空间或选择其他位置");
        }
    }

    private static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[128 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    private File outputDirectory(String id) throws IOException {
        if (!OUTPUT_ID.matcher(id).matches()) throw new IOException("无效素材编号");
        File root = new File(getFilesDir(), "导出素材").getCanonicalFile();
        File result = new File(root, id).getCanonicalFile();
        if (!root.equals(result.getParentFile())) throw new IOException("无效素材目录");
        return result;
    }

    public class AndroidHost {
        @JavascriptInterface
        public void closeApp() {
            runOnUiThread(MainActivity.this::finish);
        }

        @JavascriptInterface
        public void checkForUpdates() {
            updater.check(true);
        }

        @JavascriptInterface
        public void saveVideo(String id, String name) {
            try {
                if (name == null || !name.matches("成片_(横版|竖版)(_英文字幕|_双语字幕)?\\.mp4")) {
                    throw new IOException("无效的视频名称");
                }
                File file = new File(outputDirectory(id), name);
                if (!file.isFile()) throw new IOException("视频不存在");
                requestSave(file, "video/mp4", name);
            } catch (Exception error) {
                toast("无法找到成片，请重新合成");
            }
        }

        @JavascriptInterface
        public void savePublicationFile(String id, String name) {
            try {
                if (!"封面_横版.png".equals(name) && !"封面_竖版.png".equals(name)
                        && !"封面_3比4.png".equals(name) && !"封面_4比3.png".equals(name)
                        && !"封面_16比10.png".equals(name) && !"封面_1比1.png".equals(name)
                        && !"发布文案.txt".equals(name)) {
                    throw new IOException("无效发布文件");
                }
                File file = new File(outputDirectory(id), name);
                if (!file.isFile()) throw new IOException("文件不存在");
                requestSave(file, name.endsWith(".png") ? "image/png" : "text/plain", name);
            } catch (Exception error) {
                toast("请先保存这条成片的封面和文案");
            }
        }

        @JavascriptInterface
        public void saveBatch(String path) {
            new Thread(() -> {
                try {
                    File directory = new File(path).getCanonicalFile();
                    if (!directory.equals(outputDirectory(directory.getName())) || !directory.isDirectory()) {
                        throw new IOException("无效素材目录");
                    }
                    File archive = File.createTempFile("spoken_material_", ".zip", getCacheDir());
                    File[] files = directory.listFiles();
                    if (files == null) throw new IOException("无法读取素材目录");
                    try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(archive))) {
                        zip.setLevel(0);
                        for (File file : files) {
                            if (!file.isFile()) continue;
                            String name = file.getName();
                            if (!name.matches("\\d{3,}_(中文题卡\\.png|原视频\\.mp4|中英文本\\.txt)")
                                    && !"素材清单.json".equals(name)
                                    && !name.matches("成片_(横版|竖版)(_英文字幕|_双语字幕)?\\.mp4")
                                    && !"封面_横版.png".equals(name) && !"封面_竖版.png".equals(name)
                                    && !"封面_3比4.png".equals(name)
                                    && !"封面_4比3.png".equals(name) && !"封面_16比10.png".equals(name)
                                    && !"封面_1比1.png".equals(name)
                                    && !"发布文案.txt".equals(name) && !"发布资料.json".equals(name)) continue;
                            zip.putNextEntry(new ZipEntry(name));
                            try (InputStream input = new FileInputStream(file)) { copy(input, zip); }
                            zip.closeEntry();
                        }
                    }
                    String label = new File(directory, "发布资料.json").isFile() ? "发布资料_" : "口语素材_";
                    requestSave(archive, "application/zip", label + directory.getName() + ".zip");
                } catch (Exception error) {
                    toast("素材包保存失败，请检查存储空间");
                }
            }, "package-output").start();
        }

        public void saveKey(String key) throws Exception {
            SecretKey secret = getSecretKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secret);
            byte[] iv = cipher.getIV();
            byte[] encrypted = cipher.doFinal(key.getBytes(StandardCharsets.UTF_8));
            File directory = new File(getNoBackupFilesDir(), "private");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法保存密钥");
            AtomicFile target = new AtomicFile(new File(directory, "deepseek.key"));
            FileOutputStream output = target.startWrite();
            try {
                output.write(iv.length);
                output.write(iv);
                output.write(encrypted);
                target.finishWrite(output);
            } catch (Exception error) {
                target.failWrite(output);
                throw error;
            }
        }

        public String loadKey() throws Exception {
            File file = new File(keyPath());
            if (!file.isFile()) return "";
            byte[] bytes;
            try (InputStream input = new FileInputStream(file); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                copy(input, buffer);
                bytes = buffer.toByteArray();
            }
            if (bytes.length < 30) throw new IOException("密钥文件无效");
            int ivLength = bytes[0] & 0xff;
            if (ivLength < 12 || ivLength > 16 || bytes.length <= ivLength + 1) throw new IOException("密钥文件无效");
            byte[] iv = java.util.Arrays.copyOfRange(bytes, 1, ivLength + 1);
            byte[] encrypted = java.util.Arrays.copyOfRange(bytes, ivLength + 1, bytes.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        }

        public String keyPath() {
            return new File(getNoBackupFilesDir(), "private/deepseek.key").getAbsolutePath();
        }

        private SecretKey getSecretKey() throws Exception {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if (!store.containsAlias(KEY_ALIAS)) {
                KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
                generator.generateKey();
            }
            return (SecretKey) store.getKey(KEY_ALIAS, null);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript("typeof window.mobileBack === 'function' ? window.mobileBack() : false",
                result -> { if (!destroyed && "false".equals(result)) MainActivity.super.onBackPressed(); });
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (webView != null) webView.destroy();
        if (backend != null) new Thread(() -> backend.callAttr("stop"), "app-stop").start();
        super.onDestroy();
    }
}
