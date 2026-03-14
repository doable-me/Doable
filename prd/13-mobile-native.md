# 13 — Mobile & Native App Path

## Overview

Doable generates **web applications** (React + Vite + Tailwind). It does NOT generate native iOS/Android binaries directly. However, the platform provides multiple pathways for users to take their web apps to mobile: **mobile-responsive output**, **PWA generation**, **Capacitor wrapping**, and guidance for **native rebuilds**. This document specifies how Doable supports mobile use cases end-to-end.

---

## 1. Mobile-Responsive Output (Default)

### 1.1 Built-in Responsive Design
| Feature | Description |
|---------|-------------|
| **Tailwind CSS** | Mobile-first responsive breakpoints by default |
| **Preview toggle** | Web/Mobile view toggle in editor |
| **iOS safe areas** | Safe area insets enforced in mobile preview |
| **Touch-optimized** | Platform mobile experience uses sheets instead of popovers |
| **Responsive layouts** | Flexbox/grid layouts generated for all screen sizes |

### 1.2 Mobile Builder Experience
- Full **mobile builder redesign** — create and tweak apps from phone/tablet
- Sheets replace popovers for menus, navigation, and sharing on mobile
- Touch-optimized panel switching
- "Inbox" and "What's new" inside avatar menu on small screens

---

## 2. PWA Generation

### 2.1 One-Prompt PWA
Convert any Doable app to a Progressive Web App with a single prompt:
```
"Turn this into a PWA. Add a web app manifest and add a service worker for basic offline support. Also add a PWA splash screen for iOS and Android."
```

### 2.2 Generated PWA Artifacts
| Artifact | Description |
|----------|-------------|
| **manifest.json** | App name, icons, display mode (standalone), theme color |
| **Service worker** | Basic offline caching via Workbox |
| **Splash screens** | iOS and Android splash screen configurations |
| **Install prompt** | In-app banner prompting users to install |
| **App icons** | Multiple sizes for different devices |

### 2.3 PWA Capabilities
| Feature | iOS | Android |
|---------|-----|---------|
| **Install to home screen** | ✅ | ✅ |
| **Offline support** | ✅ (limited) | ✅ |
| **Push notifications** | ❌ (Safari limitation) | ✅ |
| **Bluetooth/NFC** | ❌ | ✅ |
| **Full-screen mode** | ✅ | ✅ |
| **Background sync** | ❌ | ✅ |

### 2.4 PWA Limitations
- iOS Safari significantly limits PWA features (no real push via APNs, no Bluetooth, limited storage)
- Not suitable for App Store distribution
- Best for: internal tools, prototypes, quick demos

---

## 3. Capacitor Wrapping (iOS/Android)

### 3.1 Overview
Users can wrap their Doable web app in a native shell using **Capacitor** (by Ionic) for App Store / Google Play distribution.

### 3.2 Workflow (Post-Export)
1. Export Doable project via GitHub sync
2. Clone repo locally
3. Install Capacitor: `npm install @capacitor/core @capacitor/cli`
4. Initialize: `npx cap init` (app name, bundle ID, web directory)
5. Add platforms: `npx cap add ios` / `npx cap add android`
6. Build web app: `npm run build`
7. Sync: `npx cap sync`
8. Open in Xcode (iOS) or Android Studio (Android)
9. Build and run on device/simulator

### 3.3 Native Features via Capacitor Plugins
| Plugin | Feature |
|--------|---------|
| `@capacitor/camera` | Camera access |
| `@capacitor/geolocation` | GPS location |
| `@capacitor/push-notifications` | Push notifications |
| `@capacitor/filesystem` | File storage |
| `@capacitor/biometrics` | Face ID / fingerprint |
| `@capacitor/haptics` | Haptic feedback |
| 50+ more | Contact access, device info, etc. |

### 3.4 Considerations
- Result is a **web app inside a native shell** (WebView)
- Apple may reject under **Guideline 4.2** ("minimum functionality") if app is too basic
- Performance slightly worse than true native
- Recommended for: internal apps, MVPs, apps not needing heavy native features

---

## 4. Third-Party Native Conversion Tools

### 4.1 Overview
The ecosystem includes third-party tools that convert Doable web apps to native apps:

| Tool | Approach | App Store Submission |
|------|----------|---------------------|
| **Capacitor** | WebView wrapper + native plugins | Manual via Xcode/Android Studio |
| **Despia** | Native conversion with Doable SDK | One-click publish to App Store/Play |
| **Natively** | Website-to-native wrapper | Built-in App Store submission |
| **WebViewGold** | Native WebView template | Manual setup |

