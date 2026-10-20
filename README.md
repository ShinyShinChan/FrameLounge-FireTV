# Frame Lounge — Fire OS app · VHS Collection Edition v1.5.0 · public-safe

A Fire TV remote-friendly VHS-shelf browser of FrameXTV-listed movies and television, with FrameXTV iframe playback. Android source + GitHub Actions APK builder. **The ZIP contains no personal TMDB credentials or signing keys; it is safe to publish as a new public repository.**


## Listed links = playable (no verification requirement)

- Shelves and search show **only links listed on FrameXTV's published Movies/TV pages**. TMDB enriches those listings with artwork, synopses, ratings, and TV episodes, but does not independently add titles.
- The daily GitHub workflow `.github/workflows/refresh-framextv-catalog.yml` collects public `/movie/{id}` and `/tv/{id}` links and updates `framextv-catalog.json` in this same repository. **It never tests video playback.** Run it once manually after uploading the files to populate a larger library.
- The Fire Stick downloads that catalog at launch and caches it locally. The bundled starter snapshot lets the app show selected publicly listed titles before the first workflow refresh.
- We assume a title that FrameXTV lists has a usable player. This is a convenience assumption, not proof that the upstream video works. If a stream is later removed, a playback error is still possible.
- If GitHub Action updates are rejected, check repository Settings → Actions → General → Workflow permissions; allow Read and write permissions.

## VHS Collection Edition · What changed

- VHS sleeve movie/TV cards with front TMDB posters, printed spine titles, and angled 3D presentation.
- Details view opens first, then Play / Like / Dislike / Watch Later.
- Like and Dislike are mutually exclusive, separate from the Watch Later list. The **My Shelf** section shows these lists and history. All stay local in WebView storage; saved TMDB titles and poster paths are cached for offline shelf browsing.
- New tilted-VHS app icon and matching Fire TV home launcher banner.
- Updated Android SDK GitHub Action to v4 to avoid deprecated `tools` installation failure.

## Update your EXISTING public GitHub repository (recommended)

Since `ShinyShinChan/FrameLounge-FireTV` already exists, extract this ZIP and run **`UPDATE-EXISTING-WINDOWS.ps1`** from PowerShell after installing Git for Windows, GitHub CLI (`gh`), and Python. Sign in when asked. This script safely checks for credentials, updates the same public repository, and includes the hidden `.github` workflow folder automatically. It does **not** create a second repository. Alternatively, upload the extracted files via the GitHub web interface, taking care to upload the workflows in `.github/workflows/`.

After upload, manually run **Actions → Refresh FrameXTV Listings → Run workflow** once, then **Build Fire TV APK**. The former publishes the current title links to your one public repository; the latter produces an installable APK.

## Quick start — one public GitHub repository

1. Create **one new PUBLIC repository** at <https://github.com/new>, named **`FrameLounge-FireTV`** (account `ShinyShinChan`, branch **`main`**). Do not create a private copy or a second config repository.
2. **Extract the ZIP first.** Upload the extracted project's CONTENTS to your repository root (files like `app/`, `scripts/`, `remote-config.json`, `build.gradle`, and hidden `.github/workflows/build-apk.yml`). Do NOT upload just the ZIP, and do NOT upload your older personal/keyed project.
3. GitHub → **Actions** → **Build Fire TV APK** → select latest run or **Run workflow**. When successful, download its `FrameLounge-FireTV-APK` artifact and unzip to obtain `FrameLounge-FireTV.apk`.
4. Install APK onto your Fire OS Stick, using ADB (`adb install -r FrameLounge-FireTV.apk`) or the Fire Stick Downloader app and an accessible APK URL. Amazon installation steps: <https://www.developer.amazon.com/docs/fire-tv/installing-and-running-your-app.html>.
5. Launch **Frame Lounge** → **Settings** → enter your own **TMDB v3 API key** (or v4 read token) → **Save & Connect**. The key is stored only in app-local WebView data. Next time it connects automatically: **no repeated entry**. You can use the Fire TV phone app's keyboard to paste it rather than using remote button presses.

**Alternative for Windows users:** After extracting the ZIP, run `PUBLISH-WINDOWS.ps1` with PowerShell if you have `git`, `gh` (GitHub CLI), and Python installed. The script checks for credentials, opens GitHub authentication if necessary, creates the PUBLIC repository, and pushes the project. If you already created the repo, use the web upload instructions instead.

