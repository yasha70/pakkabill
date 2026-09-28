# The web page calls these through the JavaScript bridge.
-keepclassmembers class com.pakkabill.app.web.JsBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
