package com.spokenmaterial.app;

public class AndroidUpdateMetadataCheck {
    private static void expect(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        String hash = "a".repeat(64);
        String url = "https://github.com/dzh131697/spoken-english-material-tool/"
                + "releases/download/android-v3/spoken-material-android.apk";
        expect(AndroidUpdate.validMetadata(3, "0.3.0", url, hash), "valid release rejected");
        expect(!AndroidUpdate.validMetadata(0, "0.3.0", url, hash), "invalid version accepted");
        expect(!AndroidUpdate.validMetadata(3, "", url, hash), "empty version name accepted");
        expect(!AndroidUpdate.validMetadata(3, "0.3.0", url.replace("https://", "http://"), hash), "HTTP accepted");
        expect(!AndroidUpdate.validMetadata(3, "0.3.0", url.replace("github.com/", "github.com.evil/"), hash), "host spoof accepted");
        expect(!AndroidUpdate.validMetadata(3, "0.3.0", url.replace("android-v3", "android-v4"), hash), "wrong release accepted");
        expect(!AndroidUpdate.validMetadata(3, "0.3.0", url + "?other=1", hash), "unexpected URL accepted");
        expect(!AndroidUpdate.validMetadata(3, "0.3.0", url, "a".repeat(63)), "short hash accepted");
        expect(!AndroidUpdate.validMetadata(3, "0.3.0", url, "z".repeat(64)), "invalid hash accepted");
        expect(AndroidUpdate.shouldOfferUpdate(2, 3, 0, false), "new version not offered");
        expect(!AndroidUpdate.shouldOfferUpdate(2, 3, 3, false), "ignored version offered automatically");
        expect(AndroidUpdate.shouldOfferUpdate(2, 3, 3, true), "manual check hid ignored version");
        expect(!AndroidUpdate.shouldOfferUpdate(3, 3, 0, true), "current version offered as update");
        System.out.println("Android update metadata validation: PASS");
    }
}
