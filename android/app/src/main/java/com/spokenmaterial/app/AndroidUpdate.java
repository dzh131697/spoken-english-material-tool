package com.spokenmaterial.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.provider.Settings;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

class AndroidUpdate {
    static final int INSTALL_PERMISSION = 3;
    private static final String MANIFEST_URL = "https://raw.githubusercontent.com/dzh131697/"
            + "spoken-english-material-tool/main/android/update.json";
    private static final String DOWNLOAD_PREFIX = "https://github.com/dzh131697/"
            + "spoken-english-material-tool/releases/download/android-v";
    private static final long MAX_APK_BYTES = 512L * 1024 * 1024;

    private final Activity activity;
    private boolean checking;
    private boolean downloading;
    private File pendingInstall;

    AndroidUpdate(Activity activity) {
        this.activity = activity;
    }

    static boolean validMetadata(int code, String name, String url, String sha256) {
        return code > 0 && name != null && !name.trim().isEmpty() && name.length() <= 40
                && url != null && url.equals(DOWNLOAD_PREFIX + code + "/spoken-material-android.apk")
                && sha256 != null && sha256.matches("[0-9a-fA-F]{64}");
    }

    static boolean shouldOfferUpdate(long current, int available, int ignored, boolean manual) {
        return available > current && (manual || available != ignored);
    }

    void check(boolean manual) {
        synchronized (this) {
            if (checking) {
                if (manual) toast("正在检查更新，请稍候");
                return;
            }
            checking = true;
        }
        new Thread(() -> {
            try {
                UpdateInfo info = readManifest();
                long current = activity.getPackageManager()
                        .getPackageInfo(activity.getPackageName(), 0).getLongVersionCode();
                int ignored = activity.getPreferences(Activity.MODE_PRIVATE).getInt("ignored_update", 0);
                if (shouldOfferUpdate(current, info.code, ignored, manual)) {
                    onUi(() -> new AlertDialog.Builder(activity)
                            .setTitle("发现新版本 " + info.name)
                            .setMessage((info.notes.isEmpty() ? "新版本已准备好。" : info.notes)
                                    + "\n\n是否下载并安装？")
                            .setNegativeButton("稍后", null)
                            .setNeutralButton("忽略此版本", (dialog, which) -> activity.getPreferences(Activity.MODE_PRIVATE)
                                    .edit().putInt("ignored_update", info.code).apply())
                            .setPositiveButton("下载并安装", (dialog, which) -> download(info))
                            .show());
                } else if (manual && info.code <= current) {
                    toast("当前已是最新版本");
                }
            } catch (Exception error) {
                if (manual) toast("暂时无法检查更新，请检查网络后重试");
            } finally {
                synchronized (this) { checking = false; }
            }
        }, "check-update").start();
    }

