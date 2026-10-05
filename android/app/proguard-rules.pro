# Rhino (runs the Meesho P&L engine) loads many of its own classes by name.
-keep class org.mozilla.javascript.** { *; }
-dontwarn org.mozilla.javascript.**
-dontwarn javax.lang.model.**
-dontwarn java.beans.**
-dontwarn jdk.dynalink.**
-dontwarn javax.script.**
