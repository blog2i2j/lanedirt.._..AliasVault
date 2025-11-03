
1. Clone
```bash
git clone https://gitlab.com/fdroid/fdroiddata.git --depth=1
git clone https://gitlab.com/fdroid/fdroidserver.git --depth=1
```

2. Build docker image and run docker compose in attach mode
```bash
docker compose build && docker compose run --rm fdroid-buildserver
```

3. Inside the Docker container, run this:
```bash
./build.sh
```

The build process can take a while, upwards of 30min. Final output should look like this:
```bash
 Task :app:packageRelease
> Task :app:createReleaseApkListingFileRedirect
> Task :app:lintVitalAnalyzeRelease
> Task :app:lintVitalReportRelease
> Task :app:lintVitalRelease
> Task :app:assembleRelease

[Incubating] Problems report is available at: file:///build/build/net.aliasvault.app/apps/mobile-app/android/build/reports/problems/problems-report.html

Deprecated Gradle features were used in this build, making it incompatible with Gradle 9.0.

You can use '--warning-mode all' to show the individual deprecation warnings and determine if they come from your own scripts or plugins.

For more on this, please refer to https://docs.gradle.org/8.13/userguide/command_line_interface.html#sec:command_line_warnings in the Gradle documentation.

BUILD SUCCESSFUL in 30m 25s
1564 actionable tasks: 1563 executed, 1 up-to-date
2025-11-03 16:40:56,157 INFO: Successfully built version 0.99.0-test1 of net.aliasvault.app from 97d8d4d15df88cd759b62489368e857291a27078
```
