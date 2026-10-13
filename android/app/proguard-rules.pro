# Rhino (runs the Meesho P&L engine) loads many of its own classes by name.
-keep class org.mozilla.javascript.** { *; }
-dontwarn org.mozilla.javascript.**
-dontwarn javax.lang.model.**
-dontwarn java.beans.**
-dontwarn jdk.dynalink.**
-dontwarn javax.script.**

# AndroidSVG draws the How to use pictures
-keep class com.caverock.androidsvg.** { *; }
-dontwarn com.caverock.androidsvg.**

# Razorpay checkout (its pages talk to the app through a JavaScript bridge)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keepattributes *Annotation*
-dontwarn com.razorpay.**
-keep class com.razorpay.** { *; }
-keepclasseswithmembers class * {
    public void onPayment*(...);
}