### 4.2 Despia Integration (Recommended Third-Party)
- Provides `@despia/native` npm package for Doable projects
- Supports: RevenueCat (in-app purchases), OneSignal (push notifications)
- Native features: Face ID, haptics, document scanner, photo library, deep linking
- OTA (over-the-air) updates
- One-click publish to App Store and Google Play
- Full 6-hour tutorial workflow available

### 4.3 Natively
- Converts any published URL to a native app
- No code required
- App Store submission built-in
- 14-day free trial

---

## 5. React Native Rebuild Path

### 5.1 When to Rebuild
Recommended when:
- App requires complex native interactions, animations, or offline support
- App Store quality bar is high (consumer-facing app)
- Deep native hardware integration needed (HealthKit, NFC, etc.)

### 5.2 What to Reuse from Doable
| Reusable | Description |
|----------|-------------|
| **Backend** | Same Doable Cloud (PostgreSQL, auth, storage, edge functions) |
| **API logic** | Same endpoints, same data models |
| **Business logic** | Validation, utils, hooks can be adapted |
| **Auth flows** | Same auth provider, same user table |
| **Database** | No migration needed — same database for web and mobile |

### 5.3 Rebuild Workflow
1. Keep Doable web app as-is (for web users)
2. Create React Native + Expo project
3. Connect to same Doable Cloud backend
4. Rebuild UI with React Native components
5. Share business logic where possible
6. Deploy to App Store / Google Play

---

## 6. iOS-Specific Considerations

### 6.1 Mobile UI Patterns
| Pattern | Description |
|---------|-------------|
| **Safe area insets** | Enforce `env(safe-area-inset-*)` for notch/home indicator |
| **Remove hover effects** | Disable hover states for touch devices |
| **View height** | Use `100dvh` instead of `100vh` for iOS |
| **Page structure** | Full-height pages with proper scrolling |
| **Touch targets** | Minimum 44x44px touch targets |

### 6.2 App Store Requirements
| Requirement | Details |
|-------------|---------|
| **Apple Developer Account** | $99/year |
| **App icon** | 1024x1024 PNG, no rounded corners |
| **Screenshots** | Required for each device size |
| **Privacy policy** | Required URL |
| **Guideline 4.2** | Must meet "minimum functionality" — pure web wrappers may be rejected |

---

## 7. Android-Specific Considerations

### 7.1 Google Play Setup
| Requirement | Details |
|-------------|---------|
| **Google Play Console** | $25 one-time fee |
| **App bundle** | AAB format (not APK) |
| **Target SDK** | Must target latest Android API level |
| **Screenshots** | Required for phone and tablet |

### 7.2 Android Advantages for Web Apps
- Better PWA support than iOS
- Push notifications work via PWA
- Less strict than Apple on WebView apps
- TWA (Trusted Web Activity) as alternative to Capacitor

---

## 8. Monetization in Mobile Apps

### 8.1 In-App Purchases
- **RevenueCat** integration for subscription management
- Works with Doable's backend via webhooks
- Supports App Store and Google Play billing
- Paywall UI can be designed in Doable, then connected via native bridge

### 8.2 Advertising
- AdMob integration possible via Capacitor plugin
- Configure ad units in App Store Connect / Google Play Console

---

## 9. Doable's Role vs Native Tooling

| Aspect | Doable Handles | External Tools Handle |
|--------|---------------|----------------------|
| **Web app generation** | ✅ Full-stack | — |
| **Mobile-responsive UI** | ✅ Default | — |
| **PWA conversion** | ✅ One prompt | — |
| **Native wrapping** | ❌ | Capacitor, Despia, Natively |
| **App Store submission** | ❌ | Xcode, Despia, Natively |
| **Native features** | ❌ | Capacitor plugins, native SDKs |
| **Backend for mobile** | ✅ Same backend | — |
| **In-app purchases** | ❌ | RevenueCat, native billing |

---

## 10. Recommended Mobile Strategy

```
                    ┌─────────────────────┐
                    │   Doable Web App     │
                    │ (React + Vite + TW)  │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼─────────┐ ┌───▼───────────┐ ┌──▼──────────────┐
    │    PWA             │ │  Capacitor    │ │  React Native   │
    │  (Quick/Internal)  │ │  (MVP/Store)  │ │  (Production)   │
    │  • 30 seconds      │ │  • 2-4 weeks  │ │  • 4-8 weeks    │
    │  • No app store    │ │  • App Store  │ │  • Fully native  │
    │  • Limited native  │ │  • Some native│ │  • Best quality  │
    └────────────────────┘ └──────────────┘ └─────────────────┘
```
