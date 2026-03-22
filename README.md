# Tachibana

A iOS / iPadOS control utility, as a Web UI, a MCP server, and a AgentSkill for your faviorite agents.

![Web UI main view](./.github/readme-assets/webui-main.png)

## Demo

// TODO: YouTube Links, place some placeholder for now. This includes setup, using the Web UI, using as MCP server, using as skill. Make it more obvious in common practice of README.md inserting demo videos.

## Installation

// TODO: Insert a table for different platform. For those with different architecture, put different links and mark it on the link text.

## Troubleshooting

### Caveats on Windows

#### Unable to connect any device

For Windows, you might need to install [Apple Devices on Microsoft Store](https://apps.microsoft.com/detail/9np83lwlpz9k?hl=en-US&gl=US) first. This ensures you to have proper drivers installed for iPhone / iPad.

### Caveats on macOS

#### macOS stops the app from running

If you download the tarball, you might be intercepted for running the app. This is because there's no proper code sign for the binary, which requires Apple Developer Program that is not considered for now.

You can run the following command to lift the limit.

```shell
xattr -d com.apple.quarantine ./tachibana && \
  xattr -d com.apple.quarantine **/*.node && \
  xattr -d com.apple.quarantine **/*.dylib && \
  xattr -d com.apple.quarantine ./bin/ios
```

#### App requesting keychain access

It is normal to be requested access of keychain for 3 times, on macOS, including:

- `Tachibana`, this app itself, to store and retrieve Apple Account credentials, Web UI login state in a safe place.
- `isideload`, a dependency to manage iDevices.
- `go-ios`, a dependency to establish USB tunnels.

In this case, just input your **macOS user password** and click **"Always Allow"**.

![Keychain Access](./.github/readme-assets/install-macos-keychain.png)

### Black screen in Web UI

It is most likely that your device has been locked. You can unlock it right in the Web UI by clicking **"Home icon" button** under CONTROL section header to unlock and enter home screen.

![Web UI, with device locked](.github/readme-assets/webui-locked.png)

## How does this work?

// TODO: write this, with an architecture graph.

## Known issues

In Web UI, sometimes it just fails to show the screen. This often happens on first setup, or device unplugged and plugged in.

You can either:

- Wait for a moment, and click "Retry" button multiple times.
- Avoid unpluggin the device.

## Thirdparty Software

Special shout-out to these wonderful projects, and Tachibana cannot function without them:

- [WebDriverAgent](https://github.com/appium/WebDriverAgent)
- [isideload](https://github.com/nab138/isideload)
- [idevice](https://github.com/jkcoxson/idevice)
- [go-ios](https://github.com/danielpaulus/go-ios)
- [napi-rs](https://napi.rs/)
- [ElysiaJS](https://elysiajs.com/)
- [Bun](https://bun.com/)
- [Wintun](https://www.wintun.net/)

Also, this project requires [DeveloperDiskImage](https://github.com/doronz88/DeveloperDiskImage/tree/main/PersonalizedImages/Xcode_iOS_DDI_Personalized) collected by `doronz88`, who created the classic `pymobiledevice3`. They are the best!

Since dependencies are too many, it is not convenient to list them all here. You can check out files like `package.json` and `Cargo.toml` to get to know all dependencies.