## Important: permanent APK updates (signing)

Android requires every new version of an installed app to be signed with the same key. GitHub's automatically generated **debug APK uses an ephemeral build environment**, so subsequent builds may not update in place. **For permanent Fire Stick use, set up a signing keystore BEFORE installing your permanent APK.**

On Windows with JDK `keytool` installed, run `scripts/create-signing-keystore.ps1`. It will:

- Create your private key at `%USERPROFILE%\FrameLounge-Signing\framelounge-signing.p12`, with alias `framelounge`.
- Copy its base64 to your clipboard. On GitHub → repository **Settings → Secrets and variables → Actions**, add `FRAME_LOUNGE_KEYSTORE_BASE64` as a secret and paste clipboard contents.
- Ask for a password; add that password as a second GitHub Actions secret named `FRAME_LOUNGE_KEYSTORE_PASSWORD`.

Now run **Actions → Build Fire TV APK** again. The build produces a **permanently signed release APK** as an artifact. Save a secure offline backup of the `.p12` keystore AND password — losing them prevents future in-place updates. Never commit or upload the keystore itself to a public repository. If you installed an earlier debug APK, uninstall that test version first; it has a different signing identity and uninstalling clears saved app data.

A version tag like `v1.3.0` triggers a **GitHub Release** containing the signed APK (requires those two signing secrets). For updates, increment `versionCode` in `app/build.gradle` before building a newer app version and use a new tag. GitHub Actions artifacts expire, while tagged GitHub Releases remain downloadable until removed.

## Automatic updates to FrameXTV links — ONE repository

The app checks this URL at launch and on return to foreground if more than six hours have passed since a successful check:

`https://raw.githubusercontent.com/ShinyShinChan/FrameLounge-FireTV/main/remote-config.json`

That link becomes live once you upload the project with the exact repository and branch shown above. To change or add a FrameXTV playback source later, edit **`remote-config.json`** on GitHub and commit. Use HTTPS origins and movie/TV templates. Source settings are cached if the network is unavailable. To check immediately, use **Settings → Refresh Now**.

FrameXTV's publicly documented embed forms are:
- Movie: `https://framextv.cc/embed/{id}`
- Episode: `https://framextv.cc/embed/{id}/{season}/{episode}`

Player-source switching is manual, because a loaded iframe is not proof a playable movie stream exists. If FrameXTV changes its embed API entirely, you may need an APK update. **Editing the JSON does not silently install an APK update.** Install a newly signed APK manually when code changes are necessary.

## Security & privacy

- This public project never bundles your API key or read-access token and never uses a TMDB GitHub Actions secret. Do not paste credentials into `remote-config.json`, project files, GitHub issues, or GitHub Releases.
- TMDB credentials are saved in Android WebView local storage on the Fire Stick; clearing application storage or uninstalling the app removes them. Local storage is not a secure hardware vault; people with access to your device backups/root could potentially retrieve the key. Android app backups are disabled.
- The TMDB catalog supplies metadata only, not streaming rights or media files. The streaming iframe is third-party. Content availability and WebView compatibility depend on FrameXTV and Fire OS; **live video playback on a physical Fire Stick has not been verified.** Use only content you are authorized to view.
- TMDB attribution is displayed inside Settings; TMDB does not endorse this app.
- The app is for personal sideload use, not listed in the Amazon Appstore.

## Build locally

JDK 17, Android SDK platform 35, AGP 8.7.3, Gradle 8.10.2. Run `gradle :app:assembleDebug`. To build signed release, set `FRAME_LOUNGE_KEYSTORE_PATH` and `FRAME_LOUNGE_KEYSTORE_PASSWORD` then run `gradle :app:assembleRelease`.

## Troubleshooting

- **Actions not showing?** Verify `.github/workflows/build-apk.yml` really exists in GitHub at the root of the repository, and Actions is enabled.
- **No poster images?** Enter a valid TMDB key, confirm Wi-Fi, then Save & Connect.
- **Can't install update?** Use the same private signing keystore and increase versionCode; debug APKs from separate runners may have mismatched signing keys.
- **Links broken?** Edit your single repo's `remote-config.json` then open Settings → Refresh Now.
- **Video plays in browser but not in app?** Embedded playback and codecs/DRM may be blocked by Fire OS WebView; try alternate source. There is no guarantee that changing a domain fixes this.