    private UpdateInfo readManifest() throws Exception {
        HttpURLConnection connection = open(MANIFEST_URL);
        try (InputStream input = connection.getInputStream();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > 32768) throw new IOException("更新信息过大");
                output.write(buffer, 0, count);
            }
            JSONObject data = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            int code = data.getInt("versionCode");
            String name = data.getString("versionName");
            String url = data.getString("apkUrl");
            String sha256 = data.getString("sha256");
            if (!validMetadata(code, name, url, sha256)) throw new IOException("更新信息无效");
            String notes = data.optString("notes", "").trim();
            if (notes.length() > 400) notes = notes.substring(0, 400);
            return new UpdateInfo(code, name, url, sha256.toLowerCase(Locale.ROOT), notes);
        } finally {
            connection.disconnect();
        }
    }

    private HttpURLConnection open(String address) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("User-Agent", "SpokenMaterialAndroid");
        connection.setRequestProperty("Cache-Control", "no-cache");
        return connection;
    }

    private void download(UpdateInfo info) {
        synchronized (this) {
            if (downloading) {
                toast("上一次下载正在停止，请稍后重试");
                return;
            }
            downloading = true;
        }
        AtomicBoolean cancelled = new AtomicBoolean();
        ProgressDialog progress = new ProgressDialog(activity);
        progress.setTitle("下载更新");
        progress.setMessage("下载完成后将打开系统安装界面。");
        progress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        progress.setMax(100);
        progress.setIndeterminate(true);
        progress.setCancelable(true);
        progress.setOnCancelListener(dialog -> cancelled.set(true));
        progress.setButton(ProgressDialog.BUTTON_NEGATIVE, "取消", (dialog, which) -> {
            cancelled.set(true);
            dialog.dismiss();
        });
        progress.show();

        new Thread(() -> {
            File temporary = null;
            try {
                File directory = new File(activity.getCacheDir(), "updates");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法创建更新目录");
                temporary = new File(directory, "update-download.apk");
                File apk = new File(directory, "update.apk");
                downloadFile(info, temporary, progress, cancelled);
                verifyPackage(temporary, info.code);
                if (cancelled.get()) throw new IOException("下载已取消");
                if (apk.exists() && !apk.delete()) throw new IOException("无法替换旧更新文件");
                if (!temporary.renameTo(apk)) throw new IOException("无法保存更新文件");
                onUi(() -> {
                    if (progress.isShowing()) progress.dismiss();
                    if (cancelled.get()) return;
                    pendingInstall = apk;
                    install();
                });
            } catch (Exception error) {
                if (temporary != null && temporary.exists()) temporary.delete();
                onUi(() -> {
                    if (progress.isShowing()) progress.dismiss();
                    if (!cancelled.get()) Toast.makeText(activity, "更新下载或校验失败，请稍后重试", Toast.LENGTH_LONG).show();
                });
            } finally {
                synchronized (this) { downloading = false; }
            }
        }, "download-update").start();
    }

    private void downloadFile(UpdateInfo info, File file, ProgressDialog progress, AtomicBoolean cancelled) throws Exception {
        HttpURLConnection connection = open(info.url);
        try {
            long total = connection.getContentLengthLong();
            if (total > MAX_APK_BYTES) throw new IOException("更新文件过大");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(file)) {
                byte[] buffer = new byte[128 * 1024];
                long written = 0;
                int count, lastPercent = -1;
                while ((count = input.read(buffer)) != -1) {
                    if (cancelled.get()) throw new IOException("下载已取消");
                    written += count;
                    if (written > MAX_APK_BYTES) throw new IOException("更新文件过大");
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    if (total > 0) {
                        int percent = (int) Math.min(100, written * 100 / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            onUi(() -> { progress.setIndeterminate(false); progress.setProgress(percent); });
                        }
                    }
                }
            }
            if (!hex(digest.digest()).equals(info.sha256)) throw new IOException("更新文件校验失败");
        } finally {
            connection.disconnect();
        }
    }

    private void verifyPackage(File apk, int versionCode) throws Exception {
        PackageManager manager = activity.getPackageManager();
        PackageInfo archive = manager.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
        PackageInfo installed = manager.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
        if (archive == null || !activity.getPackageName().equals(archive.packageName)
                || archive.getLongVersionCode() != versionCode || versionCode <= installed.getLongVersionCode()
                || archive.signingInfo == null || installed.signingInfo == null) {
            throw new IOException("更新包信息无效");
        }
        Signature[] expected = installed.signingInfo.getApkContentsSigners();
        Signature[] actual = archive.signingInfo.getApkContentsSigners();
        if (expected.length == 0 || !Arrays.equals(expected, actual)) throw new IOException("更新签名不匹配");
    }

    private void install() {
        if (pendingInstall == null || !pendingInstall.isFile()) return;
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(activity)
                    .setTitle("允许安装更新")
                    .setMessage("Android 需要允许本应用安装更新。您也可以选择稍后安装。")
                    .setNegativeButton("稍后", (dialog, which) -> pendingInstall = null)
                    .setPositiveButton("前往设置", (dialog, which) -> {
                        try {
                            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + activity.getPackageName()));
                            activity.startActivityForResult(intent, INSTALL_PERMISSION);
                        } catch (Exception error) {
                            pendingInstall = null;
                            toast("无法打开安装权限设置");
                        }
                    }).show();
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", pendingInstall);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            pendingInstall = null;
            activity.startActivity(intent);
        } catch (Exception error) {
            pendingInstall = null;
            toast("无法打开系统安装界面");
        }
    }

    void onInstallPermissionResult() {
        if (pendingInstall == null) return;
        if (activity.getPackageManager().canRequestPackageInstalls()) install();
        else { pendingInstall = null; toast("未允许安装，可以稍后再更新"); }
    }

    private void onUi(Runnable action) {
        activity.runOnUiThread(() -> { if (!activity.isFinishing() && !activity.isDestroyed()) action.run(); });
    }

    private void toast(String message) {
        onUi(() -> Toast.makeText(activity, message, Toast.LENGTH_LONG).show());
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    private static class UpdateInfo {
        final int code;
        final String name, url, sha256, notes;
        UpdateInfo(int code, String name, String url, String sha256, String notes) {
            this.code = code;
            this.name = name;
            this.url = url;
            this.sha256 = sha256;
            this.notes = notes;
        }
    }
}
